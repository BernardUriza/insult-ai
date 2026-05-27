"""Local judge for the clinical_compadre envelope.

Two-layer review of an envelope before it ships to the user:

  1. Mechanical floor — `judge_invariants` from clinical_envelope.py.
     Deterministic, no LLM, ~microseconds. Catches structural breaks
     (crisis-with-roast, missing micro_action on normal turn, tone
     dishonored, behavioral_activation without action).

  2. Tone/content sanity — `judge_content` (this file). Light LLM-free
     regex pass that checks for never-attack patterns landing inside
     `roast_line` and for obvious persona-leaks ("as an AI", "I'm an
     assistant"). The full LLM-grade quality check (does the jab
     actually land? is the validation genuine?) is deferred — for the
     hackathon scope we ship the mechanical + lexical layer; the
     real LLM judge is post-deadline scope.

Outcome flow:

  - All checks pass → ship envelope as-is.
  - Mechanical violations only → runtime regenerates ONCE with
    reinforcement appended to the turn prompt. If the regenerate also
    fails, the runtime degrades to `tone="no_insults"` and ships the
    safer envelope.
  - Crisis-shaped envelope that fails → don't regenerate, degrade
    immediately to the crisis fallback in crisis_resources.py. Safety
    over latency.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from .clinical_envelope import ClinicalEnvelope, JudgeReport, judge_invariants

# Never-attack lexical signals (companion to the ETHICS PlanGuard regex in
# runner.py). The PlanGuard catches the plan-step level; this catches the
# generated `roast_line` level. Same protected attributes, narrower scope
# because we're only judging ONE line, not a plan.
_RED_ROAST_PATTERNS: tuple[str, ...] = (
    # Race / ethnicity / nationality framing in the jab
    r"\b(?:race|racial|ethnic|skin\s*color|raza|étnico|color\s+de\s+piel)\b",
    # Gender identity / sexual orientation
    r"\b(?:gay|lesbian|queer|trans(?:gender)?|gender\s+identity|sexual\s+orientation|maric[oó]n|joto|lesbiana)\b",
    # Disability / neurodivergence
    r"\b(?:retard(?:ed)?|autistic|spaz|cripple|inv[áa]lido|tarad[oa]|loquit[oa])\b",
    # Body-shaming as identity (not "calendar appearance" — anchored on
    # second-person pronoun or "you/tu" + body word)
    r"\b(?:you|your|t[úu]|tu|tus)\s+(?:are|eres|est[áa]s)\s+(?:fat|ugly|gordo|fea|feo|asqueroso)\b",
    r"\b(?:you('?re)?|tu\s+eres|tu\s+est[áa]s)\s+(?:stupid|dumb|estúpido|estupida|idiota|imbécil|imbecil|tont[oa])\b",
    # Worth-as-a-person
    r"\b(?:nobody\s+(?:loves|likes|wants)\s+you|nadie\s+te\s+(?:quiere|ama))\b",
    r"\b(?:no\s+one\s+would\s+miss\s+you|nadie\s+te\s+(?:extra[ñn]ar[íi]a|notar[íi]a))\b",
    r"\b(?:you'?re\s+a\s+(?:bad\s+person|loser|failure)|eres\s+un\s+(?:perdedor|fracasad[oa]|mal[oa]\s+persona))\b",
    # Capacity to grow (fixed-mindset framing)
    r"\b(?:you'?ll\s+never\s+(?:change|amount|make\s+it)|nunca\s+vas\s+a\s+(?:cambiar|lograrlo|servir))\b",
)

# AI / assistant disclosure leak inside the persona body — the compadre
# must never break character ("I'm an AI", "as a language model", "as an
# assistant"). fi-core's ASSISTANT_TONE pack catches most; we mirror the
# core patterns here so the local judge sees them too without re-fetching
# from packs.
_ASSISTANT_LEAK_PATTERNS: tuple[str, ...] = (
    r"\bas\s+an?\s+(?:ai|artificial\s+intelligence|language\s+model|assistant|chatbot)\b",
    r"\b(?:i'?m|i\s+am)\s+an?\s+(?:ai|artificial\s+intelligence|language\s+model|assistant|chatbot)\b",
    r"\bsoy\s+un[ao]?\s+(?:ia|inteligencia\s+artificial|modelo\s+de\s+lenguaje|asistente|chatbot)\b",
    r"\bcomo\s+un[ao]?\s+(?:ia|inteligencia\s+artificial|modelo\s+de\s+lenguaje|asistente|chatbot)\b",
)


def _compile_set(patterns: tuple[str, ...]) -> list[re.Pattern[str]]:
    return [re.compile(p, re.IGNORECASE) for p in patterns]


_RED_ROAST = _compile_set(_RED_ROAST_PATTERNS)
_ASSISTANT_LEAK = _compile_set(_ASSISTANT_LEAK_PATTERNS)


@dataclass
class ContentReport:
    """Outcome of the content-level checks. Composes with the mechanical
    invariants — the runtime considers ALL violations together when
    deciding regenerate vs degrade."""

    violations: list[str] = field(default_factory=list)
    summary: str = "ok"

    @property
    def ok(self) -> bool:
        return not self.violations


def judge_content(env: ClinicalEnvelope) -> ContentReport:
    """Run lexical checks over the envelope's text fields.

    NOT an LLM. The proper content judge (does the jab actually land?
    is the validation genuine? is the micro_action small enough?) is a
    post-deadline addition. For now we catch the cheap-to-detect
    failures that an LLM would also catch but slower."""
    v: list[str] = []

    # Roast line shouldn't carry red-column attacks
    if env.roast_line:
        for pat in _RED_ROAST:
            if pat.search(env.roast_line):
                v.append("roast_red_attribute")
                break

    # Body shouldn't leak the persona
    body = f"{env.main_response} {env.roast_line or ''} {env.user_state_hypothesis}"
    for pat in _ASSISTANT_LEAK:
        if pat.search(body):
            v.append("assistant_leak")
            break

    # Body length sanity — persona contract says 2-5 sentences for normal.
    # Count terminal punctuation as a coarse approximation.
    if env.safety_level == "normal":
        sentence_count = len(re.findall(r"[.!?](?:\s|$)", env.main_response))
        if sentence_count > 7:
            v.append("response_too_long")
        # Empty / single-character main_response is a structural fail
        if len(env.main_response.strip()) < 8:
            v.append("response_too_short")

    summary = "ok" if not v else f"content violations: {', '.join(v)}"
    return ContentReport(violations=v, summary=summary)


@dataclass
class JudgeVerdict:
    """Combined outcome of mechanical + content judging. The runtime reads
    `should_ship`, `should_regenerate`, `should_degrade` to decide what
    to do next."""

    mechanical: JudgeReport
    content: ContentReport

    @property
    def ok(self) -> bool:
        return self.mechanical.ok and self.content.ok

    @property
    def should_ship(self) -> bool:
        """Ship the envelope as-is when ALL checks pass."""
        return self.ok

    @property
    def should_regenerate(self) -> bool:
        """Worth trying once more with reinforcement: any non-crisis violation."""
        if self.ok:
            return False
        # If there are ANY crisis-related violations, we don't try to fix
        # them with regenerate — we degrade immediately. Crisis trumps
        # everything; latency cost of a regenerate is unacceptable when
        # safety_level is crisis.
        crisis_tags = {
            "crisis_has_roast",
            "crisis_has_action",
            "crisis_has_followup",
        }
        if any(v in crisis_tags for v in self.mechanical.violations):
            return False
        return True

    @property
    def all_violations(self) -> list[str]:
        return [*self.mechanical.violations, *self.content.violations]

    @property
    def summary(self) -> str:
        if self.ok:
            return "ok"
        return ", ".join(self.all_violations)


def judge(env: ClinicalEnvelope) -> JudgeVerdict:
    """Run both layers (mechanical + content). Returns a verdict the
    runtime consumes."""
    return JudgeVerdict(
        mechanical=judge_invariants(env),
        content=judge_content(env),
    )
