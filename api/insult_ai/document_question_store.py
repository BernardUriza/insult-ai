"""Sidecar persistence for document starter-question UX metadata.

Backed by Postgres when ``FI_RAG_PGVECTOR_DSN`` is set (the same instance the
RAG store uses), so questions + the image cache survive restarts and stay
consistent across Container Apps replicas — local files are per-replica and
ephemeral (see .claude/rules/deploy.md). Falls back to a local JSON sidecar
for dev without Postgres wired.

Image cache caches BOTH hits and misses: a query that found no image is cached
under a short negative TTL so a repeated ingest does not re-hit Bright Data for
a known-empty query (the cache exists to protect the $250 credit). Hits use a
long TTL; misses a short one (the image may appear later).

Everything here is best-effort UX metadata: a backend failure logs and degrades
to empty/no-op rather than raising — the document ingest path must never break
because question metadata is unavailable.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from pathlib import Path
from typing import Any

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


_DSN = (os.getenv("FI_RAG_PGVECTOR_DSN") or "").strip() or None

_IMAGE_CACHE_TTL_S = _env_int("INSULT_AI_QUESTION_IMAGE_CACHE_TTL_S", 7 * 24 * 60 * 60)
# Misses expire faster than hits — an empty query today may resolve once the
# image is indexed, but we still avoid re-hitting Bright Data on every ingest.
_IMAGE_NEG_CACHE_TTL_S = _env_int("INSULT_AI_QUESTION_IMAGE_NEG_CACHE_TTL_S", 60 * 60)


def _cache_fresh(image_url: str, at: float) -> bool:
    """Hit → long TTL; miss (empty image_url) → short negative TTL."""
    ttl = _IMAGE_CACHE_TTL_S if image_url else _IMAGE_NEG_CACHE_TTL_S
    return (time.time() - float(at or 0)) <= ttl


# ---------------------------------------------------------------------------
# Postgres backend (production / dev-with-pgvector)
# ---------------------------------------------------------------------------

_DDL = """
CREATE TABLE IF NOT EXISTS iai_document_questions (
    corpus_id  text NOT NULL,
    doc_id     text NOT NULL,
    questions  jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (corpus_id, doc_id)
);
CREATE TABLE IF NOT EXISTS iai_image_cache (
    query            text PRIMARY KEY,
    image_url        text NOT NULL DEFAULT '',
    image_source_url text NOT NULL DEFAULT '',
    at               double precision NOT NULL
);
"""

# Typed Any (not `object | None`) so the double-checked-locking re-read below
# isn't narrowed to None by the type checker — another coroutine may set _pool
# while we await the lock.
_pool: Any = None
_pool_lock = asyncio.Lock()
_pool_failed = False


async def _get_pool():  # type: ignore[no-untyped-def]
    """Lazy asyncpg pool + idempotent table creation. Returns None if Postgres
    is unreachable so callers degrade instead of raising on every request."""
    global _pool, _pool_failed
    if _pool is not None:
        return _pool
    if _pool_failed:
        return None
    async with _pool_lock:
        if _pool is not None:
            return _pool
        if _pool_failed:
            return None
        try:
            import asyncpg

            pool = await asyncpg.create_pool(_DSN, min_size=1, max_size=4)
            async with pool.acquire() as conn:
                await conn.execute(_DDL)
            _pool = pool
        except Exception as exc:  # noqa: BLE001 - metadata store degrades, never raises
            _pool_failed = True
            _log.warning("doc_question_pg_unavailable err=%s — falling back to no-op", exc)
            return None
    return _pool


async def _pg_save_questions(corpus_id: str, doc_id: str, questions: list[QuestionRecord]) -> None:
    pool = await _get_pool()
    if pool is None:
        return
    async with pool.acquire() as conn:  # type: ignore[attr-defined]
        await conn.execute(
            "INSERT INTO iai_document_questions (corpus_id, doc_id, questions, updated_at) "
            "VALUES ($1, $2, $3::jsonb, now()) "
            "ON CONFLICT (corpus_id, doc_id) DO UPDATE SET "
            "questions = EXCLUDED.questions, updated_at = now()",
            corpus_id,
            doc_id,
            json.dumps(questions),
        )


async def _pg_get_questions(corpus_id: str, doc_id: str) -> list[QuestionRecord]:
    pool = await _get_pool()
    if pool is None:
        return []
    async with pool.acquire() as conn:  # type: ignore[attr-defined]
        raw = await conn.fetchval(
            "SELECT questions FROM iai_document_questions WHERE corpus_id = $1 AND doc_id = $2",
            corpus_id,
            doc_id,
        )
    if not raw:
        return []
    try:
        return normalize_records(json.loads(raw))
    except (json.JSONDecodeError, TypeError):
        return []


async def _pg_get_cached_image(key: str) -> tuple[str, str] | None:
    pool = await _get_pool()
    if pool is None:
        return None
    async with pool.acquire() as conn:  # type: ignore[attr-defined]
        row = await conn.fetchrow(
            "SELECT image_url, image_source_url, at FROM iai_image_cache WHERE query = $1",
            key,
        )
    if row is None:
        return None
    if not _cache_fresh(row["image_url"], row["at"]):
        return None
    return row["image_url"], row["image_source_url"]


async def _pg_cache_image(key: str, image_url: str, source_url: str) -> None:
    pool = await _get_pool()
    if pool is None:
        return
    async with pool.acquire() as conn:  # type: ignore[attr-defined]
        await conn.execute(
            "INSERT INTO iai_image_cache (query, image_url, image_source_url, at) "
            "VALUES ($1, $2, $3, $4) "
            "ON CONFLICT (query) DO UPDATE SET "
            "image_url = EXCLUDED.image_url, image_source_url = EXCLUDED.image_source_url, "
            "at = EXCLUDED.at",
            key,
            image_url,
            source_url,
            time.time(),
        )


# ---------------------------------------------------------------------------
# JSON sidecar backend (dev fallback when no DSN)
# ---------------------------------------------------------------------------

_STORE_PATH = Path(
    os.getenv(
        "INSULT_AI_DOCUMENT_QUESTIONS_PATH",
        str(Path(__file__).resolve().parents[2] / "storage" / "document_questions.json"),
    )
)
_IMAGE_CACHE_PATH = _STORE_PATH.with_name(f"{_STORE_PATH.stem}.image_cache.json")

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


async def _json_save_questions(corpus_id: str, doc_id: str, questions: list[QuestionRecord]) -> None:
    async with _QUESTION_LOCK:
        store = await load_question_store()
        store.setdefault(corpus_id, {})[doc_id] = questions
        await save_question_store(store)


async def _json_get_questions(corpus_id: str, doc_id: str) -> list[QuestionRecord]:
    async with _QUESTION_LOCK:
        store = await load_question_store()
    return store.get(corpus_id, {}).get(doc_id, [])


async def load_image_cache() -> ImageCache:
    data = await _read_json(_IMAGE_CACHE_PATH)
    if not isinstance(data, dict):
        return {}
    cache: ImageCache = {}
    for query, record in data.items():
        if not isinstance(record, dict):
            continue
        at = float(record.get("at") or 0)
        image_url = str(record.get("image_url") or "")
        source_url = str(record.get("image_source_url") or "")
        # Keep both hits and fresh misses; drop only expired rows so a known-
        # empty query stays cached under the short negative TTL.
        if not _cache_fresh(image_url, at):
            continue
        cache[str(query)] = {"image_url": image_url, "image_source_url": source_url, "at": at}
    return cache


async def save_image_cache(cache: ImageCache) -> None:
    await _write_json(_IMAGE_CACHE_PATH, cache)


async def _json_get_cached_image(key: str) -> tuple[str, str] | None:
    async with _IMAGE_LOCK:
        cache = await load_image_cache()
    record = cache.get(key)
    if not record:
        return None
    return record["image_url"], record["image_source_url"]


async def _json_cache_image(key: str, image_url: str, source_url: str) -> None:
    async with _IMAGE_LOCK:
        cache = await load_image_cache()
        cache[key] = {"image_url": image_url, "image_source_url": source_url, "at": time.time()}
        await save_image_cache(cache)


# ---------------------------------------------------------------------------
# Public API — dispatches to Postgres when a DSN is set, else the JSON sidecar.
# All ops are best-effort: a backend error logs and degrades, never raises.
# ---------------------------------------------------------------------------


async def save_document_questions(corpus_id: str, doc_id: str, questions: list[QuestionRecord]) -> None:
    try:
        if _DSN:
            await _pg_save_questions(corpus_id, doc_id, questions)
        else:
            await _json_save_questions(corpus_id, doc_id, questions)
    except Exception as exc:  # noqa: BLE001 - metadata persistence is best-effort
        _log.warning("save_document_questions_failed corpus_id=%s doc_id=%s err=%s", corpus_id, doc_id, exc)


async def get_document_questions(corpus_id: str, doc_id: str) -> list[QuestionRecord]:
    try:
        if _DSN:
            return await _pg_get_questions(corpus_id, doc_id)
        return await _json_get_questions(corpus_id, doc_id)
    except Exception as exc:  # noqa: BLE001 - read path feeds an endpoint with no try
        _log.warning("get_document_questions_failed corpus_id=%s doc_id=%s err=%s", corpus_id, doc_id, exc)
        return []


async def get_cached_image(query: str) -> tuple[str, str] | None:
    key = query.lower()
    try:
        if _DSN:
            return await _pg_get_cached_image(key)
        return await _json_get_cached_image(key)
    except Exception as exc:  # noqa: BLE001 - cache read is best-effort
        _log.warning("get_cached_image_failed err=%s", exc)
        return None


async def cache_image_result(query: str, image_url: str, source_url: str) -> None:
    # Cache BOTH hits and misses — a known-empty query must not re-hit Bright
    # Data on the next ingest. The negative TTL keeps misses short-lived.
    key = query.lower()
    try:
        if _DSN:
            await _pg_cache_image(key, image_url, source_url)
        else:
            await _json_cache_image(key, image_url, source_url)
    except Exception as exc:  # noqa: BLE001 - cache write is best-effort
        _log.warning("cache_image_result_failed err=%s", exc)
