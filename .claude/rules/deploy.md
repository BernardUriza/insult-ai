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
- `INSULT_AI_API_KEY` — shared X-API-Key gate (see Auth, below)
- `FI_RAG_BACKEND=pgvector` + `FI_RAG_PGVECTOR_DSN` (see RAG store, below)

## Auth — the cheap floor that protects Bright Data credit

Every `/roast`, `/chat/stream`, `/documents` request is gated by an
`X-API-Key` header matched (constant-time) against `INSULT_AI_API_KEY`.
This is NOT real auth — it's a casual-crawler gate. Threat model: a bot
scanning Container App URLs starts hitting `/roast` and burns the $250
Bright Data credit before anyone notices. With the key, the crawler gets
401s and gives up. With a rotated key, a leak buys hours, not days.

It's PAIRED with a per-IP rate limit (SlowAPI: 10 roasts/hour, 10 chat
streams/hour, 60 ingests/hour). Even a leaked key can't drain the credit
from one client.

Wiring:

```bash
KEY="$(openssl rand -hex 32)"
az containerapp secret set --name <app-name> --resource-group <rg> \
  --secrets "api-key=$KEY"
az containerapp update --name <app-name> --resource-group <rg> \
  --set-env-vars "INSULT_AI_API_KEY=secretref:api-key"

# Front-end build (SWA) needs the same value as NEXT_PUBLIC_API_KEY so
# the bundle can include the header. NEXT_PUBLIC_* gets inlined into the
# JS — anyone can read it in DevTools, that's by design (the key is a
# rate-limit anchor, not a secret).
```

`/health` is intentionally UNGATED — Container Apps' liveness probe must
reach it without a key, and conflating "service up" with "key configured"
makes restarts harder. Don't gate health.

DEV convenience: when `INSULT_AI_API_KEY` is UNSET, the API fail-opens
(loud WARN in the logs on each request). That keeps the bench, smoke
tests and a bare `uvicorn --reload` workable without ceremony. Production
ALWAYS sets the env var.

## RAG store — Postgres + pgvector (NOT HDF5)

The agent's document corpus must survive a container restart, and Container Apps
disks are ephemeral. **HDF5 (the local-dev default) is wrong here** — one restart
and the corpus is gone. Use the `pgvector` backend; fi-core's
`PgVectorChunkStore` implements the same protocol, switch is one env var.

Provision Postgres ONCE per environment with the `vector` extension enabled:

```bash
az postgres flexible-server create \
  --resource-group <rg> --name <pg-name> \
  --location <region> --tier Burstable --sku-name Standard_B1ms \
  --storage-size 32 --version 16 \
  --admin-user insultai --admin-password <strong-secret> \
  --database-name insultai \
  --public-access None      # bind to the Container App via VNet — DON'T expose to the internet

# Enable the pgvector extension (Flexible Server gates extensions through this
# server-parameter; no SQL CREATE EXTENSION until VECTOR is on the allow-list).
az postgres flexible-server parameter set \
  --resource-group <rg> --server-name <pg-name> \
  --name azure.extensions --value VECTOR
```

Then add the connection as a Container App secret and reference it as env:

```bash
DSN="postgresql://insultai:<password>@<pg-name>.postgres.database.azure.com:5432/insultai?sslmode=require"
az containerapp secret set --name <app-name> --resource-group <rg> \
  --secrets "fi-rag-dsn=$DSN"
az containerapp update --name <app-name> --resource-group <rg> \
  --set-env-vars \
    "FI_RAG_BACKEND=pgvector" \
    "FI_RAG_PGVECTOR_DSN=secretref:fi-rag-dsn" \
    "FI_RAG_EMBED_DIM=256" \
    "FI_RAG_EMBEDDER=hashing"
```

`PgVectorChunkStore` runs `CREATE EXTENSION IF NOT EXISTS vector;` + the two
tables (`fi_core_documents`, `fi_core_chunks` with `vector(N)` + IVFFlat index
on `vector_cosine_ops`) on first connect — no separate migration step. Bumping
the embedder to Azure OpenAI (`FI_RAG_EMBEDDER=azure`, dim=1536) requires
DROPping the two tables (different vector column width) and re-ingesting the
corpus.

Local dev wires the same code path via `infra/docker-compose.dev.yml` (port
**5433** to avoid colliding with a co-resident Postgres / Tilt / Supabase that
already owns 5432) — see that file's header for the workflow.

## Frontend wiring

`web/` calls the API via `NEXT_PUBLIC_API_URL` (the Container App URL in prod,
`http://localhost:8080` in dev). CORS on the API currently allows `*` for the
demo — tighten to the SWA origin before anything beyond the hackathon.
