"""FastAPI face for Insult AI. POST /roast (a URL/claim), plus /documents to feed
the agent a personal corpus it can mine during the roast (rag_store), plus
POST /chat/stream — a multi-turn chat with live chain-of-thought (SSE)."""

from __future__ import annotations

import asyncio
import hmac
import json
import logging
import os
import time
from typing import Literal

from fastapi import Depends, FastAPI, File, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from fi_runner.rag_store import RagStoreClient
from pydantic import BaseModel
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from .runner import chat_stream, roast
from .voice import DEFAULT_VOICE, TTSVoice, VoiceError, synthesize_speech, transcribe_audio
from .wire import (
    plan_rejected_to_wire,
    plan_to_wire,
    result_to_wire,
    step_done_to_wire,
    step_started_to_wire,
    tool_call_to_wire,
)

# Ensure our logger surfaces in uvicorn's stdout/stderr. uvicorn configures the
# `uvicorn.*` loggers but leaves the root logger handler-less in some setups —
# without this, `insult_ai.chat.info(...)` calls silently disappear. We attach
# a single StreamHandler iff nothing else has, and set our package level to
# INFO. Idempotent on --reload.
_root_log = logging.getLogger()
if not _root_log.handlers:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)-7s [%(name)s] %(message)s",
        datefmt="%H:%M:%S",
    )
logging.getLogger("insult_ai").setLevel(logging.INFO)
_log = logging.getLogger("insult_ai.chat")
_log.info("logging cabled — chat.event lines will land here")

app = FastAPI(title="Insult AI", version="0.1.0")

# CORS — accept the origins listed in ``CORS_ALLOW_ORIGINS`` (comma-separated)
# or fall back to wide-open in dev. Production sets this to the SWA URL via
# Container App env var; dev leaves it unset and the API accepts everything
# (handy for curl, the bench, and a local Next.js on a non-standard port).
_cors_origins_env = (os.getenv("CORS_ALLOW_ORIGINS") or "").strip()
_cors_origins = (
    [o.strip() for o in _cors_origins_env.split(",") if o.strip()]
    if _cors_origins_env
    else ["*"]
)
if _cors_origins == ["*"]:
    _log.warning(
        "CORS_ALLOW_ORIGINS unset — accepting requests from any origin "
        "(dev convenience). Set the env var in production to lock CORS to "
        "the SWA URL."
    )
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Auth: simple shared X-API-Key ----------------------------------------
# The threat model is a casual crawler that finds the public URL of the
# Container App and starts hitting /roast — each turn burns Bright Data
# credit + Claude tokens. A constant-time match against ``INSULT_AI_API_KEY``
# is the floor that stops that without any infra (Entra ID / OAuth would be
# the next tier but is overkill for a hackathon).
#
# Fail-open in DEV (no env var set) so the bench, the smoke tests and a
# bare `uvicorn --reload` still work. Fail-CLOSED only when the env var is
# present — that's the production posture: set the secret in Container
# Apps, no key in the request → 401. A WARNING is logged on each request
# when fail-open is active so it's loud in the logs.
_API_KEY = (os.getenv("INSULT_AI_API_KEY") or "").strip() or None
if _API_KEY is None:
    _log.warning(
        "INSULT_AI_API_KEY is unset — /roast, /chat/stream, /documents are "
        "UNAUTHENTICATED (fail-open). Set the env var in production."
    )


async def verify_api_key(x_api_key: str | None = Header(default=None)) -> None:
    """Dependency: 401 if a key is configured AND the request doesn't supply
    a matching one. No-op when no key is configured (dev convenience).

    Constant-time compare via ``hmac.compare_digest`` so a timing-side-channel
    attacker can't iterate character-by-character against /health-style
    probes. ``str.encode()`` because compare_digest is byte-strict."""
    if _API_KEY is None:
        return  # fail-open in dev
    supplied = (x_api_key or "").strip()
    if not supplied or not hmac.compare_digest(supplied.encode(), _API_KEY.encode()):
        # 401 ``WWW-Authenticate`` hints at the scheme so a thoughtful caller
        # knows to send the header. A bare 401 with no hint is a UX hole.
        raise HTTPException(
            status_code=401,
            detail="missing or invalid X-API-Key header",
            headers={"WWW-Authenticate": "ApiKey"},
        )


# --- Per-IP rate limit on the agent endpoints -----------------------------
# Defense-in-depth alongside the API key. Even a leaked key shouldn't let
# one client cycle through $250 of Bright Data credit. ``get_remote_address``
# trusts ``X-Forwarded-For`` only behind a properly-configured reverse proxy;
# Azure Container Apps sets it on the ingress, so this works in production.
# In local dev the limiter sees 127.0.0.1 — the limit is global to the
# loopback (fine for the bench's single-process pattern).
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Programmatic, boundary-clean store client (imports fi_core internally; results
# are plain dicts). Same FI_RAG_* env as the agent's rag_store MCP, so a doc
# ingested here is searchable by the agent during a roast.
_rag = RagStoreClient()


class RoastRequest(BaseModel):
    target: str  # a URL or a claim to roast + fact-check
    backend: str | None = None  # "claude" | "codex" (defaults to INSULT_AI_BACKEND)
    corpus_id: str | None = None  # if set, the agent also mines this document corpus
    # Product mode — "roast" (the hook, fragment voice) or "brief" (the
    # business value, structured GTM intelligence). Default keeps existing
    # callers (the bench, the web's roast button) on the roast path; brief
    # is opt-in via this field. See runner.py:Mode.
    mode: Literal["roast", "brief"] = "roast"


class RoastResponse(BaseModel):
    # Field name kept as ``roast`` for backwards compat with the web client
    # (useRoast.ts reads data.roast). Holds the agent's output text for
    # EITHER mode — a slight misnomer the field name carries, documented
    # here so a future rename is intentional rather than accidental.
    roast: str
    usage: dict | None = None


class IngestRequest(BaseModel):
    corpus_id: str
    doc_id: str
    text: str


class IngestResponse(BaseModel):
    chunks: int


class SpeakRequest(BaseModel):
    text: str
    # Curated to the three voices the product exposes (see voice.py). Default
    # is onyx — the deadpan-anchor tone that matches the roast persona's
    # voice. Adding more is a one-line change in voice.py + here.
    voice: TTSVoice = DEFAULT_VOICE


class TranscribeResponse(BaseModel):
    text: str


class ChatRequest(BaseModel):
    session_id: str  # client-generated; same id across turns = same conversation
    message: str
    backend: str | None = None  # "claude" | "codex" (only claude streams live)
    corpus_id: str | None = None  # optional rag_store doc corpus to mine
    # Persona for THIS turn. Switching mid-conversation is allowed (the
    # conversation_store replays prior turns into the new persona's context)
    # — that's the whole point of two modes over one engine.
    mode: Literal["roast", "brief"] = "roast"


@app.get("/health")
async def health() -> dict:
    # Intentionally UNGATED — Container Apps' liveness probe must reach this
    # without a key, and a key check here would conflate "service up" with
    # "key configured". Returns ok even when INSULT_AI_API_KEY is unset.
    return {"ok": True}


@app.post("/roast", response_model=RoastResponse, dependencies=[Depends(verify_api_key)])
@limiter.limit("10/hour")
async def do_roast(request: Request, req: RoastRequest) -> RoastResponse:
    # SlowAPI needs the ``request: Request`` parameter to extract the client
    # IP for ``get_remote_address``. Don't drop it even if the body doesn't
    # use it — the decorator wraps this signature.
    result = await roast(
        req.target,
        backend=req.backend,
        corpus_id=req.corpus_id,
        mode=req.mode,
    )
    return RoastResponse(roast=result.text, usage=result.usage)


@app.post("/documents", response_model=IngestResponse, dependencies=[Depends(verify_api_key)])
@limiter.limit("60/hour")
async def ingest_document(request: Request, req: IngestRequest) -> IngestResponse:
    """Feed a document into a corpus the agent can mine during a later roast."""
    # Higher limit than /roast because ingestion is local (no Bright Data /
    # Claude spend) — the cap is still useful to floor abuse but cheap enough
    # to let a real onboarding flow paste 20 documents in a row.
    # Low min_chunk_size so short pastes (a paragraph, a bio) still get stored,
    # not silently dropped.
    chunks = await _rag.ingest(req.corpus_id, req.doc_id, req.text, min_chunk_size=30)
    return IngestResponse(chunks=chunks)


def _sse(event: str, data: dict) -> str:
    """Format one SSE message. Newlines in `data` are JSON-escaped, so a single
    'data:' line is always valid per the SSE spec."""
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@app.post("/chat/stream", dependencies=[Depends(verify_api_key)])
@limiter.limit("10/hour")
async def chat_stream_endpoint(request: Request, req: ChatRequest) -> StreamingResponse:
    """Multi-turn chat with live chain-of-thought as Server-Sent Events.

    Re-emits each event from ``runner.run_stream`` as SSE so the UI can paint
    every Bright Data call as a step ('🔍 search_engine', '📄 scrape') while
    the roast text streams token by token. Live streaming requires the claude
    backend; codex falls back to a single ``result`` event (per fi-runner).

    Wire contract (event names → payload shape — see :mod:`insult_ai.wire`):
      - ``open``         {"session_id"}
      - ``plan``         :class:`PlanWire`                       (declare_plan — first turn-tool)
      - ``plan_rejected`` :class:`PlanRejectedWire`              (PlanGuard veto — soft, stream continues)
      - ``step_started`` :class:`StepStartedWire`                (start_step → row goes "running")
      - ``step_done``    :class:`StepDoneWire`                   (complete_step | fail_step)
      - ``tool_call``    :class:`ToolCallWire`                   (no input — PHI-safe)
      - ``text``         {"delta"}                                (token-ish chunk)
      - ``result``       :class:`ResultWire`
      - ``error``        {"message","kind"}
      - ``done``         {}                                       (always fires last,
                                                                   even after ``error``)

    ``plan`` / ``step_started`` / ``step_done`` are emitted ADDITIONALLY to the
    raw ``tool_call`` for each task_tracker MCP call (see fi_runner's
    ``_derive_plan_events``). The UI uses the semantic ones for a checklist and
    keeps the raw ones for a "thinking" detail view — so both panels stay in
    sync even if the persona ever stops calling ``declare_plan``.
    """

    # Capture fi_runner telemetry for THIS turn. Lives in the closure so each
    # request gets its own list (no cross-request leak). Server-side log fires
    # immediately on each event; the `meta` SSE event is composed from this
    # list after the turn settles, so the UI sees the same numbers the server
    # logged. Order matters: history_replayed (if multi-turn) → tool_called
    # (one per call) → turn_completed (closing summary with latency_ms,
    # tokens, guard_levels).
    captured: list[tuple[str, dict]] = []
    t0 = time.perf_counter()

    def _capture(event: str, fields: dict) -> None:
        captured.append((event, fields))
        # Structured log — visible in uvicorn output, also picked up by any
        # JSON log aggregator (Azure Log Analytics, Loki, etc.) when deployed.
        # `extra=` keeps it parseable; the literal message stays short.
        _log.info(
            "chat.event %s",
            event,
            extra={"event": event, "session_id": req.session_id, "fields": fields},
        )

    async def gen():
        # Tell the client the stream is live so the UI can flip 'thinking…' on
        # before the first tool_call lands (otherwise nothing happens for ~1s).
        yield _sse("open", {"session_id": req.session_id})
        try:
            # Hard ceiling on a turn. A wedged Bright Data MCP or a stalled
            # SDK socket would otherwise leave this SSE open forever, holding
            # the MCP busy and silently burning tokens. 180s covers a heavy
            # multi-fetch roast; a regression past this is a real bug.
            async with asyncio.timeout(180):
                async for event in chat_stream(
                    req.message,
                    session_id=req.session_id,
                    backend=req.backend,
                    corpus_id=req.corpus_id,
                    mode=req.mode,
                    on_event=_capture,
                ):
                    etype = event.get("type")
                    if etype == "tool_call":
                        yield _sse("tool_call", dict(tool_call_to_wire(event["tool"])))
                    elif etype == "text":
                        yield _sse("text", {"delta": event["text"]})
                    elif etype == "plan":
                        # Semantic re-emit of the agent's declare_plan call — UI
                        # uses this for the live checklist. The raw task_tracker
                        # tool_call still went through above, so the thinking
                        # panel keeps its detail view.
                        yield _sse("plan", dict(plan_to_wire(event["data"])))
                    elif etype == "plan_rejected":
                        # PlanGuard vetoed the declared plan — SOFT reject
                        # (fi-runner keeps the stream open; the agent's retry
                        # path picks up the reinforcement and re-declares). UI
                        # paints a red banner over the checklist with the reason
                        # and which steps tripped.
                        yield _sse("plan_rejected", dict(plan_rejected_to_wire(event["data"])))
                    elif etype == "step_started":
                        yield _sse("step_started", dict(step_started_to_wire(event["data"])))
                    elif etype == "step_done":
                        yield _sse("step_done", dict(step_done_to_wire(event["data"])))
                    elif etype == "result":
                        # POST-guard text + final tool_calls (is_error resolved).
                        # The UI MUST REPLACE, not append — antidrift may have
                        # rewritten the live deltas. ``fallback_session_id`` covers
                        # backends that don't round-trip the client-issued id.
                        payload = result_to_wire(event["result"], fallback_session_id=req.session_id)
                        yield _sse("result", dict(payload))
                    # Any other event type from fi_runner (telemetry, etc.) is
                    # skipped — only the ones above are part of our wire contract.
            # Turn settled cleanly → emit the closing telemetry as `meta`. The
            # frontend uses this for the "✓ 2.3s · 4 tools · 1,234 tokens"
            # footer; if turn_completed never fired (edge case), we synthesize
            # a minimal one from the wall clock so the UI always gets numbers.
            tc = next((f for e, f in captured if e == "turn_completed"), None)
            replayed = next((f for e, f in captured if e == "history_replayed"), None)
            yield _sse("meta", {
                "latency_ms": (tc or {}).get("latency_ms", round((time.perf_counter() - t0) * 1000, 2)),
                "tool_count": (tc or {}).get("tool_count"),
                "mcp_count": (tc or {}).get("mcp_count"),
                "tokens": (tc or {}).get("tokens"),
                "guard_levels": (tc or {}).get("guard_levels"),
                "attempts": (tc or {}).get("attempts"),
                "model": (tc or {}).get("model"),
                "replayed_messages": (replayed or {}).get("messages", 0),
            })
        except asyncio.CancelledError:
            # Client closed the tab / cancelled the fetch. Propagate so
            # `run_stream` (and the backend SDK request) actually cancel —
            # otherwise the turn keeps running in the shadow, burning tokens
            # and holding the MCP busy. The `finally` still fires its `done`.
            raise
        except TimeoutError:
            yield _sse("error", {"message": "turn exceeded 180s timeout", "kind": "TimeoutError"})
        except Exception as exc:  # noqa: BLE001 - boundary: surface to UI
            yield _sse("error", {"message": str(exc), "kind": type(exc).__name__})
        finally:
            yield _sse("done", {})

    # `X-Accel-Buffering: no` disables nginx/proxy buffering so events arrive in
    # real time (otherwise an intermediary may hold them till the gen finishes).
    # `Connection: keep-alive` keeps the SSE socket open on hop-by-hop proxies.
    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


# --- Voice mode: Whisper (audio in) + TTS (audio out) ----------------------
# Two thin proxies to the `whisper` and `tts` deployments on Bernard's
# `insult-openai` Azure resource. Same X-API-Key gate + per-IP rate limit
# as /roast and /chat/stream. The frontend uses these to turn the demo
# from text-in-text-out into a ChatGPT-style voice loop: user holds mic,
# whisper transcribes → /chat/stream fires, roast returns → user clicks
# play, tts streams the roast back in the onyx voice.


@app.post("/voice/transcribe", response_model=TranscribeResponse, dependencies=[Depends(verify_api_key)])
@limiter.limit("60/hour")
async def voice_transcribe(
    request: Request, audio: UploadFile = File(...)
) -> TranscribeResponse:
    """Multipart upload → Whisper → text. The frontend posts the
    MediaRecorder blob directly; no client-side transcoding."""
    try:
        audio_bytes = await audio.read()
        if not audio_bytes:
            raise HTTPException(status_code=400, detail="empty audio payload")
        text = await transcribe_audio(
            audio_bytes, filename=audio.filename or "audio.webm"
        )
    except VoiceError as exc:
        # 502 = upstream (Azure) failure. Distinguishes from a 4xx caller
        # error (bad audio, missing key) so the frontend can decide whether
        # to retry or surface as user-facing error.
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return TranscribeResponse(text=text)


@app.post("/voice/speak", dependencies=[Depends(verify_api_key)])
@limiter.limit("60/hour")
async def voice_speak(request: Request, req: SpeakRequest) -> Response:
    """Text → TTS (onyx by default) → audio/mpeg blob. Returns the raw
    MP3 bytes so the browser can play it via `new Audio(URL.createObjectURL(blob))`
    without a streaming protocol on top."""
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="text is empty")
    try:
        audio_bytes = await synthesize_speech(req.text, voice=req.voice)
    except VoiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    # Cache-Control: short cache per (text, voice) — same input twice in a
    # row would hit Azure twice without this. 1h covers a user replaying
    # a roast a few times. Keyed by the URL + body so different roasts
    # don't collide.
    return Response(
        content=audio_bytes,
        media_type="audio/mpeg",
        headers={"Cache-Control": "private, max-age=3600"},
    )
