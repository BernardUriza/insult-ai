# Language — the system writes English; only the roast follows the target

Every author-controlled string in this repo is **English**. The only piece
that legitimately switches language is the **roast text the agent produces**
— the persona's "Match the target's language" rule (see `personas.md` and
the VOICE section of `personas/roast.md`) means a Spanish target gets a
Spanish roast. Everything around that is English.

## What's IN scope (must be English)

| Surface | File pattern | Why |
|---|---|---|
| Web UI copy | `web/app/**/*.tsx`, `web/components/**/*.tsx` | Headers, labels, placeholders, `aria-label`s, hints, empty states, errors — anything rendered to the DOM or read by a screen reader. |
| Persona prompts | `api/insult_ai/personas/*.md` | Instructions to the model. The SDK works best in English; the model still emits the roast in the target's language because the persona's VOICE rule tells it to. |
| Antidrift / guard packs | `api/insult_ai/runner.py` (the `break_patterns=` list) | Prefer the English-only catalogs (`packs.DEFAULT_EN`, `ASSISTANT_TONE_EN`, etc.) over the mixed `DEFAULT_BILINGUAL`. If a Spanish target ever needs Spanish-side drift detection, branch on detected target language and add the ES pack on top — don't ship mixed by default. |
| Code comments / JSDoc | `**/*.{ts,tsx,py}` | English so PR reviewers / new contributors don't bounce off a language wall. |
| Commit messages, PR titles | git | Same. |

## What's OUT of scope (the agent's bilingual surface)

- **The roast OUTPUT.** The persona's "Match the target's language" rule is
  the product's bilingual surface — keep it. A roast of `acme.com` reads
  English; a roast of `https://startup-pocho.mx` reads Spanish pocho.
- **The fetched content** (Bright Data MCP results). Whatever the page says
  is whatever the page says.

## Applying the rule (concrete checks)

1. New string in a component, persona, or prompt? Write it in English.
   If the original thought was Spanish, translate before committing.
2. Reviewing a PR? Grep the diff for Spanish keywords inside JSX
   (`nueva`, `mensaje`, `parar`, `pensando`, `escribiendo`, `aterrice`,
   `ocultar`, `mandar`, `cargar`, etc.). Any hit in a user-visible string
   or in a persona prompt is a regression.
3. Adding an antidrift pack to a guard? Prefer the `_EN` variant of the
   pattern catalog (`packs.DEFAULT_EN`, `ASSISTANT_TONE_EN`,
   `MORALIZING_EN`). The bilingual aggregates (`DEFAULT_BILINGUAL`,
   `ALL_AI_DISCLOSURE`) carry Spanish patterns too; that's fine for a
   product whose chrome is bilingual, not for this one.
4. Touching a placeholder, `aria-label`, `title`, or empty-state copy?
   Same rule — they're user-visible to keyboard / screen-reader users.
5. Found Spanish in an existing file you're editing? Migrate it in the
   same PR. Boy-scout rule.

## What this rule does NOT forbid

- Emoji is not the topic here (see `personas/roast.md`: "no emoji in the
  roast"). This rule is about LANGUAGE, not glyphs.
- Spanish in commit messages of dependencies / vendored code is out of
  scope — only this repo's authored files.
- The agent's response language. The roast is the product; the chrome is
  the frame.
