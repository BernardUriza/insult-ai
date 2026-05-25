# Architecture

## Thin consumer of fi-runner

This repo does NOT reimplement an agent loop. It builds a `fi-runner` `Runner`
and exposes it. Verified API (read the fi-runner source before assuming anything):

```python
from fi_runner import (
    ClaudeCodeBackend, CodexBackend,
    MCPServerSpec, PermissionMode, Runner, ToolPolicy,
)

runner = Runner(
    backend=agent_backend,            # ClaudeCodeBackend(...) or CodexBackend(...)
    persona=ROAST_PERSONA,            # the system prompt — this repo's main contribution
    extra_mcp_servers=[BRIGHTDATA_MCP],
    tool_policy=ToolPolicy(permission_mode=PermissionMode.BYPASS),
)
result = await runner.run("Roast & fact-check this using live web data: ...")
```

- Keep `runner.py` declarative: config in, `Runner` out. No business logic.
- If you need behavior that other fi-runner consumers would want, contribute it
  **upstream to fi-runner**, then bump the dependency. Don't fork logic here.

## Two backends — selected at runtime, never hardcoded

`INSULT_AI_BACKEND` env var picks the engine:

| value    | backend            | auth                                              |
|----------|--------------------|---------------------------------------------------|
| `claude` | `ClaudeCodeBackend`| `CLAUDE_CODE_OAUTH_TOKEN` (or `ANTHROPIC_API_KEY`)|
| `codex`  | `CodexBackend`     | `AZURE_OPENAI_API_KEY` + `AZURE_OPENAI_ENDPOINT`  |

Both must work. When adding features, test against both — a change that only
works on one backend is a regression.

## The CLIs are NOT Python packages — they're npm binaries

`fi-runner` **shells out to external CLIs** (`claude`, `codex`). conda installs
the Python library; it does NOT bring those CLIs. The container/dev env must
`npm install -g @anthropic-ai/claude-code @openai/codex` (and `@brightdata/mcp`)
separately. If `runner.run()` fails with "command not found", that's this.

## Claude Code requires a non-root user

`ClaudeCodeBackend` refuses to run as root and needs a writable `$HOME` for
`~/.claude/.credentials.json`. The Dockerfile creates a non-root user; don't
revert that. `entrypoint.sh` materializes `CLAUDE_CODE_OAUTH_TOKEN` into the
credentials file at boot.

## Reference architecture

This design imitates a proven private Claude-Code-headless-in-a-container setup
(conda base + npm CLIs + non-root + token-to-credentials entrypoint). When in
doubt about infra, that pattern is the source of truth, not guesswork.
