"""Golden tests for the clinical_compadre persona.

Two-layer test suite over cases.jsonl:

  1. SHAPE tests (always run): every case parses into the expected
     schema. Catches drift in the JSONL itself — adding a case with a
     typo in `safety_level` or a missing `tone` field fails fast.

  2. LIVE tests (opt-in via env): hits the actual API endpoint with each
     case's input and validates the returned envelope against the case's
     expected invariants. Skipped by default because:
       (a) it burns Azure / Bright Data credit + minutes
       (b) the Whisper/TTS quota is 3 RPM (10 turns ≈ 4 min minimum)
       (c) it requires the API to be running (local or production)

     Enable with: RUN_LIVE=1 INSULT_AI_API_URL=https://... pytest -q

Expected invariants per case:
  safety_level                          : required level (regex/LLM)
  roast_line_present                    : bool, must / mustn't be null
  micro_action_present                  : bool
  follow_up_question_present            : bool
  clinical_moves_acceptable             : list — must be one of these
  red_flag_substrings_in_response       : MUST NOT appear in the
                                          rendered text (case-insensitive)
  must_contain_substrings (optional)    : MUST appear (e.g. crisis
                                          fallback must include a hotline)

Run:
  pytest bench/golden/clinical_compadre/test_clinical_compadre.py -v
  RUN_LIVE=1 pytest bench/golden/clinical_compadre/ -v --tb=short
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import pytest

# Make the api/ package importable when pytest runs from repo root.
_REPO = Path(__file__).resolve().parents[3]
_API = _REPO / "api"
if str(_API) not in sys.path:
    sys.path.insert(0, str(_API))

from insult_ai.clinical.envelope import (  # noqa: E402
    ClinicalEnvelope,
    parse_envelope,
)

CASES_FILE = Path(__file__).parent / "cases.jsonl"


def _load_cases() -> list[dict]:
    cases = []
    for i, line in enumerate(CASES_FILE.read_text(encoding="utf-8").splitlines(), 1):
        line = line.strip()
        if not line:
            continue
        try:
            cases.append(json.loads(line))
        except json.JSONDecodeError as e:
            raise AssertionError(f"cases.jsonl line {i}: {e}") from e
    return cases


CASES = _load_cases()
CASE_IDS = [c["id"] for c in CASES]


def _category_counts() -> dict[str, int]:
    counts: dict[str, int] = {}
    for c in CASES:
        counts[c["category"]] = counts.get(c["category"], 0) + 1
    return counts


# ============================================================
# SHAPE tests — always run
# ============================================================


def test_case_count_matches_brief():
    """Bernard's brief says 10 golden tests: 3 normal + 3 procrastination +
    2 anxiety + 1 lower-tone + 1 crisis. Catch silent drift."""
    counts = _category_counts()
    assert counts == {
        "normal": 3,
        "procrastination": 3,
        "anxiety": 2,
        "lower_tone": 1,
        "crisis": 1,
    }, f"unexpected case mix: {counts}"


@pytest.mark.parametrize("case", CASES, ids=CASE_IDS)
def test_case_schema(case: dict) -> None:
    """Every case has the required fields with the right types."""
    assert isinstance(case.get("id"), str) and case["id"]
    assert case.get("category") in {
        "normal",
        "procrastination",
        "anxiety",
        "lower_tone",
        "crisis",
    }
    assert case.get("tone") in {"soft", "medium", "spicy", "no_insults"}
    assert case.get("lang") in {"es", "en"}
    assert isinstance(case.get("input"), str) and case["input"].strip()
    exp = case.get("expected")
    assert isinstance(exp, dict)
    assert exp.get("safety_level") in {"normal", "sensitive", "crisis"}
    for k in ("roast_line_present", "micro_action_present", "follow_up_question_present"):
        assert isinstance(exp.get(k), bool), f"{case['id']}: {k} must be bool"
    moves = exp.get("clinical_moves_acceptable")
    assert isinstance(moves, list) and moves
    valid_moves = {
        "validation",
        "reflection",
        "cognitive_reframe",
        "behavioral_activation",
        "planning",
        "boundary",
    }
    for m in moves:
        assert m in valid_moves, f"{case['id']}: bad move {m!r}"
    assert isinstance(exp.get("red_flag_substrings_in_response"), list)


# ============================================================
# LIVE tests — opt-in
# ============================================================

RUN_LIVE = os.environ.get("RUN_LIVE") == "1"


def _live_assertions(case: dict, env: ClinicalEnvelope) -> None:
    """Per-case invariant checks against a real envelope."""
    exp = case["expected"]
    cid = case["id"]

    assert env.safety_level == exp["safety_level"], (
        f"{cid}: safety_level got {env.safety_level!r}, expected {exp['safety_level']!r}"
    )

    if exp["roast_line_present"]:
        assert env.roast_line is not None and env.roast_line.strip(), (
            f"{cid}: roast_line MUST be present and non-empty"
        )
    else:
        assert env.roast_line is None, (
            f"{cid}: roast_line MUST be null — got {env.roast_line!r}"
        )

    if exp["micro_action_present"]:
        assert env.micro_action is not None and env.micro_action.strip(), (
            f"{cid}: micro_action MUST be present"
        )
    else:
        assert env.micro_action is None, (
            f"{cid}: micro_action MUST be null — got {env.micro_action!r}"
        )

    if exp["follow_up_question_present"]:
        assert env.follow_up_question is not None and env.follow_up_question.strip(), (
            f"{cid}: follow_up_question MUST be present"
        )
    else:
        assert env.follow_up_question is None, (
            f"{cid}: follow_up_question MUST be null"
        )

    assert env.clinical_move in exp["clinical_moves_acceptable"], (
        f"{cid}: clinical_move {env.clinical_move!r} not in "
        f"{exp['clinical_moves_acceptable']}"
    )

    rendered = " ".join(
        part for part in [env.main_response, env.roast_line or "", env.user_state_hypothesis]
    ).lower()
    for needle in exp.get("red_flag_substrings_in_response", []):
        assert needle.lower() not in rendered, (
            f"{cid}: red-flag substring {needle!r} appeared in response"
        )
    for needle in exp.get("must_contain_substrings", []):
        assert needle.lower() in rendered, (
            f"{cid}: required substring {needle!r} missing from response"
        )


@pytest.mark.skipif(not RUN_LIVE, reason="set RUN_LIVE=1 to hit the live API")
@pytest.mark.parametrize("case", CASES, ids=CASE_IDS)
def test_live_envelope(case: dict) -> None:
    """Call the API with the case's input + tone, parse the envelope,
    apply the case's invariants. Skipped unless RUN_LIVE=1.

    Requires the API to be reachable at the URL in INSULT_AI_API_URL
    (defaults to localhost:8080) and any required X-API-Key in
    INSULT_AI_API_KEY."""
    import httpx

    api_url = os.environ.get(
        "INSULT_AI_API_URL", "http://localhost:8080"
    ).rstrip("/")
    api_key = os.environ.get("INSULT_AI_API_KEY", "")
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["X-API-Key"] = api_key

    body = {
        "target": case["input"],
        "mode": "clinical",
        "tone": case["tone"],
    }
    resp = httpx.post(
        f"{api_url}/roast", headers=headers, json=body, timeout=120
    )
    assert resp.status_code == 200, f"{case['id']}: HTTP {resp.status_code}: {resp.text[:200]}"
    data = resp.json()
    raw = data.get("roast") or ""
    env = parse_envelope(raw)
    _live_assertions(case, env)
