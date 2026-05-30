"""Tests for server-side preview metadata parsing and URL safety."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

_API_ROOT = Path(__file__).resolve().parent.parent / "api"
if str(_API_ROOT) not in sys.path:
    sys.path.insert(0, str(_API_ROOT))

from insult_ai.preview import PreviewError, _validate_public_url, parse_preview_html  # noqa: E402


def test_parse_preview_html_prefers_open_graph() -> None:
    html = """
    <html><head>
      <title>Plain title</title>
      <meta property="og:title" content="OG title">
      <meta property="og:description" content="OG description">
      <meta property="og:image" content="/card.jpg">
    </head></html>
    """
    assert parse_preview_html(html, "https://example.com/post") == {
        "title": "OG title",
        "description": "OG description",
        "image": "https://example.com/card.jpg",
    }


def test_parse_preview_html_falls_back_to_title() -> None:
    html = "<html><head><title>Fallback title</title></head></html>"
    assert parse_preview_html(html, "https://example.com/") == {
        "title": "Fallback title",
        "description": "",
        "image": "",
    }


@pytest.mark.parametrize(
    "url",
    [
        "http://localhost:8080",
        "http://127.0.0.1",
        "http://10.0.0.5",
        "http://192.168.1.1",
        "file:///etc/passwd",
    ],
)
def test_validate_public_url_blocks_local_and_private_targets(url: str) -> None:
    with pytest.raises(PreviewError):
        _validate_public_url(url)


def test_validate_public_url_allows_public_https() -> None:
    assert _validate_public_url("https://www.vhemt.org/death.htm#mortality") == (
        "https://www.vhemt.org/death.htm#mortality"
    )
