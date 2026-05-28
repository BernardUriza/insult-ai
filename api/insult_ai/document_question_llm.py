"""Azure OpenAI generation for document starter questions."""
from __future__ import annotations

import logging
import os

import httpx

from .document_question_types import QuestionRecord, extract_json_array, normalize_records

_log = logging.getLogger("insult_ai.document_question_llm")

_AZURE_ENDPOINT = (os.getenv("AZURE_OPENAI_ENDPOINT") or "").rstrip("/")
_AZURE_API_KEY = (os.getenv("AZURE_OPENAI_API_KEY") or "").strip() or None
_AZURE_API_VERSION = os.getenv("AZURE_OPENAI_API_VERSION") or "2024-02-15-preview"
_QUESTION_DEPLOYMENT = (
    os.getenv("INSULT_AI_QUESTION_DEPLOYMENT")
    or os.getenv("AZURE_OPENAI_CHAT_DEPLOYMENT")
    or os.getenv("INSULT_AI_MODEL")
    or "gpt-4.1"
)
_QUESTION_TIMEOUT = httpx.Timeout(14.0, connect=6.0)
_MAX_SOURCE_CHARS = 10_000


def _question_prompt(corpus_id: str, source_label: str, source_excerpt: str) -> list[dict[str, str]]:
    return [
        {
            "role": "system",
            "content": (
                "Generate high-signal starter questions for a document source "
                "inside a skeptical research/briefing app. Return ONLY a JSON "
                "array of 4 or 5 objects. Each object must have: question "
                "(a concise question) and image_query (a short Google Images "
                "query likely to find a relevant public image, logo, person, "
                "product, chart, place, or visual artifact for that question). "
                "The questions should help a user interrogate claims, "
                "contradictions, missing evidence, and angles worth verifying "
                "with live web research."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Knowledge base: {corpus_id}\n"
                f"Source: {source_label}\n\n"
                f"Document excerpt:\n{source_excerpt}"
            ),
        },
    ]


async def generate_question_records(
    *, corpus_id: str, doc_id: str, text: str, source_name: str | None = None
) -> list[QuestionRecord]:
    """Ask Azure OpenAI for starter-question records. Fail-open."""
    if not _AZURE_ENDPOINT or not _AZURE_API_KEY:
        _log.info("question_generation_skipped reason=missing_azure_config")
        return []

    source_label = (source_name or doc_id).strip()[:120]
    source_excerpt = text.strip()[:_MAX_SOURCE_CHARS]
    if not source_excerpt:
        return []

    url = (
        f"{_AZURE_ENDPOINT}/openai/deployments/{_QUESTION_DEPLOYMENT}"
        f"/chat/completions?api-version={_AZURE_API_VERSION}"
    )
    headers = {"api-key": _AZURE_API_KEY, "Content-Type": "application/json"}
    body = {
        "messages": _question_prompt(corpus_id, source_label, source_excerpt),
        "temperature": 0.35,
        "max_tokens": 420,
    }

    try:
        async with httpx.AsyncClient(timeout=_QUESTION_TIMEOUT) as client:
            resp = await client.post(url, headers=headers, json=body)
        if resp.status_code != 200:
            _log.warning(
                "question_generation_failed status=%s body=%s",
                resp.status_code,
                resp.text[:300],
            )
            return []
        payload = resp.json()
        raw = payload["choices"][0]["message"]["content"]
        return normalize_records(extract_json_array(raw))
    except Exception as exc:  # noqa: BLE001 - UX metadata must fail open
        _log.warning("question_generation_failed err=%s", exc)
        return []
