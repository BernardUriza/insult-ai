"""Structured response envelope for the clinical_compadre persona.

The persona is instructed to emit a single JSON object per turn:

    {
      "safety_level":         "normal" | "sensitive" | "crisis",
      "tone":                 "soft" | "medium" | "spicy" | "no_insults",
      "user_state_hypothesis": "...",
      "clinical_move":        "validation" | "reflection" | "cognitive_reframe"
                              | "behavioral_activation" | "planning" | "boundary",
      "roast_line":           str | null,
      "main_response":        "...",
      "micro_action":         str | null,
      "follow_up_question":   str | null
    }

This module is the parser + validator + wire serializer for that shape.

Why a separate module (not just JSON in runner.py): the envelope is the
load-bearing contract between persona, judge, runtime, and UI. Centralizing
it here means: (1) the persona prompt is the only place that decides
field names; (2) the judge invariants live next to the dataclass that
ships them; (3) the wire renderer + the eval bench both project the same
type so the UI and the test suite can't drift on field shape.

The persona's instructions ARE the schema. If the persona changes (new
fields, renamed move, etc.) edit one Literal here, one Literal in the
persona prompt, and the TypedDict mirror in web/components/chat/types.ts.
Three places, no codegen — same discipline as wire.py.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Literal, TypedDict

# These Literals MUST match the persona prompt verbatim. A typo here is a
# silent contract break — the parser will land "spice" in `tone` even
# though the persona will only ever write "spicy". We keep them tight and
# small so a future addition shows up as a missing-case error in mypy.
SafetyLevel = Literal["normal", "sensitive", "crisis"]
Tone = Literal["soft", "medium", "spicy", "no_insults"]
ClinicalMove = Literal[
    "validation",
    "reflection",
    "cognitive_reframe",
    "behavioral_activation",
    "planning",
    "boundary",
]

_VALID_SAFETY: set[str] = {"normal", "sensitive", "crisis"}
_VALID_TONE: set[str] = {"soft", "medium", "spicy", "no_insults"}
_VALID_MOVE: set[str] = {
    "validation",
    "reflection",
    "cognitive_reframe",
    "behavioral_activation",
    "planning",
    "boundary",
}

# Slice 3 — Maximum number of cited sources surfaced in the envelope. The
# persona prompt also enforces this; the parser is the belt-and-suspenders
# layer that truncates if the LLM oversteps. Three is enough to attribute
# without turning the response into a citation page.
_MAX_SOURCES = 3


@dataclass(frozen=True)
class ClinicalSource:
    """One cited source. Populated when the LLM used the psychology corpus
    AND the retrieved chunk carried an in-text ``[Source: ... | URL: ... |
    License: ...]`` header (written by ``bench/ingest_psychology_corpus.py
    --commit``). The LLM copies those values into the envelope's optional
    ``sources`` array; the runner does NOT enrich server-side."""

    name: str  # e.g. "NIMH"
    url: str  # e.g. "https://www.nimh.nih.gov/health/topics/depression"
    license: str  # e.g. "public-domain-us-federal"


class ClinicalSourceWire(TypedDict):
    """Wire-side mirror — keep this aligned with the TS
    ClinicalSource in web/components/chat/ClinicalEnvelope.tsx."""

    name: str
    url: str
    license: str


@dataclass
class ClinicalEnvelope:
    """Structured envelope produced by the clinical_compadre persona.

    Always reaches the UI via `to_wire()`. Field semantics live in
    `personas/clinical_compadre.md` (the persona contract) — this dataclass
    is the runtime mirror.
    """

    safety_level: SafetyLevel
    tone: Tone
    user_state_hypothesis: str
    clinical_move: ClinicalMove
    roast_line: str | None
    main_response: str
    micro_action: str | None
    follow_up_question: str | None
    # Slice 3 — Optional, LLM opt-in. Populated only when the clinical mode
    # turn was wired with a corpus AND the LLM used it. Omitted entirely
    # (not null, not empty) when the LLM did not cite. See the persona
    # prompt + clinical_prompt() in runner.py. Truncated to _MAX_SOURCES.
    sources: list[ClinicalSource] | None = None

    def to_wire(self) -> EnvelopeWire:
        """Project to the SSE wire shape (a plain dict the client reads)."""
        wire: EnvelopeWire = {
            "safety_level": self.safety_level,
            "tone": self.tone,
            "user_state_hypothesis": self.user_state_hypothesis,
            "clinical_move": self.clinical_move,
            "roast_line": self.roast_line,
            "main_response": self.main_response,
            "micro_action": self.micro_action,
            "follow_up_question": self.follow_up_question,
        }
        # Sources are only added when present and non-empty so the wire
        # contract for non-Slice-3 turns is bit-identical to pre-Slice-3.
        # The TS mirror also makes the field optional.
        if self.sources:
            wire["sources"] = [
                {"name": s.name, "url": s.url, "license": s.license}
                for s in self.sources
            ]
        return wire


class EnvelopeWire(TypedDict, total=False):
    """TS-side mirror — keep this aligned with the ClinicalEnvelopeData
    interface in web/components/chat/ClinicalEnvelope.tsx. There's no
    codegen here on purpose; a drift surfaces fast because the UI silently
    drops unknown fields and the panel goes blank.

    ``total=False`` so the optional ``sources`` field doesn't need to be
    present in every envelope dict. The required fields are still always
    populated by ``to_wire``; the type system is just permissive for the
    optional one."""

    safety_level: SafetyLevel
    tone: Tone
    user_state_hypothesis: str
    clinical_move: ClinicalMove
    roast_line: str | None
    main_response: str
    micro_action: str | None
    follow_up_question: str | None
    sources: list[ClinicalSourceWire]


@dataclass
class EnvelopeParseError(Exception):
    """Surfaced when the persona's output isn't a recoverable envelope.

    Carries the original raw text so the caller can fall back to plain
    rendering (the safer degradation than dropping the turn). The `reason`
    is a short tag (`not_json`, `missing_fields`, `bad_enum`) so the
    judge can decide whether to regenerate or accept-with-warning."""

    reason: str
    raw: str
    detail: str = ""


# Persona is instructed to emit JUST the JSON object — no markdown fences,
# no preamble. But models drift. This regex strips a possible
# ```json … ``` fence and pulls the first {...} balanced span as a
# best-effort recovery. If it still doesn't parse, we raise.
_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)


def _extract_json_object(text: str) -> str:
    """Best-effort: pull the JSON object out of `text`.

    The persona is supposed to emit ONLY the JSON. When it doesn't (drift,
    extra commentary, code-fence), we strip the obvious junk and return
    the first balanced `{...}` span. Falls back to the original string
    if no balanced object is found — let json.loads raise the descriptive
    error."""
    stripped = _FENCE_RE.sub("", text).strip()
    if not stripped.startswith("{"):
        # Try to find the first balanced {…}. Naive but robust enough for
        # model drift — anything past the matching brace is dropped.
        depth = 0
        start = -1
        for i, ch in enumerate(stripped):
            if ch == "{":
                if depth == 0:
                    start = i
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0 and start != -1:
                    return stripped[start : i + 1]
        return stripped  # let json.loads choke with a clear error
    return stripped


def parse_envelope(raw: str) -> ClinicalEnvelope:
    """Parse the persona's raw output into a ClinicalEnvelope.

    Raises EnvelopeParseError on:
      - non-JSON (`reason="not_json"`)
      - missing required field (`reason="missing_fields"`)
      - invalid enum value (`reason="bad_enum"`)
      - wrong type on a required field (`reason="bad_type"`)

    Optional fields (roast_line, micro_action, follow_up_question) accept
    both `null` and `""` — the latter is a common model output for "no
    value" and we coerce it to None. Anything else on those fields must
    be a string.
    """
    extracted = _extract_json_object(raw)
    try:
        data = json.loads(extracted)
    except (json.JSONDecodeError, ValueError) as exc:
        raise EnvelopeParseError(
            reason="not_json", raw=raw, detail=str(exc)
        ) from exc

    if not isinstance(data, dict):
        raise EnvelopeParseError(
            reason="not_json", raw=raw, detail="top-level value is not an object"
        )

    required = (
        "safety_level",
        "tone",
        "user_state_hypothesis",
        "clinical_move",
        "main_response",
    )
    missing = [k for k in required if k not in data]
    if missing:
        raise EnvelopeParseError(
            reason="missing_fields",
            raw=raw,
            detail=f"missing: {missing}",
        )

    safety = data["safety_level"]
    if safety not in _VALID_SAFETY:
        raise EnvelopeParseError(
            reason="bad_enum", raw=raw, detail=f"safety_level={safety!r}"
        )
    tone = data["tone"]
    if tone not in _VALID_TONE:
        raise EnvelopeParseError(
            reason="bad_enum", raw=raw, detail=f"tone={tone!r}"
        )
    move = data["clinical_move"]
    if move not in _VALID_MOVE:
        raise EnvelopeParseError(
            reason="bad_enum", raw=raw, detail=f"clinical_move={move!r}"
        )

    def _optional_str(key: str) -> str | None:
        v = data.get(key)
        if v is None:
            return None
        if isinstance(v, str):
            return v.strip() or None  # treat empty string as null
        raise EnvelopeParseError(
            reason="bad_type", raw=raw, detail=f"{key} must be string|null"
        )

    def _required_str(key: str) -> str:
        v = data.get(key)
        if not isinstance(v, str):
            raise EnvelopeParseError(
                reason="bad_type", raw=raw, detail=f"{key} must be string"
            )
        return v.strip()

    # Slice 3 — optional sources array. Tolerant by design: malformed or
    # over-the-limit entries are silently dropped rather than raising, so a
    # well-formed envelope is never rejected because of a sloppy citation.
    # The parser:
    #   - accepts list of dicts with str name/url/license;
    #   - drops dict entries missing any required key or with non-str values;
    #   - **filters first, then truncates** to _MAX_SOURCES so a few
    #     malformed entries at the head of the array don't crowd out the
    #     valid ones that follow;
    #   - returns None when the field is missing, null, [], or every entry
    #     was dropped.
    sources: list[ClinicalSource] | None = None
    raw_sources = data.get("sources")
    if isinstance(raw_sources, list) and raw_sources:
        parsed: list[ClinicalSource] = []
        for item in raw_sources:
            if not isinstance(item, dict):
                continue
            name = item.get("name")
            url = item.get("url")
            lic = item.get("license")
            if (
                isinstance(name, str)
                and isinstance(url, str)
                and isinstance(lic, str)
                and name.strip()
                and url.strip()
                and lic.strip()
            ):
                parsed.append(
                    ClinicalSource(
                        name=name.strip(), url=url.strip(), license=lic.strip()
                    )
                )
        sources = parsed[:_MAX_SOURCES] or None

    return ClinicalEnvelope(
        safety_level=safety,  # type: ignore[arg-type]
        tone=tone,  # type: ignore[arg-type]
        user_state_hypothesis=_required_str("user_state_hypothesis"),
        clinical_move=move,  # type: ignore[arg-type]
        roast_line=_optional_str("roast_line"),
        main_response=_required_str("main_response"),
        micro_action=_optional_str("micro_action"),
        follow_up_question=_optional_str("follow_up_question"),
        sources=sources,
    )


# ──────────────────────────────────────────────────────────────────────
# Judge invariants — the rules from safety_protocols.md and
# clinical_moves.md, mechanically applied to a parsed envelope.
# Returns a list of violation tags (empty = valid).
# ──────────────────────────────────────────────────────────────────────


@dataclass
class JudgeReport:
    """Outcome of running the invariants over a parsed envelope.

    `violations` is empty when the envelope is acceptable. Each entry is a
    short tag (`crisis_has_roast`, `normal_missing_action`, …) the runner
    can log; the human-readable summary lives in `summary`.
    """

    violations: list[str] = field(default_factory=list)
    summary: str = "ok"

    @property
    def ok(self) -> bool:
        return not self.violations


def judge_invariants(env: ClinicalEnvelope) -> JudgeReport:
    """Apply the mechanical invariants from the policy docs.

    Does NOT call an LLM. This is the fast deterministic floor — content-
    quality grading (does the jab actually land? is the validation
    genuine?) is the LLM judge's job (Commit 3). Failing this floor
    triggers the runtime's regenerate-once-then-degrade path.
    """
    v: list[str] = []

    # safety_protocols.md — crisis must zero out everything roast-shaped
    if env.safety_level == "crisis":
        if env.roast_line is not None:
            v.append("crisis_has_roast")
        if env.micro_action is not None:
            v.append("crisis_has_action")
        if env.follow_up_question is not None:
            v.append("crisis_has_followup")

    # sensitive forces no jab regardless of tone
    if env.safety_level == "sensitive" and env.roast_line is not None:
        v.append("sensitive_has_roast")

    # normal MUST close with action + question
    if env.safety_level == "normal":
        if env.micro_action is None:
            v.append("normal_missing_action")
        if env.follow_up_question is None:
            v.append("normal_missing_followup")

    # tone honor
    if env.tone == "no_insults" and env.roast_line is not None:
        v.append("no_insults_has_roast")
    if env.tone == "soft" and env.roast_line is not None:
        v.append("soft_has_roast")

    # clinical_moves.md — behavioral_activation MUST ship an action
    if env.clinical_move == "behavioral_activation" and env.micro_action is None:
        v.append("behavioral_activation_missing_action")
    if env.clinical_move == "planning" and env.micro_action is None:
        v.append("planning_missing_action")

    summary = "ok" if not v else f"violations: {', '.join(v)}"
    return JudgeReport(violations=v, summary=summary)
