"""Builds the Insult AI roast/fact-check agent on top of fi_runner.

Pattern mirrors discord-bot/insult (the proven production runner): an external
MCP server declared as an `MCPServerSpec`, a persona, a tool policy, and a
swappable backend. Here the MCP is Bright Data (live web data — the hackathon's
mandatory product) instead of Playwright.
"""

from __future__ import annotations

import logging
import os
from collections.abc import Callable
from pathlib import Path
from typing import Literal

from fi_runner import (
    ClaudeCodeBackend,
    CodexBackend,
    MCPServerSpec,
    PermissionMode,
    RetryPolicy,
    Runner,
    ToolPolicy,
)
from fi_runner.conversation import (
    ConversationStore,
    InMemoryConversationStore,
    Message,
    render_transcript,
)

# Extracted siblings (see .claude/rules/architecture.md — runner stays "config
# in, Runner out"). guards = anti-drift + ETHICS PlanGuard; prompts = turn-prompt
# construction; clinical_pipeline = the pure clinical safety decisions; modes =
# the shared Mode/Tone literals. The clinical safety machinery (classify_safety
# + the pipeline) used to be exercised ONLY by the bench — it is now wired into
# `_clinical_turn` below.
from .clinical_pipeline import (
    ClinicalResult,
    crisis_envelope,
    degraded_envelope,
    evaluate,
    finalize,
)
from .guards import build_guards, build_plan_guard, looks_spanish
from .modes import DEFAULT_TONE, Mode, Tone
from .prompts import (
    PROMPT_BY_MODE,
    clinical_prompt,
    looks_like_roast_target,
    wrap_with_safety_floor,
    wrap_with_tone,
)
from .safety import classify_safety

_log = logging.getLogger(__name__)

# Slice 3 — Psychology corpus flags. When ENABLED and mode is "clinical" and
# the user did not supply their own corpus_id, the runner falls back to the
# curated public-knowledge corpus identified by INSULT_AI_PSYCH_CORPUS_ID.
# Default OFF: with ENABLED unset or != "1", clinical mode behaves bit-
# identically to pre-Slice-3 master. See _resolve_clinical_corpus_id below.
_PSYCH_CORPUS_ENABLED_ENV = "INSULT_AI_PSYCH_CORPUS_ENABLED"
_PSYCH_CORPUS_ID_ENV = "INSULT_AI_PSYCH_CORPUS_ID"
_PSYCH_CORPUS_DEFAULT_ID = "psych_public_v1"


def _resolve_clinical_corpus_id(user_corpus_id: str | None, mode: str) -> str | None:
    """Decide which corpus_id this turn should use.

    Precedence (highest first):

      1. ``user_corpus_id`` — if the user uploaded their own docs and passed
         a corpus_id on the request, that wins absolutely. Slice 3 does not
         merge corpora; user choice is sovereign.

      2. ``mode == "clinical"`` AND ``INSULT_AI_PSYCH_CORPUS_ENABLED == "1"``
         — fall back to ``INSULT_AI_PSYCH_CORPUS_ID`` (default
         ``"psych_public_v1"``).

      3. Otherwise — None. No RAG wired this turn.

    Returning None means "skip rag_store capability for this turn."
    Returning a string means "wire rag_store and inject the corpus_id into
    the prompt." The chosen corpus_id flows uniformly into both
    ``build_runner(with_rag=...)`` and ``PROMPT_BY_MODE[mode](..., corpus_id)``.
    """
    if user_corpus_id:
        return user_corpus_id
    if mode != "clinical":
        return None
    if os.environ.get(_PSYCH_CORPUS_ENABLED_ENV) != "1":
        return None
    return os.environ.get(_PSYCH_CORPUS_ID_ENV, _PSYCH_CORPUS_DEFAULT_ID)

# --- Personas --------------------------------------------------------------
# Prompts live in files (personas/<name>.md), NOT hardcoded — the voice is
# content that iterates fast (mirrors discord-bot's persona.md). Editing the
# roast voice never touches this module. The dual-persona (roast = hook,
# brief = business value; see .claude/rules/personas.md) is just two files here.
_PERSONAS_DIR = Path(__file__).parent / "personas"


def load_persona(name: str) -> str:
    """Load a persona prompt from ``personas/<name>.md`` (content, not code)."""
    return (_PERSONAS_DIR / f"{name}.md").read_text(encoding="utf-8").strip()


ROAST_PERSONA = load_persona("roast")
BRIEF_PERSONA = load_persona("brief")
CLINICAL_PERSONA = load_persona("clinical_compadre")

# The product modes: three personas over the SAME Runner (same backend, same
# Bright Data MCP capability, same receipts + grounding contract). Selected at
# call time — config, not code (see .claude/rules/personas.md). Adding a new
# mode = a new file in personas/ + an entry in the three dispatch tables
# below. NO engine changes.
#
# `clinical` is the pivot persona: a clinical-informed coach disfrazado de
# compa insultador. Same Runner, different prompt, different output shape
# (JSON envelope — see clinical_envelope.py). The tone parameter modulates
# it within bounds the persona enforces (soft/medium/spicy/no_insults).
# ``Mode`` / ``Tone`` are defined in :mod:`insult_ai.modes` (shared leaf).
_PERSONA_BY_MODE: dict[Mode, str] = {
    "roast": ROAST_PERSONA,
    "brief": BRIEF_PERSONA,
    "clinical": CLINICAL_PERSONA,
}

BackendName = Literal["claude", "codex"]
_VALID_BACKENDS: set[str] = {"claude", "codex"}


def normalize_backend_name(backend: str | None = None) -> BackendName:
    """Resolve and validate the requested backend name.

    Before this check, any typo other than ``codex`` silently selected Claude
    because the code's fallback branch handled every unknown string. That makes
    operational mistakes hard to diagnose and can send traffic to the wrong
    provider. Unknown values now fail fast with a clear ValueError that the API
    maps to HTTP 400.
    """
    name = (backend or os.getenv("INSULT_AI_BACKEND", "claude")).strip().lower()
    if name not in _VALID_BACKENDS:
        raise ValueError(
            f"unsupported backend {name!r}; expected one of {sorted(_VALID_BACKENDS)}"
        )
    return name  # type: ignore[return-value]

# --- Bright Data MCP (live web data — REQUIRED by the hackathon) -----------
# Runs as `npx @brightdata/mcp`. It reads its credential from the API_TOKEN env
# var, which the subprocess inherits because MCPServerSpec.env_passthrough
# defaults to True (so just set API_TOKEN in the container/host env).
BRIGHTDATA_MCP = MCPServerSpec(
    name="brightdata",
    command="npx",
    args=["-y", "@brightdata/mcp"],
)

# --- Chat conversation store ----------------------------------------------
# Module-level so multi-turn chat sessions persist across `/chat/stream` calls
# without making every endpoint pass it explicitly. In-memory is fine for the
# demo (a process restart wipes sessions); swap for RedisConversationStore when
# the API runs multi-replica. Same instance is shared by every chat Runner so a
# follow-up turn sees the previous user+assistant messages via `session_id`.
_CHAT_STORE: ConversationStore = InMemoryConversationStore(max_messages=40)


def chat_store() -> ConversationStore:
    """Expose the process-wide chat store (for tests / inspection)."""
    return _CHAT_STORE


# --- Backend singleton ------------------------------------------------------
# `build_runner` was rebuilding the backend on every chat turn, which made the
# Bright Data MCP subprocess (npx @brightdata/mcp) re-spawn on every turn — ~1-3s
# of dead time per request. ClaudeCodeBackend / CodexBackend are heavyweight
# objects that own SDK clients and MCP pools internally; they're safe to share
# across turns (the Runner orchestrates per-turn state on top of them). We key
# the cache by backend NAME ("claude" / "codex") because the auth pivot lives
# in __init__: a process picks one and sticks to it.
_BACKENDS: dict[str, ClaudeCodeBackend | CodexBackend] = {}


def _make_backend(name: str) -> ClaudeCodeBackend | CodexBackend:
    """Construct the agent backend for ``name`` (``claude`` | ``codex``).

    Auth precedence footgun (claude only): the Claude Agent SDK gives an
    ambient ``ANTHROPIC_API_KEY`` priority over the OAuth token, silently
    hijacking subscription auth. A stale key in a dev shell then surfaces as
    "Invalid API key". Picking ``claude`` AND supplying an OAuth token is an
    explicit intent to use the subscription, so drop any ambient API key and
    let the SDK fall through to OAuth. No-op in the container (the entrypoint
    env carries no ANTHROPIC_API_KEY)."""
    name = normalize_backend_name(name)
    if name == "codex":
        # API-motor mode: Codex CLI pointed at Azure OpenAI. Key read from
        # AZURE_OPENAI_API_KEY in the env (never passed inline).
        return CodexBackend(
            default_model=os.getenv("INSULT_AI_MODEL", "gpt-4.1"),
            azure_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],  # https://<res>.openai.azure.com/openai/v1
        )
    # Claude Code (Max). OAuth token materialized to ~/.claude/.credentials.json
    # by entrypoint.sh; the SDK reads it there.
    if os.getenv("CLAUDE_CODE_OAUTH_TOKEN"):
        os.environ.pop("ANTHROPIC_API_KEY", None)
    return ClaudeCodeBackend(
        default_model=os.getenv("INSULT_AI_MODEL", "claude-sonnet-4-5"),
    )


def _get_backend(name: str) -> ClaudeCodeBackend | CodexBackend:
    """Process-wide backend cache (one per name). Reusing the same backend
    instance keeps its internal SDK client + MCP pool alive across turns,
    so the @brightdata/mcp subprocess isn't re-spawned on every chat turn."""
    name = normalize_backend_name(name)
    inst = _BACKENDS.get(name)
    if inst is None:
        inst = _make_backend(name)
        _BACKENDS[name] = inst
    return inst


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
    hook — abrasive, fragment voice) or ``brief`` (the business-value — a
    structured competitive briefing). Persona + guards + prompt wrapper all
    dispatch off this one arg. Adding a new mode = a new ``personas/*.md``
    + entries in the three dispatch tables; the engine stays untouched.

    With ``with_rag``, also wire the fi-core rag_store capability so the agent can
    mine the user's document corpus. With ``conversation_store``, the Runner folds
    prior turns into the next prompt (chat mode), keyed by ``session_id``.

    ``on_event`` is fi_runner's telemetry sink — it fires for ``history_replayed``,
    ``tool_called``, ``turn_completed``, ``backend_error``, etc. The chat endpoint
    uses this to log structured per-turn metrics AND to emit an SSE ``meta`` event
    with latency/tokens/tool_count to the UI.

    ``target_hint`` is the user's input for this turn (URL/claim for /roast,
    the current message for /chat). It decides the guard language layer: when
    it looks Spanish (see :func:`looks_spanish`), Spanish drift patterns are
    layered on top of the English ones so a Spanish-side roast/brief can still
    be guard-checked. Pass ``None`` for pure-EN guards.

    The Runner itself is cheap (a config holder); the BACKEND is the expensive
    bit and it's cached process-wide — see :func:`_get_backend`."""
    backend_name = normalize_backend_name(backend)
    agent_backend = _get_backend(backend_name)

    # Capabilities (fi-core MCPs, resolved by fi-runner — we never import fi_core):
    # - task_tracker is ON for the agentic modes (roast / brief). The agent calls
    #   declare_plan / start_step / complete_step|fail_step so fi-runner can re-emit
    #   semantic plan/step_started/step_done events. UI gets a live checklist instead
    #   of an opaque "thinking…". Costs ~1 + 2·N extra MCP round-trips per turn.
    # - rag_store opt-in via with_rag — the agent search_documents'es the user's
    #   corpus for extra ammo.
    # - CLINICAL mode is one-shot conversational (no agent plan, no web fetch).
    #   It SKIPS task_tracker AND Bright Data — the persona just reads the user
    #   message + tone context and emits the JSON envelope. Wiring those in would
    #   only burn latency + an MCP round-trip for nothing.
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
        # Block the built-in WebSearch/WebFetch so ALL web access goes through
        # Bright Data (the hackathon requirement + what the $250 credit is for) —
        # otherwise the agent reaches for the native SERP and skips the MCP.
        tool_policy=ToolPolicy(
            permission_mode=PermissionMode.BYPASS,
            builtin_disallowed=["WebSearch", "WebFetch"],
        ),
        # Anti-drift: if the output breaks character (report voice in the roast,
        # assistant tone, AI-disclosure), the runner re-runs the turn once more
        # with reinforcement appended. Mode-specific because the BRIEF mode
        # legitimately uses markdown structure — those packs would false-positive
        # against the brief. Guards are built per-turn because the language layer
        # depends on the target — Runner is cheap; the BACKEND is what's cached
        # (see _get_backend).
        guards=build_guards(mode, target_hint),
        # Plan-first ethics defense: inspects the agent's `declare_plan` BEFORE
        # any other tool fires. Pairs with the persona's PLAN BEFORE YOU ACT
        # contract — the persona orders the agent to write its route, this guard
        # vetoes a route that targets identity attributes. Static (no language
        # branch): the plan is always in English per persona instructions
        # ("4-8 short imperative labels"), regardless of the roast's output language.
        plan_guard=build_plan_guard(),
        retry_policy=RetryPolicy(max_attempts=2),
        # Multi-turn chat memory (None = stateless single-shot, like /roast).
        conversation_store=conversation_store,
        # Telemetry — None for /roast (we don't surface per-turn metrics yet),
        # cabled for /chat/stream so the UI can show "done in 2.3s · 4 tools".
        on_event=on_event,
    )


# --- Clinical mode orchestration -------------------------------------------
# The pure clinical safety decisions (crisis envelope, parse+judge, degrade,
# finalize, ceiling-raise) live in :mod:`insult_ai.clinical_pipeline`. What
# stays here is the ORCHESTRATOR — the glue that ties the engine (build_runner,
# the chat store) to those decisions across the regenerate-once-then-degrade
# loop. See .claude/rules/clinical.md for the contract.


async def _persist_clinical(
    session_id: str | None, user_message: str, assistant_json: str
) -> None:
    """Append the FINAL (post-pipeline) exchange to the shared chat store.

    We persist manually — the clinical runner runs store-less, so an unjudged or
    regenerated draft never lands in history; only what the user actually saw
    does. Persistence failure is logged, not fatal (the next turn just loses
    this exchange from context)."""
    if not session_id:
        return
    try:
        await _CHAT_STORE.append(
            session_id,
            [
                Message(role="user", content=user_message),
                Message(role="assistant", content=assistant_json),
            ],
        )
    except Exception as exc:  # noqa: BLE001 - persistence is best-effort
        _log.warning("clinical_safety persist_failed session=%s err=%s", session_id, exc)


async def _clinical_turn(
    message: str,
    *,
    session_id: str | None,
    backend: str | None,
    corpus_id: str | None,
    tone: Tone,
    on_event: Callable[[str, dict], None] | None,
) -> ClinicalResult:
    """Run one clinical turn through the full safety pipeline (see the module
    comment above for the four stages) and return a finalized envelope —
    validated, judged, and, if needed, degraded to something safe."""
    floor = classify_safety(message)
    is_spanish = looks_spanish(message)

    # Stage 1 — crisis hard-stop. The regex caught an acute signal; do NOT run
    # the LLM. Hand off immediately with a localized resource.
    if floor == "crisis":
        _log.info("clinical_safety hard_stop=crisis session=%s", session_id)
        final = finalize(crisis_envelope(message, is_spanish), message, is_spanish)
        await _persist_clinical(session_id, message, final)
        return ClinicalResult(text=final, session_id=session_id)

    effective_corpus_id = _resolve_clinical_corpus_id(corpus_id, "clinical")
    if effective_corpus_id and effective_corpus_id != corpus_id:
        _log.info(
            "psych_corpus_resolved entrypoint=clinical session_id=%s corpus_id=%s",
            session_id, effective_corpus_id,
        )

    # Store-less runner — we persist the final envelope ourselves below.
    runner = build_runner(
        backend,
        mode="clinical",
        with_rag=bool(effective_corpus_id),
        conversation_store=None,
        on_event=on_event,
        target_hint=message,
    )
    history = await _CHAT_STORE.load(session_id) if session_id else []
    transcript = render_transcript(history, message)
    base_prompt = wrap_with_tone(
        clinical_prompt(transcript, effective_corpus_id), tone
    )
    prompt = wrap_with_safety_floor(base_prompt, floor)

    # Stage 2 — first attempt.
    result = await runner.run(prompt)
    decision, env, reinforce = evaluate(result.text, floor)
    usage = result.usage
    if decision == "ship":
        final = finalize(env, message, is_spanish)  # type: ignore[arg-type]
        await _persist_clinical(session_id, message, final)
        return ClinicalResult(text=final, usage=usage, session_id=session_id)
    if decision == "crisis":
        _log.warning("clinical_safety crisis_violation session=%s -> fallback", session_id)
        final = finalize(crisis_envelope(message, is_spanish), message, is_spanish)
        await _persist_clinical(session_id, message, final)
        return ClinicalResult(text=final, usage=usage, session_id=session_id)

    # Stage 3 — regenerate ONCE with reinforcement.
    _log.info("clinical_safety regenerate session=%s", session_id)
    result2 = await runner.run(f"{prompt}\n\n[System: {reinforce}]")
    decision2, env2, _ = evaluate(result2.text, floor)
    usage = result2.usage or usage
    if decision2 == "ship":
        final = finalize(env2, message, is_spanish)  # type: ignore[arg-type]
        await _persist_clinical(session_id, message, final)
        return ClinicalResult(text=final, usage=usage, session_id=session_id)
    if decision2 == "crisis":
        _log.warning(
            "clinical_safety crisis_violation_retry session=%s -> fallback", session_id
        )
        final = finalize(crisis_envelope(message, is_spanish), message, is_spanish)
        await _persist_clinical(session_id, message, final)
        return ClinicalResult(text=final, usage=usage, session_id=session_id)

    # Stage 3b — degrade to a deterministic safe envelope.
    _log.warning("clinical_safety degrade session=%s (regenerate failed)", session_id)
    final = finalize(
        degraded_envelope(floor, env2 or env, message, is_spanish), message, is_spanish
    )
    await _persist_clinical(session_id, message, final)
    return ClinicalResult(text=final, usage=usage, session_id=session_id)


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
      - ``brief``    — structured competitive intelligence brief (the
                       business value: GTM battlecards, outreach hooks).
      - ``clinical`` — clinical-informed coach disfrazado de compa
                       insultador. Emits a JSON envelope (see
                       clinical_envelope.py).

    ``tone`` only affects ``clinical`` mode (soft / medium / spicy /
    no_insults). The other modes ignore it.

    The function is still called ``roast`` for backwards compatibility
    with the API + bench, but it dispatches all three modes."""
    # Clinical runs the full safety pipeline (pre-LLM classifier, envelope
    # judge, regenerate-once-then-degrade, crisis hand-off) instead of a bare
    # turn. Single-shot /roast has no session, so no multi-turn history or
    # persistence — the pipeline still validates and degrades the one turn.
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
    return await runner.run(prompt)


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

    Yields, in order, the events from ``Runner.run_stream``:
      - ``{"type":"tool_call","tool":ToolCall}`` per Bright Data / RAG call,
      - ``{"type":"text","text":delta}`` as the assistant text arrives,
      - ``{"type":"result","result":TurnResult}`` once guards settle.

    ``mode`` picks the persona (see :data:`Mode`). Each turn's runner is
    rebuilt with that mode's persona + guards — switching mid-conversation
    is supported and intentional (the chat history is shared across modes,
    so "now write a brief on the same target" works after a roast turn).

    ``on_event`` taps fi_runner's telemetry sink (history_replayed, tool_called,
    turn_completed, backend_error). The endpoint uses it to (a) log structured
    per-turn metrics and (b) emit an SSE ``meta`` event to the UI.

    The first user turn of a session may use the mode's prompt framing
    (URL/claim → roast/brief); follow-ups go in as plain chat. We detect
    "first turn" via the shared conversation store. The Runner is built per
    turn (cheap) but shares ``_CHAT_STORE`` so prior turns are replayed for
    context.

    Clinical mode does NOT stream a live chain-of-thought — it's one-shot
    conversational, and its output must be validated/degraded as a whole
    before it reaches the browser. So it bypasses ``run_stream`` entirely:
    ``_clinical_turn`` runs the full safety pipeline and we emit a single
    synthetic ``result`` event carrying the finalized envelope JSON. The UI's
    clinical renderer replaces on ``result`` anyway, so nothing is lost."""
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
        # Per-turn target hint — the language layer of the guards adapts to
        # THIS turn's message. A bilingual conversation flips guard packs
        # turn-by-turn, which is what we want.
        target_hint=message,
    )
    history = await _CHAT_STORE.load(session_id)
    is_first_turn = not history
    # On turn 1 the user message is USUALLY a target ("acme.com") — wrap it
    # so the agent fetches + roasts (or briefs). But if the user opens with
    # free-form chat ("hey, can you roast something for me?") the wrap reads
    # weirdly; the heuristic gates it. Subsequent turns ALWAYS go raw (the
    # conversation already carries the context via the conversation_store
    # replay).
    prompt = (
        PROMPT_BY_MODE[mode](message, effective_corpus_id)
        if is_first_turn and looks_like_roast_target(message)
        else message
    )
    async for event in runner.run_stream(prompt, session_id=session_id):
        yield event
