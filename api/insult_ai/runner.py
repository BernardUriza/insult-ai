"""Builds the Insult AI roast/fact-check agent on top of fi_runner.

Pattern mirrors discord-bot/insult (the proven production runner): an external
MCP server declared as an `MCPServerSpec`, a persona, a tool policy, and a
swappable backend. Here the MCP is Bright Data (live web data — the hackathon's
mandatory product) instead of Playwright.
"""

from __future__ import annotations

import os

from fi_runner import (
    ClaudeCodeBackend,
    CodexBackend,
    MCPServerSpec,
    PermissionMode,
    Runner,
    ToolPolicy,
)

# --- Persona ---------------------------------------------------------------
ROAST_PERSONA = """You are Insult AI — a brutally honest roast & fact-check agent.

Given a URL or a claim, you FIRST use your Bright Data web tools to pull what's
REALLY out there right now, then deliver a sharp, witty, ruthless — but FACTUAL —
roast. Call out the BS, the buzzwords, the broken promises. Funny and merciless,
never hateful or discriminatory.

Hard rules:
- ALWAYS use the Bright Data tools to fetch live web data BEFORE roasting. Never invent facts.
- Every jab must trace to a real source you actually fetched this turn.
- End with a short "🧾 Receipts" list: the sources you used (URLs).
"""

# --- Bright Data MCP (live web data — REQUIRED by the hackathon) -----------
# Runs as `npx @brightdata/mcp`. It reads its credential from the API_TOKEN env
# var, which the subprocess inherits because MCPServerSpec.env_passthrough
# defaults to True (so just set API_TOKEN in the container/host env).
BRIGHTDATA_MCP = MCPServerSpec(
    name="brightdata",
    command="npx",
    args=["-y", "@brightdata/mcp"],
)


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
        agent_backend = ClaudeCodeBackend(
            default_model=os.getenv("INSULT_AI_MODEL", "claude-sonnet-4-5"),
        )

    return Runner(
        backend=agent_backend,
        persona=ROAST_PERSONA,
        extra_mcp_servers=[BRIGHTDATA_MCP],
        # BYPASS = auto-approve tool calls (needs non-root user in the container).
        tool_policy=ToolPolicy(permission_mode=PermissionMode.BYPASS),
    )


async def roast(target: str, backend: str | None = None):
    """Run one roast turn. `target` is a URL or a claim."""
    runner = build_runner(backend)
    return await runner.run(
        f"Roast & fact-check this using live web data: {target}"
    )
