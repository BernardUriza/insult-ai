# Architecture

## Thin consumer of fi-runner

This repo does NOT reimplement an agent loop. It builds a `fi-runner` `Runner`
and exposes it. Verified API (read the fi-runner source before assuming anything):

```python
from fi_runner import (
    ClaudeCodeBackend, CodexBackend,
    MCPServerSpec, PermissionMode, Runner, ToolPolicy,
)

runner = Runner(
    backend=agent_backend,            # ClaudeCodeBackend(...) or CodexBackend(...)
    persona=ROAST_PERSONA,            # the system prompt — this repo's main contribution
    extra_mcp_servers=[BRIGHTDATA_MCP],
    tool_policy=ToolPolicy(permission_mode=PermissionMode.BYPASS),
)
result = await runner.run("Roast & fact-check this using live web data: ...")
```

- Keep `runner.py` declarative: config in, `Runner` out. No business logic.
- If you need behavior that other fi-runner consumers would want, contribute it
  **upstream to fi-runner**, then bump the dependency. Don't fork logic here.

## Two backends — selected at runtime, never hardcoded

`INSULT_AI_BACKEND` env var picks the engine:

| value    | backend            | auth                                              |
|----------|--------------------|---------------------------------------------------|
| `claude` | `ClaudeCodeBackend`| `CLAUDE_CODE_OAUTH_TOKEN` (or `ANTHROPIC_API_KEY`)|
| `codex`  | `CodexBackend`     | `AZURE_OPENAI_API_KEY` + `AZURE_OPENAI_ENDPOINT`  |

Both must work. When adding features, test against both — a change that only
works on one backend is a regression.

## The CLIs are NOT Python packages — they're npm binaries

`fi-runner` **shells out to external CLIs** (`claude`, `codex`). conda installs
the Python library; it does NOT bring those CLIs. The container/dev env must
`npm install -g @anthropic-ai/claude-code @openai/codex` (and `@brightdata/mcp`)
separately. If `runner.run()` fails with "command not found", that's this.

## Claude Code requires a non-root user

`ClaudeCodeBackend` refuses to run as root and needs a writable `$HOME` for
`~/.claude/.credentials.json`. The Dockerfile creates a non-root user; don't
revert that. `entrypoint.sh` materializes `CLAUDE_CODE_OAUTH_TOKEN` into the
credentials file at boot.

## Runner is cheap; the backend is expensive — cache the backend

`build_runner()` is called per turn (cheap config holder). But constructing
a `ClaudeCodeBackend` / `CodexBackend` spawns SDK clients + an MCP subprocess
pool — heavy, ~1-3s overhead. `runner.py` keeps a process-wide cache keyed
by backend NAME (`_BACKENDS: dict[str, ClaudeCodeBackend | CodexBackend]`) so
the second `/chat/stream` turn reuses the same backend instance + its already-
spawned `npx @brightdata/mcp` subprocess. Don't accidentally undo this when
refactoring — the cache is what makes multi-turn chat feel responsive.

## fi-runner surfaces this repo doesn't fully use yet

Catalog of leverage on the table (each one short-circuits work this repo
might otherwise reinvent):

- `PlanGuard` (`fi_runner.plan_guard`) — pre-execution review of a declared
  plan, deterministic regex/predicate, soft-rejects via `plan_rejected`
  stream event. **Wired** as of the ETHICS PlanGuard commit; consumers may
  add more guards by composing predicates. `Runner.plan_guard` is a single
  slot — wrap if you need multi-policy.
- `preflight.probe_mcp` / `probe_all` — fast roundtrip probe of an MCP
  server. Drop-in for a real `/health` that doesn't just return `{"ok": true}`
  while Bright Data is wedged. Not wired yet.
- `FlowNarrator` — Runner's default: every turn's mechanical Mermaid flow
  gets narrated by the backend itself in the background (second call, doesn't
  block the turn; drained on `aclose()`). Useful for the "auditable cognition"
  story in the demo. Disable in benches (`runner.flow_narrator = None`) to
  keep latency measurements honest.
- `RagStoreClient` (`fi_runner.rag_store`) — boundary-clean async client for
  the rag_store backend WITHOUT importing `fi_core`. Used by `/documents`;
  returns plain dicts. Same `FI_RAG_*` env as the MCP server — ingest here,
  search from the agent there.
- `ConversationStore` — `InMemoryConversationStore` for local/single-replica
  dev; `RedisConversationStore` exists for multi-replica deploy. Swap is a
  constructor arg, no other code change.
- `_derive_plan_events` — Runner's stream re-emits `plan` / `step_started` /
  `step_done` events when the agent calls task_tracker MCP tools. The
  consumer just has to forward them — no parsing of tool names needed.

When a feature feels like "we'd build that here", check if fi-runner already
exposes it before writing the local version. The thin-consumer rule means
NEW reusable behavior belongs upstream in fi-runner; we just import and
configure.

## Voice loop — Azure OpenAI Whisper + TTS, backend-proxied

The app ships a ChatGPT-style voice loop: user holds the mic, `Whisper`
transcribes, the agent runs, the user clicks "listen", `TTS` (voice
`onyx` by default) reads the response back. Two endpoints, both on the
same `X-API-Key` + SlowAPI rate-limit floor as `/roast`:

- `POST /voice/transcribe` — multipart audio → JSON `{text}`. Whisper
  proxy; the frontend posts the MediaRecorder blob unmodified (webm /
  mp4 — both accepted by Whisper without transcoding).
- `POST /voice/speak` — `{text, voice}` → audio/mpeg blob. TTS proxy.
  `Cache-Control: private, max-age=3600` so a user replaying a roast
  doesn't re-hit Azure each time.

Wiring: `api/insult_ai/voice.py` (HTTP client to Azure deployments) +
`api/insult_ai/app.py` (endpoints) + `web/components/chat/AudioPlayer.tsx`
+ `useTtsBlob.ts` + `useVoiceCapture.ts` + `useAudioAnalysis.ts` +
`PulseRings.tsx` + `RecordingTimer.tsx`.

**Backend proxy, NOT frontend direct.** The Azure OpenAI key never lives
in the bundle. `NEXT_PUBLIC_API_KEY` is the user-facing gate; the Azure
key is a Container App secret. Same threat model as `/roast`.

**Quota awareness.** The `whisper` + `tts` deployments on `insult-openai`
ship with `capacity: 1` by default (1 RPM). We bumped them to capacity 3
in this session (3 RPM) — the subscription quota cap. Raising past that
requires an Azure quota-increase request. The frontend hooks +
backend `voice.py` honor `Retry-After`: 429 from Azure propagates as
HTTP 429 + `Retry-After` header through the API, and `voiceRetry.ts`
respects it (max 2 retries, exponential fallback).

## Aurity port pattern — extract essence, not copy-paste

When a useful component lives in another Bernard repo (currently
`free-intelligence/apps/aurity`), the port discipline is:

1. **Identify the essence** — the load-bearing pattern that solves the
   problem (e.g. floating-bar player, VAD pulse rings reactive to
   audioLevel, markdown renderer with GFM).
2. **Adapt to this repo's design system** — `iai-*` classes, `iai-fire`
   token, `iai-card-sample`, etc. NOT aurity's `aplay-*` or `rec-*`
   class system.
3. **Drop dependencies that aren't load-bearing** — aurity ships a
   `useChatVoiceRecorder` with 30s chunked Deepgram streaming; we don't
   need it (our `/voice/transcribe` is single-POST). aurity's
   `AudioPlayerContext` is multi-player; we lift one floating player to
   the page level. Cut features that fit aurity's product but not ours.
4. **Add the deps that ARE load-bearing** — `framer-motion` for
   animations, `react-markdown` + `remark-gfm` for GFM. Adding two npm
   deps is fine; vendoring a half-baked replacement is not.

The shipped port (commit `3be2cbc`) is the template — read its diff
when porting next time.

## Clinical mode — three personas, two output shapes

`roast` + `brief` are agentic (Bright Data MCP, plan + steps, plain
text output). `clinical` is conversational (no MCP, no plan, JSON
envelope output). The dispatch is THREE tables in `runner.py`
(`_PERSONA_BY_MODE`, `_GUARDS_BY_MODE`, `_PROMPT_BY_MODE`) — adding a
mode is THREE entries + ONE file in `personas/`. Engine untouched.

For the clinical contract (envelope, safety classifier, judge,
crisis fallback), see `clinical.md`. The judge in
`api/insult_ai/judge.py` is **local** to this repo — it is NOT a
consumer of `xair`. xair is repo-automation / CI; this judge is
conversational-quality, in-process.

## CI/CD — both halves auto-deploy from master

Push to master with `web/**` changes → SWA workflow → live at
`iai.bernarduriza.com` in ~90s. Push with `api/**` changes →
Container Apps workflow → API image rolled to a new revision in
~2min. Details in `deploy.md`.

OIDC federated identity (no long-lived SP secret). GHCR for image
registry (public package after the first manual flip). Soft `/health`
probe gates the API workflow green.

## Reference architecture

This design imitates a proven private Claude-Code-headless-in-a-container setup
(conda base + npm CLIs + non-root + token-to-credentials entrypoint). When in
doubt about infra, that pattern is the source of truth, not guesswork.
