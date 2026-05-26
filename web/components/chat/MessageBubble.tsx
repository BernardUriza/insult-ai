"use client";

import { ReceiptsPanel } from "../roast/ReceiptsPanel";
import { ThinkingPanel } from "./ThinkingPanel";
import type { ChatMessage, ChatMeta } from "./types";

/** Compact per-turn observability footer — projection of fi_runner's
 * `turn_completed` event ("✓ 2.3s · 4 tools · 1,234 tokens · guards: ok").
 * Renders nothing when `meta` is null (turn errored or never closed). */
function MetaFooter({ meta }: { meta: ChatMeta }) {
  const parts: string[] = [];
  if (typeof meta.latency_ms === "number") parts.push(`${(meta.latency_ms / 1000).toFixed(2)}s`);
  if (typeof meta.tool_count === "number") parts.push(`${meta.tool_count} tools`);
  // `tokens` is whatever the backend reported (Claude/Codex differ); extract a
  // canonical "total" if we can guess it. Anthropic-shaped → input+output_tokens.
  const tk = meta.tokens as Record<string, unknown> | null | undefined;
  if (tk) {
    const inp = typeof tk.input_tokens === "number" ? tk.input_tokens : 0;
    const out = typeof tk.output_tokens === "number" ? tk.output_tokens : 0;
    const total = inp + out;
    if (total > 0) parts.push(`${total.toLocaleString()} tokens`);
  }
  if (meta.guard_levels) {
    const levels = Object.values(meta.guard_levels);
    const worst = levels.find((l) => l === "critical") ?? levels.find((l) => l === "warning") ?? "ok";
    if (worst !== "ok") parts.push(`guards: ${worst}`);
  }
  if (typeof meta.replayed_messages === "number" && meta.replayed_messages > 0) {
    parts.push(`replay ${meta.replayed_messages}`);
  }
  if (parts.length === 0) return null;
  return (
    <div className="iai-hint mt-3 flex flex-wrap gap-x-2 text-[10px] uppercase tracking-wide">
      <span>✓</span>
      {parts.map((p, i) => (
        <span key={i}>{p}</span>
      ))}
    </div>
  );
}

/** Render one chat message. User → right-aligned plain bubble. Assistant →
 * left-aligned card with: thinking steps (collapsible) + roast text (with the
 * **sententia** highlight as in RoastView) + receipts panel. */
export function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="iai-card-soft max-w-[85%] whitespace-pre-wrap text-zinc-100">
          {message.content}
        </div>
      </div>
    );
  }

  // assistant
  const parts = message.content.split(/(\*\*[^*]+\*\*)/g);
  return (
    <div className="flex w-full justify-start">
      <div className="iai-card w-full">
        <ThinkingPanel steps={message.steps} status={message.status} />
        {message.content && (
          <div className="iai-roast">
            {parts.map((p, i) =>
              p.startsWith("**") && p.endsWith("**") ? (
                <strong key={i} className="iai-sententia">
                  {p.slice(2, -2)}
                </strong>
              ) : (
                <span key={i}>{p}</span>
              ),
            )}
            {/* Soft caret while text is still streaming so the user sees life. */}
            {message.status === "streaming" && <span className="ml-0.5 animate-pulse">▍</span>}
          </div>
        )}
        {message.status === "error" && (
          <div className="iai-error mt-2 text-sm">⚠️ {message.errorMessage ?? "stream failed"}</div>
        )}
        {message.receipts.length > 0 && (
          <div className="mt-3">
            <ReceiptsPanel urls={message.receipts} />
          </div>
        )}
        {message.meta && <MetaFooter meta={message.meta} />}
      </div>
    </div>
  );
}
