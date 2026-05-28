"""Voice mode — Whisper (speech → text) + TTS (text → speech) proxies.

Bernard's `insult-openai` Azure OpenAI resource ships two voice deployments
(`whisper` and `tts`) in addition to the chat model — so the product can
become a ChatGPT-style voice loop without standing up a separate Speech
resource. This module is the thin async wrapper around those two endpoints.

Boundary:
  - Keys never leave the backend. The frontend talks to `/voice/*` on this
    API; the API talks to Azure with `AZURE_OPENAI_API_KEY`. NEXT_PUBLIC_*
    stays out of the voice path.
  - Both functions raise :class:`VoiceError` on Azure failure; the FastAPI
    layer maps those to HTTP 502 (upstream) so the client can distinguish
    a backend bug from a transient Azure hiccup.
"""

from __future__ import annotations

import logging
import os
import re
from typing import Literal

import httpx

_log = logging.getLogger("insult_ai.voice")

# The three voices we expose to the product (out of OpenAI's six). The full
# tts-1 model supports alloy/echo/fable/onyx/nova/shimmer — we curate to the
# ones that match the "deadpan-anchor" voice of the roast persona. Adding
# more is a one-line change here + the frontend dropdown.
TTSVoice = Literal["onyx", "echo", "alloy"]
DEFAULT_VOICE: TTSVoice = "onyx"

# Tunables — pulled from env so a Container App can override per deployment
# without a code change. Defaults match Bernard's `insult-openai` resource.
_AZURE_ENDPOINT = (
    os.getenv("AZURE_OPENAI_ENDPOINT")
    or "https://northcentralus.api.cognitive.microsoft.com"
).rstrip("/")
_AZURE_API_KEY = (os.getenv("AZURE_OPENAI_API_KEY") or "").strip() or None
_AZURE_API_VERSION = os.getenv("AZURE_OPENAI_API_VERSION") or "2024-02-15-preview"
_WHISPER_DEPLOYMENT = os.getenv("AZURE_OPENAI_WHISPER_DEPLOYMENT") or "whisper"
_TTS_DEPLOYMENT = os.getenv("AZURE_OPENAI_TTS_DEPLOYMENT") or "tts"


def _positive_int_env(name: str, default: int) -> int:
    raw = (os.getenv(name) or "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        _log.warning("%s=%r is invalid; using default %s", name, raw, default)
        return default
    if value <= 0:
        _log.warning("%s=%r must be positive; using default %s", name, raw, default)
        return default
    return value


MAX_TTS_CHARS = _positive_int_env("INSULT_AI_TTS_MAX_CHARS", 4096)

# Per-call timeout. Whisper on a 30s clip is ~3-5s; TTS on 200 chars is ~2-3s.
# 60s gives plenty of headroom for a slow Azure region without blocking the
# uvicorn worker indefinitely if Azure wedges.
_HTTP_TIMEOUT = httpx.Timeout(60.0, connect=10.0)


class VoiceError(RuntimeError):
    """Upstream (Azure OpenAI) call failed — caller should surface as 502."""


class VoiceRateLimitError(VoiceError):
    """Azure returned 429 (rate-limit / capacity exceeded).

    Carries the retry-after hint when the upstream surfaces one — either via
    the `Retry-After` HTTP header (preferred, RFC 9110) or via the
    "retry after N seconds" string Azure embeds in the JSON body when the
    header is absent. The FastAPI layer maps this to HTTP 429 with the
    Retry-After header so the frontend can back off intelligently instead
    of an opaque 502.
    """

    def __init__(self, message: str, retry_after_seconds: int | None = None):
        super().__init__(message)
        self.retry_after_seconds = retry_after_seconds


_RETRY_AFTER_BODY_RE = re.compile(r"retry after (\d+) sec", re.IGNORECASE)


def _extract_retry_after(resp: httpx.Response) -> int | None:
    """Pull a retry-after hint off a 429 response. Prefer the header; fall
    back to scraping the Azure message body when the header isn't set."""
    header = resp.headers.get("retry-after")
    if header:
        try:
            return int(float(header))
        except ValueError:
            pass  # could be an HTTP-date — Azure rarely sends that, ignore
    match = _RETRY_AFTER_BODY_RE.search(resp.text)
    if match:
        return int(match.group(1))
    return None


def _require_key() -> str:
    if _AZURE_API_KEY is None:
        raise VoiceError(
            "AZURE_OPENAI_API_KEY is not configured on the backend — "
            "voice endpoints require the same Azure OpenAI resource the chat "
            "backend uses."
        )
    return _AZURE_API_KEY


async def transcribe_audio(audio_bytes: bytes, filename: str = "audio.webm") -> str:
    """Send raw audio bytes to Azure OpenAI Whisper, return the transcript.

    The whisper deployment accepts the same audio formats as the OpenAI API
    (webm, mp3, wav, m4a, ogg, flac, mp4, mpeg, mpga, oga). The frontend
    captures with MediaRecorder → webm/opus by default, which Whisper handles
    natively without re-encoding.

    `filename` matters only because Azure inspects the extension for the
    content sniffer — pass the real one when known, default is fine for
    MediaRecorder output.
    """
    api_key = _require_key()
    url = (
        f"{_AZURE_ENDPOINT}/openai/deployments/{_WHISPER_DEPLOYMENT}"
        f"/audio/transcriptions?api-version={_AZURE_API_VERSION}"
    )
    # Whisper API takes multipart/form-data with `file` + `model` fields.
    # The `model` field is required by OpenAI SDK signature even for Azure
    # (where the deployment in the URL is what actually routes); pass it
    # anyway so the contract is parity-clean if we ever swap providers.
    files = {"file": (filename, audio_bytes)}
    data = {"model": "whisper-1", "response_format": "json"}
    headers = {"api-key": api_key}

    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
        try:
            resp = await client.post(url, headers=headers, files=files, data=data)
        except httpx.HTTPError as exc:
            raise VoiceError(f"whisper request failed: {exc}") from exc

    if resp.status_code == 429:
        retry_after = _extract_retry_after(resp)
        raise VoiceRateLimitError(
            f"whisper rate-limited: {resp.text[:200]}",
            retry_after_seconds=retry_after,
        )
    if resp.status_code != 200:
        raise VoiceError(
            f"whisper returned {resp.status_code}: {resp.text[:300]}"
        )
    try:
        payload = resp.json()
    except ValueError as exc:
        raise VoiceError(f"whisper returned non-JSON: {resp.text[:300]}") from exc
    text = (payload.get("text") or "").strip()
    _log.info(
        "whisper.transcribe ok bytes=%d chars=%d", len(audio_bytes), len(text)
    )
    return text


async def synthesize_speech(text: str, voice: TTSVoice = DEFAULT_VOICE) -> bytes:
    """Send text to Azure OpenAI TTS, return the audio bytes (MP3).

    Uses `response_format: mp3` so the browser can play the blob directly
    in an `<audio>` element with no transcoding step on either side.

    Length cap: 4096 chars per the OpenAI API spec. Roasts run ~500-1500
    chars — well under. We don't pre-truncate here so a misuse surfaces as
    an Azure 400, not a silent half-roast.
    """
    text = text.strip()
    if not text:
        raise VoiceError("tts input is empty")
    if len(text) > MAX_TTS_CHARS:
        raise VoiceError(
            f"tts input is too long ({len(text)} chars); max {MAX_TTS_CHARS}"
        )
    api_key = _require_key()
    url = (
        f"{_AZURE_ENDPOINT}/openai/deployments/{_TTS_DEPLOYMENT}"
        f"/audio/speech?api-version={_AZURE_API_VERSION}"
    )
    headers = {"api-key": api_key, "Content-Type": "application/json"}
    body = {
        "model": "tts",
        "input": text,
        "voice": voice,
        "response_format": "mp3",
    }

    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
        try:
            resp = await client.post(url, headers=headers, json=body)
        except httpx.HTTPError as exc:
            raise VoiceError(f"tts request failed: {exc}") from exc

    if resp.status_code == 429:
        retry_after = _extract_retry_after(resp)
        raise VoiceRateLimitError(
            f"tts rate-limited: {resp.text[:200]}",
            retry_after_seconds=retry_after,
        )
    if resp.status_code != 200:
        raise VoiceError(
            f"tts returned {resp.status_code}: {resp.text[:300]}"
        )
    audio = resp.content
    _log.info(
        "tts.synthesize ok voice=%s chars=%d bytes=%d",
        voice, len(text), len(audio),
    )
    return audio
