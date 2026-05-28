"""Builds the Insult AI roast/fact-check agent on top of fi_runner.

Pattern mirrors discord-bot/insult (the proven production runner): an external
MCP server declared as an `MCPServerSpec`, a persona, a tool policy, and a
swappable backend. Here the MCP is Bright Data (live web data — the hackathon's
mandatory product) instead of Playwright.

Extracted siblings:
  backend.py           — backend factory + process-wide singleton cache
  corpus.py            — corpus_id resolution for RAG (Slice 3 psych corpus)
  store.py             — process-wide InMemoryConversationStore singleton
  clinical/orchestrator.py  — _clinical_turn (full safety pipeline + persistence)
  guards.py            — anti-drift + ETHICS PlanGuard
  prompts.py           — turn-prompt construction
  clinical/pipeline.py  — pure clinical safety decisions (LLM-free)
  modes.py             — shared Mode/Tone literals
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from pathlib import Path

from fi_runner import (
    MCPServerSpec,
    PermissionMode,
    RetryPolicy,
    Runner,
    ToolPolicy,
)
from fi_runner.conversation import ConversationStore

from .backend import _get_backend, normalize_backend_name
from .clinical.orchestrator import _clinical_turn
from .corpus import _resolve_clinical_corpus_id
from .guards import build_guards, build_plan_guard
from .modes import DEFAULT_TONE, Mode, Tone
from .prompts import PROMPT_BY_MODE, looks_like_roast_target
from .receipts import ensure_result_receipts
from .store import _CHAT_STORE, chat_store

_log = logging.getLogger(__name__)

# --- Personas -----------------------------------------------------------------
# Prompts live in files (personas/<name>.md), NOT hardcoded — the voice is
# content that iterates fast. Editing the roast voice never touches this module.
_PERSONAS_DIR = Path(__file__).parent / "personas"


def load_persona(name: str) -> str:
    """Load a persona prompt from ``personas/<name>.md`` (content, not code)."""
    return (_PERSONAS_DIR / f"{name}.md").read_text(encoding="utf-8").strip()


ROAST_PERSONA = load_persona("roast")
BRIEF_PERSONA = load_persona("brief")
CLINICAL_PERSONA = load_persona("clinical_compadre")

_PERSONA_BY_MODE: dict[Mode, str] = {
    "roast": ROAST_PERSONA,
    "brief": BRIEF_PERSONA,
    "clinical": CLINICAL_PERSONA,
}

# --- Bright Data MCP (live web data — REQUIRED by the hackathon) -------------
# Runs as `npx @brightdata/mcp`. Reads its credential from API_TOKEN (env
# passthrough). See .claude/rules/bright-data.md.
BRIGHTDATA_MCP = MCPServerSpec(
    name="brightdata",
    command="npx",
    args=["-y", "@brightdata/mcp"],
)

# Re-export for external consumers (bench, validation.py) so they don't need
# to know about the backend/corpus split.
__all__ = [
    "BRIGHTDATA_MCP",
    "build_runner",
    "chat_store",
    "chat_stream",
    "load_persona",
    "normalize_backend_name",
    "roast",
]


def build_runner(
    backend: str | None = None,
    *,
    mode: Mode = "roast",
    with_rag: bool = False,
    conversation_store: ConversationStore | None = None,
    on_event: Callable[[str, dict], None] | None = None,
    target_hint: str | None = None,
) -> Runner:
    """Compose a fi_runner Runner with the chosen backend + Bright Data MCP.

    ``mode`` selects the product persona (see :data:`Mode`): ``roast`` (the
    hook), ``brief`` (the business-value brief), or ``clinical`` (the
    compa-clínico conversational mode). Persona + guards + prompt wrapper all
    dispatch off this one arg. Adding a new mode = a new ``personas/*.md``
    + entries in the three dispatch tables; the engine stays untouched.

    ``target_hint`` is the user's input for this turn. It decides the guard
    language layer: when it looks Spanish, Spanish drift patterns are layered
    on top of the English ones. Pass ``None`` for pure-EN guards.

    The Runner itself is cheap (a config holder); the BACKEND is the expensive
    bit and it's cached process-wide — see :func:`backend._get_backend`.
    """
    backend_name = normalize_backend_name(backend)
    agent_backend = _get_backend(backend_name)

    # Clinical mode is one-shot conversational — no task_tracker, no Bright
    # Data MCP (no web fetch needed). Wiring those would only burn latency.
    is_clinical = mode == "clinical"
    capability_names: list[str] = []
    if not is_clinical:
        capability_names.append("task_tracker")
    if with_rag:
        capability_names.append("rag_store")
    extra_mcp = [] if is_clinical else [BRIGHTDATA_MCP]

    return Runner(
        backend=agent_backend,
        persona=_PERSONA_BY_MODE[mode],
        extra_mcp_servers=extra_mcp,
        capabilities=capability_names,
        # BYPASS = auto-approve tool calls (needs non-root user in the container).
        # Block native WebSearch/WebFetch so ALL web access goes through
        # Bright Data — otherwise the agent reaches for native SERP and skips
        # the MCP (burning the $250 credit for nothing).
        tool_policy=ToolPolicy(
            permission_mode=PermissionMode.BYPASS,
            builtin_disallowed=["WebSearch", "WebFetch"],
        ),
        guards=build_guards(mode, target_hint),
        plan_guard=build_plan_guard(),
        retry_policy=RetryPolicy(max_attempts=2),
        conversation_store=conversation_store,
        on_event=on_event,
    )


async def roast(
    target: str,
    backend: str | None = None,
    corpus_id: str | None = None,
    mode: Mode = "roast",
    tone: Tone = DEFAULT_TONE,
):
    """Run one turn against the agent. ``target`` is a URL or a claim.

    ``mode`` picks the product persona (see :data:`Mode`):
      - ``roast``    — abrasive fragment-voice takedown (the hook).
      - ``brief``    — structured competitive intelligence brief.
      - ``clinical`` — clinical-informed coach; emits a JSON envelope.

    ``tone`` only affects ``clinical`` mode (soft / medium / spicy /
    no_insults). The other modes ignore it.
    """
    if mode == "clinical":
        return await _clinical_turn(
            target,
            session_id=None,
            backend=backend,
            corpus_id=corpus_id,
            tone=tone,
            on_event=None,
        )
    effective_corpus_id = _resolve_clinical_corpus_id(corpus_id, mode)
    runner = build_runner(
        backend,
        mode=mode,
        with_rag=bool(effective_corpus_id),
        target_hint=target,
    )
    prompt = PROMPT_BY_MODE[mode](target, effective_corpus_id)
    result = await runner.run(prompt)
    return ensure_result_receipts(result)


async def chat_stream(
    message: str,
    *,
    session_id: str,
    backend: str | None = None,
    corpus_id: str | None = None,
    mode: Mode = "roast",
    tone: Tone = DEFAULT_TONE,
    on_event: Callable[[str, dict], None] | None = None,
):
    """Stream a chat turn as dict events (chain-of-thought).

    Yields, in order:
      - ``{"type":"tool_call","tool":ToolCall}`` per Bright Data / RAG call,
      - ``{"type":"text","text":delta}`` as the assistant text arrives,
      - ``{"type":"result","result":TurnResult}`` once guards settle.

    Clinical mode does NOT stream a live chain-of-thought — it's one-shot and
    its output must be validated/degraded as a whole before reaching the
    browser. It bypasses ``run_stream`` entirely and emits a single synthetic
    ``result`` event carrying the finalized envelope JSON.
    """
    if mode == "clinical":
        result = await _clinical_turn(
            message,
            session_id=session_id,
            backend=backend,
            corpus_id=corpus_id,
            tone=tone,
            on_event=on_event,
        )
        yield {"type": "result", "result": result}
        return

    effective_corpus_id = _resolve_clinical_corpus_id(corpus_id, mode)
    runner = build_runner(
        backend,
        mode=mode,
        with_rag=bool(effective_corpus_id),
        conversation_store=_CHAT_STORE,
        on_event=on_event,
        target_hint=message,
    )
    history = await _CHAT_STORE.load(session_id)
    is_first_turn = not history
    # On turn 1 the user message is USUALLY a target ("acme.com") — wrap it
    # so the agent fetches + roasts/briefs. Free-form chat openers go raw.
    # Subsequent turns ALWAYS go raw (conversation_store replays history).
    prompt = (
        PROMPT_BY_MODE[mode](message, effective_corpus_id)
        if is_first_turn and looks_like_roast_target(message)
        else message
    )
    async for event in runner.run_stream(prompt, session_id=session_id):
        if event.get("type") == "result":
            event = {**event, "result": ensure_result_receipts(event["result"])}
        yield event
