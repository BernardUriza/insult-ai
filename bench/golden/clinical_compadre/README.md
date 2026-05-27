# Golden tests — clinical_compadre

Per Bernard's brief: **10 conversational tests** that exercise the
clinical_compadre persona's contract end-to-end.

## Case mix (exact, brief-mandated)

| Category | Count | Purpose |
|---|---|---|
| `normal` | 3 | Plain coaching turns at three different tones — verify the persona honors tone (jab on medium/spicy, no jab on soft) and produces the full envelope (action + question). |
| `procrastination` | 3 | The product's bread-and-butter — classic avoidance, tool-overinvestment, "waiting to feel ready." Verify the `behavioral_activation` / `cognitive_reframe` / `planning` moves land. |
| `anxiety` | 2 | Mild anxiety in EN + ES — verify the persona escalates to `sensitive`, drops the jab, picks `cognitive_reframe` or `validation`. Catches the "you have anxiety disorder" diagnosis-leak failure. |
| `lower_tone` | 1 | User explicitly asks to soften mid-conversation — verify the persona drops the jab even with `tone: spicy` in the request. |
| `crisis` | 1 | Suicidal ideation (ES) — verify the persona switches to `boundary` move, NULLS roast/action/follow-up, and the response contains a real hotline (Línea de la Vida + IASP fallback). |

Total: **10 cases.** `test_case_count_matches_brief` enforces this — adding a
case requires updating that assertion deliberately.

## Two layers

### SHAPE tests (always run)

`test_case_schema` validates every case's structure: required fields, valid
enum values, correct types. Catches drift in the JSONL itself before any
network or model call. Cheap and fast — runs on every CI commit.

### LIVE tests (opt-in)

`test_live_envelope` hits the real `/roast` endpoint with `mode=clinical`
for each case, parses the returned envelope, and validates the per-case
invariants:

- `safety_level` matches expected
- `roast_line` / `micro_action` / `follow_up_question` presence matches the case's bool
- `clinical_move` is one of the acceptable moves for the situation
- Red-flag substrings are ABSENT from the rendered response
- (Crisis only) Required substrings ARE present (hotline names)

Skipped by default — opt in via env:

```bash
RUN_LIVE=1 INSULT_AI_API_KEY=<key> pytest bench/golden/clinical_compadre/ -v
```

Hits prod by default; override with `INSULT_AI_API_URL=https://...`.

## Why it's burning quota

The Whisper deployment is capped at 3 RPM on the S0 tier (post-bump; was 1
RPM out of the box). The 10 LIVE tests serialize over `/roast`, so a full
run takes ~3-4 minutes minimum. Cost per run is roughly $0.02 in
Azure OpenAI tokens. Don't run on every commit; run before tagging a
release and post-deadline once daily.

## Adding a case

1. Append a JSONL line to `cases.jsonl` with the case's `id`, `category`,
   `tone`, `lang`, `input`, and `expected` block.
2. Update `test_case_count_matches_brief` if the category mix changes.
3. Run SHAPE tests locally (`pytest test_clinical_compadre.py -k schema -v`).
4. Run LIVE tests against your local API before opening the PR.

## Why no LLM-judge here

The judge in `api/insult_ai/judge.py` runs MECHANICAL + LEXICAL checks
on the envelope shape. A real content judge ("does the jab actually
land?", "is the validation genuine?") is the LLM-grade work scoped
post-deadline. For now, the golden tests rely on:

- the structural invariants (in `expected.*_present`)
- a red-flag substring list (catches obvious diagnosis-leaks and
  persona breaks)
- a required-substring list for crisis (catches missing hand-off)

That floor is enough to prevent the most expensive regressions (crisis
without a resource, persona-leak, missing micro-action). The
LLM-content judge sits as future work in `api/insult_ai/judge.py`.
