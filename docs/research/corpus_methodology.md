# Corpus Methodology — Roast Coach Psychology Knowledge Base

This document describes **how** the Roast Coach psychology corpus is built,
validated, and ingested. The **what** (licenses, sources, buckets) lives in
[`psychology_sources.md`](./psychology_sources.md).

Slice 1 is the foundation: directory layout, frontmatter spec, dry-run
ingest script, and 8 NIMH seed documents. Slice 1 does NOT wire RAG into
the Roast Coach runtime — that is Slice 3.

---

## Directory layout

```
corpus/
├── clinical_public_knowledge/    # External public-domain sources
│   └── nimh/                     # NIMH seed docs (Slice 1)
├── conversation_moves/           # Bernard-authored move examples (Slice 2)
├── roast_boundaries/             # Bernard-authored boundary rules (Slice 2)
└── golden_conversations/         # Eval-only golden turns (Slice 2+, NEVER ingested)

docs/research/
├── psychology_sources.md         # License registry
└── corpus_methodology.md         # This file
```

`corpus/golden_conversations/` is **excluded from runtime ingest** by an
explicit guard in `bench/ingest_psychology_corpus.py`. Golden conversations
are the hold-out used to score retrieval relevance and persona drift; they
must never leak into the retriever they are scoring.

---

## Frontmatter specification

Every `.md` file in `corpus/clinical_public_knowledge/`,
`corpus/conversation_moves/`, and `corpus/roast_boundaries/` MUST begin with
YAML frontmatter containing the eight fields below. The ingest script
treats a missing or malformed field as a hard error.

```yaml
---
source: NIMH
source_url: https://www.nimh.nih.gov/health/topics/depression
license: public-domain-us-federal
license_url: https://www.nimh.nih.gov/site-info/policies
retrieved_at: 2026-05-26
attribution_required: true
attribution_text: "Source: National Institute of Mental Health (NIMH)."
phi_screened: true
---
```

| Field | Required | Type | Notes |
|---|---|---|---|
| `source` | yes | string | Human-readable source name. Used in retrieval results metadata. |
| `source_url` | yes | URL | Canonical link to the upstream page. Must be retrievable when the file was curated. |
| `license` | yes | slug | Must match a key in `ALLOWED_LICENSES` in the ingest script. Out-of-list values = REJECT. |
| `license_url` | yes | URL | Where the license text lives on the upstream source. |
| `retrieved_at` | yes | date (YYYY-MM-DD) | When Bernard (or the curator) read the upstream page. Drives staleness review. |
| `attribution_required` | yes | bool | If true, `attribution_text` MUST also be non-empty. |
| `attribution_text` | conditional | string | The exact text the response envelope should surface when this chunk is retrieved. Empty allowed only if `attribution_required: false`. |
| `phi_screened` | yes | bool | Must be `true`. The curator certifies they screened the document for PHI (personally identifiable health information). If `false`, the document is rejected. |

---

## PHI screening checklist

Before setting `phi_screened: true`, the curator must visually confirm:

1. No named individuals (real or anonymized).
2. No case studies, vignettes, or "patient X" examples — even paraphrased.
3. No clinical transcripts or therapy session content.
4. No identifying details that would let a reader guess at a person
   (workplace + condition + region triangulation, etc.).
5. Content is at the level of NIMH-style public psychoeducation:
   definitions, signs/symptoms, when-to-seek-help, general resources.

NIMH topic pages by their nature already satisfy items 1–4 because they
are written for the general public. The screening still happens, document
by document, because trust-but-verify.

---

## Deterministic `doc_id`

The ingest script computes `doc_id = sha1(relative_path_from_corpus_root)`.

Properties this gives us:

- **Idempotency:** re-ingesting the same file replaces the chunks under
  that `doc_id` (via fi-core's `replace_existing` behavior in `RagStore`).
  No duplicates accumulate across re-runs.
- **Stability across machines:** `sha1` of a path is deterministic; the
  same `doc_id` is produced on Bernard's laptop, CI, and prod.
- **Survives renames:** moving a file to a new path changes its `doc_id`,
  which is correct — a renamed file should be a fresh insert (the old
  `doc_id` is now orphaned and can be cleaned up manually if desired).

The script does NOT hash content. Content edits do not change `doc_id`;
they just produce a fresh replacement chunkset under the same `doc_id`.
That's what we want: keep the URL/source association stable, refresh the
chunks.

---

## Chunking strategy

The ingest script uses fi-runner's defaults, surfaced explicitly so they
are visible in code review:

- `strategy = "paragraph_aware"` — respects blank-line paragraph breaks,
  which is the natural unit for psychoeducation prose.
- `chunk_size = 400` tokens (estimated; fi-core's Spanish-aware heuristic).
- `overlap = 50` tokens between adjacent chunks.
- `min_chunk_size = 100` tokens — short paragraphs get merged forward, so
  one-line section headers don't produce 5-token chunks the embedder can't
  meaningfully embed.

The frontmatter block is in YAML between `---` markers; the chunker
respects the blank line after `---` and does not embed the frontmatter
into the first chunk. The script still strips the frontmatter manually
before calling `ingest_text_file()` to be safe.

---

## What runs in CI vs. locally

| Step | Slice 1 | Slice 2 | Slice 3 | Slice 4 |
|---|---|---|---|---|
| Lint frontmatter (this script, dry-run) | ✓ CI | ✓ CI | ✓ CI | ✓ CI |
| Real ingest into `fi_rag_store.h5` | local-only | local-only | deploy hook | deploy hook |
| `with_rag=True` in clinical mode | no | no | feature flag | flag on |
| Golden retrieval-relevance eval | no | no | no | ✓ CI |

Slice 1's CI step is **only the dry-run**: it validates frontmatter, license,
PHI screening, and `doc_id` collision detection. No `RagStoreClient` is
instantiated, no `.h5` file is touched. That's deliberate — Slice 1 should
be safely mergeable without any RAG infrastructure being live in CI.

---

## Why no scraping

NIMH and SAMHSA are public domain, so scraping is technically legal.
Bernard's standing rule (see the platform-engineer brief) forbids it
anyway, for three reasons:

1. **Quality control.** A curated subset of ~50 NIMH pages, hand-picked
   for relevance to common Roast Coach situations (anxiety, burnout,
   procrastination, low mood, sleep, stress), retrieves better than 500
   scraped pages that include site navigation, headers, footers, and
   irrelevant policy text.
2. **Voice integrity.** `clinical_compadre.md` explicitly bans
   therapy-speak in the response. Scraped chunks that contain clinical
   register ("individuals experiencing symptoms of...") would degrade
   the LLM's voice when cited. Curation lets us prefer NIMH pages
   written in plainer language.
3. **Maintenance burden.** Scraped corpora rot when the upstream site
   reorganizes. ~50 hand-curated files with explicit `source_url` are
   re-curateable in an afternoon; 500 scraped files are not.

---

## Slice boundaries

- **Slice 1 (this PR):** docs + 8 NIMH seed docs + dry-run script.
  No runtime change, no RAG live, no SAMHSA, no WHO/APA, no datasets.
- **Slice 2:** expand NIMH curation to ~40 docs; add `conversation_moves/`
  examples; add `roast_boundaries/`; populate `golden_conversations/`.
- **Slice 3:** wire `with_rag=True` into clinical mode behind
  `INSULT_AI_PSYCH_CORPUS_ENABLED` env flag; add `sources` to the
  response envelope; deploy hook runs `make corpus-ingest`.
- **Slice 4:** CI runs `bench/eval_roast_coach_corpus.py` against
  `golden_conversations/`; PR-gates retrieval relevance.

The slices are independently mergeable. Each one is reversible.
