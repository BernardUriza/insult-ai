"""Input validation helpers and tunable constants for the HTTP API."""
from __future__ import annotations

import logging
import os
import re

from fastapi import HTTPException, UploadFile

from .backend import normalize_backend_name

_log = logging.getLogger("insult_ai.validation")

# ---------------------------------------------------------------------------
# Tunable constants — all overridable via env vars without a code redeploy.
# ---------------------------------------------------------------------------

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


# Hard ceiling on a single /chat/stream turn. Heavy agentic turns (multi-page
# roast/brief research) can exceed 180s — raise this or trim the persona's
# research depth so turns finish well under the cap.
CHAT_TURN_TIMEOUT_S = _positive_int_env("INSULT_AI_CHAT_TURN_TIMEOUT_S", 180)
REQUEST_TEXT_MAX_CHARS = _positive_int_env("INSULT_AI_REQUEST_TEXT_MAX_CHARS", 12_000)
INGEST_TEXT_MAX_BYTES = _positive_int_env("INSULT_AI_INGEST_TEXT_MAX_BYTES", 1 * 1024 * 1024)
VOICE_UPLOAD_MAX_BYTES = _positive_int_env("INSULT_AI_VOICE_UPLOAD_MAX_BYTES", 12 * 1024 * 1024)

UPLOAD_READ_CHUNK_BYTES = 1024 * 1024
_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$")

# ---------------------------------------------------------------------------
# Validation helpers
# ---------------------------------------------------------------------------

def clean_text(value: str, *, field: str, max_chars: int) -> str:
    value = value.strip()
    if not value:
        raise HTTPException(status_code=400, detail=f"{field} is empty")
    if len(value) > max_chars:
        raise HTTPException(
            status_code=413,
            detail=f"{field} is too long ({len(value)} chars); max {max_chars}",
        )
    return value


def clean_optional_id(value: str | None, *, field: str) -> str | None:
    if value is None:
        return None
    value = value.strip()
    if not value:
        return None
    validate_id(value, field=field)
    return value


def validate_id(value: str, *, field: str) -> str:
    value = value.strip()
    if not _ID_RE.fullmatch(value):
        raise HTTPException(
            status_code=400,
            detail=(
                f"{field} must be 1-128 chars and contain only letters, "
                "numbers, underscore, dot, colon, or dash"
            ),
        )
    return value


def validate_backend(backend: str | None) -> str | None:
    if backend is None:
        return None
    try:
        return normalize_backend_name(backend)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def public_error_message(exc: Exception) -> str:
    """Return a client-safe boundary error. Full details stay in server logs."""
    if isinstance(exc, TimeoutError):
        return f"turn exceeded {CHAT_TURN_TIMEOUT_S}s timeout"
    return "request failed while generating a response"


async def read_upload_limited(file: UploadFile, *, max_bytes: int) -> bytes:
    """`await file.read()` loads the whole part before checking size. This
    helper refuses the payload as soon as it crosses the cap."""
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(UPLOAD_READ_CHUNK_BYTES)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            raise HTTPException(
                status_code=413,
                detail=f"file too large ({total} bytes); max {max_bytes} bytes",
            )
        chunks.append(chunk)
    return b"".join(chunks)
