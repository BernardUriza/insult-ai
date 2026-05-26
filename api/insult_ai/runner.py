"""Builds the Insult AI roast/fact-check agent on top of fi_runner.

Pattern mirrors discord-bot/insult (the proven production runner): an external
MCP server declared as an `MCPServerSpec`, a persona, a tool policy, and a
swappable backend. Here the MCP is Bright Data (live web data — the hackathon's
mandatory product) instead of Playwright.
"""

from __future__ import annotations

import os
import re
from collections.abc import Callable
from pathlib import Path
from typing import Literal

from fi_runner import (
    ClaudeCodeBackend,
    CodexBackend,
    MCPServerSpec,
    PermissionMode,
    PlanGuard,
    RetryPolicy,
    Runner,
    ToolPolicy,
    antidrift_guard,
    packs,
    plan_guard,
)
from fi_runner.conversation import ConversationStore, InMemoryConversationStore

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

# The product modes: two personas over the SAME Runner (same backend, same
# Bright Data MCP, same receipts + grounding). Selected at call time — config,
# not code (see .claude/rules/personas.md). Adding a new mode = a new file in
# personas/ + an entry in the three dispatch tables below. NO engine changes.
Mode = Literal["roast", "brief"]

_PERSONA_BY_MODE: dict[Mode, str] = {
    "roast": ROAST_PERSONA,
    "brief": BRIEF_PERSONA,
}

# --- Bright Data MCP (live web data — REQUIRED by the hackathon) -----------
# Runs as `npx @brightdata/mcp`. It reads its credential from the API_TOKEN env
# var, which the subprocess inherits because MCPServerSpec.env_passthrough
# defaults to True (so just set API_TOKEN in the container/host env).
BRIGHTDATA_MCP = MCPServerSpec(
    name="brightdata",
    command="npx",
    args=["-y", "@brightdata/mcp"],
)

# --- Guards: keep Insult IN character (anti-drift) -------------------------
# Compose fi-core's built-in pattern packs via `fi_runner.packs` (boundary-clean
# — we never import fi_core) that flag the drift we fought to kill: report-voice
# markdown headers, "TL;DR"/summaries, stage directions, AI-disclosure ("as an
# AI"), customer-service tone. On a break the runner re-roasts (RetryPolicy) with
# the reinforcement appended, so the voice stays Insult turn after turn — and the
# benchmark can read result.guard_outcomes instead of a hand-rolled heuristic.
#
# Language branch — the system writes English (.claude/rules/language.md), but
# the persona's "Match the target's language" rule means a Spanish target gets
# a Spanish roast. When THAT happens, English-only drift patterns ("as an AI")
# won't catch Spanish-side drift ("soy un bot diseñado para…"). So we layer in
# packs.DEFAULT_ES on top of DEFAULT_EN when the input looks Spanish. Both
# layers always include the style packs (MARKDOWN_DRIFT / SUMMARIZING /
# STAGE_DIRECTIONS), which are catalog-by-format and language-agnostic.
_SPANISH_DOMAIN_TLD = re.compile(
    r"\.(mx|ar|cl|co|es|pe|uy|ec|gt|hn|bo|sv|do|ni|cr|py|ve|cu)\b",
    re.IGNORECASE,
)
_SPANISH_GLYPH = re.compile(r"[áéíóúñüÁÉÍÓÚÑÜ¿¡]")
# Very common Spanish function words — rare in English-language inputs. We
# require ≥2 hits to fire so a stray "esta" in an English sentence doesn't
# flip the language.
_SPANISH_STOPWORDS = re.compile(
    r"\b(el|la|los|las|una?|y|o|pero|que|porque|para|por|con|sin|del|al|"
    r"de|se|le|"
    r"esto|este|esta|esa|ese|aquel|aquella|son|fue|era|estaba|hay|muy|"
    r"como|cuando|donde|porque|tambi[eé]n|tampoco|m[aá]s|menos|"
    r"ahora|antes|despu[eé]s|siempre|nunca|ayer|hoy|ma[ñn]ana|aqu[ií]|all[aá]|"
    r"as[ií]|pues|entonces|ya)\b",
    re.IGNORECASE,
)


def looks_spanish(text: str) -> bool:
    """Heuristic: does ``text`` look like Spanish-speaking input?

    Three layered signals (any wins): (1) a Spanish-speaking TLD in a URL,
    (2) a Spanish-only glyph (ñ, accented vowel, ¿/¡), or (3) two-or-more
    Spanish stop-word hits. Conservative on purpose — a single ``esta`` in
    an English sentence (the demonstrative ``ESTA Inc``) won't trip it."""
    if not text:
        return False
    if _SPANISH_DOMAIN_TLD.search(text):
        return True
    if _SPANISH_GLYPH.search(text):
        return True
    if len(_SPANISH_STOPWORDS.findall(text)) >= 2:
        return True
    return False


# --- PlanGuard: defense-in-depth on the agent's declared route ------------
# The persona's "NEVER ATTACK" list (race, ethnicity, gender, sexuality,
# nationality, disability, neurodivergence, illness, trauma, body, poverty,
# accent) is currently enforced ONLY in the post-hoc roast text via antidrift
# packs — i.e. the agent has already scraped, spent credit, and burned tokens
# by the time the guard fires. PlanGuard moves the same policy UP to the
# plan step: when ``declare_plan`` declares "fetch founder's ethnic
# background", fi-runner inspects the steps BEFORE the agent fires any
# follow-up tool and re-emits a soft ``plan_rejected`` event (see
# fi_runner.Runner.run_stream). The consumer (this repo's /chat/stream) just
# forwards the rejection to the UI — the agent's own retry path picks up the
# reinforcement and re-declares.
#
# Patterns are intentionally NARROW: a roast plan step that says "Scrape acme
# pricing page" must not trip; one that says "Search founder's racial
# background" must. The blocklist targets IDENTITY-ATTRIBUTE vocabulary that
# is rarely legitimate in a fact-finding plan — we tolerate occasional false
# positives because the rejection is SOFT (the turn retries; nothing dies).
_ETHICS_REINFORCEMENT = (
    "PlanGuard rejected your previous plan because one or more steps targeted "
    "an identity attribute that the ETHICS rule forbids (race / ethnicity / "
    "nationality / gender identity / sexual orientation / disability / "
    "neurodivergence / mental-health history / body / class / accent). Re-declare "
    "the plan: attack the BEHAVIOR (arguments, broken promises, hypocrisy, what "
    "they SHIP) and the SYSTEMS, never the BEING. Rewrite the offending step(s) "
    "to target a behavior or claim instead."
)
_ETHICS_BLOCKLIST: tuple[str, ...] = (
    # Race / ethnicity / nationality framing — broad; "ethnic"/"racial" rarely
    # appears legitimately in a roast-plan step.
    r"\b(?:race|racial|ethnic(?:ity)?|ethnically|skin\s*color|caucasian|african[\s-]?american|asian\s+american|latino|latina|hispanic|heritage(?:\s+background)?)\b",
    # Gender identity / sexual orientation — same logic. "gender" alone is rare
    # in a roast plan; "gender identity" / "sexual orientation" never legitimate.
    r"\b(?:gender\s+identity|sexual\s+orientation|sexuality|lgbtq?\+?|transgender|trans\s+(?:woman|man|person)|gay|lesbian|bisexual|queer)\b",
    # Disability / neurodivergence
    r"\b(?:disabilit(?:y|ies)|disabled|autis(?:m|tic)|asperger'?s?|adhd|neurodivergen(?:t|ce)|developmental\s+disorder)\b",
    # Mental-health / trauma framing
    r"\b(?:mental\s+illness|mental[\s-]health\s+history|psychiatric\s+(?:history|record)|depression\s+history|trauma\s+history|abuse\s+(?:history|background)|addiction\s+history)\b",
    # Body / appearance — contextual: require a person/role anchor so "page
    # appearance" / "site looks" don't trip. The anchor is a possessive or
    # bare role noun before the attribute.
    r"\b(?:founder|co[\s-]?founder|ceo|cto|cofounder|executive|owner)('?s)?\s+(?:looks|appearance|body|weight|physique|attractiveness)\b",
    r"\bobesit(?:y|e)\b",
    # Class / poverty as an identity attribute (not "low pricing tier")
    r"\b(?:poverty\s+(?:childhood|background)|poor\s+background|underclass|broke\s+(?:childhood|upbringing))\b",
    # Accent / grammar mocking (the persona's "accent/grammar" never-attack item)
    r"\b(?:foreign\s+accent|speech\s+accent|broken\s+english|english\s+as\s+(?:a\s+)?second\s+language|esl(?:\s+grammar)?|grammar\s+(?:mistakes?|errors?))\b",
)


def _build_plan_guard() -> PlanGuard:
    """Compose the PlanGuard for the roast persona. Returns a single guard so
    fi-runner's ``Runner.plan_guard`` slot stays one-to-one with our policy
    (the runner only inspects ONE PlanGuard; multiple require a wrapper)."""
    return plan_guard(
        blocked_patterns=_ETHICS_BLOCKLIST,
        reinforcement=_ETHICS_REINFORCEMENT,
        name="insult_ai_ethics",
    )


def _build_roast_guards(target_hint: str | None) -> list:
    """Compose the roast guard chain. EN patterns + style packs are always
    on; ES patterns layer in when ``target_hint`` looks Spanish so the
    Spanish-side roast can still be guard-checked. See module-level
    comment for the rationale."""
    style_packs = [
        *packs.MARKDOWN_DRIFT,
        *packs.SUMMARIZING,
        *packs.STAGE_DIRECTIONS,
    ]
    language_packs = list(packs.DEFAULT_EN)
    if target_hint and looks_spanish(target_hint):
        # Prepend ES patterns so they catch first on a Spanish turn; EN stays
        # on too (the model can still drift to English mid-Spanish-roast).
        language_packs = [*packs.DEFAULT_ES, *language_packs]
    return [
        antidrift_guard(
            break_patterns=[*language_packs, *style_packs],
            reinforcement=packs.GENERIC_REINFORCEMENT,
        )
    ]


def _build_brief_guards(target_hint: str | None) -> list:
    """Compose the brief guard chain. CRITICAL difference vs the roast: the
    brief INTENTIONALLY uses markdown headers + bullet summaries (it IS a
    structured briefing document). So ``MARKDOWN_DRIFT`` and ``SUMMARIZING``
    packs would false-positive on every brief — drop them. ``STAGE_DIRECTIONS``
    stays on (no "*reviews their pricing page*" cues even in a brief).
    ``DEFAULT_EN/ES`` stays on too — assistant tone + AI-disclosure are still
    drift the brief shouldn't ship."""
    language_packs = list(packs.DEFAULT_EN)
    if target_hint and looks_spanish(target_hint):
        language_packs = [*packs.DEFAULT_ES, *language_packs]
    return [
        antidrift_guard(
            break_patterns=[*language_packs, *packs.STAGE_DIRECTIONS],
            reinforcement=packs.GENERIC_REINFORCEMENT,
        )
    ]


_GUARDS_BY_MODE: dict[Mode, Callable[[str | None], list]] = {
    "roast": _build_roast_guards,
    "brief": _build_brief_guards,
}


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
    backend_name = (backend or os.getenv("INSULT_AI_BACKEND", "claude")).lower()
    agent_backend = _get_backend(backend_name)

    # Capabilities (fi-core MCPs, resolved by fi-runner — we never import fi_core):
    # - task_tracker is ALWAYS ON. The agent calls declare_plan / start_step /
    #   complete_step|fail_step so fi-runner can re-emit semantic plan/step_started/
    #   step_done events. UI gets a live checklist instead of an opaque "thinking…".
    #   Costs ~1 + 2·N extra MCP round-trips per turn (acceptable for the demo;
    #   re-check against bench/bench_perf.py before tightening latency budgets).
    # - rag_store opt-in via with_rag — the agent search_documents'es the user's
    #   corpus for extra ammo.
    capability_names = ["task_tracker"]
    if with_rag:
        capability_names.append("rag_store")

    return Runner(
        backend=agent_backend,
        persona=_PERSONA_BY_MODE[mode],
        extra_mcp_servers=[BRIGHTDATA_MCP],
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
        guards=_GUARDS_BY_MODE[mode](target_hint),
        # Plan-first ethics defense: inspects the agent's `declare_plan` BEFORE
        # any other tool fires. Pairs with the persona's PLAN BEFORE YOU ACT
        # contract — the persona orders the agent to write its route, this guard
        # vetoes a route that targets identity attributes. Static (no language
        # branch): the plan is always in English per persona instructions
        # ("4-8 short imperative labels"), regardless of the roast's output language.
        plan_guard=_build_plan_guard(),
        retry_policy=RetryPolicy(max_attempts=2),
        # Multi-turn chat memory (None = stateless single-shot, like /roast).
        conversation_store=conversation_store,
        # Telemetry — None for /roast (we don't surface per-turn metrics yet),
        # cabled for /chat/stream so the UI can show "done in 2.3s · 4 tools".
        on_event=on_event,
    )


# A message "looks like a roast target" if it carries a URL/domain or is short
# enough to plausibly be a claim ("Elon founded OpenAI"). Long free-form chat
# ("hey, can you summarize what you found?") goes through unwrapped. This keeps
# the first chat turn natural when the user opens with conversation instead of
# a target — without breaking the single-shot `/roast` flow (which calls
# `roast_prompt` directly, no heuristic).
_URL_OR_DOMAIN = re.compile(
    r"https?://|\b[a-z0-9-]{2,}\.(?:com|org|io|net|ai|co|app|dev|me|xyz|sh|tech)\b",
    re.IGNORECASE,
)


def looks_like_roast_target(message: str) -> bool:
    """Heuristic: does ``message`` read like a thing to roast vs free-form chat?"""
    if "://" in message or _URL_OR_DOMAIN.search(message):
        return True
    return len(message.split()) <= 8


def roast_prompt(target: str, corpus_id: str | None = None) -> str:
    """The turn instruction for a roast — ONE source of truth. The bench imports
    this instead of re-hardcoding the wording, so the two never drift."""
    base = f"Roast & fact-check this using live web data: {target}"
    if corpus_id:
        base += (
            f"\n\nThe user also has a document corpus (id: '{corpus_id}'). Use the"
            " search_documents tool over it for extra context and ammo about the"
            " target before roasting — cite anything you use in the receipts."
        )
    return base


def brief_prompt(target: str, corpus_id: str | None = None) -> str:
    """The turn instruction for a BRIEF — sibling to ``roast_prompt``. Same
    target shape, different framing: produce a structured competitive
    intelligence brief instead of a roast. The persona supplies the section
    headers + voice; this wrapper just sets the goal."""
    base = (
        f"Produce a competitive intelligence brief on this target using live "
        f"web data: {target}"
    )
    if corpus_id:
        base += (
            f"\n\nThe user also has a document corpus (id: '{corpus_id}'). Use the"
            " search_documents tool over it for additional context about the"
            " target before composing the brief — cite anything you use in the"
            " Receipts section."
        )
    return base


_PROMPT_BY_MODE: dict[Mode, Callable[[str, str | None], str]] = {
    "roast": roast_prompt,
    "brief": brief_prompt,
}


async def roast(
    target: str,
    backend: str | None = None,
    corpus_id: str | None = None,
    mode: Mode = "roast",
):
    """Run one turn against the agent. ``target`` is a URL or a claim.

    ``mode`` picks the product persona (see :data:`Mode`):
      - ``roast`` — abrasive fragment-voice takedown (the hook).
      - ``brief`` — structured competitive intelligence brief (the business
        value: GTM battlecards, outreach hooks).

    The function is still called ``roast`` for backwards compatibility with
    the API + bench, but it dispatches both modes. If ``corpus_id`` is given,
    the agent can also mine the user's document corpus (rag_store)."""
    runner = build_runner(
        backend,
        mode=mode,
        with_rag=bool(corpus_id),
        target_hint=target,
    )
    return await runner.run(_PROMPT_BY_MODE[mode](target, corpus_id))


async def chat_stream(
    message: str,
    *,
    session_id: str,
    backend: str | None = None,
    corpus_id: str | None = None,
    mode: Mode = "roast",
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
    context."""
    runner = build_runner(
        backend,
        mode=mode,
        with_rag=bool(corpus_id),
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
        _PROMPT_BY_MODE[mode](message, corpus_id)
        if is_first_turn and looks_like_roast_target(message)
        else message
    )
    async for event in runner.run_stream(prompt, session_id=session_id):
        yield event
