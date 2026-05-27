# Hackathon — Web Data UNLOCKED (Bright Data × lablab.ai)

Official reference card for prioritization decisions. Source:
[lablab.ai/ai-hackathons/brightdata-ai-agents-web-data-hackathon](https://lablab.ai/ai-hackathons/brightdata-ai-agents-web-data-hackathon).
Fetched 2026-05-26. Re-fetch if anything below changes.

## Rule 0 — Product

The product should feel like comedy, but behave like responsible
clinical infrastructure.

This means:

- Humor is the interface, not the purpose.
- Permitted insults target patterns, habits, or procrastination; never
  identity, body, mental health, trauma, protected attributes, or
  personal worth.
- On sensitive or crisis signals, the persona abandons the roast and
  responds with grounded support, clarity, and resources.
- Every response closes with a useful micro-action.
- The demo must sell personality but demonstrate architecture:
  safety, traceability, tone consent, and graceful degradation.

## Judging criteria (no published weights — treat as paritarios)

| # | Criterion | Verbatim definition |
|---|---|---|
| 1 | **Application of Technology** | How effectively the chosen model(s) are integrated into the solution. |
| 2 | **Presentation** | The clarity and effectiveness of the project presentation. |
| 3 | **Business Value** | The impact and practical value, considering how well it fits into business areas. |
| 4 | **Originality** | The uniqueness & creativity of the solution, highlighting approaches and ability to demonstrate behaviors. |

## Mapping to this repo's product surfaces

- **Originality** ← `ROAST_PERSONA` + ETHICS `PlanGuard` (attack behavior,
  never identity; pre-execution defense, not post-hoc text rewrite).
- **Business Value** ← `BRIEF_PERSONA` (GTM intelligence: battlecards,
  outreach briefs with cited receipts). **Not in runtime yet** — only the
  roast persona is wired; the brief is the highest-delta gap before the
  deadline. See `personas.md`.
- **Application of Technology** ← Bright Data MCP integration is real
  (not memory), proven by `used_bright_data` + `receipts_grounded`
  guards; pgvector RAG; fi-runner orchestration; dual backend.
- **Presentation** ← Needs a live demo URL, a video, and slides. The
  demo URL is the load-bearing piece (jury must be able to touch the
  thing).

## Hard requirement

> Your submission must demonstrably use at least one Bright Data product.

This repo uses **Bright Data MCP server**. Other options if a flow needs
them: SERP API, Web Unlocker, Scraping Browser, Web Scraper API. See
`bright-data.md`.

## Logistics

- **Prize: $5,000 cash** + Bright Data AI Startup Program opportunities.
  This is NOT the $3,000 DEV.to "Bright Data Real-Time AI Agents
  Challenge" — that is a parallel, separate event.
- **Dates: 25–30 May 2026 online + 30–31 May SF onsite finale.** Online
  submissions eligible for prizes without travel.
- **Venue (onsite only):** The Web Data Loft, 625 2nd St, San Francisco.
- **Eligibility:** Open to everyone, solo entries eligible.
- **Onsite extras (non-cash):** 4 × $100 Amazon gift cards giveaway.

## Deliverables ("What to Submit?")

| Bucket | Items |
|---|---|
| Basic | Project title, short description, long description, technology + category tags |
| Media | Cover image, **video presentation**, **slide presentation** |
| Code | **Public GitHub repo**, demo app platform, **application URL (live)** |

The three load-bearing pieces — VIDEO, SLIDES, LIVE URL — are also the
three things this repo doesn't have yet. Until those land, even a
technically excellent submission scores low on **Presentation** by
definition (no way for the jury to see the product).

## Story beats for the video / slides (suggested)

1. **Live web data via Bright Data MCP** — the hard requirement, proven
   with the `receipts` panel showing every source the agent actually
   fetched.
2. **Plan-first chain-of-thought with PlanGuard** — the agent declares
   its route via `declare_plan` BEFORE acting; PlanGuard vetoes
   identity-targeting steps before any scrape runs. Originality + audit
   trail.
3. **Two personas, one engine** — roast (hook) and brief (business
   value) share the same Bright Data + receipts + grounding pipeline.
   GTM track positioning.

## Three enterprise tracks (lablab framing)

GTM Intelligence / Finance / Security. This repo positions on **GTM
Intelligence** via the brief persona ("battlecards, sales outreach
briefs, always-on structured web intelligence" — quoted from
`personas.md`).
