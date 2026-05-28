"""Corpus ID resolution for the RAG pipeline.

Extracted from runner.py. Owns the three Slice-3 env vars and the single
function that decides which corpus_id a given turn should use.

Precedence (highest first):
  1. ``user_corpus_id`` — user-uploaded docs win absolutely.
  2. ``mode == "clinical"`` AND ``INSULT_AI_PSYCH_CORPUS_ENABLED == "1"``
     — fall back to the curated public-knowledge corpus.
  3. Otherwise — None. No RAG this turn.
"""

from __future__ import annotations

import os

_PSYCH_CORPUS_ENABLED_ENV = "INSULT_AI_PSYCH_CORPUS_ENABLED"
_PSYCH_CORPUS_ID_ENV = "INSULT_AI_PSYCH_CORPUS_ID"
_PSYCH_CORPUS_DEFAULT_ID = "psych_public_v1"


def _resolve_clinical_corpus_id(user_corpus_id: str | None, mode: str) -> str | None:
    """Decide which corpus_id this turn should use.

    Returning None means "skip rag_store capability for this turn."
    Returning a string means "wire rag_store and inject the corpus_id into
    the prompt." The chosen corpus_id flows into both
    ``build_runner(with_rag=...)`` and ``PROMPT_BY_MODE[mode](..., corpus_id)``.
    """
    if user_corpus_id:
        return user_corpus_id
    if mode != "clinical":
        return None
    if os.environ.get(_PSYCH_CORPUS_ENABLED_ENV) != "1":
        return None
    return os.environ.get(_PSYCH_CORPUS_ID_ENV, _PSYCH_CORPUS_DEFAULT_ID)
