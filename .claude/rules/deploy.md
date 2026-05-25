# Deploy — Azure

## Targets

| component | target                        | why                                              |
|-----------|-------------------------------|--------------------------------------------------|
| `api/`    | **Azure Container Apps**      | real container — Python + npm CLIs + MCP subprocess |
| `web/`    | **Azure Static Web Apps**     | static Next.js export (e.g. `insult.bernarduriza.com`) |

## NEVER use serverless for the API

`fi-runner` spawns external CLI processes (`claude`, `codex`) and the Bright Data
MCP subprocess (`npx @brightdata/mcp`). **Azure Functions / Vercel / any FaaS
cannot do this** — no persistent process, no arbitrary subprocess. It MUST be a
real container (Azure Container Apps, or any container host). If someone suggests
"just deploy the API to Functions to save money", that's the trap — it won't run.

## Image

- Base: conda-native (`quay.io/condaforge/miniforge3`), `mamba env update`.
- Then `npm install -g @anthropic-ai/claude-code @openai/codex @brightdata/mcp`.
- **Non-root user** (Claude Code refuses root — see `architecture.md`).
- `entrypoint.sh` writes `CLAUDE_CODE_OAUTH_TOKEN` → `~/.claude/.credentials.json`,
  then `exec uvicorn`.

## Secrets (container env / Azure secrets — never in the image, never committed)

- `API_TOKEN` — Bright Data MCP
- Backend `claude`: `CLAUDE_CODE_OAUTH_TOKEN` (or `ANTHROPIC_API_KEY`)
- Backend `codex`: `AZURE_OPENAI_API_KEY` + `AZURE_OPENAI_ENDPOINT`
- `INSULT_AI_BACKEND` to pick the default engine

## Frontend wiring

`web/` calls the API via `NEXT_PUBLIC_API_URL` (the Container App URL in prod,
`http://localhost:8080` in dev). CORS on the API currently allows `*` for the
demo — tighten to the SWA origin before anything beyond the hackathon.
