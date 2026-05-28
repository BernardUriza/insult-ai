"""Shared product-mode + tone literals.

A tiny leaf module so ``guards`` / ``prompts`` / ``clinical_pipeline`` / ``runner``
can all agree on the ``Mode`` and ``Tone`` types without importing each other
(which would cycle). The persona dispatch, guard dispatch, and prompt dispatch
are all keyed by ``Mode``; the clinical tone parameter is ``Tone``.
"""

from __future__ import annotations

from typing import Literal

# Three personas over the SAME Runner (see .claude/rules/personas.md): roast
# (hook), brief (business value), clinical (compa-clínico). Config, not code —
# adding a mode is a persona file + entries in the dispatch tables.
Mode = Literal["roast", "brief", "clinical"]

# Clinical-only intensity ceiling (soft / medium / spicy / no_insults). The
# other modes ignore it. Safety can override it DOWN at runtime, never up —
# see policies/tone_levels.md.
Tone = Literal["soft", "medium", "spicy", "no_insults"]
DEFAULT_TONE: Tone = "medium"
