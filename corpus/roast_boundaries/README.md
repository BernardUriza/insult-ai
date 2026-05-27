# `corpus/roast_boundaries/`

Bernard-authored documents describing what the Roast Coach must NOT
roast, plus crisis-trigger language. This complements
[`api/insult_ai/policies/never_attack.md`](../../api/insult_ai/policies/never_attack.md)
and the crisis-resource handoff in
[`api/insult_ai/policies/crisis_resources.md`](../../api/insult_ai/policies/crisis_resources.md).

These documents live in the retrieval corpus (not just in the policies
directory) so the LLM can be prompted to retrieve relevant boundary
context for a user message at runtime, in addition to the static system
prompt rules. Both layers are belt-and-suspenders.

This directory is **empty in Slice 1**. Files will be added in Slice 2.
