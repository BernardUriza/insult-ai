# CLAUDE.md — Insult AI

Project context for Claude Code. Read this before touching anything.

## What this is

**Insult AI** is a roast & fact-check agent: feed it a URL or a claim, it pulls
**live web data** via the **Bright Data MCP** server, and roasts the target with
real, cited receipts. Built for the **Web Data UNLOCKED Hackathon**
(Bright Data × lablab.ai, May 2026).

This repo is a **thin consumer** of the public MIT library
[`fi-runner`](https://github.com/BernardUriza/free-intelligence/tree/main/apps/packages/fi-runner)
(`conda install -c bernardurizaorozco fi-runner`). The brains (agent loop, MCP
wiring, guards, backends) live in `fi-runner`. This repo only adds: config,
the roast persona, a FastAPI face, and a Next.js UI. **Keep it thin** — if logic
feels reusable, it belongs upstream in `fi-runner`, not here.

## Layout

```
insult_ai/
├── api/                  ⚡ FastAPI backend (Python, conda)
│   ├── insult_ai/
│   │   ├── runner.py     🤖 builds the fi-runner Runner (persona + Bright Data MCP)
│   │   └── app.py        🌐 POST /roast, /health
│   ├── environment.yml   🐍 conda env (python 3.12, nodejs, fi-runner[claude,codex])
│   ├── Dockerfile        🐳 conda + npm CLIs, non-root user
│   └── entrypoint.sh
├── web/                  🎨 Next.js + Tailwind UI (deploy: Azure Static Web Apps)
├── bench/                📊 benchmarks (baselines — see rules/benchmarks.md)
└── .claude/rules/        📏 the rules below
```

## Run locally

```bash
cd api
cp .env.example .env        # fill API_TOKEN (Bright Data) + a backend key

# FIRST time use `env create` (the env doesn't exist yet); `env update` only
# works on an already-created env.  After that, swap create→update to re-sync.
mamba env create -n insult-ai -f environment.yml && mamba activate insult-ai

# fi-runner shells out to these npm CLIs — conda does NOT bring them:
npm install -g @anthropic-ai/claude-code @openai/codex @brightdata/mcp

# --env-file loads api/.env (API_TOKEN etc.) into the process; WITHOUT it the
# Bright Data MCP subprocess gets no credential and the roast skips the web.
uvicorn insult_ai.app:app --reload --port 8080 --env-file .env
# POST http://localhost:8080/roast  { "target": "https://some-startup.com" }
```

> Auth gotcha (claude backend): an ambient `ANTHROPIC_API_KEY` (e.g. in your
> shell profile) takes precedence over `CLAUDE_CODE_OAUTH_TOKEN` and, if stale,
> yields `Invalid API key`. `runner.py` drops it when an OAuth token is present
> so the Max subscription wins.

Frontend: see `web/README.md`.

## Conventions (the short version — details in .claude/rules/)

- **Two backends, one env var.** `INSULT_AI_BACKEND=claude|codex`. Don't hardcode one.
- **Bright Data is mandatory and must do real work.** The agent has to actually
  call the MCP tools — no roasting from training memory. → `rules/bright-data.md`
- **Capture benchmark baselines BEFORE changing code.** Two of them. → `rules/benchmarks.md`
- **Deploy = real container (Azure Container Apps), never serverless.** → `rules/deploy.md`
- **The persona is the product.** Roast hard, but every jab needs a receipt (a
  source it actually fetched). No receipt = cut the line.

## Rules index (`.claude/rules/`)

- `architecture.md` — fi-runner usage, the two backends, the thin-consumer boundary
- `bright-data.md` — mandatory Bright Data MCP integration + how it's wired
- `benchmarks.md` — the two-baseline discipline (guard quality + perf)
- `deploy.md` — Azure (Container Apps + Static Web Apps), secrets, non-root
- `personas.md` — the two product personas (roast = hook, brief = business value)
- `language.md` — system writes English (UI, personas, antidrift packs, comments); only the roast follows the target

## Note

Personal / private working notes live in `CLAUDE.local.md` (gitignored — not in
this public repo). If you're Claude Code on Bernard's machine, read it too.
