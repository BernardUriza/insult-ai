"""Unit tests for Slice 3 — clinical psychology corpus wiring.

Covers the two pure-function pieces that gate the feature:

  - ``_resolve_clinical_corpus_id`` — the precedence table that decides
    which corpus_id flows into ``build_runner(with_rag=...)`` and the
    per-mode prompt builder. Verifies the flag-OFF invariant
    ("bit-identical to pre-Slice-3 master") AND the flag-ON happy path.

  - ``parse_envelope`` (sources branch) — the envelope parser must:
      (a) skip the ``sources`` field gracefully when absent;
      (b) ingest a well-formed array;
      (c) truncate to the per-persona max;
      (d) drop malformed entries silently rather than raising.

The tests are pure (no RagStoreClient, no fi-runner, no LLM). They are
the floor under acceptance criterion (4) in the Slice 3 brief
("TypeScript, Next build y pytest pasan").

Run from the api/ env (where fi-runner is installed). The tests do NOT
need fi-runner to import — only ``insult_ai.runner._resolve_clinical_corpus_id``
and ``insult_ai.clinical_envelope.parse_envelope`` are exercised — but the
module imports themselves will pull fi-runner transitively, so the env
must have it.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import pytest

# Make ``api/`` importable when pytest runs from the repo root, without
# requiring an editable install. Mirrors what other bench/* scripts do.
_API_ROOT = Path(__file__).resolve().parent.parent / "api"
if str(_API_ROOT) not in sys.path:
    sys.path.insert(0, str(_API_ROOT))

from insult_ai.clinical_envelope import (  # noqa: E402
    ClinicalSource,
    EnvelopeParseError,
    parse_envelope,
)
from insult_ai.runner import _resolve_clinical_corpus_id  # noqa: E402


# ---------------------------------------------------------------------------
# _resolve_clinical_corpus_id — precedence table
# ---------------------------------------------------------------------------


_FLAG = "INSULT_AI_PSYCH_CORPUS_ENABLED"
_ID = "INSULT_AI_PSYCH_CORPUS_ID"


@pytest.fixture(autouse=True)
def _isolate_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Every test starts with the two env vars unset so the resolver's
    state is deterministic per case."""
    monkeypatch.delenv(_FLAG, raising=False)
    monkeypatch.delenv(_ID, raising=False)


def test_user_corpus_id_wins_when_clinical_and_flag_on(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """User-supplied corpus_id is sovereign — Slice 3 does not merge."""
    monkeypatch.setenv(_FLAG, "1")
    monkeypatch.setenv(_ID, "psych_public_v1")
    assert (
        _resolve_clinical_corpus_id("user_own_corpus", "clinical")
        == "user_own_corpus"
    )


def test_user_corpus_id_wins_when_roast_mode(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """User corpus_id is respected even outside clinical mode — Slice 3
    does not change roast/brief behavior."""
    monkeypatch.setenv(_FLAG, "1")
    assert (
        _resolve_clinical_corpus_id("user_own_corpus", "roast")
        == "user_own_corpus"
    )


def test_roast_mode_never_uses_psych_default(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """roast/brief modes are out of scope for the psychology fallback."""
    monkeypatch.setenv(_FLAG, "1")
    monkeypatch.setenv(_ID, "psych_public_v1")
    assert _resolve_clinical_corpus_id(None, "roast") is None
    assert _resolve_clinical_corpus_id(None, "brief") is None


def test_flag_off_returns_none_even_in_clinical(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The flag-OFF invariant: clinical without flag is bit-identical to
    pre-Slice-3 master."""
    # Flag unset
    assert _resolve_clinical_corpus_id(None, "clinical") is None
    # Flag explicitly "0"
    monkeypatch.setenv(_FLAG, "0")
    assert _resolve_clinical_corpus_id(None, "clinical") is None
    # Flag with any non-"1" value (truthiness is NOT what we use)
    monkeypatch.setenv(_FLAG, "true")
    assert _resolve_clinical_corpus_id(None, "clinical") is None


def test_flag_on_clinical_falls_back_to_default(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """When the user passes no corpus_id and the flag is "1", clinical
    mode resolves to the hard-coded default."""
    monkeypatch.setenv(_FLAG, "1")
    # No INSULT_AI_PSYCH_CORPUS_ID override
    assert _resolve_clinical_corpus_id(None, "clinical") == "psych_public_v1"


def test_flag_on_clinical_honors_env_override(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The env override (INSULT_AI_PSYCH_CORPUS_ID) wins over the default
    when the flag is on."""
    monkeypatch.setenv(_FLAG, "1")
    monkeypatch.setenv(_ID, "psych_v2_experimental")
    assert (
        _resolve_clinical_corpus_id(None, "clinical")
        == "psych_v2_experimental"
    )


def test_empty_user_corpus_id_falls_through(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """An empty string is treated as ``not provided``, not as an explicit
    request for an empty corpus."""
    monkeypatch.setenv(_FLAG, "1")
    assert _resolve_clinical_corpus_id("", "clinical") == "psych_public_v1"


# ---------------------------------------------------------------------------
# parse_envelope — sources branch
# ---------------------------------------------------------------------------


_BASE_ENVELOPE: dict[str, object] = {
    "safety_level": "normal",
    "tone": "medium",
    "user_state_hypothesis": "sounds saturated",
    "clinical_move": "validation",
    "roast_line": "the inbox isn't winning, you're losing",
    "main_response": "Two-week-old drafts have weight. That's not nothing.",
    "micro_action": "set a 12-minute timer and open the file",
    "follow_up_question": "what's the smallest version of the email you can send today?",
}


def _envelope_with(**overrides: object) -> str:
    """Helper — build a JSON envelope string with optional overrides."""
    data = dict(_BASE_ENVELOPE)
    data.update(overrides)
    return json.dumps(data)


def test_envelope_without_sources_parses_to_none() -> None:
    """The Slice 3 default: when the LLM omitted the field, the dataclass
    field is None (NOT [], NOT an empty list)."""
    env = parse_envelope(_envelope_with())
    assert env.sources is None


def test_envelope_with_null_sources_parses_to_none() -> None:
    """If the LLM mistakenly emitted `null` (against persona instructions),
    we tolerate it and treat as absent."""
    env = parse_envelope(_envelope_with(sources=None))
    assert env.sources is None


def test_envelope_with_empty_sources_parses_to_none() -> None:
    """Same for `[]` — absent."""
    env = parse_envelope(_envelope_with(sources=[]))
    assert env.sources is None


def test_envelope_with_one_source_parses_to_one() -> None:
    src = {
        "name": "NIMH",
        "url": "https://www.nimh.nih.gov/health/topics/depression",
        "license": "public-domain-us-federal",
    }
    env = parse_envelope(_envelope_with(sources=[src]))
    assert env.sources == [
        ClinicalSource(
            name="NIMH",
            url="https://www.nimh.nih.gov/health/topics/depression",
            license="public-domain-us-federal",
        )
    ]


def test_envelope_truncates_sources_to_three() -> None:
    """Persona contract: max 3. Parser enforces the floor."""
    srcs = [
        {
            "name": f"src-{i}",
            "url": f"https://example.com/{i}",
            "license": "public-domain-us-federal",
        }
        for i in range(5)
    ]
    env = parse_envelope(_envelope_with(sources=srcs))
    assert env.sources is not None
    assert len(env.sources) == 3
    assert [s.name for s in env.sources] == ["src-0", "src-1", "src-2"]


def test_envelope_drops_malformed_source_entries() -> None:
    """Tolerant parse: a malformed entry is dropped, not raised."""
    srcs = [
        {"name": "NIMH", "url": "https://x", "license": "public-domain-us-federal"},
        {"name": "missing_url", "license": "public-domain-us-federal"},
        "not even a dict",
        {"name": "", "url": "https://y", "license": "x"},  # empty name
        {"name": "WHO", "url": "https://who.int", "license": "ok"},
    ]
    env = parse_envelope(_envelope_with(sources=srcs))
    assert env.sources is not None
    assert [s.name for s in env.sources] == ["NIMH", "WHO"]


def test_envelope_with_all_malformed_sources_parses_to_none() -> None:
    """If every entry is dropped, the field collapses to None — same
    contract as omitting it entirely."""
    env = parse_envelope(_envelope_with(sources=[{"name": "only"}, 42]))
    assert env.sources is None


def test_envelope_to_wire_omits_sources_when_absent() -> None:
    """Wire-shape invariant: a no-corpus turn produces a dict whose keys
    are bit-identical to pre-Slice-3 (no `sources` key)."""
    env = parse_envelope(_envelope_with())
    wire = env.to_wire()
    assert "sources" not in wire


def test_envelope_to_wire_includes_sources_when_present() -> None:
    src = {
        "name": "NIMH",
        "url": "https://www.nimh.nih.gov/health/topics/sleep",
        "license": "public-domain-us-federal",
    }
    env = parse_envelope(_envelope_with(sources=[src]))
    wire = env.to_wire()
    assert wire.get("sources") == [src]


def test_envelope_parse_still_raises_on_missing_required_field() -> None:
    """Sources tolerance does NOT extend to the rest of the schema —
    missing required fields still raise."""
    bad = json.dumps({**_BASE_ENVELOPE, "main_response": None})
    with pytest.raises(EnvelopeParseError):
        parse_envelope(bad)
