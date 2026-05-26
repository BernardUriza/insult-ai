"""Wire schemas — the **single source of truth** for what leaves this process
over the HTTP/SSE boundary.

The API streams a fi_runner ``TurnResult`` (and its ``ToolCall``\\s) to the
browser. Those classes carry full tool *inputs* — for Bright Data MCP that
includes URLs with query-string auth tokens, search queries verbatim, etc.
A naïve ``asdict`` of them would leak that to anyone watching the network tab.

So the wire shape is **deliberately narrower** than the in-process shape:

  - ``ToolCallWire``     — ``{name, server, id, is_error}``        (NO ``input``)
  - ``ResultWire``       — ``{text, tool_calls, usage, session_id}``
  - ``PlanWire``         — ``{session_id, steps}``                 (declare_plan)
  - ``StepStartedWire``  — ``{plan_id, step_index}``               (start_step)
  - ``StepDoneWire``     — ``{plan_id, step_index, status, summary?, error?}``
  - ``PlanRejectedWire`` — ``{reason, matched, guard}`` (PlanGuard pre-execution veto)

The three plan shapes are also PHI-safe by construction: ``steps`` are agent-
authored short labels, ``summary`` is a one-line factual recap of what the step
returned (the persona is explicit: factual, not roast-flavored). Neither the
tool's URL nor any Bright Data token ever lands in them.

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

from typing import Any, Literal, TypedDict


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


class PlanWire(TypedDict):
    """Re-emit of fi_runner's derived ``plan`` event (from ``declare_plan``).

    ``steps`` is the ordered list of step labels the agent committed to. The UI
    paints one row per step and toggles its state as ``step_started`` /
    ``step_done`` events land. ``session_id`` is for client-side reconciliation
    on a reconnect (not used today; reserved)."""

    session_id: str | None
    steps: list[str]


class StepStartedWire(TypedDict):
    """``start_step(plan_id, step_index)`` — UI flips that row to ``running``."""

    plan_id: str | None
    step_index: int


class StepDoneWire(TypedDict):
    """``complete_step`` / ``fail_step`` — UI flips that row to done/failed and
    pins the one-line summary (or error) under it. ``status`` is the discriminant."""

    plan_id: str | None
    step_index: int
    status: Literal["done", "failed"]
    summary: str | None
    error: str | None


class PlanRejectedMatchWire(TypedDict):
    """One step that tripped the PlanGuard policy. ``pattern`` is included so the
    UI can show *why* (e.g. "race / ethnicity") — but the FULL regex source is
    dropped (long and useless to a user). The wire-side ``pattern`` is the
    human-readable guard NAME, not the regex itself."""

    index: int
    label: str


class PlanRejectedWire(TypedDict):
    """fi_runner's ``plan_rejected`` event projected to the wire. Soft-reject:
    the stream KEEPS GOING (the agent's retry path picks up the reinforcement
    and re-declares). The UI uses this to flip a banner on the checklist."""

    reason: str
    matched: list[PlanRejectedMatchWire]
    guard: str | None


def plan_to_wire(data: dict[str, Any]) -> PlanWire:
    """Project fi_runner's ``plan`` event payload to the wire. No PHI risk —
    ``steps`` are agent-authored short labels (no URLs, no tokens) and
    ``session_id`` is the one the client issued."""
    raw_steps = data.get("steps") or []
    return {
        "session_id": data.get("session_id"),
        "steps": [str(s) for s in raw_steps if isinstance(s, (str, int, float))],
    }


def step_started_to_wire(data: dict[str, Any]) -> StepStartedWire:
    return {
        "plan_id": data.get("plan_id"),
        # Coerce defensively — codex doesn't capture MCP tool inputs (see
        # _derive_plan_events) so this path rarely fires there, but if it does
        # we don't want a string sneaking through and confusing the UI.
        "step_index": int(data.get("step_index") or 0),
    }


def plan_rejected_to_wire(data: dict[str, Any]) -> PlanRejectedWire:
    """Project fi_runner's ``plan_rejected`` payload to the wire. Keep ``index``
    + ``label`` per matched step; drop the raw regex source (long, leaks
    implementation detail) — the ``guard`` name carries enough signal for the UI."""
    raw_matched = data.get("matched") or []
    matched: list[PlanRejectedMatchWire] = []
    for m in raw_matched:
        if not isinstance(m, dict):
            continue
        try:
            matched.append({
                "index": int(m.get("index") or 0),
                "label": str(m.get("label") or ""),
            })
        except (TypeError, ValueError):
            continue
    return {
        "reason": str(data.get("reason") or "plan rejected"),
        "matched": matched,
        "guard": data.get("guard"),
    }


def step_done_to_wire(data: dict[str, Any]) -> StepDoneWire:
    status = data.get("status")
    return {
        "plan_id": data.get("plan_id"),
        "step_index": int(data.get("step_index") or 0),
        "status": "failed" if status == "failed" else "done",
        "summary": data.get("summary"),
        "error": data.get("error"),
    }


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
