"""Benchmark 2 — per-turn LATENCY (and throughput) per backend.

Companion to ``eval_quality.py``. Same eval set, same ``build_runner()`` — but
the question this one answers is *how fast*, not *how good*. Output: p50/p90/p99
of per-turn wall time + turns-per-minute, written as ``baseline_perf.json``
(or ``baseline_perf_<label>.json`` when ``--label`` is given so a BEFORE/AFTER
pair sits side by side under ``bench/`` for diffing).

The rule (``.claude/rules/benchmarks.md``) is: capture BEFORE you change agent
behavior, capture AGAIN after, compare. A change that regresses p90 without a
written justification gets reverted. The task_tracker capability in particular
adds ~1+2·N MCP round-trips per turn (declare_plan + start_step/complete_step
per declared step) — this bench is what confirms the cost stays acceptable.

Robustness notes (copied from eval_quality.py — same shape, same demands):
- per-case timeout so one hung roast can't zombie the run;
- per-case error is recorded (``error``) and we keep going;
- the agent's text + tool_calls are NOT written here on purpose — quality is
  ``eval_quality.py``'s job. This file measures TIME and TOOL VOLUME only.

Usage:
    python bench/bench_perf.py                          # full run, writes baseline_perf.json
    python bench/bench_perf.py --limit 4                # smoke (first 4 cases)
    python bench/bench_perf.py --label before           # → baseline_perf_before.json
    python bench/bench_perf.py --label after --reps 2   # 2 reps per case (variance check)
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time
from pathlib import Path
from statistics import mean, median
from typing import Any

from dotenv import load_dotenv

_HERE = Path(__file__).resolve().parent
_API = _HERE.parent / "api"

load_dotenv(_API / ".env")
sys.path.insert(0, str(_API))

from insult_ai.runner import build_runner, roast_prompt  # noqa: E402

EVAL_SET = _HERE / "eval_set.jsonl"

# Per-case ceiling — matches eval_quality.py. A stuck Bright Data MCP / wedged
# SDK socket otherwise leaves a turn open forever and pollutes the p99.
TURN_TIMEOUT_S = 300


def _percentile(values: list[float], p: float) -> float:
    """Linear-interpolation percentile (numpy-style ``method="linear"``). Returns
    ``0.0`` on an empty list so an aggregate row never crashes on a fully-failed run."""
    if not values:
        return 0.0
    s = sorted(values)
    if len(s) == 1:
        return s[0]
    k = (len(s) - 1) * p
    lo = int(k)
    hi = min(lo + 1, len(s) - 1)
    frac = k - lo
    return s[lo] + (s[hi] - s[lo]) * frac


def aggregate(rows: list[dict]) -> dict:
    ok = [r for r in rows if not r.get("error")]
    lat = [r["latency_s"] for r in ok]
    tool_counts = [r["tool_count"] for r in ok]
    total_time = sum(lat)
    return {
        "turns": len(rows),
        "ok": len(ok),
        "failed": sum(1 for r in rows if r.get("error")),
        "latency_s": {
            "p50": round(median(lat), 2) if lat else 0.0,
            "p90": round(_percentile(lat, 0.90), 2),
            "p99": round(_percentile(lat, 0.99), 2),
            "mean": round(mean(lat), 2) if lat else 0.0,
            "min": round(min(lat), 2) if lat else 0.0,
            "max": round(max(lat), 2) if lat else 0.0,
        },
        # Turns per minute computed from total successful-turn wall time. Since
        # cases run sequentially, this is the sustained sequential throughput,
        # NOT a concurrency benchmark. Apples-to-apples across runs.
        "throughput_turns_per_min": round((len(ok) / total_time) * 60.0, 2) if total_time else 0.0,
        "avg_tool_count": round(mean(tool_counts), 2) if tool_counts else 0.0,
    }


async def run_perf(cases: list[dict], reps: int) -> list[dict]:
    """Time every (case × rep) live. A failure is recorded and the run continues
    — one bad case can't take the bench down. ``runner.aclose()`` is in a
    ``finally`` so a SIGINT mid-run still drains pending narrations."""
    runner = build_runner()
    # No background narration during a perf bench — that's a SECOND backend call
    # per turn (see fi_runner.Runner.flow_narrator). It does NOT block the turn
    # (drained on aclose), but the extra outbound socket activity perturbs the
    # numbers. The product ships with it on; the bench measures the turn itself.
    runner.flow_narrator = None

    rows: list[dict] = []
    try:
        n = len(cases) * reps
        i = 0
        for rep in range(1, reps + 1):
            for case in cases:
                i += 1
                tag = f"[{i}/{n}] {case['target']}" + (f" (rep {rep})" if reps > 1 else "")
                print(f"{tag} ...", flush=True)
                t0 = time.perf_counter()
                error: str | None = None
                tool_count = 0
                try:
                    result = await asyncio.wait_for(
                        runner.run(roast_prompt(case["target"])),
                        timeout=TURN_TIMEOUT_S,
                    )
                    tool_count = len(result.tool_calls)
                except Exception as exc:  # noqa: BLE001 - boundary: record and continue
                    error = f"{type(exc).__name__}: {exc}"
                dt = time.perf_counter() - t0
                rows.append({
                    "id": case["id"],
                    "target": case["target"],
                    "rep": rep,
                    "latency_s": round(dt, 2),
                    "tool_count": tool_count,
                    "error": error,
                })
                if error:
                    print(f"    ✗ FAILED after {dt:.1f}s: {error[:120]}", flush=True)
                else:
                    print(f"    ✓ {dt:.1f}s · {tool_count} tools", flush=True)
    finally:
        await runner.aclose()
    return rows


def _baseline_path(label: str | None) -> Path:
    suffix = f"_{label}" if label else ""
    return _HERE / f"baseline_perf{suffix}.json"


def _write_baseline(rows: list[dict], label: str | None, reps: int) -> None:
    out: dict[str, Any] = {
        "benchmark": "roast_perf_sequential",
        "backend": os.getenv("INSULT_AI_BACKEND", "claude"),
        "label": label,
        "reps": reps,
        "aggregate": aggregate(rows),
        "turns": rows,
        "note": "sequential per-turn latency; flow_narrator OFF to keep the measurement honest",
    }
    path = _baseline_path(label)
    path.write_text(json.dumps(out, indent=2) + "\n")
    print(f"\n✅ baseline → {path.relative_to(_HERE.parent)}")
    print(json.dumps(out["aggregate"], indent=2))


async def main() -> None:
    ap = argparse.ArgumentParser(description="Benchmark 2 — roast latency (p50/p90/p99).")
    ap.add_argument("--limit", type=int, default=0, help="run only the first N cases (smoke test)")
    ap.add_argument("--reps", type=int, default=1, help="repetitions per case (variance check)")
    ap.add_argument(
        "--label",
        type=str,
        default=None,
        help="suffix for the baseline filename, e.g. --label before → baseline_perf_before.json",
    )
    args = ap.parse_args()

    cases = [json.loads(line) for line in EVAL_SET.read_text().splitlines() if line.strip()]
    if args.limit:
        cases = cases[: args.limit]
    rows = await run_perf(cases, reps=args.reps)
    _write_baseline(rows, args.label, args.reps)


if __name__ == "__main__":
    asyncio.run(main())
