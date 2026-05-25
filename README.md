# Insult AI 😈🔥

A brutally honest **roast & fact-check agent** that pulls **live web data** (via
[Bright Data MCP](https://www.npmjs.com/package/@brightdata/mcp)) and roasts any
URL or claim — with real, cited receipts. Every jab is backed by something it
just scraped off the live web.

> Built for the **Web Data UNLOCKED Hackathon** (Bright Data × lablab.ai, May 2026).

## How it works

```
🌐 web/  (Next.js + Tailwind)            → POST /roast { target }
   │
   ▼
⚡ api/  (FastAPI)
   └─ 🤖 fi-runner Runner
        ├─ backend: ClaudeCodeBackend (Max)  OR  CodexBackend (Azure OpenAI)
        ├─ 🔌 Bright Data MCP  → live web data (SERP / Web Unlocker / Scraper)
        └─ 🛡️ tool policy (BYPASS)
```

The brains are the public MIT library **[`fi-runner`](https://github.com/BernardUriza/free-intelligence/tree/main/apps/packages/fi-runner)**
(`conda install -c bernardurizaorozco fi-runner`); this repo is a thin consumer:
config, persona, and a FastAPI/Next.js face. Backend is swappable between
**Claude Code** and **Codex (Azure OpenAI)** with one env var.

## Run locally

```bash
# backend
cd api
cp .env.example .env        # fill the tokens (Bright Data API_TOKEN + a backend)
mamba env update -n insult-ai -f environment.yml && mamba activate insult-ai
uvicorn insult_ai.app:app --reload --port 8080
# POST http://localhost:8080/roast  { "target": "https://some-startup.com" }

# frontend (see web/README.md)
cd ../web && npm run dev
```

## Deploy

- **api/** → Azure Container Apps (real container — runs Python + the npm CLIs +
  the MCP subprocess). Secrets: `CLAUDE_CODE_OAUTH_TOKEN`, `AZURE_OPENAI_API_KEY`,
  `AZURE_OPENAI_ENDPOINT`, `API_TOKEN`. Image: `docker build -t insult-ai api/`.
- **web/** → Azure Static Web Apps (e.g. `insult.bernarduriza.com`).

## License

MIT © 2026 Bernard Uriza Orozco
