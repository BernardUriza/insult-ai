# Bright Data MCP — mandatory, must do real work

## Why it's non-negotiable

The hackathon requires using **at least one Bright Data product**. For this repo
that product is the **Bright Data MCP server**, and the judges (and our own
benchmarks) check that the agent **actually fetches live web data** — not that it
roasts from the model's training memory. A roast with no real receipts is a
disqualifying failure of the whole premise, not just a quality miss.

## How it's wired

```python
BRIGHTDATA_MCP = MCPServerSpec(
    name="brightdata",
    command="npx",
    args=["-y", "@brightdata/mcp"],
    # inherits API_TOKEN from the process env (env_passthrough)
)
```

- The MCP server reads `API_TOKEN` from the environment. Set it in `api/.env`
  (local) and as a container secret (deploy). Never commit it.
- `@brightdata/mcp` is an npm binary — it must be installed in the runtime
  (dev env + Docker image). See `architecture.md`.

## What "real work" means in practice

- The persona must instruct the agent to **fetch before it judges**: scrape the
  URL / run a SERP / unlock the page, then base every claim on what came back.
- Surface the sources to the user as **receipts** (the UI has a "🧾 Receipts"
  panel). If the agent produced a roast with zero tool calls, treat it as a bug.
- The `used_bright_data` guard/eval exists precisely to catch a run that skipped
  the web. Don't let a refactor silently disable the MCP wiring.

## Bright Data products available (pick what fits the target)

MCP Server (default), SERP API, Web Unlocker, Scraping Browser, Web Scraper API.
For "roast this startup's landing page" → Web Unlocker / scrape. For "roast this
public claim" → SERP to find counter-evidence.

## Billing note

We're on the **$250 promo credit** (no card attached). Don't add a payment
method or trigger anything that would. If a flow asks for a card, stop and ask.
