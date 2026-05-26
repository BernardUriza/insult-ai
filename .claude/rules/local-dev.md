# Local dev — environment gotchas the hard way

Every entry below cost real wall-clock time to debug. Read this before
spinning up local services from scratch.

## Port collisions (Postgres 5432, Next.js 3000)

Bernard's machine runs OTHER projects with persistent dev servers:

- **Tilt** (Kubernetes dev tool) holds **localhost:5432** with its own
  Postgres. Any container that binds `127.0.0.1:5432:5432` will be
  shadowed — packets go to Tilt, our DB never sees them, asyncpg gets
  "InvalidPasswordError" because Tilt's PG has different credentials.
  → `infra/docker-compose.dev.yml` uses **5433** on purpose.
- **Archestra.AI** (`next-server` PID 3956, started ~Monday in this
  machine's life) holds **localhost:3000**. Our Next.js binds the
  same port on IPv6 `*:3000` but `127.0.0.1:3000` resolves to
  archestra first. → run `web/` with `PORT=3100 npm run dev`.

How to verify before debugging "auth fails / wrong app loads":

```bash
lsof -i :5432 -sTCP:LISTEN   # who owns postgres?
lsof -i :3000 -sTCP:LISTEN   # who owns next?
```

If anything other than our container/process is listed, move our port.

## Docker on macOS NATs source IPs

The default Postgres `pg_hba.conf` includes `host all all 127.0.0.1/32
trust` — but Docker Desktop on macOS does NAT, so connections from the
host arrive at the container with a source IP that is NOT 127.0.0.1.
They fall through to `host all all all scram-sha-256` and require a real
password. Don't waste time on `POSTGRES_HOST_AUTH_METHOD=trust` to "fix"
the password — the password works fine once the port collision (above)
is resolved.

## Next.js 16 + Turbopack: cross-origin guard breaks hydration

Next.js 16 dev refuses to serve `_next/font` and other internals when
the Origin header doesn't match its `allowedDevOrigins` list. Default
is `localhost` only. If you load the page via `http://127.0.0.1:3100`,
the font request 403s, partial hydration leaves event handlers
disconnected, and React inputs go DEAD (controlled-input
`onChange` never fires, send buttons stay disabled forever).

→ Always load the dev URL as **`http://localhost:3100`**, NOT
`http://127.0.0.1:3100`. Or add `127.0.0.1` to `allowedDevOrigins` in
`next.config.ts` if you must.

## React 19 + Turbopack: `fill()` doesn't trigger `onChange`

The chrome-devtools MCP `fill` tool sets `.value` via the native
setter and dispatches an `input` event — that's enough for React 18.
React 19's controlled-input path doesn't observe it. Symptoms: the
input shows the text, but the React state stays empty, and any button
gated by `!draft.trim()` stays disabled.

Workaround order:

1. **`click` the input first** to focus it, then `type_text` (real
   keyboard simulation, fires beforeinput/input/keydown — React 19
   accepts this).
2. If that's not enough, `evaluate_script` →
   `el.focus(); document.execCommand("insertText", false, value)`.
3. Avoid using `setter.call(el, value) + dispatchEvent(Event("input"))`
   — that's the pattern that fails on React 19.

## asyncpg + scram-sha-256 false alarm

Auth failures against a fresh Postgres container can LOOK like a
"asyncpg 0.31 + postgres 16 SCRAM incompatibility" — they're almost
always a port collision (above) routing your connection to another
Postgres entirely. Verify the source IP postgres sees with
`SET log_connections='on'`; if your connection attempts don't even
land in the container's logs, you're talking to a different server.

## free-intelligence pin discipline (cross-repo dep)

This repo consumes `fi-runner` and `fi-core` from the
`free-intelligence` monorepo's `dev` branch via git+https. When
free-intelligence bumps fi-core (e.g. 0.23 → 0.24) without bumping
fi-runner's `fi-core>=X,<Y` pin, **pip resolution dies for every
downstream consumer** (`fi-core 0.24.x conflicts with fi-runner
requires <0.24`).

Symptom: `mamba env update` fails on `ResolutionImpossible`.

Fix (in free-intelligence, NOT here): edit
`apps/packages/fi-runner/pyproject.toml`, bump the pin's upper bound
to match the new fi-core minor, commit + push to `dev`. THIS repo's
`environment.yml` doesn't need a change — it tracks `dev`.

This is a CROSS-REPO interaction Bernard owns. Don't push to
free-intelligence without his explicit go-ahead, but DO flag the
exact one-line fix when you hit the symptom.

## fi-core's `__init__.py` vs `pyproject.toml` version drift

free-intelligence occasionally has `__init__.py` (e.g. `0.22.0`) and
`pyproject.toml` (e.g. `0.23.0`) out of sync. This shows up when
inspecting "what version am I on" locally. The git-installed wheel
takes the `pyproject.toml` value as canonical (that's what pip sees);
`__init__.py.__version__` is documentation. When in doubt, trust
`pip show fi-core` / `pip show fi-runner`.

## Local pgvector workflow

```bash
docker compose -f infra/docker-compose.dev.yml up -d   # PG+vector on :5433
# wait for healthcheck, then:
# api/.env: FI_RAG_BACKEND=pgvector
#          FI_RAG_PGVECTOR_DSN=postgresql://insultai:insultai@127.0.0.1:5433/insultai
# (NO "localhost" in the DSN — see Docker NAT note above. 127.0.0.1 fine
# here because asyncpg → Docker port mapping → container, all on loopback.)
```

`PgVectorChunkStore` auto-creates the `vector` extension + the two
tables on first connect. No migration step.

## Smoke scripts go in `api/_smoke_*.py` then `rm` them

Throwaway scripts to validate a single thing (smoke-test pgvector,
poke an endpoint, hand-call a fi-runner API). Keep them under
`api/_smoke_*.py` (underscore-prefixed so they don't look like
package code), don't commit, `rm` when the question is answered.
The throwaway is the point — they document what was checked.
