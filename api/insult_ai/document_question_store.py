"""Sidecar persistence for document starter-question UX metadata."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from pathlib import Path

from .document_question_types import ImageCache, QuestionRecord, QuestionStore, normalize_records

_log = logging.getLogger("insult_ai.document_question_store")


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except ValueError:
        _log.warning("invalid_int_env name=%s value=%r default=%d", name, raw, default)
        return default
    return max(0, value)


_STORE_PATH = Path(
    os.getenv(
        "INSULT_AI_DOCUMENT_QUESTIONS_PATH",
        str(Path(__file__).resolve().parents[2] / "storage" / "document_questions.json"),
    )
)
_IMAGE_CACHE_PATH = _STORE_PATH.with_name(f"{_STORE_PATH.stem}.image_cache.json")
_IMAGE_CACHE_TTL_S = _env_int("INSULT_AI_QUESTION_IMAGE_CACHE_TTL_S", 7 * 24 * 60 * 60)

_QUESTION_LOCK = asyncio.Lock()
_IMAGE_LOCK = asyncio.Lock()


async def _read_json(path: Path) -> object:
    def read() -> object:
        if not path.exists():
            return {}
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            _log.warning("json_store_unreadable path=%s", path)
            return {}

    return await asyncio.to_thread(read)


async def _write_json(path: Path, data: object) -> None:
    def write() -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(
            json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True),
            encoding="utf-8",
        )
        tmp.replace(path)

    await asyncio.to_thread(write)


async def load_question_store() -> QuestionStore:
    data = await _read_json(_STORE_PATH)
    if not isinstance(data, dict):
        return {}
    return {
        str(corpus): {str(doc): normalize_records(questions) for doc, questions in docs.items()}
        for corpus, docs in data.items()
        if isinstance(docs, dict)
    }


async def save_question_store(store: QuestionStore) -> None:
    await _write_json(_STORE_PATH, store)


async def save_document_questions(corpus_id: str, doc_id: str, questions: list[QuestionRecord]) -> None:
    async with _QUESTION_LOCK:
        store = await load_question_store()
        store.setdefault(corpus_id, {})[doc_id] = questions
        await save_question_store(store)


async def get_document_questions(corpus_id: str, doc_id: str) -> list[QuestionRecord]:
    async with _QUESTION_LOCK:
        store = await load_question_store()
    return store.get(corpus_id, {}).get(doc_id, [])


async def get_cached_image(query: str) -> tuple[str, str] | None:
    key = query.lower()
    async with _IMAGE_LOCK:
        cache = await load_image_cache()
    record = cache.get(key)
    if not record:
        return None
    return record["image_url"], record["image_source_url"]


async def cache_image_result(query: str, image_url: str, source_url: str) -> None:
    if not image_url:
        return
    key = query.lower()
    async with _IMAGE_LOCK:
        cache = await load_image_cache()
        cache[key] = {
            "image_url": image_url,
            "image_source_url": source_url,
            "at": time.time(),
        }
        await save_image_cache(cache)


async def load_image_cache() -> ImageCache:
    data = await _read_json(_IMAGE_CACHE_PATH)
    if not isinstance(data, dict):
        return {}
    cache: ImageCache = {}
    now = time.time()
    for query, record in data.items():
        if not isinstance(record, dict):
            continue
        at = float(record.get("at") or 0)
        if now - at > _IMAGE_CACHE_TTL_S:
            continue
        image_url = str(record.get("image_url") or "")
        source_url = str(record.get("image_source_url") or "")
        if image_url:
            cache[str(query)] = {
                "image_url": image_url,
                "image_source_url": source_url,
                "at": at,
            }
    return cache


async def save_image_cache(cache: ImageCache) -> None:
    await _write_json(_IMAGE_CACHE_PATH, cache)
