"""Localized crisis resource selection.

When `safety_level == "crisis"` lands on a turn, the runtime enriches the
envelope's `main_response` with a real hand-off resource (hotline,
emergency line, IASP fallback). The persona doesn't pick the resource
itself — it just signals the crisis level. This module is the runtime
side of that decision.

Selection logic (matches policies/crisis_resources.md):
  1. Detect language from the user's message (reuses runner.looks_spanish).
  2. If Spanish, try to disambiguate by country TLD or country mention.
     Default to Mexico when nothing else fits (primary Spanish audience).
  3. If English, default to US (988) + IASP international.
  4. ALWAYS append IASP as the universal fallback.

The resources list is canonical to policies/crisis_resources.md. When
numbers change OR a new country joins, update BOTH files — they're the
same source of truth in two formats. Last audit timestamp is recorded
there.
"""

from __future__ import annotations

import re
from typing import Literal

CrisisLang = Literal["es-mx", "es-ar", "es-cl", "es-co", "es-es", "es-pe", "es-uy", "en", "default"]

# Country mention or TLD signals — narrow on purpose. The default for
# Spanish is Mexico (the product's primary audience); other Spanish-
# speaking regions only win on an explicit signal.
_REGION_SIGNALS: dict[CrisisLang, re.Pattern[str]] = {
    "es-ar": re.compile(r"\b(?:argentina|argentin[oa]|buenos\s+aires|\.ar\b)", re.IGNORECASE),
    "es-cl": re.compile(r"\b(?:chile|chilen[oa]|santiago|\.cl\b)", re.IGNORECASE),
    "es-co": re.compile(r"\b(?:colombia|colombian[oa]|bogot[áa]|medell[íi]n|\.co\b)", re.IGNORECASE),
    "es-es": re.compile(r"\b(?:espa[ñn]a|espa[ñn]ol[ae]?|madrid|barcelona|\.es\b)", re.IGNORECASE),
    "es-pe": re.compile(r"\b(?:per[úu]|peruan[oa]|lima|\.pe\b)", re.IGNORECASE),
    "es-uy": re.compile(r"\b(?:uruguay|uruguay[oa]|montevideo|\.uy\b)", re.IGNORECASE),
}

# Resource lines — terse, factual, no marketing copy. The "Otros países"
# fallback is always appended.
_RESOURCES: dict[CrisisLang, str] = {
    "es-mx": "México: Línea de la Vida — 800 290 0024 (24/7, gratuito).",
    "es-ar": "Argentina: Centro de Asistencia al Suicida — 135 (Buenos Aires) o (011) 5275-1135 (24/7).",
    "es-cl": "Chile: Salud Responde — 600 360 7777 opción 1 (24/7). Desde celular: *4141.",
    "es-co": "Colombia: Línea Nacional Psicoactiva — 018000 112439 (24/7). Bogotá: línea 106.",
    "es-es": "España: 024 — línea de atención a la conducta suicida (24/7). También: Teléfono de la Esperanza 717 003 717.",
    "es-pe": "Perú: Línea 113 opción 5 — Ministerio de Salud (24/7).",
    "es-uy": "Uruguay: Línea Vida — 0800 0767 (24/7).",
    "en": "US: 988 Suicide & Crisis Lifeline (call or text 988, 24/7).",
    "default": "Otros países / Worldwide: https://www.iasp.info/resources/Crisis_Centres/",
}


def _detect_spanish_region(text: str) -> CrisisLang:
    """Pick the most specific Spanish-speaking region signal in `text`.
    Falls back to es-mx when no explicit signal is found."""
    for lang, pat in _REGION_SIGNALS.items():
        if pat.search(text):
            return lang
    return "es-mx"


def pick_resources(message: str, is_spanish: bool) -> str:
    """Build the resource block to append to a crisis envelope's main_response.

    Returns a two-line string:
      <localized resource> + newline + <IASP universal fallback>.

    Caller appends this verbatim under the persona's main_response,
    separated by a blank line."""
    if is_spanish:
        primary_key: CrisisLang = _detect_spanish_region(message)
    else:
        primary_key = "en"
    primary = _RESOURCES[primary_key]
    fallback = _RESOURCES["default"]
    return f"{primary}\n{fallback}"


# Crisis fallback message templates — used when the persona's envelope
# failed to parse OR violated invariants AND safety_level was crisis. The
# runtime degrades to one of these BEFORE handing the user nothing.

CRISIS_FALLBACK_EN = (
    "What you're describing is bigger than this conversation can hold on "
    "its own. Talking to someone trained, right now, matters more than "
    "anything I can say here."
)

# Kept for the auto_locale=true future flag — currently unused because
# the default product surface is English (see personas/clinical_compadre.md
# LANGUAGE rule + hackathon.md Rule 0). Resource line itself still
# adapts to detected region via pick_resources().
CRISIS_FALLBACK_ES = (
    "Lo que me cuentas pesa más de lo que esta conversación puede sostener "
    "sola. Hablar con alguien entrenado, en este momento, importa más que "
    "cualquier cosa que yo pueda decir."
)


def crisis_fallback(message: str, is_spanish: bool) -> str:
    """Compose the FULL safer fallback (template + resources) when the
    persona's response can't be salvaged.

    `is_spanish` toggles ONLY the resource-region selection (MX vs US
    default). The TEMPLATE itself is always English while the product
    is `auto_locale=false`. When auto_locale is wired, the template
    will also flip — see the EN/ES constants above."""
    # Default to English template regardless of input language — the
    # Roast Coach persona is English-first per the hackathon decision.
    template = CRISIS_FALLBACK_EN
    return f"{template}\n\n{pick_resources(message, is_spanish)}"
