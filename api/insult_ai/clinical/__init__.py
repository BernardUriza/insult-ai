"""Clinical mode — the compa-clínico contract.

Sub-package for all clinical pipeline logic (see .claude/rules/clinical.md):

  envelope       — ClinicalEnvelope dataclass + parser + invariants
  judge          — local judge (mechanical + lexical)
  crisis_resources — localized crisis hand-off resources
  pipeline       — pure safety pipeline (LLM-free decision logic)
  orchestrator   — turn orchestration (glues engine + pipeline)
"""
