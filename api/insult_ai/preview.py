"""Server-side URL preview extraction.

Browsers cannot reliably read arbitrary pages for OG metadata because of CORS,
iframes, cookie walls, and anti-bot rules. This module fetches a small slice of
HTML server-side, extracts Open Graph/Twitter tags, and fails closed for local
or private network targets.
"""

from __future__ import annotations

import asyncio
import ipaddress
import socket
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse

import httpx

_MAX_HTML_BYTES = 256 * 1024
_TIMEOUT = httpx.Timeout(5.5, connect=3.0)
_USER_AGENT = (
    "Mozilla/5.0 (compatible; InsultAI-Preview/1.0; +https://iai.bernarduriza.com)"
)


class PreviewError(ValueError):
    """Client-safe preview failure."""


class _MetaParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.meta: dict[str, str] = {}
        self.title = ""
        self._in_title = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attrs_map = {k.lower(): (v or "").strip() for k, v in attrs}
        if tag.lower() == "title":
            self._in_title = True
            return
        if tag.lower() != "meta":
            return
        key = (attrs_map.get("property") or attrs_map.get("name") or "").lower()
        content = attrs_map.get("content") or ""
        if key and content and key not in self.meta:
            self.meta[key] = content

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "title":
            self._in_title = False

    def handle_data(self, data: str) -> None:
        if self._in_title and not self.title:
            self.title = " ".join(data.split())


def _clean(value: str, limit: int) -> str:
    return " ".join(value.strip().split())[:limit]


def _validate_public_url(raw_url: str) -> str:
    value = raw_url.strip()
    try:
        parsed = urlparse(value)
    except ValueError as exc:
        raise PreviewError("invalid URL") from exc
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise PreviewError("preview requires an http(s) URL")
    host = parsed.hostname.lower()
    if host in {"localhost", "localhost.localdomain"} or host.endswith(".localhost"):
        raise PreviewError("local URLs cannot be previewed")
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return value
    if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
        raise PreviewError("private network URLs cannot be previewed")
    return value


async def _assert_public_dns(raw_url: str) -> None:
    host = urlparse(raw_url).hostname
    if not host:
        raise PreviewError("invalid URL")

    def resolve() -> list[str]:
        infos = socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)
        return [item[4][0] for item in infos]

    try:
        addresses = await asyncio.to_thread(resolve)
    except socket.gaierror as exc:
        raise PreviewError("could not resolve URL host") from exc
    for address in addresses:
        ip = ipaddress.ip_address(address)
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            raise PreviewError("private network URLs cannot be previewed")


def parse_preview_html(html: str, base_url: str) -> dict[str, str]:
    parser = _MetaParser()
    parser.feed(html)
    title = (
        parser.meta.get("og:title")
        or parser.meta.get("twitter:title")
        or parser.title
        or urlparse(base_url).netloc
    )
    description = (
        parser.meta.get("og:description")
        or parser.meta.get("twitter:description")
        or parser.meta.get("description")
        or ""
    )
    image = (
        parser.meta.get("og:image:secure_url")
        or parser.meta.get("og:image")
        or parser.meta.get("twitter:image")
        or ""
    )
    return {
        "title": _clean(title, 160),
        "description": _clean(description, 260),
        "image": urljoin(base_url, image) if image else "",
    }


async def fetch_url_preview(raw_url: str) -> dict[str, str]:
    url = _validate_public_url(raw_url)
    await _assert_public_dns(url)
    headers = {
        "Accept": "text/html,application/xhtml+xml",
        "User-Agent": _USER_AGENT,
    }
    async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True, max_redirects=3) as client:
        async with client.stream("GET", url, headers=headers) as response:
            response.raise_for_status()
            content_type = response.headers.get("content-type", "")
            if "html" not in content_type.lower():
                raise PreviewError("URL did not return an HTML page")
            chunks: list[bytes] = []
            total = 0
            async for chunk in response.aiter_bytes():
                total += len(chunk)
                if total > _MAX_HTML_BYTES:
                    break
                chunks.append(chunk)
    html = b"".join(chunks).decode(response.encoding or "utf-8", errors="replace")
    return parse_preview_html(html, str(response.url))
