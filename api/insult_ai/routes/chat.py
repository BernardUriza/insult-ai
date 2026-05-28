"""POST /chat/stream — multi-turn chat with live chain-of-thought as SSE."""
from __future__ import annotations

import asyncio
import json
import logging
import time

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from ..auth import limiter, verify_api_key
from ..clinical.quip import waiting_quip
from ..models import ChatRequest, QuipRequest, QuipResponse
from ..runner import chat_stream
from ..validation import (
    CHAT_TURN_TIMEOUT_S,
    REQUEST_TEXT_MAX_CHARS,
    clean_optional_id,
    clean_text,
    public_error_message,
    validate_backend,
)
from ..wire import (
    plan_rejected_to_wire,
    plan_to_wire,
    result_to_wire,
    step_done_to_wire,
    step_started_to_wire,
    tool_call_to_wire,
)

_log = logging.getLogger("insult_ai.routes.chat")

router = APIRouter()


def _sse(event: str, data: dict) -> str:
    """Format one SSE message. Newlines in `data` are JSON-escaped so a
    single 'data:' line is always valid per the SSE spec."""
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@router.post("/chat/stream", dependencies=[Depends(verify_api_key)])
@limiter.limit("10/hour")
async def chat_stream_endpoint(request: Request, req: ChatRequest) -> StreamingResponse:
    """Multi-turn chat with live chain-of-thought as Server-Sent Events.

    Re-emits each event from ``runner.run_stream`` as SSE so the UI can paint
    every Bright Data call as a step while the roast text streams token by token.
    Live streaming requires the claude backend; codex falls back to a single
    ``result`` event (per fi-runner).

    Wire contract (event → payload):
      open          {"session_id"}
      plan          PlanWire                 (declare_plan)
      plan_rejected PlanRejectedWire         (PlanGuard veto — soft, stream continues)
      step_started  StepStartedWire          (start_step → row goes "running")
      step_done     StepDoneWire             (complete_step | fail_step)
      tool_call     ToolCallWire             (no input — PHI-safe)
      text          {"delta"}               (token-ish chunk)
      result        ResultWire
      error         {"message","kind"}
      done          {}                       (always fires last, even after error)
    """
    session_id = req.session_id  # already validated by Pydantic Field constraints
    message = clean_text(req.message, field="message", max_chars=REQUEST_TEXT_MAX_CHARS)
    backend = validate_backend(req.backend)
    corpus_id = clean_optional_id(req.corpus_id, field="corpus_id")

    # Per-turn telemetry capture. Lives in closure so each request gets its
    # own list (no cross-request leak). history_replayed → tool_called →
    # turn_completed compose the `meta` SSE event at end of turn.
    captured: list[tuple[str, dict]] = []
    t0 = time.perf_counter()

    def _on_event(event: str, fields: dict) -> None:
        captured.append((event, fields))
        # Error-ish events carry failure detail in `fields`. Default console
        # format doesn't render `extra`, so log fields INLINE for these so
        # the cause is always visible in Container App log stream.
        if event in ("backend_error", "guard_failed", "plan_rejected"):
            _log.warning("chat.event %s detail=%s", event, fields)
        else:
            _log.info(
                "chat.event %s",
                event,
                extra={"event": event, "session_id": session_id, "fields": fields},
            )

    async def gen():
        # Tell the client the stream is live so the UI flips 'thinking…' on
        # before the first tool_call lands (~1s delay otherwise).
        yield _sse("open", {"session_id": session_id})
        try:
            async with asyncio.timeout(CHAT_TURN_TIMEOUT_S):
                async for event in chat_stream(
                    message,
                    session_id=session_id,
                    backend=backend,
                    corpus_id=corpus_id,
                    mode=req.mode,
                    tone=req.tone,
                    on_event=_on_event,
                ):
                    etype = event.get("type")
                    if etype == "tool_call":
                        yield _sse("tool_call", dict(tool_call_to_wire(event["tool"])))
                    elif etype == "text":
                        yield _sse("text", {"delta": event["text"]})
                    elif etype == "plan":
                        # Semantic re-emit of declare_plan — UI uses this for the
                        # live checklist. Raw task_tracker tool_call already went
                        # through above, keeping the thinking panel in sync.
                        yield _sse("plan", dict(plan_to_wire(event["data"])))
                    elif etype == "plan_rejected":
                        # PlanGuard soft-veto — stream keeps going; agent retries.
                        yield _sse("plan_rejected", dict(plan_rejected_to_wire(event["data"])))
                    elif etype == "step_started":
                        yield _sse("step_started", dict(step_started_to_wire(event["data"])))
                    elif etype == "step_done":
                        yield _sse("step_done", dict(step_done_to_wire(event["data"])))
                    elif etype == "result":
                        # UI MUST REPLACE, not append — antidrift may have rewritten
                        # the live deltas. fallback_session_id covers backends that
                        # don't round-trip the client-issued id.
                        payload = result_to_wire(event["result"], fallback_session_id=session_id)
                        yield _sse("result", dict(payload))

            # Turn settled — emit closing telemetry as `meta`.
            # If turn_completed never fired (edge case), synthesize from wall clock.
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
            # Client closed the tab — propagate so the backend SDK request
            # actually cancels instead of burning tokens in the shadow.
            raise
        except TimeoutError as exc:
            _log.error(
                "chat turn exceeded %ss timeout (session=%s, mode=%s)",
                CHAT_TURN_TIMEOUT_S, session_id, req.mode,
            )
            yield _sse("error", {"message": public_error_message(exc), "kind": "TimeoutError"})
        except Exception as exc:  # noqa: BLE001 - boundary: surface to UI
            _log.exception("chat turn failed (session=%s, mode=%s)", session_id, req.mode)
            yield _sse("error", {"message": public_error_message(exc), "kind": type(exc).__name__})
        finally:
            yield _sse("done", {})

    # X-Accel-Buffering: no disables nginx/proxy buffering so events arrive
    # in real time. Connection: keep-alive keeps the SSE socket open on
    # hop-by-hop proxies.
    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.post("/chat/quip", dependencies=[Depends(verify_api_key)])
@limiter.limit("30/hour")
async def chat_quip_endpoint(request: Request, req: QuipRequest) -> QuipResponse:
    """One-line "waiting room" quip for the clinical skeleton.

    A cheap-tier one-shot (no MCP, no agent loop) that reacts to the user's
    message so the ~30s clinical wait feels alive instead of broken. Fired
    in parallel with /chat/stream by the frontend; purely decorative.

    Returns ``{"quip": null}`` when the message is sensitive/crisis (a joke
    over a crisis signal would break Rule 0) or when generation fails — the
    UI then keeps its hardcoded fallback line. Never blocks the real turn.
    """
    message = clean_text(req.message, field="message", max_chars=REQUEST_TEXT_MAX_CHARS)
    backend = validate_backend(req.backend)
    try:
        quip = await waiting_quip(message, backend=backend, tone=req.tone)
    except Exception:  # noqa: BLE001 - decorative: a quip failure is never an error
        _log.info("quip endpoint swallowed an error; returning null quip")
        quip = None
    return QuipResponse(quip=quip)
