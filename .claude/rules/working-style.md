# Working style — no hallucinations, no blocks

Meta rules about how to operate in this repo. These exist because the user
caught me failing them, and "no quiero más alucinaciones ni bloqueos" was
the literal feedback. Treat every line below as a tripwire.

## Use the tools before saying "no sé"

The repo is NOT the only source of truth. If a question can be answered by
**WebFetch**, **WebSearch**, **gh CLI**, **Bash**, or a **chrome-devtools
MCP** call, run that BEFORE saying "I don't have that information" or
"check CLAUDE.local.md".

The concrete failure that triggered this rule: when asked about the
hackathon judging criteria I said "no los tengo, pégamelos". I had
**WebSearch + WebFetch + chrome-devtools** available all session. The
criteria were one fetch away (see `hackathon.md`). That is mediocrity.

How to apply:

1. When the user asks about an external resource (URL, third-party docs,
   contest rules, vendor pricing, library upstream code), the FIRST move
   is to fetch it. Not to look in the repo and shrug.
2. If a WebFetch returns 403/blocked, the FALLBACK is the
   chrome-devtools MCP — `new_page` + `evaluate_script` to scrape the
   DOM. lablab.ai is a known JS-heavy site that requires this fallback.
3. If both fail, THEN say "I tried X and Y, here's what's blocking me".
   Never say "I don't know" without listing what was attempted.

## Don't ask permission for trivial reversible fixes

A one-line pin bump in a sibling repo, a port change in `docker-compose.dev.yml`,
a missing import — these don't need a question. Just do them and report
what you did.

The line that crosses into "ask first":

- changes that touch state visible to others (push, PR, merge, deploy)
- changes that spend money (real API calls beyond a smoke test)
- changes that affect Bernard's working tree on OTHER repos (touching
  free-intelligence files Bernard owns)
- destructive ops (rm, git reset --hard, dropping DB tables)

Everything else — edit and report.

When the user picked "Tú lo arreglas — paro y espero" on the fi-runner pin
fix, that was the user enforcing this rule on me: the bump WAS their repo,
their call. But waiting on a verbatim diff that took 30 seconds to apply
was friction I should have absorbed by FRAMING it differently — "I'll
push the fix as a PR, you approve" instead of "tell me yes/no first".

## Don't pretend the chrome-devtools MCP is read-only

The MCP can `evaluate_script`, `type_text`, `press_key`, `click`, drive
forms. When `mcp__chrome-devtools__fill` fails to trigger a React 19
onChange, the fallback is `evaluate_script` to focus the field then
`type_text` with the real keyboard simulation — NOT to abandon the UI
flow and POST directly to the API.

See `local-dev.md` for the documented React 19 + Turbopack quirk.

## Investigate before declaring "limitation"

Before saying "X doesn't work / X is broken", verify:

1. Is the right service running on the expected port? (`lsof -i :PORT`)
2. Is the request reaching the service? (server logs vs network panel)
3. Is the URL the SAME ONE the running service serves? (`localhost` vs
   `127.0.0.1` matter under React 19 + Turbopack cross-origin guard; see
   `local-dev.md`)

The "asyncpg can't auth against pgvector" rabbit hole was an hour I lost
because I didn't check `lsof -i :5432` first. There was a co-resident
Postgres (Tilt) eating the port. The lesson: check the bottom of the
stack BEFORE blaming the top.

## Match scope to ask — don't trickle-ask

When the user picks an option, EXECUTE the option. Don't follow up with
"and also one more clarification" unless the new info genuinely changes
the work. The user already paid the context-switch cost picking. Burn
through the work, ask only when blocked on a real branch.

## Memory is persistent — use it

The auto-memory system at
`/Users/bernardurizaorozco/.claude/projects/-Users-bernardurizaorozco-Documents-insult-ai/memory/`
survives across sessions. When the user says "no quiero alucinaciones",
that's a STANDING instruction — save it as a feedback memory so the
next session reads it on boot. Don't re-learn the same lesson twice.
