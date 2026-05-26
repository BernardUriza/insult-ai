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

from fi_runner import (
    ClaudeCodeBackend,
    CodexBackend,
    MCPServerSpec,
    PermissionMode,
    RetryPolicy,
    Runner,
    ToolPolicy,
    antidrift_guard,
    packs,
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
_ROAST_GUARDS = [
    antidrift_guard(
        break_patterns=[
            # English-only catalog — matches the rest of the system (see
            # .claude/rules/language.md). DEFAULT_BILINGUAL would pull in
            # Spanish patterns too; when a future feature ships Spanish-side
            # drift detection it should branch on the detected target
            # language and add packs.DEFAULT_ES on top, not flip back to
            # bilingual-by-default.
            *packs.DEFAULT_EN,
            *packs.MARKDOWN_DRIFT,
            *packs.SUMMARIZING,
            *packs.STAGE_DIRECTIONS,
        ],
        reinforcement=packs.GENERIC_REINFORCEMENT,
    )
]


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
    with_rag: bool = False,
    conversation_store: ConversationStore | None = None,
    on_event: Callable[[str, dict], None] | None = None,
) -> Runner:
    """Compose a fi_runner Runner with the chosen backend + Bright Data MCP.
    With ``with_rag``, also wire the fi-core rag_store capability so the agent can
    mine the user's document corpus. With ``conversation_store``, the Runner folds
    prior turns into the next prompt (chat mode), keyed by ``session_id``.

    ``on_event`` is fi_runner's telemetry sink — it fires for ``history_replayed``,
    ``tool_called``, ``turn_completed``, ``backend_error``, etc. The chat endpoint
    uses this to log structured per-turn metrics AND to emit an SSE ``meta`` event
    with latency/tokens/tool_count to the UI.

    The Runner itself is cheap (a config holder); the BACKEND is the expensive
    bit and it's cached process-wide — see :func:`_get_backend`."""
    backend_name = (backend or os.getenv("INSULT_AI_BACKEND", "claude")).lower()
    agent_backend = _get_backend(backend_name)

    return Runner(
        backend=agent_backend,
        persona=ROAST_PERSONA,
        extra_mcp_servers=[BRIGHTDATA_MCP],
        # rag_store (fi-core MCP) when the user has a document corpus — the agent
        # can search_documents over it for extra ammo. Boundary-clean: capability
        # resolution stays in fi-runner; we never import fi_core here.
        capabilities=["rag_store"] if with_rag else [],
        # BYPASS = auto-approve tool calls (needs non-root user in the container).
        # Block the built-in WebSearch/WebFetch so ALL web access goes through
        # Bright Data (the hackathon requirement + what the $250 credit is for) —
        # otherwise the agent reaches for the native SERP and skips the MCP.
        tool_policy=ToolPolicy(
            permission_mode=PermissionMode.BYPASS,
            builtin_disallowed=["WebSearch", "WebFetch"],
        ),
        # Anti-drift: if the roast breaks character (report voice, assistant tone,
        # AI-disclosure), the runner re-roasts once more with reinforcement appended.
        guards=_ROAST_GUARDS,
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


async def roast(target: str, backend: str | None = None, corpus_id: str | None = None):
    """Run one roast turn. `target` is a URL or a claim. If `corpus_id` is given,
    the agent can also mine the user's document corpus (rag_store)."""
    runner = build_runner(backend, with_rag=bool(corpus_id))
    return await runner.run(roast_prompt(target, corpus_id))


async def chat_stream(
    message: str,
    *,
    session_id: str,
    backend: str | None = None,
    corpus_id: str | None = None,
    on_event: Callable[[str, dict], None] | None = None,
):
    """Stream a chat turn as dict events (chain-of-thought).

    Yields, in order, the events from ``Runner.run_stream``:
      - ``{"type":"tool_call","tool":ToolCall}`` per Bright Data / RAG call,
      - ``{"type":"text","text":delta}`` as the assistant text arrives,
      - ``{"type":"result","result":TurnResult}`` once guards settle.

    ``on_event`` taps fi_runner's telemetry sink (history_replayed, tool_called,
    turn_completed, backend_error). The endpoint uses it to (a) log structured
    per-turn metrics and (b) emit an SSE ``meta`` event to the UI.

    The first user turn of a session may use ``roast_prompt`` framing (URL/claim
    → roast); follow-ups go in as plain chat. We detect "first turn" via the
    shared conversation store. The Runner is built per turn (cheap) but shares
    ``_CHAT_STORE`` so prior turns are replayed for context."""
    runner = build_runner(
        backend,
        with_rag=bool(corpus_id),
        conversation_store=_CHAT_STORE,
        on_event=on_event,
    )
    history = await _CHAT_STORE.load(session_id)
    is_first_turn = not history
    # On turn 1 the user message is USUALLY a target ("acme.com") — wrap it
    # so the agent fetches + roasts. But if the user opens with free-form chat
    # ("hey, can you roast something for me?") the wrap reads weirdly; the
    # heuristic gates it. Subsequent turns ALWAYS go raw (the conversation
    # already carries the roast context via the conversation_store replay).
    prompt = (
        roast_prompt(message, corpus_id)
        if is_first_turn and looks_like_roast_target(message)
        else message
    )
    async for event in runner.run_stream(prompt, session_id=session_id):
        yield event
