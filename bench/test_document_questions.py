"""Unit tests for document starter-question metadata.

The document ingest path must never depend on LLM/image metadata succeeding.
These tests keep that contract explicit: parsing is tolerant, enrichment fills
the optional image fields, and persistence failures fail open.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

_API_ROOT = Path(__file__).resolve().parent.parent / "api"
if str(_API_ROOT) not in sys.path:
    sys.path.insert(0, str(_API_ROOT))

from insult_ai import document_questions as dq  # noqa: E402
from insult_ai.brightdata_images import image_from_payload  # noqa: E402
from insult_ai.document_question_store import _env_int  # noqa: E402
from insult_ai.document_question_types import (  # noqa: E402
    extract_json_array,
    normalize_records,
)


def test_extract_json_array_accepts_fenced_json() -> None:
    raw = """```json
[
  {"question": "What claim is missing evidence?", "image_query": "evidence board"}
]
```"""
    assert extract_json_array(raw) == [
        {"question": "What claim is missing evidence?", "image_query": "evidence board"}
    ]


def test_normalize_records_deduplicates_and_limits() -> None:
    values = [
        {"question": "What changed", "image_query": "change chart"},
        {"question": "What changed?", "image_query": "duplicate"},
        "Which source should be verified",
        {"question": "   ", "image_query": "empty"},
    ]
    values.extend({"question": f"Question {i}", "image_query": f"image {i}"} for i in range(5))
    records = normalize_records(values)
    assert len(records) == 5
    assert records[0]["question"] == "What changed?"
    assert records[1]["question"] == "Which source should be verified?"


def test_image_from_payload_prefers_image_and_non_google_source() -> None:
    payload = {
        "items": [
            {
                "thumbnail_url": "https://images.example/thumb.jpg",
                "link": "https://publisher.example/story",
            }
        ],
        "search": {"url": "https://www.google.com/search?q=x"},
    }
    assert image_from_payload(payload) == (
        "https://images.example/thumb.jpg",
        "https://publisher.example/story",
    )


def test_env_int_falls_back_on_invalid_value(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("INSULT_AI_BAD_INT", "not-an-int")
    assert _env_int("INSULT_AI_BAD_INT", 123) == 123


def test_env_int_clamps_negative_value(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("INSULT_AI_NEGATIVE_INT", "-20")
    assert _env_int("INSULT_AI_NEGATIVE_INT", 123) == 0


@pytest.mark.asyncio
async def test_generate_source_questions_enriches_and_persists(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    saved: dict[str, object] = {}

    async def fake_generate_question_records(**_: object) -> list[dq.QuestionRecord]:
        return [
            {
                "question": "What claim should be checked?",
                "image_query": "claim evidence",
                "image_url": "",
                "image_source_url": "",
            }
        ]

    async def fake_image_result(query: str) -> tuple[str, str]:
        assert query == "claim evidence"
        return "https://images.example/claim.jpg", "https://publisher.example/claim"

    async def fake_save(corpus_id: str, doc_id: str, records: list[dq.QuestionRecord]) -> None:
        saved["corpus_id"] = corpus_id
        saved["doc_id"] = doc_id
        saved["records"] = records

    monkeypatch.setattr(dq, "generate_question_records", fake_generate_question_records)
    monkeypatch.setattr(dq, "brightdata_image_result", fake_image_result)
    monkeypatch.setattr(dq, "save_document_questions", fake_save)

    records = await dq.generate_source_questions(
        corpus_id="corpus", doc_id="doc", text="source text", source_name="Source"
    )

    assert records[0]["image_url"] == "https://images.example/claim.jpg"
    assert saved["corpus_id"] == "corpus"
    assert saved["doc_id"] == "doc"


@pytest.mark.asyncio
async def test_generate_source_questions_fails_open_on_save_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_generate_question_records(**_: object) -> list[dq.QuestionRecord]:
        return [
            {
                "question": "What claim should be checked?",
                "image_query": "claim evidence",
                "image_url": "",
                "image_source_url": "",
            }
        ]

    async def fake_image_result(_: str) -> tuple[str, str]:
        return "", ""

    async def fake_save(*_: object) -> None:
        raise OSError("disk unavailable")

    monkeypatch.setattr(dq, "generate_question_records", fake_generate_question_records)
    monkeypatch.setattr(dq, "brightdata_image_result", fake_image_result)
    monkeypatch.setattr(dq, "save_document_questions", fake_save)

    assert await dq.generate_source_questions(
        corpus_id="corpus", doc_id="doc", text="source text"
    ) == []
