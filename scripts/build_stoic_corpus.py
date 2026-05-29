#!/usr/bin/env python3
"""Build the Stoic public-domain corpus under ``corpus/stoic_public/``.

Downloads two Project Gutenberg public-domain texts (George Long translations),
strips the Gutenberg boilerplate, splits them into per-section Markdown files
with the same frontmatter contract the psychology corpus uses, and writes them
to ``corpus/stoic_public/``. The clinical mode (Roast Coach) ingests this corpus
alongside the NIMH public-knowledge docs so it can ground replies in real Stoic
philosophy (Marcus Aurelius, Epictetus) instead of paraphrasing from memory.

Sources (public domain, Project Gutenberg):
  * Meditations — Marcus Aurelius, trans. George Long (#2680)
  * A Selection from the Discourses of Epictetus with the Encheiridion,
    trans. George Long (#10661)

Run from repo root:
    python scripts/build_stoic_corpus.py            # download + write .md files
    python scripts/build_stoic_corpus.py --offline  # use cached /tmp downloads

Idempotent: re-running overwrites the .md files. After building, ingest with
``python bench/ingest_psychology_corpus.py --commit`` (the stoic dir is wired
into that script's INGEST_DIRS).
"""

from __future__ import annotations

import argparse
import re
import sys
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = REPO_ROOT / "corpus" / "stoic_public"
CACHE_DIR = Path("/tmp")

RETRIEVED_AT = "2026-05-28"
LICENSE = "public-domain"
LICENSE_URL = "https://www.gutenberg.org/policy/permission.html"

MEDITATIONS_URL = "https://www.gutenberg.org/cache/epub/2680/pg2680.txt"
EPICTETUS_URL = "https://www.gutenberg.org/cache/epub/10661/pg10661.txt"


def _download(url: str, cache_name: str, *, offline: bool) -> str:
    cache = CACHE_DIR / cache_name
    if offline:
        if not cache.exists():
            sys.exit(f"--offline but no cache at {cache}; run once online first")
        return cache.read_text(encoding="utf-8")
    if cache.exists():
        return cache.read_text(encoding="utf-8")
    with urllib.request.urlopen(url, timeout=30) as resp:  # noqa: S310 - trusted host
        text = resp.read().decode("utf-8")
    cache.write_text(text, encoding="utf-8")
    return text


def _strip_gutenberg(text: str) -> str:
    """Return the body between the START and END Gutenberg markers."""
    start = re.search(r"\*\*\* START OF THE PROJECT GUTENBERG EBOOK.*?\*\*\*", text)
    end = re.search(r"\*\*\* END OF THE PROJECT GUTENBERG EBOOK.*?\*\*\*", text)
    body = text[start.end() : end.start()] if start and end else text
    return body.strip()


def _frontmatter(*, source_title: str, source_url: str, attribution: str) -> str:
    return (
        "---\n"
        f"source: Project Gutenberg — {source_title}\n"
        f"source_url: {source_url}\n"
        f"license: {LICENSE}\n"
        f"license_url: {LICENSE_URL}\n"
        f"retrieved_at: {RETRIEVED_AT}\n"
        "attribution_required: false\n"
        f'attribution_text: "{attribution}"\n'
        "phi_screened: true\n"
        "---\n\n"
    )


def _write(name: str, frontmatter: str, heading: str, body: str) -> None:
    path = OUT_DIR / name
    path.write_text(frontmatter + f"# {heading}\n\n" + body.strip() + "\n", encoding="utf-8")
    print(f"  wrote {path.relative_to(REPO_ROOT)}  ({len(body):,} chars)")


_BOOK_WORDS = [
    "FIRST", "SECOND", "THIRD", "FOURTH", "FIFTH", "SIXTH",
    "SEVENTH", "EIGHTH", "NINTH", "TENTH", "ELEVENTH", "TWELFTH",
]


def build_meditations(*, offline: bool) -> int:
    raw = _strip_gutenberg(_download(MEDITATIONS_URL, "med.txt", offline=offline))
    fm = _frontmatter(
        source_title="Meditations",
        source_url="https://www.gutenberg.org/ebooks/2680",
        attribution="Marcus Aurelius, Meditations, trans. George Long (Project Gutenberg)",
    )
    # Split on "THE <ORDINAL> BOOK" headings.
    pattern = re.compile(r"^THE (" + "|".join(_BOOK_WORDS) + r") BOOK\s*$", re.MULTILINE)
    marks = list(pattern.finditer(raw))
    if not marks:
        sys.exit("meditations: no book markers found — source format changed")
    count = 0
    for i, m in enumerate(marks):
        ordinal = m.group(1)
        start = m.end()
        end = marks[i + 1].start() if i + 1 < len(marks) else len(raw)
        body = raw[start:end]
        # The twelfth book's body runs into the translator's APPENDIX (Roman-
        # emperor history) and NOTES — cut them at their bare all-caps headings.
        # Only Book XII contains these, so the split is a no-op for the others.
        body = re.split(r"\n\s*(?:APPENDIX|NOTES)\s*\n", body)[0]
        num = _BOOK_WORDS.index(ordinal) + 1
        _write(
            f"meditations_book_{num:02d}.md",
            fm,
            f"Meditations — Book {num} (Marcus Aurelius)",
            body,
        )
        count += 1
    return count


def build_epictetus(*, offline: bool) -> int:
    raw = _strip_gutenberg(_download(EPICTETUS_URL, "epi.txt", offline=offline))
    fm = _frontmatter(
        source_title="Discourses of Epictetus with the Encheiridion",
        source_url="https://www.gutenberg.org/ebooks/10661",
        attribution="Epictetus, Discourses & Encheiridion, trans. George Long (Project Gutenberg)",
    )
    # The Encheiridion (Manual) is the second-to-last major section; it begins at
    # the LAST occurrence of its heading (the first is the table of contents).
    ench_marks = list(re.finditer(r"^THE ENCHEIRIDION, OR MANUAL\.\s*$", raw, re.MULTILINE))
    if not ench_marks:
        sys.exit("epictetus: no Encheiridion marker found — source format changed")
    ench_start = ench_marks[-1].start()
    discourses = raw[:ench_start].strip()
    enchiridion = raw[ench_start:].strip()

    count = 0
    # Encheiridion: one coherent unit (the practical manual — most quotable).
    _write(
        "epictetus_enchiridion.md",
        fm,
        "The Encheiridion, or Manual (Epictetus)",
        enchiridion,
    )
    count += 1

    # Discourses: no clean chapter markers in this edition, so chunk by size at
    # paragraph boundaries into ~4 roughly-even parts. The RAG chunker splits
    # finer at ingest; this just keeps each file a sane size.
    paras = re.split(r"\n\s*\n", discourses)
    n_parts = 4
    target = max(1, len(discourses) // n_parts)
    buf: list[str] = []
    size = 0
    part = 1
    for para in paras:
        buf.append(para)
        size += len(para)
        if size >= target and part < n_parts:
            _write(
                f"epictetus_discourses_part_{part:02d}.md",
                fm,
                f"Discourses of Epictetus — Part {part}",
                "\n\n".join(buf),
            )
            count += 1
            buf, size = [], 0
            part += 1
    if buf:
        _write(
            f"epictetus_discourses_part_{part:02d}.md",
            fm,
            f"Discourses of Epictetus — Part {part}",
            "\n\n".join(buf),
        )
        count += 1
    return count


def main() -> None:
    ap = argparse.ArgumentParser(description="Build the Stoic public-domain corpus.")
    ap.add_argument("--offline", action="store_true", help="use cached /tmp/{med,epi}.txt")
    args = ap.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"→ {OUT_DIR.relative_to(REPO_ROOT)}")
    n_med = build_meditations(offline=args.offline)
    n_epi = build_epictetus(offline=args.offline)
    print(f"\n✅ {n_med} Meditations books + {n_epi} Epictetus files = {n_med + n_epi} docs")


if __name__ == "__main__":
    main()
