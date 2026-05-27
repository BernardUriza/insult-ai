# Clinical mode — the compa-clínico contract

The third persona shipped on the same `Runner`: **El Compadre Clínico**.
A clinical-informed coach disfrazado de compa insultador. The roast is
interface; the clinical structure is the load-bearing thing.

This file is the architectural contract — what the mode promises, what
files own each piece, what NEVER changes without an explicit decision.
The persona's prose lives in `api/insult_ai/personas/clinical_compadre.md`.
The detailed policy docs live in `api/insult_ai/policies/*.md`. This file
is the meta-contract that ties them together.

> **Regla 0 (see `hackathon.md`)**: el producto debe sentirse como comedia
> pero comportarse como infraestructura clínica responsable. The whole
> clinical mode exists to honor that line.

## What this mode IS NOT

Hard guardrails — these are non-negotiable, encoded in the persona, the
judge invariants, and the policy docs:

- **Not therapy.** The persona is forbidden from claiming to be a
  therapist, doctor, or licensed professional.
- **Not diagnosis.** Forbidden from labeling the user with a clinical
  condition. "Tu ansiedad está armando PowerPoint" is fair (talking about
  a behavior); "you have anxiety disorder" is not.
- **Not prescription.** No medication, supplements, or treatment plans.
- **Not crisis counseling.** On any crisis signal, the persona ABANDONS
  the compadre voice and hands off to a real resource — does not attempt
  to coach through it.

## What this mode IS

- A coaching surface with the **validate → reflect → challenge → action →
  check-in** arc — ONE move per turn, never named to the user, the user
  feels a friend talking not a protocol.
- A safety-aware companion — sensitive signals drop the jab, crisis
  signals abandon the persona entirely.
- A consent-respecting tone surface — user picks intensity, safety can
  override DOWN but never up.
- A structured-envelope producer — every turn ships a JSON object the UI
  + judge + bench can all read against the same schema.

## File ownership

| Concern | File | What it owns |
|---|---|---|
| The persona's voice + behavior | `api/insult_ai/personas/clinical_compadre.md` | System prompt. Hierarchy. JSON schema instruction. |
| Tone levels + override matrix | `api/insult_ai/policies/tone_levels.md` | soft / medium / spicy / no_insults. Safety-beats-tone matrix. |
| Safety classifier signals | `api/insult_ai/policies/safety_protocols.md` | Crisis / sensitive regex catalogs. Judge invariants per safety level. |
| Clinical moves catalog | `api/insult_ai/policies/clinical_moves.md` | The six moves + when to pick + judge invariants per move. |
| Never-attack list | `api/insult_ai/policies/never_attack.md` | Validity test + green-vs-red examples. |
| Crisis resources (per region) | `api/insult_ai/policies/crisis_resources.md` | Hotline numbers + selection logic. Quarterly audit discipline lives here. |
| Envelope dataclass + parser + invariants | `api/insult_ai/clinical_envelope.py` | `ClinicalEnvelope`, `parse_envelope`, `judge_invariants`. |
| Safety regex fast-path | `api/insult_ai/safety.py` | `classify_safety(message)` — bilingual EN+ES. |
| Local judge (mechanical + lexical) | `api/insult_ai/judge.py` | `judge(env) → JudgeVerdict`. Catches red-attribute attacks + AI leaks + length sanity. |
| Crisis fallback dispatch | `api/insult_ai/crisis_resources.py` | `pick_resources(message, is_spanish)` + `crisis_fallback`. |
| Runner wiring | `api/insult_ai/runner.py` | `Mode = "clinical"` entry in the three dispatch tables. Clinical-specific guards. |
| UI rendering | `web/components/chat/ClinicalEnvelope.tsx` | `parseEnvelope`, `ClinicalEnvelopeView`, `ClinicalEnvelopeTrace`. |
| UI tone selector | `web/components/chat/IntensitySelector.tsx` | Four-chip selector + LowerIntensityButton. |
| UI consent gate | `web/components/chat/OnboardingDialog.tsx` | One-time, localStorage-gated. |
| Golden tests | `bench/golden/clinical_compadre/` | 10 cases (3 normal + 3 procrastination + 2 anxiety + 1 lower-tone + 1 crisis). SHAPE always; LIVE opt-in via `RUN_LIVE=1`. |

## The envelope contract — single source of truth

Every clinical turn ships a single JSON object:

```json
{
  "safety_level": "normal | sensitive | crisis",
  "tone": "soft | medium | spicy | no_insults",
  "user_state_hypothesis": "...",
  "clinical_move": "validation | reflection | cognitive_reframe | behavioral_activation | planning | boundary",
  "roast_line": "<string or null>",
  "main_response": "<string>",
  "micro_action": "<string or null>",
  "follow_up_question": "<string or null>"
}
```

When the schema changes, edit **three** places — there's no codegen:

1. The persona prompt (`api/insult_ai/personas/clinical_compadre.md`)
2. The Python dataclass + Literal types (`api/insult_ai/clinical_envelope.py`)
3. The TypeScript mirror (`web/components/chat/ClinicalEnvelope.tsx`)

A drift between any two surfaces causes silent UI failures (unknown fields
get dropped) — verified per the `wire.py` discipline.

## Safety beats tone — non-negotiable

The `tone` field is a CEILING set by the user. Safety can LOWER it. Never
raise it. Override matrix (canonical to `policies/tone_levels.md`):

| user picked | normal | sensitive | crisis |
|---|---|---|---|
| soft | soft | soft | crisis fallback |
| medium | medium | no_insults effective | crisis fallback |
| spicy | spicy | no_insults effective | crisis fallback |
| no_insults | no_insults | no_insults | crisis fallback |

When `safety_level == "crisis"`:
- `roast_line` MUST be null
- `micro_action` MUST be null (handoff > coaching)
- `follow_up_question` MUST be null
- `clinical_move` MUST be `boundary`
- `main_response` MUST validate + name the limit; the runtime appends the
  localized resource block from `crisis_resources.py`

These are enforced mechanically by `judge_invariants` — a violation
triggers the regenerate-once-then-degrade path (see below).

## Regenerate-once-then-degrade (runtime loop)

The runtime applies a two-step recovery when the judge rejects an
envelope:

1. **Regenerate once** with reinforcement appended to the prompt
   (mechanical violations only — fixable in a retry).
2. **Degrade** if the second attempt also fails — drop to
   `tone: "no_insults"` and ship the safer envelope. Crisis-shaped
   violations SKIP the regenerate and go straight to the localized
   crisis fallback (safety over latency).

This loop lives in `runner.py` — adding new envelope-producing modes
should reuse it, not reimplement.

## Pre-LLM safety classifier

`api/insult_ai/safety.py:classify_safety(message)` runs BEFORE the LLM
turn. Bilingual regex catalog (EN + ES) lifted from
`policies/safety_protocols.md`. Hits force the safety_level into the
prompt context so the persona doesn't have to discover the level from
text alone.

- ~1ms per call, no LLM round-trip
- False positives on `sensitive` are cheap (gentler response)
- False negatives on `crisis` are catastrophic — the classifier biases
  toward over-detection on crisis-shaped signals
- Crisis patterns require a first-person framing: "I want to die" is
  crisis; "my friend wants to die" is sensitive, not crisis

## Disciplinary boundaries (the rules behind the rules)

1. **`xair` is NOT in the runtime.** xair is a CI / repo-automation
   framework (GitHub Actions, PR review gatekeepers — see BAIR). It
   does not live in the conversational loop. The judge in
   `api/insult_ai/judge.py` is **local** to insult-ai. If something
   useful from xair surfaces for repo-quality work, it goes in CI,
   never in `/chat/stream`.
2. **The persona is content, not code.** Edit
   `clinical_compadre.md` to change behavior; touch the code only when
   the contract itself changes.
3. **Three dispatch tables** in `runner.py` (`_PERSONA_BY_MODE`,
   `_GUARDS_BY_MODE`, `_PROMPT_BY_MODE`) — adding a fourth mode is
   three entries, no engine changes.
4. **No therapy speak.** `fi-runner`'s `THERAPY_SPEAK_*`,
   `OVER_VALIDATION_*`, and `MORALIZING_*` packs (EN+ES) are wired
   into the clinical guards. The compadre is a friend, not a corporate
   therapist.
5. **One move per turn.** The persona is instructed to pick ONE
   clinical_move. Stacking moves dilutes the validation/challenge arc
   and makes the response read as protocol.
6. **Microaction on every normal turn.** Closing without a concrete
   next-24-hour step is a judge violation (`normal_missing_action`).
7. **Crisis resources audited quarterly.** The numbers in
   `policies/crisis_resources.md` decay; the audit timestamp at the
   bottom of that doc is load-bearing.

## What changes when (not if) we add a fourth persona

Same drill as adding `clinical` to `roast` + `brief` was:
1. Write `personas/<name>.md` — the prompt.
2. Add the entry to the three dispatch tables in `runner.py`.
3. If the persona needs a structured output, add the schema to
   `clinical_envelope.py` (or sibling module) — same three-place
   discipline.
4. Add cases to a new `bench/golden/<name>/` directory.

Engine untouched. Three tables, one persona file, one (optional)
envelope module. The pivot of this session is the template — read its
commits if doubts arise.
