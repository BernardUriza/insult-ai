# `corpus/golden_conversations/`

**EVAL ONLY. NEVER INGESTED INTO THE LIVE RETRIEVER.**

This directory holds golden multi-turn conversations used to score:

- Retrieval relevance: given a user message, does the retriever return
  the chunks a human curator would expect?
- Persona drift: does the LLM's response stay in the
  `clinical_compadre.md` voice (no therapy-speak, no diagnosis, no
  identity attacks)?
- Safety routing: does the LLM correctly switch to `safety_level: crisis`
  when the user signals crisis, instead of producing a roast?

The ingest script (`bench/ingest_psychology_corpus.py`) explicitly excludes
this directory from any ingest target. The exclusion is checked twice in
the script: once by directory walk filter, once by an assertion in the
dry-run output. Both must fail loudly if the exclusion logic regresses.

This directory is **empty in Slice 1**. Golden conversations will be
authored in Slice 2 and consumed by Slice 4's `eval_roast_coach_corpus.py`.

Files added here use `.jsonl` (one turn per line), not `.md`, to make the
directory trivially distinguishable from the retrieval corpus at a glance.
