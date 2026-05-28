"""Tests for the post-model receipts contract."""

from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace

_API_ROOT = Path(__file__).resolve().parent.parent / "api"
if str(_API_ROOT) not in sys.path:
    sys.path.insert(0, str(_API_ROOT))

from insult_ai.receipts import (
    ensure_receipts_section,
    has_receipt_urls,
    urls_from_tool_inputs,
)


def test_urls_from_tool_inputs_dedupes_in_trace_order() -> None:
    calls = [
        SimpleNamespace(input={"url": "https://github.com/BernardUriza"}),
        SimpleNamespace(input={"url": "https://github.com/BernardUriza"}),
        SimpleNamespace(input={"nested": {"url": "https://bernarduriza.com."}}),
    ]
    assert urls_from_tool_inputs(calls) == [
        "https://github.com/BernardUriza",
        "https://bernarduriza.com",
    ]


def test_existing_receipts_with_urls_are_left_untouched() -> None:
    text = "Body\n\nReceipts\n- https://example.com"
    calls = [SimpleNamespace(input={"url": "https://github.com/BernardUriza"})]
    assert has_receipt_urls(text)
    assert ensure_receipts_section(text, calls) == text


def test_missing_receipts_are_appended_from_tool_inputs() -> None:
    text = "Body without the contract."
    calls = [
        SimpleNamespace(input={"url": "https://github.com/BernardUriza"}),
        SimpleNamespace(input={"url": "https://github.com/BernardUriza/Robo-Poet"}),
    ]
    assert ensure_receipts_section(text, calls) == (
        "Body without the contract.\n\n"
        "Receipts\n"
        "- https://github.com/BernardUriza\n"
        "- https://github.com/BernardUriza/Robo-Poet"
    )


def test_bare_receipts_heading_gets_urls_without_duplicate_heading() -> None:
    text = "Body\n\nReceipts"
    calls = [SimpleNamespace(input={"url": "https://example.com"})]
    assert ensure_receipts_section(text, calls) == "Body\n\nReceipts\n- https://example.com"


def test_no_tool_urls_leaves_text_unchanged() -> None:
    text = "Body without receipts."
    calls = [SimpleNamespace(input={"query": "not a url"})]
    assert ensure_receipts_section(text, calls) == text
