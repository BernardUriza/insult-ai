"""Guard composition — anti-drift packs + the ETHICS PlanGuard.

Extracted from runner.py so the engine module stays "config in, Runner out"
(.claude/rules/architecture.md). This module owns:

  - ``looks_spanish`` — the language heuristic that decides whether ES drift
    packs layer on top of the EN ones.
  - the per-mode antidrift guard chains (roast / brief / clinical) and the
    ``build_guards`` dispatcher ``build_runner`` calls.
  - the ETHICS ``PlanGuard`` (``build_plan_guard``) — pre-execution veto on
    identity-attribute attacks in the agent's declared plan.

Boundary-clean: composes fi-core's pattern packs via ``fi_runner.packs`` — we
never import fi_core. No dependency on this repo's runner internals (it takes a
plain ``mode: str``), so importing it from runner introduces no cycle.
"""

from __future__ import annotations

import re
from collections.abc import Callable

from fi_runner import PlanGuard, antidrift_guard, packs, plan_guard

# --- Language heuristic ----------------------------------------------------
# The system writes English (.claude/rules/language.md), but the persona's
# "Match the target's language" rule means a Spanish target gets a Spanish
# roast. When THAT happens, English-only drift patterns ("as an AI") won't
# catch Spanish-side drift ("soy un bot diseñado para…"). So we layer in
# packs.DEFAULT_ES on top of DEFAULT_EN when the input looks Spanish. The
# style packs (MARKDOWN_DRIFT / SUMMARIZING / STAGE_DIRECTIONS) are
# catalog-by-format and language-agnostic, so they apply either way.
_SPANISH_DOMAIN_TLD = re.compile(
    r"\.(mx|ar|cl|co|es|pe|uy|ec|gt|hn|bo|sv|do|ni|cr|py|ve|cu)\b",
    re.IGNORECASE,
)
_SPANISH_GLYPH = re.compile(r"[áéíóúñüÁÉÍÓÚÑÜ¿¡]")
# Very common Spanish function words — rare in English-language inputs. We
# require ≥2 hits to fire so a stray "esta" in an English sentence doesn't
# flip the language.
_SPANISH_STOPWORDS = re.compile(
    r"\b(el|la|los|las|una?|y|o|pero|que|porque|para|por|con|sin|del|al|"
    r"de|se|le|"
    r"esto|este|esta|esa|ese|aquel|aquella|son|fue|era|estaba|hay|muy|"
    r"como|cuando|donde|porque|tambi[eé]n|tampoco|m[aá]s|menos|"
    r"ahora|antes|despu[eé]s|siempre|nunca|ayer|hoy|ma[ñn]ana|aqu[ií]|all[aá]|"
    r"as[ií]|pues|entonces|ya)\b",
    re.IGNORECASE,
)


def looks_spanish(text: str) -> bool:
    """Heuristic: does ``text`` look like Spanish-speaking input?

    Three layered signals (any wins): (1) a Spanish-speaking TLD in a URL,
    (2) a Spanish-only glyph (ñ, accented vowel, ¿/¡), or (3) two-or-more
    Spanish stop-word hits. Conservative on purpose — a single ``esta`` in
    an English sentence (the demonstrative ``ESTA Inc``) won't trip it."""
    if not text:
        return False
    if _SPANISH_DOMAIN_TLD.search(text):
        return True
    if _SPANISH_GLYPH.search(text):
        return True
    if len(_SPANISH_STOPWORDS.findall(text)) >= 2:
        return True
    return False


# --- PlanGuard: defense-in-depth on the agent's declared route ------------
# The persona's "NEVER ATTACK" list (race, ethnicity, gender, sexuality,
# nationality, disability, neurodivergence, illness, trauma, body, poverty,
# accent) is also enforced post-hoc in the roast text via antidrift packs —
# i.e. the agent has already scraped, spent credit, and burned tokens by the
# time the guard fires. PlanGuard moves the same policy UP to the plan step:
# when ``declare_plan`` declares "fetch founder's ethnic background", fi-runner
# inspects the steps BEFORE the agent fires any follow-up tool and re-emits a
# soft ``plan_rejected`` event (see fi_runner.Runner.run_stream). The consumer
# (this repo's /chat/stream) just forwards the rejection to the UI — the agent's
# own retry path picks up the reinforcement and re-declares.
#
# Patterns are intentionally NARROW: a roast plan step that says "Scrape acme
# pricing page" must not trip; one that says "Search founder's racial
# background" must. The blocklist targets IDENTITY-ATTRIBUTE vocabulary that
# is rarely legitimate in a fact-finding plan — we tolerate occasional false
# positives because the rejection is SOFT (the turn retries; nothing dies).
_ETHICS_REINFORCEMENT = (
    "PlanGuard rejected your previous plan because one or more steps targeted "
    "an identity attribute that the ETHICS rule forbids (race / ethnicity / "
    "nationality / gender identity / sexual orientation / disability / "
    "neurodivergence / mental-health history / body / class / accent). Re-declare "
    "the plan: attack the BEHAVIOR (arguments, broken promises, hypocrisy, what "
    "they SHIP) and the SYSTEMS, never the BEING. Rewrite the offending step(s) "
    "to target a behavior or claim instead."
)
_ETHICS_BLOCKLIST: tuple[str, ...] = (
    # Race / ethnicity / nationality framing — broad; "ethnic"/"racial" rarely
    # appears legitimately in a roast-plan step.
    r"\b(?:race|racial|ethnic(?:ity)?|ethnically|skin\s*color|caucasian|african[\s-]?american|asian\s+american|latino|latina|hispanic|heritage(?:\s+background)?)\b",
    # Gender identity / sexual orientation — same logic. "gender" alone is rare
    # in a roast plan; "gender identity" / "sexual orientation" never legitimate.
    r"\b(?:gender\s+identity|sexual\s+orientation|sexuality|lgbtq?\+?|transgender|trans\s+(?:woman|man|person)|gay|lesbian|bisexual|queer)\b",
    # Disability / neurodivergence
    r"\b(?:disabilit(?:y|ies)|disabled|autis(?:m|tic)|asperger'?s?|adhd|neurodivergen(?:t|ce)|developmental\s+disorder)\b",
    # Mental-health / trauma framing
    r"\b(?:mental\s+illness|mental[\s-]health\s+history|psychiatric\s+(?:history|record)|depression\s+history|trauma\s+history|abuse\s+(?:history|background)|addiction\s+history)\b",
    # Body / appearance — contextual: require a person/role anchor so "page
    # appearance" / "site looks" don't trip. The anchor is a possessive or
    # bare role noun before the attribute.
    r"\b(?:founder|co[\s-]?founder|ceo|cto|cofounder|executive|owner)('?s)?\s+(?:looks|appearance|body|weight|physique|attractiveness)\b",
    r"\bobesit(?:y|e)\b",
    # Class / poverty as an identity attribute (not "low pricing tier")
    r"\b(?:poverty\s+(?:childhood|background)|poor\s+background|underclass|broke\s+(?:childhood|upbringing))\b",
    # Accent / grammar mocking (the persona's "accent/grammar" never-attack item)
    r"\b(?:foreign\s+accent|speech\s+accent|broken\s+english|english\s+as\s+(?:a\s+)?second\s+language|esl(?:\s+grammar)?|grammar\s+(?:mistakes?|errors?))\b",
)


def build_plan_guard() -> PlanGuard:
    """Compose the PlanGuard for the roast persona. Returns a single guard so
    fi-runner's ``Runner.plan_guard`` slot stays one-to-one with our policy
    (the runner only inspects ONE PlanGuard; multiple require a wrapper)."""
    return plan_guard(
        blocked_patterns=_ETHICS_BLOCKLIST,
        reinforcement=_ETHICS_REINFORCEMENT,
        name="insult_ai_ethics",
    )


# --- Anti-drift guard chains (per mode) ------------------------------------
# On a break the runner re-runs the turn (RetryPolicy) with the reinforcement
# appended, so the voice stays in character turn after turn — and the bench can
# read result.guard_outcomes instead of a hand-rolled heuristic.


def _build_roast_guards(target_hint: str | None) -> list:
    """Compose the roast guard chain. EN patterns + style packs are always
    on; ES patterns layer in when ``target_hint`` looks Spanish so the
    Spanish-side roast can still be guard-checked."""
    style_packs = [
        *packs.MARKDOWN_DRIFT,
        *packs.SUMMARIZING,
        *packs.STAGE_DIRECTIONS,
    ]
    language_packs = list(packs.DEFAULT_EN)
    if target_hint and looks_spanish(target_hint):
        # Prepend ES patterns so they catch first on a Spanish turn; EN stays
        # on too (the model can still drift to English mid-Spanish-roast).
        language_packs = [*packs.DEFAULT_ES, *language_packs]
    return [
        antidrift_guard(
            break_patterns=[*language_packs, *style_packs],
            reinforcement=packs.GENERIC_REINFORCEMENT,
        )
    ]


def _build_brief_guards(target_hint: str | None) -> list:
    """Compose the brief guard chain. CRITICAL difference vs the roast: the
    brief INTENTIONALLY uses markdown headers + bullet summaries (it IS a
    structured briefing document). So ``MARKDOWN_DRIFT`` and ``SUMMARIZING``
    packs would false-positive on every brief — drop them. ``STAGE_DIRECTIONS``
    stays on (no "*reviews their pricing page*" cues even in a brief).
    ``DEFAULT_EN/ES`` stays on too — assistant tone + AI-disclosure are still
    drift the brief shouldn't ship."""
    language_packs = list(packs.DEFAULT_EN)
    if target_hint and looks_spanish(target_hint):
        language_packs = [*packs.DEFAULT_ES, *language_packs]
    return [
        antidrift_guard(
            break_patterns=[*language_packs, *packs.STAGE_DIRECTIONS],
            reinforcement=packs.GENERIC_REINFORCEMENT,
        )
    ]


def _build_clinical_guards(target_hint: str | None) -> list:
    """Clinical-mode guards: drop the markdown/summary/stage-direction packs
    (the persona emits JSON, those would false-positive constantly) and
    KEEP the four drift surfaces that ARE specific to a clinical-coaching
    voice — fi-core already catalogs them:

      - ``ASSISTANT_TONE_*``    — "as an AI" / "soy un asistente" leaks
      - ``THERAPY_SPEAK_*``     — "let's hold space" / "let's unpack that"
                                  corporate-therapist tone the compadre
                                  must avoid
      - ``OVER_VALIDATION_*``   — "your feelings are SO valid", saccharine
                                  affirmation the persona's `validation`
                                  move replaces with something terser
      - ``MORALIZING_*``        — "I want you to know …", lecturing tone

    Adding ES variants on top of EN when the input looks Spanish, same
    pattern the roast/brief modes use.

    The ETHICS PlanGuard still applies (built separately in
    `build_plan_guard`) — heavier defense, pre-execution veto on
    identity-attribute attacks. `never_attack.md` matches the same shape."""
    en_packs = [
        *packs.ASSISTANT_TONE_EN,
        *packs.THERAPY_SPEAK_EN,
        *packs.OVER_VALIDATION_EN,
        *packs.MORALIZING_EN,
    ]
    es_packs = [
        *packs.ASSISTANT_TONE_ES,
        *packs.THERAPY_SPEAK_ES,
        *packs.OVER_VALIDATION_ES,
        *packs.MORALIZING_ES,
    ]
    language_packs = list(en_packs)
    if target_hint and looks_spanish(target_hint):
        language_packs = [*es_packs, *language_packs]
    return [
        antidrift_guard(
            break_patterns=language_packs,
            reinforcement=packs.GENERIC_REINFORCEMENT,
        )
    ]


_GUARDS_BY_MODE: dict[str, Callable[[str | None], list]] = {
    "roast": _build_roast_guards,
    "brief": _build_brief_guards,
    "clinical": _build_clinical_guards,
}


def build_guards(mode: str, target_hint: str | None) -> list:
    """Build the antidrift guard chain for ``mode``. The language layer adapts
    to ``target_hint`` — Spanish drift packs layer on top of the English ones
    when it looks Spanish (see :func:`looks_spanish`). Pass ``None`` for
    pure-EN guards."""
    return _GUARDS_BY_MODE[mode](target_hint)
