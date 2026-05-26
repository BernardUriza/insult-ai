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

## Runner is cheap; the backend is expensive — cache the backend

`build_runner()` is called per turn (cheap config holder). But constructing
a `ClaudeCodeBackend` / `CodexBackend` spawns SDK clients + an MCP subprocess
pool — heavy, ~1-3s overhead. `runner.py` keeps a process-wide cache keyed
by backend NAME (`_BACKENDS: dict[str, ClaudeCodeBackend | CodexBackend]`) so
the second `/chat/stream` turn reuses the same backend instance + its already-
spawned `npx @brightdata/mcp` subprocess. Don't accidentally undo this when
refactoring — the cache is what makes multi-turn chat feel responsive.

## fi-runner surfaces this repo doesn't fully use yet

Catalog of leverage on the table (each one short-circuits work this repo
might otherwise reinvent):

- `PlanGuard` (`fi_runner.plan_guard`) — pre-execution review of a declared
  plan, deterministic regex/predicate, soft-rejects via `plan_rejected`
  stream event. **Wired** as of the ETHICS PlanGuard commit; consumers may
  add more guards by composing predicates. `Runner.plan_guard` is a single
  slot — wrap if you need multi-policy.
- `preflight.probe_mcp` / `probe_all` — fast roundtrip probe of an MCP
  server. Drop-in for a real `/health` that doesn't just return `{"ok": true}`
  while Bright Data is wedged. Not wired yet.
- `FlowNarrator` — Runner's default: every turn's mechanical Mermaid flow
  gets narrated by the backend itself in the background (second call, doesn't
  block the turn; drained on `aclose()`). Useful for the "auditable cognition"
  story in the demo. Disable in benches (`runner.flow_narrator = None`) to
  keep latency measurements honest.
- `RagStoreClient` (`fi_runner.rag_store`) — boundary-clean async client for
  the rag_store backend WITHOUT importing `fi_core`. Used by `/documents`;
  returns plain dicts. Same `FI_RAG_*` env as the MCP server — ingest here,
  search from the agent there.
- `ConversationStore` — `InMemoryConversationStore` for local/single-replica
  dev; `RedisConversationStore` exists for multi-replica deploy. Swap is a
  constructor arg, no other code change.
- `_derive_plan_events` — Runner's stream re-emits `plan` / `step_started` /
  `step_done` events when the agent calls task_tracker MCP tools. The
  consumer just has to forward them — no parsing of tool names needed.

When a feature feels like "we'd build that here", check if fi-runner already
exposes it before writing the local version. The thin-consumer rule means
NEW reusable behavior belongs upstream in fi-runner; we just import and
configure.

## Reference architecture

This design imitates a proven private Claude-Code-headless-in-a-container setup
(conda base + npm CLIs + non-root + token-to-credentials entrypoint). When in
doubt about infra, that pattern is the source of truth, not guesswork.
