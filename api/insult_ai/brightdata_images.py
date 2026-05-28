"""Bright Data image enrichment for document starter questions."""
from __future__ import annotations

import logging
import os
from typing import Any
from urllib.parse import quote_plus, urlparse

import httpx

from .document_question_store import cache_image_result, get_cached_image

_log = logging.getLogger("insult_ai.brightdata_images")

_IMAGE_TIMEOUT = httpx.Timeout(6.0, connect=4.0)
_BRIGHTDATA_API_TOKEN = (os.getenv("API_TOKEN") or "").strip() or None
_BRIGHTDATA_SERP_ZONE = os.getenv("INSULT_AI_BRIGHTDATA_SERP_ZONE", "serp_api1")
_IMAGE_ENABLED = os.getenv("INSULT_AI_QUESTION_IMAGES_ENABLED", "1") != "0"


def _is_http_url(value: str) -> bool:
    try:
        parsed = urlparse(value)
    except ValueError:
        return False
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def _looks_like_google_search_url(value: str) -> bool:
    parsed = urlparse(value)
    return "google." in parsed.netloc and parsed.path.startswith("/search")


def _first_string(obj: Any, keys: set[str], *, reject_google_search: bool = False) -> str:
    if isinstance(obj, dict):
        for key, value in obj.items():
            if key in keys and isinstance(value, str) and _is_http_url(value):
                if reject_google_search and _looks_like_google_search_url(value):
                    continue
                return value
            found = _first_string(value, keys, reject_google_search=reject_google_search)
            if found:
                return found
    elif isinstance(obj, list):
        for item in obj:
            found = _first_string(item, keys, reject_google_search=reject_google_search)
            if found:
                return found
    return ""


def image_from_payload(payload: Any) -> tuple[str, str]:
    """Best-effort parser over Bright Data's parsed/raw Google Images shapes."""
    candidates: list[dict[str, Any]] = []

    def collect(obj: Any) -> None:
        if isinstance(obj, dict):
            if set(obj.keys()) & {"image", "image_url", "thumbnail", "thumbnail_url", "original", "src"}:
                candidates.append(obj)
            for value in obj.values():
                collect(value)
        elif isinstance(obj, list):
            for item in obj:
                collect(item)

    collect(payload)
    for item in candidates:
        image_url = _first_string(
            item,
            {"image", "image_url", "thumbnail", "thumbnail_url", "original", "src"},
        )
        source_url = _first_string(
            item,
            {"link", "source_url", "source", "page_url", "url"},
            reject_google_search=True,
        )
        if image_url:
            return image_url, source_url

    image_url = _first_string(
        payload,
        {"image", "image_url", "thumbnail", "thumbnail_url", "original", "src"},
    )
    source_url = _first_string(
        payload,
        {"link", "source_url", "source", "page_url"},
        reject_google_search=True,
    )
    return image_url, source_url


async def brightdata_image_result(query: str) -> tuple[str, str]:
    """Return (image_url, source_url) for a Google Images query via Bright Data."""
    normalized_query = " ".join(query.split()).strip()
    if not _IMAGE_ENABLED or not _BRIGHTDATA_API_TOKEN or not normalized_query:
        return "", ""

    cached = await get_cached_image(normalized_query)
    if cached:
        return cached

    search_url = (
        "https://www.google.com/search"
        f"?q={quote_plus(normalized_query)}&udm=2&hl=en&gl=us&brd_json=1"
    )
    body = {
        "zone": _BRIGHTDATA_SERP_ZONE,
        "url": search_url,
        "format": "json",
        "method": "GET",
        "country": "us",
    }
    headers = {
        "Authorization": f"Bearer {_BRIGHTDATA_API_TOKEN}",
        "Content-Type": "application/json",
        "x-unblock-data-format": "parsed_light",
    }
    try:
        async with httpx.AsyncClient(timeout=_IMAGE_TIMEOUT) as client:
            resp = await client.post("https://api.brightdata.com/request", headers=headers, json=body)
        if resp.status_code != 200:
            _log.warning("brightdata_image_failed status=%s body=%s", resp.status_code, resp.text[:220])
            return "", ""
        payload = resp.json()
    except Exception as exc:  # noqa: BLE001 - image enrichment must fail open
        _log.warning("brightdata_image_failed err=%s", exc)
        return "", ""

    image_url, source_url = image_from_payload(payload)
    await cache_image_result(normalized_query, image_url, source_url)
    return image_url, source_url
