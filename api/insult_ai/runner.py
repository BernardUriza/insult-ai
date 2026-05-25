"""Builds the Insult AI roast/fact-check agent on top of fi_runner.

Pattern mirrors discord-bot/insult (the proven production runner): an external
MCP server declared as an `MCPServerSpec`, a persona, a tool policy, and a
swappable backend. Here the MCP is Bright Data (live web data — the hackathon's
mandatory product) instead of Playwright.
"""

from __future__ import annotations

import os
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
            *packs.DEFAULT_BILINGUAL,
            *packs.MARKDOWN_DRIFT,
            *packs.SUMMARIZING,
            *packs.STAGE_DIRECTIONS,
        ],
        reinforcement=packs.GENERIC_REINFORCEMENT,
    )
]


def build_runner(backend: str | None = None) -> Runner:
    """Compose a fi_runner Runner with the chosen backend + Bright Data MCP."""
    backend = (backend or os.getenv("INSULT_AI_BACKEND", "claude")).lower()

    if backend == "codex":
        # API-motor mode: Codex CLI pointed at Azure OpenAI. Key read from
        # AZURE_OPENAI_API_KEY in the env (never passed inline).
        agent_backend: ClaudeCodeBackend | CodexBackend = CodexBackend(
            default_model=os.getenv("INSULT_AI_MODEL", "gpt-4.1"),
            azure_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],  # https://<res>.openai.azure.com/openai/v1
        )
    else:
        # Claude Code (Max). The OAuth token is materialized to
        # ~/.claude/.credentials.json by entrypoint.sh; the SDK reads it there.
        #
        # Auth precedence footgun: the Claude Agent SDK gives an ambient
        # ANTHROPIC_API_KEY priority over the OAuth token ("API motor mode"),
        # silently hijacking subscription auth. A stale key in a dev shell then
        # surfaces as "Invalid API key". Picking `claude` AND supplying an OAuth
        # token is an explicit intent to use the subscription, so drop any
        # ambient API key and let the SDK fall through to OAuth. No-op in the
        # container (the entrypoint env carries no ANTHROPIC_API_KEY).
        if os.getenv("CLAUDE_CODE_OAUTH_TOKEN"):
            os.environ.pop("ANTHROPIC_API_KEY", None)
        agent_backend = ClaudeCodeBackend(
            default_model=os.getenv("INSULT_AI_MODEL", "claude-sonnet-4-5"),
        )

    return Runner(
        backend=agent_backend,
        persona=ROAST_PERSONA,
        extra_mcp_servers=[BRIGHTDATA_MCP],
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
    )


def roast_prompt(target: str) -> str:
    """The turn instruction for a roast — ONE source of truth. The bench imports
    this instead of re-hardcoding the wording, so the two never drift."""
    return f"Roast & fact-check this using live web data: {target}"


async def roast(target: str, backend: str | None = None):
    """Run one roast turn. `target` is a URL or a claim."""
    runner = build_runner(backend)
    return await runner.run(roast_prompt(target))
