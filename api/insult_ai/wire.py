"""Wire schemas — the **single source of truth** for what leaves this process
over the HTTP/SSE boundary.

The API streams a fi_runner ``TurnResult`` (and its ``ToolCall``\\s) to the
browser. Those classes carry full tool *inputs* — for Bright Data MCP that
includes URLs with query-string auth tokens, search queries verbatim, etc.
A naïve ``asdict`` of them would leak that to anyone watching the network tab.

So the wire shape is **deliberately narrower** than the in-process shape:

  - ``ToolCallWire``  — ``{name, server, id, is_error}``   (NO ``input``)
  - ``ResultWire``    — ``{text, tool_calls, usage, session_id}``

Two consumers must agree on these:

  1. ``api/insult_ai/app.py`` (the SSE endpoint) — calls
     :func:`tool_call_to_wire` / :func:`result_to_wire` to render events.
  2. ``web/components/chat/types.ts`` — the TS-side mirror (``Step``,
     ``ChatMessage`` for ``role:"assistant"``). When this shape changes,
     **both files change together**. There is no code-gen here on purpose
     (one feature, two languages); a divergence is caught fast because the
     hook silently drops unknown fields and the panel goes blank.

What's intentionally NOT here:

  - ``bench/eval_quality.py`` keeps its own local-full ``_tc_to_dict``
    that DOES carry ``input``. The bench writes ``.raw_roasts.jsonl``
    (gitignored) for offline re-scoring and ``_fetched_domains`` needs
    the inputs to recover what the agent actually scraped. That is a
    different contract (audit trail, never wire) — do not unify.
"""

from __future__ import annotations

from typing import Any, TypedDict


class ToolCallWire(TypedDict):
    """PHI-safe projection of ``fi_runner.ToolCall`` for the SSE wire.

    All four keys are always present (``total=True`` by default); each value
    is the raw attribute or ``None`` when the backend didn't fill it in
    (e.g. ``is_error`` stays ``None`` until the ``ToolResultBlock`` arrives)."""

    name: str | None
    server: str | None
    id: str | None
    is_error: bool | None


class ResultWire(TypedDict):
    """Projection of ``fi_runner.TurnResult`` for the SSE ``result`` event.

    ``text`` is the POST-guard text (antidrift may have rewritten it — the UI
    must REPLACE the streamed deltas, not append). ``tool_calls`` is the final
    list with ``is_error`` resolved; it supersedes the live ``tool_call`` events."""

    text: str
    tool_calls: list[ToolCallWire]
    usage: dict[str, Any] | None
    session_id: str | None


def tool_call_to_wire(tc: Any) -> ToolCallWire:
    """Serialize a fi_runner ``ToolCall`` (or any compatible object) to the
    wire shape, **dropping ``input``** to keep Bright Data tokens off the wire.

    Uses ``getattr`` with ``None`` defaults so a partial / mocked object still
    serializes cleanly — important during the live stream when a ``ToolUseBlock``
    arrives before its matching ``ToolResultBlock`` (``is_error`` is still ``None``)."""
    return {
        "name": getattr(tc, "name", None),
        "server": getattr(tc, "server", None),
        "id": getattr(tc, "id", None),
        "is_error": getattr(tc, "is_error", None),
    }


def result_to_wire(r: Any, *, fallback_session_id: str | None = None) -> ResultWire:
    """Serialize a fi_runner ``TurnResult`` to the wire shape.

    ``fallback_session_id`` is used when the backend didn't echo the session id
    back (e.g. a client-issued id that fi_runner doesn't round-trip). The SSE
    endpoint passes its own ``req.session_id`` so the client can correlate.

    Field access here is DIRECT (``r.text``, not ``getattr(r, "text", "")``) —
    unlike :func:`tool_call_to_wire`, which sees partially-filled objects mid-
    stream, the ``result`` event always carries a fully constructed TurnResult.
    Letting it raise AttributeError on a fi_runner-side rename is what we want:
    a silent default would hide the drift and ship empty results to the UI."""
    return {
        "text": r.text or "",
        "tool_calls": [tool_call_to_wire(t) for t in (r.tool_calls or [])],
        "usage": r.usage,
        "session_id": r.session_id or fallback_session_id,
    }
