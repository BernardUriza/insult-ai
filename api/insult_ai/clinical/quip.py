"""Fast one-shot "waiting room" quip for the clinical skeleton.

While a clinical turn runs (~25-40s), the UI paints <EnvelopeSkeleton>.
Instead of a hardcoded slow-banner line, this generates ONE short quip
reacting to the user's actual message — same persona voice, a fraction
of the latency/cost.

It's the FlowNarrator pattern (fi_runner.narrate): a second, CHEAPER
``backend.run_turn`` with ``mcp_servers=[]`` (no MCP, no agent loop) and
a model override to a fast tier. Purely decorative — any failure returns
None and the UI keeps its hardcoded fallback line.

Safety: ``classify_safety`` runs FIRST. A sensitive/crisis message NEVER
reaches the LLM — a joke layered over a crisis signal would break Rule 0
(see .claude/rules/hackathon.md). Only ``normal`` messages get a quip.
"""

from __future__ import annotations

import logging
import os

from fi_runner import ToolPolicy

from ..backend import _get_backend, normalize_backend_name
from ..modes import Tone
from ..safety import classify_safety

_log = logging.getLogger(__name__)

# A quip is one short line, never a paragraph. Cap defensively so a runaway
# model reply never floods the skeleton banner.
_MAX_QUIP_CHARS = 160

# Cheap/fast tier per backend. The quip is decorative — never spend the
# turn's full model on it. claude → Haiku; codex keeps its configured Azure
# deployment unless an explicit override is set (a bogus deployment name
# would 404, and the quip would just fall back to the hardcoded line).
_DEFAULT_CLAUDE_QUIP_MODEL = "claude-haiku-4-5-20251001"


def _quip_model(backend_name: str) -> str | None:
    override = (os.getenv("INSULT_AI_QUIP_MODEL") or "").strip()
    if override:
        return override
    if backend_name == "claude":
        return _DEFAULT_CLAUDE_QUIP_MODEL
    return None  # codex: use the backend's default deployment


_SYSTEM = """\
You are the waiting-room voice of a roast coach. The user just sent a message \
and is now waiting ~30 seconds for your full coaching response to render. Your \
job is to fill that dead air with ONE short line, in character, so the wait \
feels alive instead of broken.

Output exactly one line (no line breaks), max ~15 words. A light, warm jab at \
the BEHAVIOR, situation, or claim in the user's message — the kind of nudge a \
sharp friend gives. It should clearly react to what they actually wrote, not be \
a generic "please wait" filler.

Hard rules:
- Match the user's language (Spanish message -> Spanish line; English -> English).
- NEVER attack identity, body, race, gender, orientation, health, trauma, \
appearance, intelligence, or personal worth. Attack the behavior, never the person.
- No emoji. No greeting. No meta ("please wait", "loading", "one moment").
- No quotes around the line. Just the line itself."""

_TONE_HINT = {
    "soft": "Keep it gentle — a wink, not a jab.",
    "medium": "One sharp but friendly line.",
    "spicy": "Sharper edge, still never cruel.",
    "no_insults": "No jab at all — just a warm, witty line about the wait.",
}


async def waiting_quip(
    message: str,
    *,
    backend: str | None = None,
    tone: Tone = "medium",
) -> str | None:
    """Generate a one-line waiting-room quip reacting to ``message``.

    Returns ``None`` (and the UI keeps its hardcoded fallback) when the
    message is sensitive/crisis, when the message is empty, or on any
    backend error — the quip is decorative and must never block or break
    the clinical turn it decorates.
    """
    text = (message or "").strip()
    if not text:
        return None

    # Safety gate — a quip over a sensitive/crisis signal is a Rule 0
    # violation. Cheap regex, no LLM round-trip; sensitive/crisis -> no quip.
    if classify_safety(text) != "normal":
        return None

    try:
        backend_name = normalize_backend_name(backend)
        agent_backend = _get_backend(backend_name)
        system = f"{_SYSTEM}\n\nTone for this turn: {_TONE_HINT.get(tone, _TONE_HINT['medium'])}"
        result = await agent_backend.run_turn(
            system_prompt=system,
            user_message=text,
            mcp_servers=[],
            tool_policy=ToolPolicy(),
            model=_quip_model(backend_name),
            session_id=None,
        )
    except Exception as exc:  # noqa: BLE001 - decorative: never propagate
        _log.info("quip generation failed (decorative, ignored): %s", exc)
        return None

    line = (result.text or "").strip().strip('"').splitlines()
    quip = line[0].strip() if line else ""
    if not quip:
        return None
    return quip[:_MAX_QUIP_CHARS]
