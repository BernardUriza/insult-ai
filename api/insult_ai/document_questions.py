"""Facade for LLM-generated starter questions on ingested document sources.

The RAG store remains the searchable source of truth. This module owns the
UX metadata pipeline:
  1. Azure OpenAI generates question + image_query records.
  2. Bright Data SERP enriches each image_query with a public image URL.
  3. A small sidecar JSON store persists the resulting records by corpus/doc.
"""
from __future__ import annotations

import asyncio
import logging

from .brightdata_images import brightdata_image_result
from .document_question_llm import generate_question_records
from .document_question_store import get_document_questions, save_document_questions
from .document_question_types import QuestionRecord

_log = logging.getLogger("insult_ai.document_questions")

__all__ = ["generate_source_questions", "get_document_questions", "save_document_questions"]


async def generate_source_questions(
    *,
    corpus_id: str,
    doc_id: str,
    text: str,
    source_name: str | None = None,
) -> list[QuestionRecord]:
    """Generate, enrich, persist, and return starter questions for one source.

    Fail-open by design: document ingestion must succeed even if Azure OpenAI
    or Bright Data is unavailable.
    """
    try:
        records = await generate_question_records(
            corpus_id=corpus_id,
            doc_id=doc_id,
            text=text,
            source_name=source_name,
        )
        if not records:
            return []

        image_results = await asyncio.gather(
            *[brightdata_image_result(record["image_query"]) for record in records],
            return_exceptions=True,
        )
        for record, result in zip(records, image_results, strict=False):
            if isinstance(result, Exception):
                continue
            image_url, source_url = result
            record["image_url"] = image_url
            record["image_source_url"] = source_url

        await save_document_questions(corpus_id, doc_id, records)
    except Exception as exc:  # noqa: BLE001 - metadata must not break ingest
        _log.warning(
            "question_generation_failed_open corpus_id=%s doc_id=%s err=%s",
            corpus_id,
            doc_id,
            exc,
        )
        return []
    _log.info(
        "question_generation_ok corpus_id=%s doc_id=%s count=%d",
        corpus_id,
        doc_id,
        len(records),
    )
    return records
