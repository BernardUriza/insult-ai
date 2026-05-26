/** Wire types for the /chat/stream SSE feed and the in-memory chat model.
 *
 * Keep this file pure data + helpers — no React, no fetch. The hook (useChat)
 * consumes these and the components only see the in-memory ChatMessage. */

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
      receipts: string[];
      usage: Record<string, unknown> | null;
      meta: ChatMeta | null;
      status: "thinking" | "streaming" | "done" | "error";
      errorMessage?: string;
    };

/** Derive a UI label for a tool name. Strips the `mcp__<server>__` prefix so
 * the step reads as ``🔍 search_engine`` instead of ``🔍 mcp__brightdata__…``. */
export function stepLabel(name: string): { icon: string; short: string } {
  const short = name.replace(/^mcp__[^_]+__/, "");
  const lower = short.toLowerCase();
  let icon = "⚙️";
  if (lower.includes("search")) icon = "🔍";
  else if (lower.includes("scrape") || lower.includes("fetch")) icon = "📄";
  else if (lower.includes("browser")) icon = "🌐";
  else if (lower.includes("document") || lower.includes("rag")) icon = "📚";
  return { icon, short };
}

/** URLs under the last "Receipts" heading (fallback: every URL), de-duped.
 * Lifted from useRoast so the chat reuses the same heuristic as single-shot. */
export function receiptsFrom(text: string): string[] {
  const marks = [...text.matchAll(/receipts?/gi)];
  const last = marks.at(-1);
  const tail = last?.index != null ? text.slice(last.index) : text;
  const urls = tail.match(/https?:\/\/[^\s)\]>"']+/g) ?? [];
  return [...new Set(urls)];
}
