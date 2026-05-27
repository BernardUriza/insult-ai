# Psychology Sources — License & Use Registry

This file is the **canonical license registry** for every external psychology
information source that touches the Roast Coach pipeline (runtime retrieval,
policy summary, eval, or rejected). It is the source of truth used by
`bench/ingest_psychology_corpus.py` to decide whether a `.md` document is
allowed into the live RAG store.

Slice 1 (this PR) ships **NIMH-only** seed documents. Other sources are
documented here for the next slices and as a permanent record of why each
source landed in its bucket.

---

## Allowlist (runtime RAG)

A document is allowed into the live retrieval index only if its frontmatter
`license` value is in the allowlist below AND `phi_screened: true`.

| `license` slug | Description | Permits commercial use? | Citation required? |
|---|---|---|---|
| `public-domain-us-federal` | Work of the US federal government, public domain by 17 U.S.C. § 105. | Yes | Yes — source attribution required, no endorsement implied. |

Anything else is **rejected at ingest time**, even if the file exists on disk.
That is intentional: license drift is a security/compliance bug, and the
ingest script must fail loudly rather than silently dropping or accepting.

---

## Sources

### 1. NIMH — National Institute of Mental Health

- **Use bucket:** runtime RAG ✓
- **License:** `public-domain-us-federal`
- **Homepage:** https://www.nimh.nih.gov
- **License URL:** https://www.nimh.nih.gov/site-info/policies
- **Operative clause:** "The information on our website and in our materials
  is in the public domain. You may copy and reuse it without permission."
- **Attribution policy:** NIMH asks that "you cite NIMH as the source." We
  honor this by surfacing `attribution_text` in the response envelope when
  a chunk derived from NIMH appears in retrieved context.
- **Endorsement:** NIMH does not endorse external products. Any user-facing
  text built on NIMH content must NOT imply NIMH endorsement of the Roast
  Coach. The default `attribution_text` ("Source: National Institute of
  Mental Health (NIMH).") satisfies this.
- **PHI / transcript risk:** None. NIMH topic pages are general
  psychoeducation. No individual case studies, no transcripts.
- **Risk level:** Low.

### 2. SAMHSA — Substance Abuse and Mental Health Services Administration

- **Use bucket:** runtime RAG ⚠ (deferred to a later slice)
- **License:** public-domain-us-federal (agency-authored pages only)
- **Homepage:** https://www.samhsa.gov
- **License URL:** https://www.samhsa.gov/about-us/website-policies-notices
- **Why deferred:** SAMHSA's site mixes agency-authored psychoeducation
  (public domain) with PDFs of external research papers that retain their
  original authors' copyrights. The ingest script would need a per-document
  filter step that confirms each candidate URL is on a SAMHSA-authored page
  (not a hosted external paper). That filter is out of scope for Slice 1.
- **Citation:** Yes — source attribution required.
- **Risk level:** Medium (low if filtering is done; high without it).

### 3. WHO — World Health Organization

- **Use bucket:** policy summary only (Bernard-authored paraphrase, no
  verbatim chunks in runtime).
- **License:** CC BY-NC-SA 3.0 IGO
- **Homepage:** https://www.who.int
- **License URL:** https://www.who.int/about/policies/publishing/copyright
- **Operative clause:** "The CC BY-NC-SA 3.0 IGO licence allows users to
  freely copy, reproduce, reprint, distribute, translate and adapt the work
  for non-commercial purposes."
- **Why excluded from runtime RAG:** The `NC` (NonCommercial) clause is
  incompatible with a monetized or monetization-adjacent product. The
  `SA` (ShareAlike) clause would force any derivative corpus that contains
  WHO chunks to inherit CC BY-NC-SA — which would taint the entire RAG
  index, not just the WHO chunks.
- **Permitted use:** Bernard can read WHO guidance and write **his own**
  prose summarizing the recommendation. The paraphrase is Bernard's work,
  not a derivative under CC BY-NC-SA, provided it does not reproduce WHO
  text verbatim.
- **Risk level:** High for runtime; low for policy summary.

### 4. APA — American Psychological Association (apa.org/topics)

- **Use bucket:** reject (runtime); eval-only allowed under fair-use
  research carve-out (small samples, internal scoring, never user-facing).
- **License:** All rights reserved, by default.
- **Homepage:** https://www.apa.org/topics
- **License URL:** https://www.apa.org/about/contact/copyright/websites-blogs-publications
- **Operative clause:** "If you are seeking to reuse material from anywhere
  else on the APA website, please reach out to Permissions."
- **Why excluded:** APA's website-content reuse policy has no automatic
  excerpt safe-harbor. The 200/400-word allowance commonly cited applies
  ONLY to APA Style resources (academic citation guidance), not to
  `apa.org/topics` psychoeducation. Commercial use is undefined by default
  and therefore assumed denied.
- **Risk level:** High.

### 5. Academic counseling datasets

These appear here only so future readers understand why they are NOT in the
corpus. None of them ship in Slice 1.

#### 5a. MentalChat16K (HuggingFace `ShenLab/MentalChat16K`)

- **Use bucket:** eval-only (synthetic split); reject (interview split).
- **License:** MIT
- **Homepage:** https://huggingface.co/datasets/ShenLab/MentalChat16K
- **PHI / transcript risk:** **High** for the 6,338 interview pairs. They
  derive from real audio recordings of behavioral-intervention sessions
  with palliative-care caregivers, paraphrased through Mistral-7B. The
  dataset card does not document IRB approval or consent provenance. Even
  if MIT permits redistribution, the upstream ethics chain is unverified.
- **Risk level:** Medium-High overall; High for the interview split.

#### 5b. CounseLLMe

- **Use bucket:** reject pending license verification.
- **License:** Unknown. The paper (ScienceDirect S2667118225000017)
  references an OSF deposit but a clear license string could not be
  retrieved. OSF defaults to "all rights reserved" unless an explicit
  license tag is attached.
- **Risk level:** High until verified.

---

## Bucket summary

| Bucket | Sources (Slice 1) | Sources (later, with filter) | Sources (rejected) |
|---|---|---|---|
| runtime RAG | NIMH | SAMHSA (agency-authored only) | — |
| policy summary | — | WHO (Bernard paraphrase) | — |
| eval-only | — | MentalChat16K synthetic split | — |
| reject | APA, MentalChat16K interview split, CounseLLMe (pending) | — | (above) |

---

## How the ingest script uses this file

`bench/ingest_psychology_corpus.py` does **not** parse this Markdown file. It
hardcodes the allowlist set (`{"public-domain-us-federal"}`) as a Python
constant matching this document. Any future addition to the allowlist
requires:

1. Adding the source section above.
2. Adding the license slug to the `ALLOWED_LICENSES` constant in the script.
3. PR review on both files together — license-policy changes are
   intentionally dual-controlled (the registry AND the enforcer).

If a source's frontmatter declares a license not in the allowlist, the
script logs a clear `REJECT` line and **excludes the document from ingest**.
That's the safe default; we'd rather fail a deploy than ingest a copyrighted
chunk into the live retriever.
