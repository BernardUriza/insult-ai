/** Wire types for the /chat/stream SSE feed and the in-memory chat model.
 *
 * Keep this file pure data + helpers — no React, no fetch. The hook (useChat)
 * consumes these and the components only see the in-memory ChatMessage. */

export type ChatMode = "roast" | "brief" | "clinical";
export type ChatTone = "soft" | "medium" | "spicy" | "no_insults";

/** One Bright Data / RAG tool call surfaced as a "thinking step". Mirrors the
 * sanitized payload the backend sends (see app.py:_tool_call_safe — `input` is
 * dropped on purpose; the real sources land in `receipts` on the result). */
export type Step = {
  /** Stable id from the backend (Anthropic tool_use_id). Today useChat does a
   * wholesale REPLACE of the steps array on the `result` event, so this isn't
   * strictly needed for correctness — but it's the React key for live steps
   * and the join key if we ever switch to merge-not-replace (to animate the
   * pending→done transition instead of swapping the list). */
  id: string | null;
  /** raw tool name, e.g. `mcp__brightdata__search_engine` or `Bash`. */
  name: string;
  /** MCP server (`brightdata`, `rag_store`) or null for built-ins. */
  server: string | null;
  /** known result status; `null` = still running / unknown. */
  isError: boolean | null;
};

/** One step inside the agent's declared plan. Mirrors the wire contract
 * (PlanWire/StepStartedWire/StepDoneWire — see api/insult_ai/wire.py) but
 * carries the local UI state (`status`) which is composed client-side from
 * the sequence of `plan` / `step_started` / `step_done` SSE events.
 *
 * Status machine: `pending` → `running` (on step_started) → `done` | `failed`
 * (on step_done). The `failed` state is non-fatal — the agent may still continue
 * with the next step. */
export type PlanStep = {
  /** Agent-authored short imperative label, e.g. "Scrape acme.com landing". */
  label: string;
  status: "pending" | "running" | "done" | "failed";
  /** One-line factual summary the agent attached on complete_step (what it
   * actually got back). Persona-bound to be factual, not roast-flavored — safe
   * to render verbatim. */
  summary?: string;
  /** Failure reason on fail_step. */
  error?: string;
};

/** A pre-execution rejection emitted by fi-runner's PlanGuard when a declared
 * plan step matches a blocked ethics pattern (see runner.py:_ETHICS_BLOCKLIST).
 * The rejection is SOFT — the stream KEEPS GOING; the agent's retry path picks
 * up the reinforcement and re-declares. The UI surfaces this so a viewer sees
 * "the agent tried to go off-policy and the guardrail caught it" — that's the
 * trust story this hackathon is selling. */
export type PlanRejection = {
  reason: string;
  matched: Array<{ index: number; label: string }>;
  guard: string | null;
};

/** The agent's plan for a turn — committed up-front via declare_plan, then the
 * UI ticks each step as start_step / complete_step land. The plan is a CONTRACT
 * with the UI (see personas/roast.md: "Skipping declare_plan is a regression"),
 * so its presence is the signal that the checklist view is meaningful. */
export type Plan = {
  steps: PlanStep[];
  /** Set when the PlanGuard rejected the most recent declared plan. A
   * subsequent `plan` event (the agent re-declared) clears this back to null. */
  rejection?: PlanRejection | null;
};

/** Per-turn observability — fi_runner's `turn_completed` event projected to
 * the wire. Composed by the API after the stream settles (see app.py:gen),
 * driven from the same data the server logs. Shown as a small footer below
 * the receipts ("✓ 2.3s · 4 tools · 1,234 tokens"). */
export type ChatMeta = {
  latency_ms?: number | null;
  tool_count?: number | null;
  mcp_count?: number | null;
  tokens?: Record<string, unknown> | null;
  guard_levels?: Record<string, string> | null;
  attempts?: number | null;
  model?: string | null;
  replayed_messages?: number | null;
};

export type ChatMessage =
  | { id: string; role: "user"; content: string }
  | {
      id: string;
      role: "assistant";
      /** Live text accumulated from `text` events. Replaced wholesale on the
       * `result` event (post-guard text may differ from the live concatenation
       * — antidrift can rewrite, see runner.py guards). */
      content: string;
      steps: Step[];
      /** Null until the agent's first `declare_plan` of the turn lands. Stays
       * null on backends that don't capture MCP inputs (codex — see
       * fi_runner._derive_plan_events) so the UI must tolerate both shapes. */
      plan: Plan | null;
      receipts: string[];
      usage: Record<string, unknown> | null;
      meta: ChatMeta | null;
      status: "thinking" | "streaming" | "done" | "error";
      errorMessage?: string;
    };

// Note: `receiptsFrom` now lives in `lib/text.ts` and is imported by both
// useRoast and useChat. Keep this file React-free and wire-shape-only.
