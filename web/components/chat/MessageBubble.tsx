"use client";

import { ReceiptsPanel } from "../roast/ReceiptsPanel";
import { ThinkingPanel } from "./ThinkingPanel";
import type { ChatMessage } from "./types";

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
      </div>
    </div>
  );
}
