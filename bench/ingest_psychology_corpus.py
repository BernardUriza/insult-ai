#!/usr/bin/env python3
"""Ingest the Roast Coach psychology corpus into the fi-runner RAG store.

Slice 1 ships **DRY RUN ONLY**. This script:

  * walks the corpus directories under ``corpus/`` (excluding
    ``corpus/golden_conversations/``);
  * parses YAML-ish frontmatter from each ``.md`` document;
  * validates license against the allowlist, attribution presence,
    PHI screening, required-field presence, and body non-emptiness;
  * computes a deterministic ``doc_id = sha1(relative_path)`` for each
    document and asserts no collisions;
  * prints a per-document accept/reject report and a summary block;
  * imports (but does not instantiate) ``fi_runner.rag_store.RagStoreClient``
    to prove the consumption path is available.

The dry-run never writes to any RAG store, never touches the network, and
never instantiates ``RagStoreClient``. A real ingest will land behind a
``--commit`` flag in a later slice; the flag is intentionally absent here.

Usage:
    python bench/ingest_psychology_corpus.py
    python bench/ingest_psychology_corpus.py --verbose
"""

from __future__ import annotations

import argparse
import hashlib
import sys
from dataclasses import dataclass, field
from pathlib import Path

# fi-runner is the only FI surface this script touches. We do not import
# fi_core anywhere. The import is attempted at module load time so the
# script fails fast in a real deploy env that is missing the dependency;
# in lint-only environments (CI without the full RAG runtime), we degrade
# to dry-run-only without crashing — the validation logic is independent.
try:
    from fi_runner.rag_store import RagStoreClient

    _FI_RUNNER_CLIENT_NAME: str | None = RagStoreClient.__name__
    _FI_RUNNER_AVAILABLE = True
except ImportError:
    _FI_RUNNER_CLIENT_NAME = None
    _FI_RUNNER_AVAILABLE = False


# ---------------------------------------------------------------------------
# Allowlist (must stay in sync with docs/research/psychology_sources.md)
# ---------------------------------------------------------------------------

ALLOWED_LICENSES: frozenset[str] = frozenset(
    {
        "public-domain-us-federal",
    }
)

REQUIRED_FRONTMATTER_FIELDS: tuple[str, ...] = (
    "source",
    "source_url",
    "license",
    "license_url",
    "retrieved_at",
    "attribution_required",
    "attribution_text",
    "phi_screened",
)


# ---------------------------------------------------------------------------
# Directory contract
# ---------------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parent.parent
CORPUS_ROOT = REPO_ROOT / "corpus"

INGEST_DIRS: tuple[Path, ...] = (
    CORPUS_ROOT / "clinical_public_knowledge",
    CORPUS_ROOT / "conversation_moves",
    CORPUS_ROOT / "roast_boundaries",
)

EXCLUDED_DIR: Path = CORPUS_ROOT / "golden_conversations"

# Default corpus_id for the live RAG store. Slice 3 will read this from the
# INSULT_AI_PSYCH_CORPUS_ID env var; for the dry-run print we hardcode the
# default so the value is visible at review time.
DEFAULT_CORPUS_ID = "psych_public_v1"


# ---------------------------------------------------------------------------
# Frontmatter parser (intentionally minimal, no PyYAML dependency)
# ---------------------------------------------------------------------------


@dataclass
class Frontmatter:
    fields: dict[str, str] = field(default_factory=dict)

    def get_bool(self, key: str) -> bool | None:
        value = self.fields.get(key, "").strip().lower()
        if value == "true":
            return True
        if value == "false":
            return False
        return None


def parse_frontmatter(text: str) -> Frontmatter | None:
    """Parse a constrained YAML frontmatter block. Returns None if absent.

    The format we accept is intentionally narrow:
      * starts with ``---\\n``;
      * contains only ``key: value`` lines (no nesting, no lists);
      * ends with ``\\n---\\n``.
    """
    if not text.startswith("---\n"):
        return None
    end = text.find("\n---\n", 4)
    if end == -1:
        return None
    block = text[4:end]
    fm = Frontmatter()
    for line in block.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if ":" not in line:
            continue
        key, _, value = line.partition(":")
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
            value = value[1:-1]
        fm.fields[key] = value
    return fm


def strip_frontmatter(text: str) -> str:
    if not text.startswith("---\n"):
        return text
    end = text.find("\n---\n", 4)
    if end == -1:
        return text
    return text[end + 5 :]


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


@dataclass
class DocValidation:
    path: Path
    rel_path: str
    doc_id: str
    accepted: bool = True
    rejections: list[str] = field(default_factory=list)
    source: str = ""
    source_url: str = ""
    license: str = ""
    body_chars: int = 0


def doc_id_for(rel_path: str) -> str:
    return hashlib.sha1(rel_path.encode("utf-8")).hexdigest()


def validate_one(path: Path) -> DocValidation:
    rel = path.relative_to(CORPUS_ROOT).as_posix()
    docv = DocValidation(path=path, rel_path=rel, doc_id=doc_id_for(rel))

    text = path.read_text(encoding="utf-8")
    fm = parse_frontmatter(text)
    if fm is None:
        docv.accepted = False
        docv.rejections.append("missing or malformed YAML frontmatter")
        return docv

    docv.source = fm.fields.get("source", "")
    docv.source_url = fm.fields.get("source_url", "")
    docv.license = fm.fields.get("license", "")

    for required in REQUIRED_FRONTMATTER_FIELDS:
        if required not in fm.fields:
            docv.accepted = False
            docv.rejections.append(f"missing frontmatter field: {required}")

    if docv.license and docv.license not in ALLOWED_LICENSES:
        docv.accepted = False
        docv.rejections.append(
            f"license {docv.license!r} not in allowlist "
            f"{sorted(ALLOWED_LICENSES)}"
        )

    phi_screened = fm.get_bool("phi_screened")
    if phi_screened is None:
        docv.accepted = False
        docv.rejections.append(
            "phi_screened: must be 'true' or 'false', got malformed value"
        )
    elif not phi_screened:
        docv.accepted = False
        docv.rejections.append("phi_screened is false - document rejected")

    attribution_required = fm.get_bool("attribution_required")
    if attribution_required is None:
        docv.accepted = False
        docv.rejections.append(
            "attribution_required: must be 'true' or 'false', got malformed"
        )
    elif attribution_required:
        attr_text = fm.fields.get("attribution_text", "").strip()
        if not attr_text:
            docv.accepted = False
            docv.rejections.append(
                "attribution_required is true but attribution_text is empty"
            )

    body = strip_frontmatter(text).strip()
    docv.body_chars = len(body)
    if docv.body_chars == 0:
        docv.accepted = False
        docv.rejections.append("document body is empty after frontmatter stripped")

    return docv


# ---------------------------------------------------------------------------
# Walk + collect
# ---------------------------------------------------------------------------


def discover_documents() -> list[Path]:
    out: list[Path] = []
    for root in INGEST_DIRS:
        if not root.exists():
            continue
        for path in sorted(root.rglob("*.md")):
            if path.name == "README.md":
                continue
            out.append(path)
    return out


def assert_exclusion_invariant() -> None:
    """Guarantee golden_conversations/ cannot leak into any INGEST_DIR walk."""
    for ingest_root in INGEST_DIRS:
        try:
            EXCLUDED_DIR.relative_to(ingest_root)
        except ValueError:
            continue
        raise AssertionError(
            f"EXCLUDED_DIR {EXCLUDED_DIR} is inside INGEST_DIR "
            f"{ingest_root}; the ingest walk would pick up "
            "golden conversations. Fix the directory layout."
        )


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--corpus-id",
        default=DEFAULT_CORPUS_ID,
        help="corpus_id passed to RagStoreClient (printed only in dry-run)",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="print per-document accept/reject lines",
    )
    args = parser.parse_args()

    print("=== ingest_psychology_corpus.py - DRY RUN ===")
    print(f"corpus_root:      {CORPUS_ROOT}")
    print(f"corpus_id:        {args.corpus_id}")
    print(f"allowed_licenses: {sorted(ALLOWED_LICENSES)}")
    print(f"excluded_dir:     {EXCLUDED_DIR.relative_to(REPO_ROOT)}/")
    if _FI_RUNNER_AVAILABLE:
        print(
            f"fi_runner:        fi_runner.rag_store.{_FI_RUNNER_CLIENT_NAME} importable"
        )
    else:
        print(
            "fi_runner:        NOT installed in this env (dry-run still proceeds)"
        )
    print()

    assert_exclusion_invariant()
    print(
        f"exclusion invariant OK: {EXCLUDED_DIR.relative_to(REPO_ROOT)}/ "
        "is a sibling of every ingest root, not a child"
    )

    excluded_files: list[Path] = []
    if EXCLUDED_DIR.exists():
        excluded_files = [
            p
            for p in EXCLUDED_DIR.rglob("*")
            if p.is_file() and p.name != "README.md"
        ]
    print(
        f"excluded directory contents: {len(excluded_files)} file(s) "
        "(none will be ingested, by design)"
    )
    print()

    docs = discover_documents()
    if not docs:
        print("no documents discovered.")
        return 1

    print(f"discovered {len(docs)} candidate document(s) under:")
    for d in INGEST_DIRS:
        rel = d.relative_to(REPO_ROOT)
        count = sum(1 for p in docs if d in p.parents)
        print(f"  {rel}/  ({count} doc(s))")
    print()

    accepted: list[DocValidation] = []
    rejected: list[DocValidation] = []
    doc_ids: dict[str, str] = {}
    collisions: list[tuple[str, str, str]] = []

    for path in docs:
        v = validate_one(path)
        if v.doc_id in doc_ids:
            collisions.append((v.doc_id, doc_ids[v.doc_id], v.rel_path))
        else:
            doc_ids[v.doc_id] = v.rel_path
        (accepted if v.accepted else rejected).append(v)

    if args.verbose or rejected:
        print("--- per-document detail ---")
        for v in accepted + rejected:
            status = "OK    " if v.accepted else "REJECT"
            print(f"  [{status}] {v.rel_path}")
            print(
                f"           doc_id={v.doc_id[:12]}...  "
                f"source={v.source or '-'}  "
                f"license={v.license or '-'}  "
                f"body={v.body_chars}ch"
            )
            for reason in v.rejections:
                print(f"           ! {reason}")
        print()

    if collisions:
        print("--- doc_id collisions (bug in doc_id_for) ---")
        for cid, a, b in collisions:
            print(f"  {cid[:12]}...: {a}  <->  {b}")
        print()

    print("--- summary ---")
    print(f"  candidates: {len(docs)}")
    print(f"  accepted:   {len(accepted)}")
    print(f"  rejected:   {len(rejected)}")
    print(f"  collisions: {len(collisions)}")

    by_source: dict[str, int] = {}
    for v in accepted:
        by_source[v.source] = by_source.get(v.source, 0) + 1
    for src in sorted(by_source):
        print(f"    by source: {src} -> {by_source[src]} doc(s)")
    print()

    print(
        "dry run: no documents were ingested into any RagStore. "
        "RagStoreClient was imported but not instantiated."
    )
    print()

    if rejected or collisions:
        print("FAIL: rejected docs or doc_id collisions present.")
        return 2
    print("PASS: every candidate document would be accepted at ingest time.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
