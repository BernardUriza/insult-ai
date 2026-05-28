"""Benchmark 1 — roast QUALITY (hybrid scoring).

The OBJECTIVE metrics are computed deterministically from the turn's tool-trace
(``fi_runner`` ``TurnResult.tool_calls``) + the roast text. The single
SUBJECTIVE metric — ``burn`` (0-5: how sharp/funny) — is left ``null`` for a
human to fill by hand. That's the "hybrid": the machine measures what it can
prove, the human judges the wit.

The star metric is ``receipts_grounded``: the fraction of cited receipts whose
domain the agent ACTUALLY fetched this turn (recovered from tool-call INPUTS,
recursively). A receipt the agent never fetched = a fabricated source. CAVEAT:
fi-runner exposes each tool's INPUT, not its OUTPUT — so a receipt the agent
found inside a SERP *result* (not scraped directly) reads as ungrounded. It's a
strict floor, not a full anti-hallucination check; for claims (pure SERP) it
trends to 0 by design.

ROBUSTNESS (so a run can't rot):
- one failing/hung case can't kill the run: each turn is wrapped + time-boxed,
  a failure is recorded (``error``) and the run continues;
- every run writes ``.raw_roasts.jsonl`` (gitignored — full text + tool_calls),
  so ``--rescore`` recomputes scores after a scoring-bug fix WITHOUT re-roasting;
- ``--rescore`` PRESERVES hand-filled ``burn`` values from the existing baseline;
- the Bright Data server name is imported from the runner (no hard-coded string
  that could silently drift and zero out ``used_bright_data``).

Capture the baseline BEFORE changing the persona/code (see
.claude/rules/benchmarks.md), commit ``baseline_quality.json``, compare deltas.
NOTE: the roast is non-deterministic (LLM), so a single run is one snapshot —
deltas carry inherent noise; treat small movements with suspicion.

Usage:
    python bench/eval_quality.py              # full run (every case — spends credit)
    python bench/eval_quality.py --limit 1    # smoke test (first N cases, cheap)
    python bench/eval_quality.py --rescore    # recompute from .raw_roasts.jsonl (free)
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys
from pathlib import Path
from statistics import mean
from typing import Any
from urllib.parse import urlparse

from dotenv import load_dotenv

_HERE = Path(__file__).resolve().parent
_API = _HERE.parent / "api"

# Secrets (Bright Data API_TOKEN, OAuth token) into the env BEFORE the runner is
# built. The claude branch drops an ambient ANTHROPIC_API_KEY itself (see runner).
load_dotenv(_API / ".env")
sys.path.insert(0, str(_API))

from fi_runner import ToolCall  # noqa: E402  (reconstruct tool_calls on --rescore)
from insult_ai.prompts import roast_prompt  # noqa: E402
from insult_ai.receipts import ensure_result_receipts  # noqa: E402
from insult_ai.runner import BRIGHTDATA_MCP, build_runner  # noqa: E402

EVAL_SET = _HERE / "eval_set.jsonl"
BASELINE = _HERE / "baseline_quality.json"
RAW = _HERE / ".raw_roasts.jsonl"  # gitignored: full text + tool_calls per case

# Single source of truth for the MCP server name — imported, NOT hard-coded, so a
# rename in runner.py can't silently zero out used_bright_data here.
_BD_SERVER = BRIGHTDATA_MCP.name

# Per-case ceiling: one hung roast (stuck MCP subprocess / network) can't zombie
# the whole run. Bumped 300→480 once the plan-first persona landed: declare_plan
# + start_step/complete_step per step add ~1+2N task_tracker round-trips, and
# JS-SPA URL targets (scraping browser) already ran close to 300 — they tipped
# over once the plan overhead was added. 480 gives the heavy URL cases headroom.
TURN_TIMEOUT_S = 480

# Deterministic safety FLOOR — a blocklist, NOT a classifier. A roast that trips
# this isn't a roast, it's abuse. Matched on WORD BOUNDARIES (so "spic" does not
# fire on "spicy"/"suspicious"/"despicable"). Conservative on purpose; the manual
# `burn` review catches subtler misses. Extend as needed.
_HATE_TERMS = ("retard", "tranny", "faggot", "kike", "spic", "wetback", "chink")
_HATE_RE = re.compile(r"\b(?:" + "|".join(map(re.escape, _HATE_TERMS)) + r")s?\b", re.IGNORECASE)

_URL_RE = re.compile(r"https?://[^\s)\]>\"']+")
_RECEIPTS_RE = re.compile(r"receipts?", re.IGNORECASE)


def _domain(url: str) -> str:
    net = urlparse(url).netloc.lower()
    return net[4:] if net.startswith("www.") else net


def _receipt_urls(text: str) -> list[str]:
    """URLs under the '🧾 Receipts' section — everything after the last 'Receipts'
    heading. Falls back to all URLs in the text when no heading is present."""
    marks = list(_RECEIPTS_RE.finditer(text))
    tail = text[marks[-1].end() :] if marks else text
    return _URL_RE.findall(tail)


def _urls_in(value: Any) -> set[str]:
    """Every URL inside a tool-call input, at ANY depth (str / dict / list) — so a
    URL nested under e.g. {'params': {'url': ...}} still counts as fetched."""
    found: set[str] = set()
    if isinstance(value, str):
        found.update(_URL_RE.findall(value))
    elif isinstance(value, dict):
        for v in value.values():
            found |= _urls_in(v)
    elif isinstance(value, (list, tuple)):
        for v in value:
            found |= _urls_in(v)
    return found


def _fetched_domains(tool_calls: list[ToolCall]) -> set[str]:
    """Domains the agent ACTUALLY fetched, recovered recursively from tool inputs."""
    out: set[str] = set()
    for tc in tool_calls:
        out.update(_domain(u) for u in _urls_in(tc.input or {}))
    return out


def _on_target(target: str, kind: str, text: str) -> bool:
    low = text.lower()
    if kind == "url":
        return _domain(target) in low
    # claim: at least half its significant (4+ char) words appear in the roast
    words = set(re.findall(r"[a-z]{4,}", target.lower()))
    if not words:
        return target.lower() in low
    hits = sum(1 for w in words if w in low)
    return hits >= max(1, len(words) // 2)


def score(case: dict, text: str, tool_calls: list[ToolCall], *, error: str | None = None) -> dict:
    kind = case.get("kind", "url")
    used_bd = any(tc.server == _BD_SERVER for tc in tool_calls)
    receipt_domains = {d for d in (_domain(u) for u in _receipt_urls(text)) if d}
    fetched = _fetched_domains(tool_calls)
    grounded = (sum(1 for d in receipt_domains if d in fetched) / len(receipt_domains)) if receipt_domains else 0.0
    return {
        "id": case["id"],
        "target": case["target"],
        "kind": kind,
        # --- objective (auto, deterministic) ---
        "used_bright_data": used_bd,
        "tool_count": len(tool_calls),
        "receipts_count": len(receipt_domains),
        "receipts_grounded": round(grounded, 3),
        "on_target": _on_target(case["target"], kind, text),
        "safety_ok": _HATE_RE.search(text) is None,
        # --- subjective (manual): fill 0-5 by hand, then --rescore for avg_burn ---
        "burn": None,
        # non-null only when the turn itself failed (timeout / backend error)
        "error": error,
    }


def _tc_to_dict(tc: ToolCall) -> dict:
    return {"name": tc.name, "server": tc.server, "input": tc.input, "id": tc.id, "is_error": tc.is_error}


def _tc_from_dict(d: dict) -> ToolCall:
    return ToolCall(
        name=d["name"], server=d.get("server"), input=d.get("input"), id=d.get("id"), is_error=d.get("is_error")
    )


def aggregate(rows: list[dict]) -> dict:
    n = len(rows)
    pct = lambda key: round(sum(1 for r in rows if r[key]) / n, 3) if n else 0.0
    burns = [r["burn"] for r in rows if isinstance(r["burn"], (int, float))]
    return {
        "cases": n,
        "failed": sum(1 for r in rows if r.get("error")),
        "pct_used_bright_data": pct("used_bright_data"),
        "pct_on_target": pct("on_target"),
        "pct_safety_ok": pct("safety_ok"),
        "avg_receipts": round(mean(r["receipts_count"] for r in rows), 2) if n else 0,
        "avg_receipts_grounded": round(mean(r["receipts_grounded"] for r in rows), 3) if n else 0,
        "avg_tool_count": round(mean(r["tool_count"] for r in rows), 2) if n else 0,
        "avg_burn": round(mean(burns), 2) if burns else None,  # null until the manual pass
    }


def _carry_burns(rows: list[dict]) -> list[dict]:
    """Re-apply hand-filled burns from the existing baseline (keyed by id) so a
    --rescore never wipes the human's work."""
    if not BASELINE.exists():
        return rows
    prev = {c["id"]: c.get("burn") for c in json.loads(BASELINE.read_text()).get("cases", [])}
    for r in rows:
        if prev.get(r["id"]) is not None:
            r["burn"] = prev[r["id"]]
    return rows


def _write_baseline(rows: list[dict]) -> None:
    out = {
        "benchmark": "roast_quality_hybrid",
        "backend": os.getenv("INSULT_AI_BACKEND", "claude"),
        "aggregate": aggregate(rows),
        "cases": rows,
        "note": "objective metrics auto; fill each `burn` 0-5 by hand, then run --rescore to recompute avg_burn",
    }
    BASELINE.write_text(json.dumps(out, indent=2) + "\n")
    print(f"\n✅ baseline → {BASELINE.relative_to(_HERE.parent)}")
    print(json.dumps(out["aggregate"], indent=2))


async def run_eval(cases: list[dict]) -> list[dict]:
    """Roast every case live, score it, and dump raw text + tool_calls (so a later
    --rescore never has to re-roast). RAW is truncated per run, flushed per case so
    a killed run still leaves what it finished. A failing/hung case is recorded and
    skipped — it can't take the whole run down."""
    runner = build_runner()
    runner.flow_narrator = None  # no background narration (a 2nd backend call) per eval

    rows: list[dict] = []
    with RAW.open("w") as raw_f:
        try:
            for i, case in enumerate(cases, 1):
                print(f"[{i}/{len(cases)}] roasting {case['target']} ...", flush=True)
                try:
                    result = await asyncio.wait_for(
                        runner.run(roast_prompt(case["target"])),
                        timeout=TURN_TIMEOUT_S,
                    )
                except Exception as exc:  # noqa: BLE001 - one bad case must not rot the run
                    rows.append(score(case, "", [], error=f"{type(exc).__name__}: {exc}"))
                    print(f"    ✗ FAILED: {type(exc).__name__}: {str(exc)[:120]}", flush=True)
                    continue
                result = ensure_result_receipts(result)
                raw_f.write(
                    json.dumps(
                        {
                            "id": case["id"],
                            "target": case["target"],
                            "kind": case.get("kind", "url"),
                            "text": result.text,
                            "tool_calls": [_tc_to_dict(tc) for tc in result.tool_calls],
                        }
                    )
                    + "\n"
                )
                raw_f.flush()
                row = score(case, result.text, result.tool_calls)
                rows.append(row)
                print(
                    f"    bright_data={row['used_bright_data']} tools={row['tool_count']} "
                    f"receipts={row['receipts_count']} grounded={row['receipts_grounded']} "
                    f"on_target={row['on_target']} safe={row['safety_ok']}",
                    flush=True,
                )
        finally:
            await runner.aclose()
    return rows


def rescore() -> list[dict]:
    """Recompute scores from .raw_roasts.jsonl WITHOUT re-roasting (free) — use
    after fixing a scoring bug. Preserves hand-filled burns from the baseline."""
    if not RAW.exists():
        sys.exit(f"no raw dump at {RAW} — run a live eval first")
    rows: list[dict] = []
    for line in RAW.read_text().splitlines():
        if not line.strip():
            continue
        d = json.loads(line)
        case = {"id": d["id"], "target": d["target"], "kind": d.get("kind", "url")}
        rows.append(score(case, d["text"], [_tc_from_dict(tc) for tc in d.get("tool_calls", [])]))
    print(f"rescored {len(rows)} cases from {RAW.name} (no roasting)")
    return _carry_burns(rows)


async def main() -> None:
    ap = argparse.ArgumentParser(description="Benchmark 1 — roast quality (hybrid).")
    ap.add_argument("--limit", type=int, default=0, help="run only the first N cases (smoke test)")
    ap.add_argument("--rescore", action="store_true", help="recompute from .raw_roasts.jsonl without re-roasting")
    args = ap.parse_args()

    if args.rescore:
        _write_baseline(rescore())
        return

    cases = [json.loads(line) for line in EVAL_SET.read_text().splitlines() if line.strip()]
    if args.limit:
        cases = cases[: args.limit]
    _write_baseline(await run_eval(cases))


if __name__ == "__main__":
    asyncio.run(main())
