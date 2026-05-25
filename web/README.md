# web/ — Insult AI frontend (Next.js, static export)

The demo UI — a single-page roast console. Calls the FastAPI backend in `../api`.

## What it does
1. **Input** — one field: a URL or a claim.
2. **Live state** — "scraping live + reasoning, ~1 min…" while `/roast` runs (the
   visual proof that Bright Data is doing real work).
3. **Result** — the 🔥 roast (Insult voice, sententia in bold) + a **🧾 Receipts**
   panel listing the sources it actually fetched (every jab cited).

## Run locally
The API must be up first (see `../api`):

```bash
# 1) API — in ../api, with the conda env active:
uvicorn insult_ai.app:app --env-file .env --port 8080

# 2) web — here:
cp .env.local.example .env.local        # NEXT_PUBLIC_API_URL=http://localhost:8080
npm install
npm run dev                             # → http://localhost:3000
```

## Build / deploy
```bash
npm run build          # static export → out/
```
Deploy `out/` to **Azure Static Web Apps** (see `../.claude/rules/deploy.md`). Set
`NEXT_PUBLIC_API_URL` to the Azure Container App URL **at build time** — it's baked
into the static bundle (`NEXT_PUBLIC_*`). The API's CORS allows `*` for the demo;
tighten to the SWA origin before anything beyond the hackathon.
