"""FastAPI face for Insult AI. POST /roast (a URL/claim), plus /documents to feed
the agent a personal corpus it can mine during the roast (rag_store), plus
POST /chat/stream — a multi-turn chat with live chain-of-thought (SSE)."""

from __future__ import annotations

import asyncio
import json

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fi_runner.rag_store import RagStoreClient
from pydantic import BaseModel

from .runner import chat_stream, roast
from .wire import result_to_wire, tool_call_to_wire

app = FastAPI(title="Insult AI", version="0.1.0")

# Wide-open CORS for the demo (the Next.js front lives on a different origin).
# Tighten to the SWA origin before anything real.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Programmatic, boundary-clean store client (imports fi_core internally; results
# are plain dicts). Same FI_RAG_* env as the agent's rag_store MCP, so a doc
# ingested here is searchable by the agent during a roast.
_rag = RagStoreClient()


class RoastRequest(BaseModel):
    target: str  # a URL or a claim to roast + fact-check
    backend: str | None = None  # "claude" | "codex" (defaults to INSULT_AI_BACKEND)
    corpus_id: str | None = None  # if set, the agent also mines this document corpus


class RoastResponse(BaseModel):
    roast: str
    usage: dict | None = None


class IngestRequest(BaseModel):
    corpus_id: str
    doc_id: str
    text: str


class IngestResponse(BaseModel):
    chunks: int


class ChatRequest(BaseModel):
    session_id: str  # client-generated; same id across turns = same conversation
    message: str
    backend: str | None = None  # "claude" | "codex" (only claude streams live)
    corpus_id: str | None = None  # optional rag_store doc corpus to mine


@app.get("/health")
async def health() -> dict:
    return {"ok": True}


@app.post("/roast", response_model=RoastResponse)
async def do_roast(req: RoastRequest) -> RoastResponse:
    result = await roast(req.target, backend=req.backend, corpus_id=req.corpus_id)
    return RoastResponse(roast=result.text, usage=result.usage)


@app.post("/documents", response_model=IngestResponse)
async def ingest_document(req: IngestRequest) -> IngestResponse:
    """Feed a document into a corpus the agent can mine during a later roast."""
    # Low min_chunk_size so short pastes (a paragraph, a bio) still get stored,
    # not silently dropped.
    chunks = await _rag.ingest(req.corpus_id, req.doc_id, req.text, min_chunk_size=30)
    return IngestResponse(chunks=chunks)


def _sse(event: str, data: dict) -> str:
    """Format one SSE message. Newlines in `data` are JSON-escaped, so a single
    'data:' line is always valid per the SSE spec."""
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@app.post("/chat/stream")
async def chat_stream_endpoint(req: ChatRequest) -> StreamingResponse:
    """Multi-turn chat with live chain-of-thought as Server-Sent Events.

    Re-emits each event from ``runner.run_stream`` as SSE so the UI can paint
    every Bright Data call as a step ('🔍 search_engine', '📄 scrape') while
    the roast text streams token by token. Live streaming requires the claude
    backend; codex falls back to a single ``result`` event (per fi-runner).

    Wire contract (event names → payload shape — see :mod:`insult_ai.wire`):
      - ``open``       {"session_id"}
      - ``tool_call``  :class:`ToolCallWire`                     (no input — PHI-safe)
      - ``text``       {"delta"}                                  (token-ish chunk)
      - ``result``     :class:`ResultWire`
      - ``error``      {"message","kind"}
      - ``done``       {}                                         (always fires last,
                                                                   even after ``error``)
    """

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
                ):
                    etype = event.get("type")
                    if etype == "tool_call":
                        yield _sse("tool_call", dict(tool_call_to_wire(event["tool"])))
                    elif etype == "text":
                        yield _sse("text", {"delta": event["text"]})
                    elif etype == "result":
                        # POST-guard text + final tool_calls (is_error resolved).
                        # The UI MUST REPLACE, not append — antidrift may have
                        # rewritten the live deltas. ``fallback_session_id`` covers
                        # backends that don't round-trip the client-issued id.
                        payload = result_to_wire(event["result"], fallback_session_id=req.session_id)
                        yield _sse("result", dict(payload))
                    # Any other event type from fi_runner (telemetry, etc.) is
                    # skipped — only the three above are part of our wire contract.
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
