# Benchmarks — capture baselines BEFORE touching code

This is the core discipline of this repo. There are **two distinct benchmarks**,
and **both are captured as a baseline before any code change**. Their entire
purpose is to tell whether a change *improves*, *does nothing*, or *regresses*.
Run them only after the fact and you have nothing to compare against — the
benchmark is worthless.

## Benchmark 1 — Guard / output quality (precision / recall / F1)

- A labeled eval set (`bench/eval_set.jsonl`): targets + expected properties.
- Measures whether the run satisfies the guards we care about, e.g.:
  - `used_bright_data` — the agent actually called the live web (see `bright-data.md`)
  - `has_receipts` — claims are backed by fetched sources
  - `not_hateful` / antidrift — roast stays a roast, doesn't become abuse or drift off-target
- Report **precision, recall, F1** per guard. Runner: `bench/eval_guards.py`.

> Reality check: this eval set does **not** exist yet — it has to be authored
> (start small, ~15–30 hand-labeled cases) before the baseline means anything.
> Also: the scaffold currently wires only `ToolPolicy`, not `guards` — wire the
> guards into `runner.py` before claiming this benchmark measures them.

## Benchmark 2 — Performance baseline (latency / throughput)

- Per-turn **latency**: p50 / p90 / p99, measured **per backend** (`claude` vs `codex`).
- **Throughput**: turns per minute under the same conditions.
- Runner: `bench/bench_perf.py`. Output a JSON baseline committed under `bench/`.

## Workflow (non-negotiable order)

1. Author / freeze the eval set.
2. Wire guards into the runner.
3. **Capture both baselines and commit the baseline JSON.**
4. Make code changes.
5. Re-run both. Compare deltas vs the committed baseline.
6. A change that drops F1 or regresses latency without justification gets reverted.

Never iterate on agent behavior without re-checking the benchmarks didn't regress.
