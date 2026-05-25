# Personas — the product IS the persona (and there are TWO)

The `Runner` is generic; the **persona** is this repo's product. Insult AI ships
**two personas over the SAME `Runner`** (same backend, same Bright Data MCP, same
receipts + grounding). They are **config, not separate products** — never fork the
engine to add a "mode"; add a persona string.

## 1. `ROAST_PERSONA` — the HOOK
Brutal, witty, FACTUAL roast of a URL or claim. This is the demo hook: memorable,
the thing that wakes up a judge or a viewer. Every jab traces to a real fetched
source; ends with a 🧾 Receipts list. No receipt = cut the line.

## 2. `BRIEF_PERSONA` — the BUSINESS VALUE
Same target, same live web data, but the **serious mode**: a competitive-
intelligence brief / battlecard / outreach brief with cited receipts — what an
enterprise GTM team would actually pay for. Maps directly to the hackathon's
**Track 1 (GTM Intelligence)**: "battlecards… sales outreach briefs… always-on
structured web intelligence."

## Why two
- The roast **sells the demo**; the brief **sells the business value**. One
  submission covers both **Originality** (roast) and **Business Value** (brief).
- `receipts_grounded` (the bench metric) is the *proof* of business value: it
  shows the agent cites sources it actually fetched, not hallucinations.

## Rules
- Both personas are plain strings selected at call time (e.g. a `mode` / `persona`
  arg on `/roast`), built on the one `build_runner`. **Config, not code.**
- A new persona must NOT require new engine behavior. If it does, that behavior
  belongs upstream in `fi-runner` (see `architecture.md`), not forked here.
- Both obey the same hard rule: fetch live web data FIRST, every claim backed by a
  fetched source, surfaced as receipts. → `bright-data.md`
- The same harness (`bench/eval_quality.py`) measures BOTH — `used_bright_data`,
  `receipts`, `receipts_grounded` apply identically to roast and brief.
