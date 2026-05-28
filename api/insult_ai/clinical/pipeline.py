"""Clinical safety pipeline — the pure decision logic.

Extracted from runner.py. The clinical persona's safety contract (see
.claude/rules/clinical.md) is NOT left to the LLM's goodwill; every clinical
turn runs through four stages, and the engine-coupled orchestration of those
stages lives in ``runner._clinical_turn``. THIS module is the pure,
LLM-free, runner-free half — the functions that decide what a turn's envelope
should become:

  - :func:`crisis_envelope`        — the safe hand-off envelope (no jab, no
                                     action, localized resources).
  - :func:`ensure_crisis_resources`— guarantee a shipped crisis envelope
                                     carries the localized resource block.
  - :func:`apply_safety_floor`     — ceiling-raise the envelope to the pre-LLM
                                     regex floor (never down).
  - :func:`evaluate`               — parse + floor-raise + judge one raw LLM
                                     output into a ship / crisis / regen
                                     decision.
  - :func:`degraded_envelope`      — deterministic last-resort safe envelope
                                     when regenerate also failed.
  - :func:`finalize`               — crisis-resource guarantee + serialize to
                                     the wire JSON.

Imports only leaf modules (clinical_envelope, crisis_resources, judge, safety),
so importing it from runner introduces no cycle.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field, replace

from .envelope import (
    ClinicalEnvelope,
    EnvelopeParseError,
    parse_envelope,
)
from .crisis_resources import crisis_fallback, pick_resources
from .judge import judge
from ..safety import SafetyLevel

_log = logging.getLogger(__name__)


@dataclass
class ClinicalResult:
    """Minimal ``TurnResult``-shaped holder for a finalized clinical turn.

    ``result_to_wire`` (wire.py) and ``RoastResponse`` (app.py) only read
    ``.text`` / ``.tool_calls`` / ``.usage`` / ``.session_id`` — that's the
    whole contract. A real (frozen) ``TurnResult`` isn't needed and would be
    impossible to synthesize for the crisis hard-stop path, where no LLM ran."""

    text: str
    usage: dict | None = None
    session_id: str | None = None
    tool_calls: list = field(default_factory=list)


_PARSE_REINFORCEMENT = (
    "Your previous output was not a valid JSON envelope. Respond with ONLY the "
    "JSON object — no prose, no markdown fences — including every required "
    "field: safety_level, tone, user_state_hypothesis, clinical_move, "
    "main_response, and roast_line / micro_action / follow_up_question (string "
    "or null)."
)


def _judge_reinforcement(violations: list[str]) -> str:
    """Reinforcement appended to the regenerate prompt after a judge rejection.
    Names the broken invariants so the model fixes the specific failure instead
    of rerolling blind."""
    return (
        "Your previous envelope violated these invariants: "
        f"{', '.join(violations)}. Rules: crisis → roast_line, micro_action and "
        "follow_up_question ALL null and clinical_move 'boundary'; sensitive → "
        "roast_line null; normal → MUST include both micro_action and "
        "follow_up_question; tone 'soft'/'no_insults' → roast_line null; "
        "behavioral_activation / planning → micro_action required; never put a "
        "protected-attribute attack in roast_line; never break character as an "
        "AI. Re-emit the JSON envelope honoring all of them."
    )


_SAFETY_ORDER: dict[str, int] = {"normal": 0, "sensitive": 1, "crisis": 2}


def crisis_envelope(message: str, is_spanish: bool) -> ClinicalEnvelope:
    """The safe crisis envelope: persona abandoned, localized hand-off.
    ``crisis_fallback`` already bundles the template + the localized resource
    block (hotline numbers)."""
    return ClinicalEnvelope(
        safety_level="crisis",
        tone="no_insults",
        user_state_hypothesis=(
            "Crisis-level signal detected; the persona was abandoned and the "
            "user handed off to a real resource."
        ),
        clinical_move="boundary",
        roast_line=None,
        main_response=crisis_fallback(message, is_spanish),
        micro_action=None,
        follow_up_question=None,
    )


def ensure_crisis_resources(
    env: ClinicalEnvelope, message: str, is_spanish: bool
) -> ClinicalEnvelope:
    """Guarantee a shipped crisis envelope carries the localized resource block
    and zeroes the roast-shaped fields. Idempotent — a hard-stop envelope (whose
    main_response already contains the resources) passes through unchanged."""
    if env.safety_level != "crisis":
        return env
    resources = pick_resources(message, is_spanish)
    body = env.main_response or ""
    first_line = resources.split("\n", 1)[0]
    if first_line not in body:
        body = f"{body}\n\n{resources}".strip()
    return replace(
        env,
        main_response=body,
        roast_line=None,
        micro_action=None,
        follow_up_question=None,
        clinical_move="boundary",
    )


def apply_safety_floor(env: ClinicalEnvelope, floor: SafetyLevel) -> ClinicalEnvelope:
    """The pre-LLM classifier is a CEILING-RAISER: bump the envelope up to the
    regex floor when the model under-classified, never down. Crisis is
    hard-stopped before the LLM runs, so ``floor`` reaching here is at most
    'sensitive' — but the comparison stays general."""
    if _SAFETY_ORDER[env.safety_level] >= _SAFETY_ORDER[floor]:
        return env
    if floor == "crisis":  # defensive; crisis hard-stops earlier
        return replace(
            env,
            safety_level="crisis",
            roast_line=None,
            micro_action=None,
            follow_up_question=None,
            clinical_move="boundary",
        )
    # floor == 'sensitive': drop the jab, keep the rest.
    return replace(env, safety_level="sensitive", roast_line=None)


def evaluate(raw: str, floor: SafetyLevel) -> tuple[str, ClinicalEnvelope | None, str]:
    """Parse + floor-raise + judge one raw LLM output.

    Returns ``(decision, env, reinforcement)`` where decision is:
      - ``"ship"``   — envelope is clean; ship it (``env`` set).
      - ``"crisis"`` — crisis-shaped violation (or model-declared crisis that
                       failed invariants): degrade to the crisis fallback.
      - ``"regen"``  — parse failure or a fixable violation: retry once with
                       ``reinforcement`` (``env`` is the best-effort parse or
                       None on a parse failure)."""
    try:
        env = parse_envelope(raw)
    except EnvelopeParseError as exc:
        _log.warning(
            "clinical_safety parse_error reason=%s detail=%s", exc.reason, exc.detail
        )
        return "regen", None, _PARSE_REINFORCEMENT
    env = apply_safety_floor(env, floor)
    verdict = judge(env)
    if verdict.should_ship:
        return "ship", env, ""
    if not verdict.should_regenerate:
        # crisis-shaped mechanical violation — don't retry, hand off now.
        return "crisis", env, ""
    return "regen", env, _judge_reinforcement(verdict.all_violations)


def degraded_envelope(
    floor: SafetyLevel,
    base: ClinicalEnvelope | None,
    message: str,
    is_spanish: bool,
) -> ClinicalEnvelope:
    """Deterministic last-resort envelope when regenerate also failed. Built to
    PASS the invariants so the runtime never ships what the judge would have
    rejected, and never DOWNGRADES a crisis the model detected."""
    base_level = base.safety_level if base else "normal"
    level = floor if _SAFETY_ORDER[floor] >= _SAFETY_ORDER[base_level] else base_level
    if level == "crisis":
        return crisis_envelope(message, is_spanish)
    main = (
        base.main_response.strip()
        if base and base.main_response and base.main_response.strip()
        else "Let's keep this simple. I'm here, and we can take the next step together."
    )
    hypo = (
        base.user_state_hypothesis
        if base and base.user_state_hypothesis
        else "User shared something that calls for a steady, low-key response."
    )
    if level == "sensitive":
        return ClinicalEnvelope(
            safety_level="sensitive",
            tone="no_insults",
            user_state_hypothesis=hypo,
            clinical_move="validation",
            roast_line=None,
            main_response=main,
            micro_action=None,
            follow_up_question=None,
        )
    return ClinicalEnvelope(
        safety_level="normal",
        tone="no_insults",
        user_state_hypothesis=hypo,
        clinical_move="validation",
        roast_line=None,
        main_response=main,
        micro_action=(
            base.micro_action
            if base and base.micro_action
            else "Pick one small thing and do it in the next hour — five minutes counts."
        ),
        follow_up_question=(
            base.follow_up_question
            if base and base.follow_up_question
            else "What's the smallest first move from here?"
        ),
    )


def finalize(env: ClinicalEnvelope, message: str, is_spanish: bool) -> str:
    """Apply the crisis-resource guarantee, then serialize to the wire JSON."""
    return json.dumps(
        ensure_crisis_resources(env, message, is_spanish).to_wire(),
        ensure_ascii=False,
    )
