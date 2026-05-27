"""Safety pre-classifier for the clinical_compadre mode.

Runs BEFORE the LLM turn to decide whether the response needs to be
overridden into `sensitive` or `crisis`. Two layers:

  1. Regex fast-path (this file): pattern catalog from
     policies/safety_protocols.md. Cheap, deterministic, runs in <10ms.
     Hits go straight to the appropriate safety_level — the persona
     reads that level from the prompt context and adjusts accordingly.

  2. LLM ambiguity escalation (Commit 3 follow-on): when the regex
     doesn't fire but the persona is uncertain, the persona itself
     escalates from the LLM side (it sets safety_level in the envelope).
     The judge then enforces the consequences (no roast, no
     micro-action on crisis, etc.).

The regex layer is intentionally conservative — false positives on
`sensitive` are cheap (the user gets a slightly gentler response than
they wanted), false negatives on `crisis` are catastrophic. We bias
toward over-detection on crisis-shaped signals.

The catalog is canonical to policies/safety_protocols.md. When a new
signal is added, update BOTH this file AND that policy doc — they're
the same source of truth in two formats.
"""

from __future__ import annotations

import re
from typing import Literal

SafetyLevel = Literal["normal", "sensitive", "crisis"]

# Crisis signals — any single hit forces safety_level=crisis. The persona
# then triggers the boundary clinical_move + abandons the compadre voice
# (see policies/safety_protocols.md crisis fallback template).
#
# Each pattern bundles a "self-pronoun nearby" clause where ambiguity
# would otherwise capture third-person reports (e.g. "my friend wants to
# die" is sensitive, "I want to die" is crisis). We err toward crisis on
# any first-person framing — false positive there is just "user gets
# routed to resources unnecessarily once," which is recoverable; missing
# a real crisis is not.

# CRISIS — English
_CRISIS_PATTERNS_EN: tuple[str, ...] = (
    r"\b(?:i('?m| am)|me)\s+(?:going to|gonna|plan to|want to|wanna)\s+(?:kill|hurt|harm|end)\s*(?:my\s*self|myself|me)\b",
    r"\b(?:kill(?:ing)?|end(?:ing)?)\s+(?:my\s*self|myself)\b",
    r"\b(?:end|ending)\s+(?:my\s+life|it\s+all|everything)\b",
    r"\b(?:suicid(?:e|al))\b.*\b(?:i|me|my|myself)\b",
    r"\b(?:i|me)\b.*\b(?:suicid(?:e|al))\b",
    r"\b(?:i|i'?m)\s+(?:going to|gonna)\s+(?:die|disappear)\b",
    r"\b(?:want(?:ing)?\s+to\s+die|rather\s+(?:be\s+)?dead|don'?t\s+want\s+to\s+(?:be\s+)?(?:alive|live|exist))\b",
    r"\b(?:hurt(?:ing)?|cut(?:ting)?|harm(?:ing)?)\s+(?:my\s*self|myself)\b",
    r"\bself[\s-]?harm(?:ing)?\b",
    r"\b(?:overdos(?:e|ing)|od)\b.*\b(?:on|my|myself|me)\b",
    r"\b(?:no\s+point|nothing\s+matters|no\s+reason)\s+(?:in\s+)?(?:living|going\s+on|continuing|trying|anymore)\b",
    r"\b(?:goodbye|farewell)\b.*\bforever\b",
    r"\b(?:i('?ve|\s*have))\s+(?:taken|swallowed)\s+(?:pills|too\s+many)\b",
)

# CRISIS — Spanish
_CRISIS_PATTERNS_ES: tuple[str, ...] = (
    r"\b(?:matar(?:me)?|quitar(?:me)?\s+la\s+vida|acabar\s+con\s+(?:mi\s+vida|todo))\b",
    r"\b(?:suicid(?:io|arme|ar))\b.*\b(?:yo|me|mi)\b",
    r"\b(?:yo|me)\b.*\b(?:suicid(?:io|arme|ar))\b",
    r"\b(?:quiero|deseo)\s+(?:morir|dejar\s+de\s+(?:existir|vivir))\b",
    r"\bya\s+no\s+quiero\s+(?:vivir|estar|seguir|existir)\b",
    r"\b(?:me\s+(?:lastim|cort|hac)\w+|me\s+estoy\s+(?:lastim|cort|hac)\w+)\s*(?:el\s+)?da[ñn]o\b",
    r"\b(?:autolesi[oó]n|autoles)\w*\b",
    r"\bya\s+no\s+aguanto\b.*\b(?:vida|aqu[ií]|esto|nada)\b",
    r"\bno\s+tiene\s+sentido\s+(?:seguir|vivir|nada|continuar)\b",
    r"\bya\s+(?:tom[eé]|me\s+tom[eé])\s+(?:las\s+)?pastillas\b",
    r"\bme\s+voy\s+a\s+(?:matar|quitar\s+la\s+vida|acabar\s+con\s+todo)\b",
)

# Sensitive — moderate distress, no acute danger. The persona drops the
# jab (roast_line=null) but stays warmly engaged. Catches burnout,
# anxiety attacks, grief, abusive-relationship descriptors without crisis
# flags, severe sleep/eating disruption.

_SENSITIVE_PATTERNS_EN: tuple[str, ...] = (
    r"\b(?:overwhelmed|drowning|can'?t\s+cope|breaking\s+down)\b",
    r"\bburn(?:ed|t|ing)\s*out\b",
    r"\b(?:anxiety\s+attack|panic\s+attack)\b",
    r"\b(?:haven'?t|have\s+not)\s+(?:slept|eaten|showered)\s+(?:in|for)\b",
    r"\b(?:i('?ve|\s*have))\s+(?:been\s+)?cry(?:ing)?\b",
    r"\b(?:lost\s+my\s+(?:job|mom|dad|mother|father|partner|husband|wife|sister|brother|child|friend|grandma|grandpa))\b",
    r"\b(?:my\s+(?:abusive|toxic|violent))\s+(?:partner|boyfriend|girlfriend|husband|wife|mom|dad|mother|father)\b",
    r"\b(?:partner|boyfriend|girlfriend|husband|wife)\s+(?:hits|hit|beats|beat|threatens|abuses)\s+me\b",
    r"\b(?:i\s+feel\s+|i'?m\s+|feeling\s+)(?:completely|totally|so|really)\s+alone\b",
    r"\b(?:everything\s+is\s+falling\s+apart|i\s+can'?t\s+keep\s+going)\b",
)

_SENSITIVE_PATTERNS_ES: tuple[str, ...] = (
    r"\b(?:saturad[ao]|agotad[ao]|abrumad[ao]|me\s+ahogo)\b",
    r"\bno\s+puedo\s+m[aá]s\b",
    r"\b(?:ataque\s+de\s+(?:ansiedad|p[aá]nico))\b",
    r"\bansiedad\b",
    r"\b(?:no\s+he\s+(?:dormido|comido|ba[ñn]ado))\s+(?:en|hace|desde)\b",
    r"\b(?:estoy|he\s+estado)\s+llor(?:ando|ado)\b",
    r"\bperd[íi]\s+a\s+(?:mi\s+)?(?:mam[áa]|pap[áa]|pareja|esposa|esposo|hermano|hermana|hij[oa]|amig[oa]|abuel[oa])\b",
    r"\b(?:mi\s+)?(?:pareja|novio|novia|esposo|esposa|mam[áa]|pap[áa])\s+(?:me\s+)?(?:abus|maltrat|pega|peg[oó]|golpe[oa]|amenaza)\w*\b",
    r"\b(?:me\s+siento|estoy)\s+(?:completamente|totalmente|muy)\s+sol[oa]\b",
    r"\btodo\s+se\s+est[áa]\s+(?:cayendo|derrumbando)\b",
)


def _compile_patterns(patterns: tuple[str, ...]) -> list[re.Pattern[str]]:
    return [re.compile(p, re.IGNORECASE) for p in patterns]


_CRISIS_RE_EN = _compile_patterns(_CRISIS_PATTERNS_EN)
_CRISIS_RE_ES = _compile_patterns(_CRISIS_PATTERNS_ES)
_SENSITIVE_RE_EN = _compile_patterns(_SENSITIVE_PATTERNS_EN)
_SENSITIVE_RE_ES = _compile_patterns(_SENSITIVE_PATTERNS_ES)


def classify_safety(message: str) -> SafetyLevel:
    """Fast-path safety classification on the user's message.

    Returns `"crisis"` on any crisis-pattern hit (highest priority),
    `"sensitive"` on any sensitive-pattern hit, else `"normal"`. Bilingual
    by design — both EN and ES catalogs are checked for every message
    because users mix languages mid-conversation.

    This is a CEILING-RAISER only. The persona may further escalate
    `normal` to `sensitive` from its own read of the conversation context
    (LLM-side classification on ambiguous signals the regex doesn't
    catch). It must NEVER lower the level the regex set."""
    if not message or not message.strip():
        return "normal"

    # Crisis first (catastrophic miss vs cheap false-positive trade-off).
    for pat in _CRISIS_RE_EN:
        if pat.search(message):
            return "crisis"
    for pat in _CRISIS_RE_ES:
        if pat.search(message):
            return "crisis"

    for pat in _SENSITIVE_RE_EN:
        if pat.search(message):
            return "sensitive"
    for pat in _SENSITIVE_RE_ES:
        if pat.search(message):
            return "sensitive"

    return "normal"


def is_sensitive_or_crisis(message: str) -> bool:
    """Convenience predicate. True when the message warrants tone override."""
    return classify_safety(message) != "normal"
