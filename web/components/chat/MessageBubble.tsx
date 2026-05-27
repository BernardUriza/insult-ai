"use client";

import { getStatusIcon, getUIIcon } from "../../lib/icons";
import { ReceiptsPanel } from "../roast/ReceiptsPanel";
import { RoastText } from "../roast/RoastText";
import { PlanChecklist } from "./PlanChecklist";
import { ThinkingPanel } from "./ThinkingPanel";
import type { ChatMessage, ChatMeta } from "./types";
import { useVoicePlayback } from "./useVoicePlayback";

const DoneIcon = getStatusIcon("done");
const WarnIcon = getStatusIcon("warning");
const ErrorIcon = getStatusIcon("error");
const SpeakerIcon = getUIIcon("speaker");
const PauseIcon = getUIIcon("pause");

/** Speaker button — POST /voice/speak with the assistant's roast text and
 * play the returned MP3. Only renders once the message is settled (status
 * !== "streaming") because synthesizing a partial roast wastes credits and
 * the result would be cut off anyway. Compact, lives at the bottom of the
 * bubble next to the meta footer.
 *
 * Voice is always "onyx" here — the user-facing voice toggle lives in
 * /chat settings (TODO) rather than per-message. Defaulting to onyx is the
 * brand match (deadpan anchor) and per-message switching invites paradox of
 * choice for a button that is, fundamentally, "read this back to me". */
function ListenButton({ text }: { text: string }) {
  const { state, error, toggle } = useVoicePlayback(text, "onyx");
  if (!text.trim()) return null;
  const label =
    state === "playing"
      ? "stop playback"
      : state === "loading"
        ? "synthesizing…"
        : "listen to this";
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={state === "loading"}
      className={`iai-btn-chip mt-3 ${
        state === "playing" ? "border-iai-fire/60 text-iai-fire" : ""
      }`}
      title={error ?? label}
      aria-label={label}
      aria-pressed={state === "playing"}
    >
      {state === "loading" ? (
        <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
        </svg>
      ) : state === "playing" ? (
        <PauseIcon className="h-3.5 w-3.5" aria-hidden />
      ) : (
        <SpeakerIcon className="h-3.5 w-3.5" aria-hidden />
      )}
      <span className="text-xs">
        {state === "playing" ? "stop" : state === "loading" ? "loading" : "listen"}
      </span>
    </button>
  );
}

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
  // Worst guard level decides the icon: warning/critical → triangle, else check.
  const worstGuard = meta.guard_levels
    ? Object.values(meta.guard_levels).find((l) => l === "critical" || l === "warning")
    : undefined;
  const Indicator = worstGuard ? WarnIcon : DoneIcon;
  return (
    <div className="iai-hint mt-3 flex flex-wrap items-center gap-x-2 text-[10px] uppercase tracking-wide">
      <Indicator
        className={`h-3 w-3 ${worstGuard ? "text-amber-400" : "text-emerald-400"}`}
        aria-hidden
      />
      {parts.map((p, i) => (
        <span key={i}>{p}</span>
      ))}
    </div>
  );
}

/** Render one chat message. User → right-aligned plain bubble. Assistant →
 * left-aligned card with: thinking steps (collapsible) + roast text (with the
 * **sententia** highlight as in RoastView) + receipts panel.
 *
 * ``target`` (optional) is the user message that prompted THIS assistant turn
 * — ChatView pulls it from the message before this one. The ThinkingPanel
 * uses it for the live "Unlocking <target>…" label (UNLOCKED tagline tie-in
 * for the hackathon). */
export function MessageBubble({
  message,
  target,
}: {
  message: ChatMessage;
  target?: string;
}) {
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
  return (
    <div className="flex w-full justify-start">
      <div className="iai-card w-full">
        {/* Plan checklist (signal) sits ABOVE the raw thinking panel (detail).
            Both can be present — they read different events (plan vs tool_call)
            and one of them may be empty depending on the backend (codex doesn't
            capture MCP inputs → no derived plan events). */}
        <PlanChecklist plan={message.plan} />
        <ThinkingPanel steps={message.steps} status={message.status} target={target} />
        {message.content && (
          <RoastText text={message.content} caret={message.status === "streaming"} />
        )}
        {message.status === "error" && (
          <div className="iai-error mt-2 inline-flex items-center gap-2 text-sm">
            <ErrorIcon className="h-4 w-4 shrink-0 text-red-400" aria-hidden />
            {message.errorMessage ?? "stream failed"}
          </div>
        )}
        {message.receipts.length > 0 && (
          <div className="mt-3">
            <ReceiptsPanel urls={message.receipts} />
          </div>
        )}
        {/* Listen button — only after the message is settled (streaming
          * partial roasts wastes Whisper credits and produces a cut-off
          * audio). Hidden on error/empty too. */}
        {message.status !== "streaming" &&
          message.status !== "error" &&
          message.content && <ListenButton text={message.content} />}
        {message.meta && <MetaFooter meta={message.meta} />}
      </div>
    </div>
  );
}
