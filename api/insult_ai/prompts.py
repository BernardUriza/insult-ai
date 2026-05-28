"""Turn-prompt construction — ONE source of truth for what the agent is told.

Extracted from runner.py so the engine module stays config-and-orchestration.
The bench imports ``roast_prompt`` from here (it used to live in runner) so the
wording the bench measures never drifts from what the API sends.

Each ``*_prompt`` builds the turn instruction for one mode; ``PROMPT_BY_MODE``
is the dispatch table keyed by :data:`~insult_ai.modes.Mode`. ``wrap_with_tone``
and ``wrap_with_safety_floor`` decorate the clinical prompt with the tone +
pre-LLM safety context. ``looks_like_roast_target`` is the first-turn heuristic
the chat entrypoint uses to decide whether to frame turn 1 as a target.
"""

from __future__ import annotations

import re
from collections.abc import Callable

from .modes import Mode, Tone
from .safety import SafetyLevel

# A message "looks like a roast target" if it carries a URL/domain or is short
# enough to plausibly be a claim ("Elon founded OpenAI"). Long free-form chat
# ("hey, can you summarize what you found?") goes through unwrapped. This keeps
# the first chat turn natural when the user opens with conversation instead of
# a target — without breaking the single-shot `/roast` flow (which calls
# `roast_prompt` directly, no heuristic).
_URL_OR_DOMAIN = re.compile(
    r"https?://|\b[a-z0-9-]{2,}\.(?:com|org|io|net|ai|co|app|dev|me|xyz|sh|tech)\b",
    re.IGNORECASE,
)


def looks_like_roast_target(message: str) -> bool:
    """Heuristic: does ``message`` read like a thing to roast vs free-form chat?"""
    if "://" in message or _URL_OR_DOMAIN.search(message):
        return True
    return len(message.split()) <= 8


def roast_prompt(target: str, corpus_id: str | None = None) -> str:
    """The turn instruction for a roast — ONE source of truth. The bench imports
    this instead of re-hardcoding the wording, so the two never drift."""
    base = f"Roast & fact-check this using live web data: {target}"
    if corpus_id:
        base += (
            f"\n\nThe user also has a document corpus (id: '{corpus_id}'). Use the"
            " search_documents tool over it for extra context and ammo about the"
            " target before roasting — cite anything you use in the receipts."
        )
    return base


def brief_prompt(target: str, corpus_id: str | None = None) -> str:
    """The turn instruction for a BRIEF — sibling to ``roast_prompt``. Same
    target shape, different framing: produce a structured competitive
    intelligence brief instead of a roast. The persona supplies the section
    headers + voice; this wrapper just sets the goal."""
    base = (
        f"Produce a competitive intelligence brief on this target using live "
        f"web data: {target}"
    )
    if corpus_id:
        base += (
            f"\n\nThe user also has a document corpus (id: '{corpus_id}'). Use the"
            " search_documents tool over it for additional context about the"
            " target before composing the brief — cite anything you use in the"
            " Receipts section."
        )
    return base


def clinical_prompt(message: str, corpus_id: str | None = None) -> str:
    """The turn instruction for the CLINICAL mode.

    Frames the user's message so the persona reads it BEFORE generating its
    JSON output. The tone is appended at call time by the clinical pipeline
    (see :func:`wrap_with_tone`); when the bench calls in directly without a
    tone, the default (`medium`) wins.

    When ``corpus_id`` is set (Slice 3 — either user-provided or resolved by
    ``_resolve_clinical_corpus_id``), an instruction block tells the persona
    that a knowledge corpus is available via the ``search_documents`` tool
    and how to populate the envelope's optional ``sources`` field from the
    in-chunk ``[Source: ... | URL: ... | License: ...]`` header that
    ``bench/ingest_psychology_corpus.py --commit`` writes. Chunks without
    that header are uncitable and must be left out of ``sources``."""
    base = (
        f"User message:\n{message}\n\nRespond with the JSON envelope as specified."
    )
    if corpus_id:
        base += (
            f"\n\n[System: A psychology knowledge corpus is available "
            f"(id: '{corpus_id}'). When grounding a reflection or reframe in "
            "general psychoeducation, call the search_documents tool over this "
            "corpus. Chunks you actually use begin with a header line like "
            "'[Source: NIMH | URL: <url> | License: public-domain-us-federal]'. "
            "Copy those (max 3) into the envelope's optional `sources` array "
            "exactly as parsed from the chunk header. Cite only chunks where "
            "the [Source: ...] header is visible at the top; chunks without it "
            "are useful for content but uncitable. Omit the `sources` field "
            "entirely if you did not use the corpus this turn — do not emit "
            "null and do not emit an empty array.]"
        )
    return base


PROMPT_BY_MODE: dict[Mode, Callable[[str, str | None], str]] = {
    "roast": roast_prompt,
    "brief": brief_prompt,
    "clinical": clinical_prompt,
}


def wrap_with_tone(prompt: str, tone: Tone) -> str:
    """Prepend a one-line tone directive to the turn prompt. The clinical
    persona reads `Tone: <value>` and adjusts roast_line accordingly.
    No-op for roast/brief (those modes ignore tone by design)."""
    return f"Tone: {tone}\n\n{prompt}"


def wrap_with_safety_floor(prompt: str, floor: SafetyLevel) -> str:
    """Inject the pre-LLM regex floor into the turn prompt as context. The
    classifier is a CEILING-RAISER: it tells the persona the MINIMUM
    safety_level for this turn so the model doesn't have to discover an acute
    signal from text alone. No-op on `normal` (the common case). Crisis never
    reaches here — it hard-stops before any LLM call."""
    if floor == "normal":
        return prompt
    note = (
        f"[System safety pre-classification: this message was flagged "
        f"'{floor}'. Set safety_level to AT LEAST '{floor}' — you may escalate "
        f"further but never below. For 'sensitive', drop the jab (roast_line "
        f"must be null) and respond with grounded warmth.]"
    )
    return f"{note}\n\n{prompt}"
