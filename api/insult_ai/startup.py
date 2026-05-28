"""Module-level startup: RAG store client + psych corpus probe.

Imported by app.py (triggering the probe) and by routes/documents.py
(using _rag). All side effects are idempotent on reload.
"""
from __future__ import annotations

import asyncio
import logging
import os

from fi_runner.rag_store import RagStoreClient

_psych_logger = logging.getLogger("insult_ai.psych_corpus")

# Boundary-clean async client — same FI_RAG_* env as the agent's rag_store
# MCP, so a doc ingested here is searchable by the agent during a roast.
_rag = RagStoreClient()

# Psych corpus probe — runs at import time so a wedged or empty corpus is
# caught at boot, not mid-request. Flips INSULT_AI_PSYCH_CORPUS_ENABLED to
# "0" on failure so the clinical mode keeps working without RAG (graceful
# degradation). The probe is a single async call: <10ms on HDF5, one
# round-trip on pgvector.
if os.environ.get("INSULT_AI_PSYCH_CORPUS_ENABLED") == "1":
    _psych_corpus_id = os.environ.get("INSULT_AI_PSYCH_CORPUS_ID", "psych_public_v1")
    try:
        _docs = asyncio.run(_rag.list_documents(_psych_corpus_id))
        _doc_count = len(_docs) if _docs else 0
        if _doc_count == 0:
            raise RuntimeError(
                f"corpus '{_psych_corpus_id}' has 0 documents — "
                "run `python bench/ingest_psychology_corpus.py --commit`"
            )
        _psych_logger.info(
            "probe_ok corpus_id=%s doc_count=%d", _psych_corpus_id, _doc_count
        )
    except Exception as exc:  # noqa: BLE001 - startup probe is intentionally broad
        _psych_logger.warning(
            "probe_failed corpus_id=%s err=%s -- "
            "flipping INSULT_AI_PSYCH_CORPUS_ENABLED to 0 to avoid runtime "
            "errors. Clinical mode will run WITHOUT corpus until the ingest "
            "is fixed. Run: python bench/ingest_psychology_corpus.py --commit",
            _psych_corpus_id,
            exc,
        )
        os.environ["INSULT_AI_PSYCH_CORPUS_ENABLED"] = "0"
else:
    _psych_logger.info("psych_corpus disabled (INSULT_AI_PSYCH_CORPUS_ENABLED != 1)")
