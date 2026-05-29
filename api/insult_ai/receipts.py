"""Post-model receipt contract helpers.

The roast/brief personas require a final ``Receipts`` section, but LLM output is
not a type system. If a turn used URL-bearing tools and the model omits that
section, append a minimal one from the tool-call inputs we actually executed.
This never invents evidence: it only lists URLs already present in the trace.
"""

from __future__ import annotations

import dataclasses
import re
from typing import Any
from urllib.parse import urlparse

_URL_RE = re.compile(r"https?://[^\s)\]>\"']+")
_RECEIPTS_RE = re.compile(r"^receipts?\s*$", re.IGNORECASE | re.MULTILINE)
_TRAILING_PUNCT = ".,;:"


def _urls_in(value: Any) -> list[str]:
    urls: list[str] = []
    if isinstance(value, str):
        urls.extend(_URL_RE.findall(value))
    elif isinstance(value, dict):
        for item in value.values():
            urls.extend(_urls_in(item))
    elif isinstance(value, (list, tuple)):
        for item in value:
            urls.extend(_urls_in(item))
    return urls


def _clean_url(url: str) -> str:
    return url.strip().rstrip(_TRAILING_PUNCT)


def _valid_http_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def urls_from_tool_inputs(tool_calls: list[Any], *, limit: int = 8) -> list[str]:
    """Return ordered unique HTTP(S) URLs found in tool-call inputs."""
    out: list[str] = []
    seen: set[str] = set()
    for tc in tool_calls:
        raw_input = getattr(tc, "input", None)
        if raw_input is None and isinstance(tc, dict):
            raw_input = tc.get("input")
        for raw_url in _urls_in(raw_input):
            url = _clean_url(raw_url)
            key = url.lower()
            if not _valid_http_url(url) or key in seen:
                continue
            seen.add(key)
            out.append(url)
            if len(out) >= limit:
                return out
    return out


def has_receipt_urls(text: str) -> bool:
    """True when the final Receipts section already contains at least one URL."""
    matches = list(_RECEIPTS_RE.finditer(text))
    tail = text[matches[-1].end() :] if matches else ""
    return bool(_URL_RE.search(tail))


def ensure_receipts_section(text: str, tool_calls: list[Any]) -> str:
    """Append fetched URL receipts when the model omitted them.

    Existing valid receipt sections are left untouched. If the model wrote a
    bare ``Receipts`` heading without URLs, URLs are appended below it.
    """
    clean_text = (text or "").rstrip()
    if has_receipt_urls(clean_text):
        return text

    urls = urls_from_tool_inputs(tool_calls)
    if not urls:
        return text

    lines = [f"- {url}" for url in urls]
    if list(_RECEIPTS_RE.finditer(clean_text)):
        return f"{clean_text}\n" + "\n".join(lines)
    return f"{clean_text}\n\nReceipts\n" + "\n".join(lines)


def ensure_result_receipts(result: Any) -> Any:
    """Return a TurnResult-like object with a receipt section.

    fi-runner's ``TurnResult`` is a FROZEN dataclass — assigning ``result.text``
    raises ``FrozenInstanceError``. Use ``dataclasses.replace`` to produce a copy
    with the new text; fall back to in-place mutation for mutable test doubles /
    non-dataclasses."""
    new_text = ensure_receipts_section(result.text or "", result.tool_calls or [])
    if new_text == (result.text or ""):
        return result
    if dataclasses.is_dataclass(result) and not isinstance(result, type):
        return dataclasses.replace(result, text=new_text)
    result.text = new_text
    return result
