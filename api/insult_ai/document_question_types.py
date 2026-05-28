"""Shared types and parsing helpers for document starter questions."""
from __future__ import annotations

import json
from typing import Any, TypedDict


class QuestionRecord(TypedDict):
    question: str
    image_query: str
    image_url: str
    image_source_url: str


class ImageCacheRecord(TypedDict):
    image_url: str
    image_source_url: str
    at: float


QuestionStore = dict[str, dict[str, list[QuestionRecord]]]
ImageCache = dict[str, ImageCacheRecord]


def extract_json_array(raw: str) -> list[Any]:
    """Extract a JSON array from a strict or fenced LLM response."""
    text = raw.strip()
    if text.startswith("```"):
        text = text.strip("`").removeprefix("json").strip()
    start = text.find("[")
    end = text.rfind("]")
    if start >= 0 and end > start:
        text = text[start : end + 1]
    data = json.loads(text)
    if not isinstance(data, list):
        raise ValueError("question payload is not a JSON array")
    return data


def normalize_records(values: Any) -> list[QuestionRecord]:
    """Normalize old string records and new object records into one shape."""
    if not isinstance(values, list):
        return []
    records: list[QuestionRecord] = []
    for value in values:
        if isinstance(value, dict):
            question = str(value.get("question") or "").strip()
            image_query = str(value.get("image_query") or "").strip()
            image_url = str(value.get("image_url") or "").strip()
            image_source_url = str(value.get("image_source_url") or "").strip()
        else:
            question = str(value).strip()
            image_query = ""
            image_url = ""
            image_source_url = ""
        if not question:
            continue
        if not question.endswith("?"):
            question = f"{question.rstrip('.')}?"
        if not any(r["question"] == question for r in records):
            records.append(
                {
                    "question": question[:220],
                    "image_query": image_query[:180],
                    "image_url": image_url,
                    "image_source_url": image_source_url,
                }
            )
    return records[:5]
