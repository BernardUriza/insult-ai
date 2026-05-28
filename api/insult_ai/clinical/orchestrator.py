"""Clinical turn orchestration.

Extracted from runner.py. The GLUE that connects the engine (build_runner,
the chat store) to the pure clinical safety decisions (clinical_pipeline).
This is stage-sequencing, not decision logic — decisions live in
clinical_pipeline; engine config lives in runner.

See .claude/rules/clinical.md for the four-stage contract:
  Stage 1 — crisis hard-stop (pre-LLM regex, no model call).
  Stage 2 — first LLM attempt, parsed + judged.
  Stage 3 — regenerate once with reinforcement on mechanical violations.
  Stage 3b — degrade to a deterministic safe envelope on second failure.

``build_runner`` is imported lazily inside ``_clinical_turn`` to avoid
a circular import at module load time (runner imports this module,
this module needs runner's build_runner).
"""

from __future__ import annotations

import logging
from collections.abc import Callable

from fi_runner.conversation import Message, render_transcript

from .pipeline import (
    ClinicalResult,
    crisis_envelope,
    degraded_envelope,
    evaluate,
    finalize,
)
from ..corpus import _resolve_clinical_corpus_id
from ..guards import looks_spanish
from ..modes import Tone
from ..prompts import clinical_prompt, wrap_with_safety_floor, wrap_with_tone
from ..safety import classify_safety
from ..store import _CHAT_STORE

_log = logging.getLogger(__name__)


async def _persist_clinical(
    session_id: str | None, user_message: str, assistant_json: str
) -> None:
    """Append the FINAL (post-pipeline) exchange to the shared chat store.

    We persist manually — the clinical runner runs store-less, so an unjudged
    or regenerated draft never lands in history; only what the user actually
    saw does. Persistence failure is logged, not fatal (the next turn just
    loses this exchange from context).
    """
    if not session_id:
        return
    try:
        await _CHAT_STORE.append(
            session_id,
            [
                Message(role="user", content=user_message),
                Message(role="assistant", content=assistant_json),
            ],
        )
    except Exception as exc:  # noqa: BLE001 - persistence is best-effort
        _log.warning("clinical_safety persist_failed session=%s err=%s", session_id, exc)


async def _clinical_turn(
    message: str,
    *,
    session_id: str | None,
    backend: str | None,
    corpus_id: str | None,
    tone: Tone,
    on_event: Callable[[str, dict], None] | None,
) -> ClinicalResult:
    """Run one clinical turn through the full safety pipeline and return a
    finalized envelope — validated, judged, and degraded if needed."""
    # Lazy import to avoid circular dependency (runner → this module → runner).
    from ..runner import build_runner  # noqa: PLC0415

    floor = classify_safety(message)
    is_spanish = looks_spanish(message)

    # Stage 1 — crisis hard-stop. Regex caught an acute signal; do NOT call
    # the LLM. Hand off immediately with a localized resource block.
    if floor == "crisis":
        _log.info("clinical_safety hard_stop=crisis session=%s", session_id)
        final = finalize(crisis_envelope(message, is_spanish), message, is_spanish)
        await _persist_clinical(session_id, message, final)
        return ClinicalResult(text=final, session_id=session_id)

    effective_corpus_id = _resolve_clinical_corpus_id(corpus_id, "clinical")
    if effective_corpus_id and effective_corpus_id != corpus_id:
        _log.info(
            "psych_corpus_resolved entrypoint=clinical session_id=%s corpus_id=%s",
            session_id,
            effective_corpus_id,
        )

    # Store-less runner — we persist the final envelope ourselves below.
    runner = build_runner(
        backend,
        mode="clinical",
        with_rag=bool(effective_corpus_id),
        conversation_store=None,
        on_event=on_event,
        target_hint=message,
    )
    history = await _CHAT_STORE.load(session_id) if session_id else []
    transcript = render_transcript(history, message)
    base_prompt = wrap_with_tone(clinical_prompt(transcript, effective_corpus_id), tone)
    prompt = wrap_with_safety_floor(base_prompt, floor)

    # Stage 2 — first attempt.
    result = await runner.run(prompt)
    decision, env, reinforce = evaluate(result.text, floor)
    usage = result.usage
    if decision == "ship":
        final = finalize(env, message, is_spanish)  # type: ignore[arg-type]
        await _persist_clinical(session_id, message, final)
        return ClinicalResult(text=final, usage=usage, session_id=session_id)
    if decision == "crisis":
        _log.warning("clinical_safety crisis_violation session=%s -> fallback", session_id)
        final = finalize(crisis_envelope(message, is_spanish), message, is_spanish)
        await _persist_clinical(session_id, message, final)
        return ClinicalResult(text=final, usage=usage, session_id=session_id)

    # Stage 3 — regenerate ONCE with reinforcement.
    _log.info("clinical_safety regenerate session=%s", session_id)
    result2 = await runner.run(f"{prompt}\n\n[System: {reinforce}]")
    decision2, env2, _ = evaluate(result2.text, floor)
    usage = result2.usage or usage
    if decision2 == "ship":
        final = finalize(env2, message, is_spanish)  # type: ignore[arg-type]
        await _persist_clinical(session_id, message, final)
        return ClinicalResult(text=final, usage=usage, session_id=session_id)
    if decision2 == "crisis":
        _log.warning(
            "clinical_safety crisis_violation_retry session=%s -> fallback", session_id
        )
        final = finalize(crisis_envelope(message, is_spanish), message, is_spanish)
        await _persist_clinical(session_id, message, final)
        return ClinicalResult(text=final, usage=usage, session_id=session_id)

    # Stage 3b — degrade to a deterministic safe envelope.
    _log.warning("clinical_safety degrade session=%s (regenerate failed)", session_id)
    final = finalize(
        degraded_envelope(floor, env2 or env, message, is_spanish), message, is_spanish
    )
    await _persist_clinical(session_id, message, final)
    return ClinicalResult(text=final, usage=usage, session_id=session_id)
