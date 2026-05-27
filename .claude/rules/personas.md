# Personas — the product IS the persona (and there are THREE)

The `Runner` is generic; the **persona** is this repo's product. Insult AI
ships **three personas over the SAME `Runner`** (same backend, same
infrastructure, same dispatch tables). They are **config, not separate
products** — never fork the engine to add a "mode"; add a persona string.

## 1. `ROAST_PERSONA` — the HOOK

Brutal, witty, FACTUAL roast of a URL or claim. This is the demo hook:
memorable, the thing that wakes up a judge or a viewer. Every jab traces
to a real fetched source; ends with a 🧾 Receipts list. No receipt = cut
the line.

Bright Data MCP + ETHICS PlanGuard wired. Plain text output. See
`personas/roast.md`.

## 2. `BRIEF_PERSONA` — the BUSINESS VALUE

Same target, same live web data, but the **serious mode**: a competitive-
intelligence brief / battlecard / outreach brief with cited receipts —
what an enterprise GTM team would actually pay for. Maps directly to the
hackathon's **Track 1 (GTM Intelligence)**: "battlecards… sales outreach
briefs… always-on structured web intelligence."

Bright Data MCP + ETHICS PlanGuard wired. Markdown-structured output
(headers, bullets) — the brief mode legitimately uses them so its guard
chain drops `MARKDOWN_DRIFT` / `SUMMARIZING` packs. See `personas/brief.md`.

## 3. `CLINICAL_PERSONA` — el COMPADRE CLÍNICO

The pivot persona. A clinical-informed coach disfrazado de compa
insultador. Comedy as UX, infrastructure as behavior — the contest's
**Regla 0** (`hackathon.md`) materialized as a persona.

Different shape than 1 and 2:
- **No Bright Data MCP** (conversational, not agentic).
- **No task_tracker capability** (one-shot, no plan).
- **Structured JSON envelope output** — not plain text. See
  `api/insult_ai/clinical_envelope.py`.
- **Tone parameter** (soft / medium / spicy / no_insults) — the user
  owns the intensity ceiling.
- **Safety-aware** — sensitive escalation drops the jab, crisis abandons
  the persona entirely and hands off to a localized resource.
- **Different guard chain** — keeps `ASSISTANT_TONE_*` + `THERAPY_SPEAK_*`
  + `OVER_VALIDATION_*` + `MORALIZING_*` packs (EN+ES); drops the
  markdown / stage-direction packs (JSON output handles those).

The full architectural contract lives in `clinical.md`. See
`personas/clinical_compadre.md` for the prompt.

## Why three

- The roast **sells the demo**; the brief **sells the business value**;
  the clinical mode **demonstrates the architecture** (safety,
  trazabilidad, consent, degradation). One submission, three judge
  criteria covered:
  - **Originality** ← roast + ETHICS PlanGuard
  - **Business Value** ← brief (GTM track) + clinical (well-being / productivity surface)
  - **Application of Technology** ← Bright Data MCP (roast/brief),
    Azure OpenAI Whisper+TTS (voice loop, see `architecture.md`),
    structured envelope contract (clinical), safety regex classifier.
- `receipts_grounded` (the bench metric for roast/brief) is the proof of
  business value for those modes. The clinical mode's proof is the
  envelope shape + judge invariants — the golden tests in
  `bench/golden/clinical_compadre/` are the measurable contract.

## Rules — apply to ALL personas

- Personas are plain strings selected at call time (`mode` arg). All
  three live in `personas/*.md`, all three dispatch via
  `runner.py:_PERSONA_BY_MODE`. **Config, not code.**
- A new persona must NOT require new engine behavior. If it does, that
  behavior belongs upstream in `fi-runner` (see `architecture.md`), not
  forked here.
- Three dispatch tables in `runner.py` (`_PERSONA_BY_MODE`,
  `_GUARDS_BY_MODE`, `_PROMPT_BY_MODE`) — adding a persona is THREE
  entries + ONE file in `personas/`. Engine untouched.

## Rules — apply to roast + brief (the agentic modes)

- Fetch live web data FIRST, every claim backed by a fetched source,
  surfaced as receipts. → `bright-data.md`
- Bench harness (`bench/eval_quality.py`) measures both —
  `used_bright_data`, `receipts`, `receipts_grounded` apply identically.

## Rules — apply to clinical (the conversational mode)

- Safety beats tone (override matrix in `clinical.md`).
- Crisis → boundary move + hand-off, no jab, no micro_action, no
  follow_up_question.
- Every normal turn closes with a micro_action AND a follow_up_question.
- Never attack identity / body / health / trauma / protected attributes.
  See `policies/never_attack.md` for the validity test + full block-list.
- Different bench harness — `bench/golden/clinical_compadre/`. SHAPE
  tests always run; LIVE tests opt-in via `RUN_LIVE=1`.
