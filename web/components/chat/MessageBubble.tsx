"use client";

import { getStatusIcon, getUIIcon } from "../../lib/icons";
import { ReceiptsPanel } from "../roast/ReceiptsPanel";
import { RoastText } from "../roast/RoastText";
import {
  ClinicalEnvelopeTrace,
  ClinicalEnvelopeView,
  parseEnvelope,
} from "./ClinicalEnvelope";
import { EnvelopeSkeleton } from "./EnvelopeSkeleton";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { PlanChecklist } from "./PlanChecklist";
import { ThinkingPanel } from "./ThinkingPanel";
import type { ChatMessage, ChatMeta } from "./types";

const DoneIcon = getStatusIcon("done");
const WarnIcon = getStatusIcon("warning");
const ErrorIcon = getStatusIcon("error");
const SpeakerIcon = getUIIcon("speaker");
const PauseIcon = getUIIcon("pause");

/** Compact per-turn observability footer — projection of fi_runner's
 * `turn_completed` event ("✓ 2.3s · 4 tools · 1,234 tokens · guards: ok").
 * Renders nothing when `meta` is null (turn errored or never closed). */
function MetaFooter({ meta }: { meta: ChatMeta }) {
  const parts: string[] = [];
  if (typeof meta.latency_ms === "number") parts.push(`${(meta.latency_ms / 1000).toFixed(2)}s`);
  if (typeof meta.tool_count === "number") parts.push(`${meta.tool_count} tools`);
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

/** Listen-button: small chip-style toggle. Doesn't own the player — only
 * tells the parent "I want THIS bubble's text in the floating player."
 * The page-level AudioPlayer takes it from there.
 *
 * Three visual states reflect parent state:
 *   - default     : "🔊 listen" (idle, ready to request)
 *   - speaking    : "⏸ stop"   (this bubble's text is in the active player)
 *   - other-active: "🔊 listen" (another bubble is playing — clicking
 *                                here re-targets the player) */
function ListenButton({
  onClick,
  isActive,
}: {
  onClick: () => void;
  isActive: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`iai-btn-chip mt-3 ${isActive ? "border-iai-fire/60 text-iai-fire" : ""}`}
      title={isActive ? "stop playback" : "listen to this"}
      aria-pressed={isActive}
    >
      {isActive ? (
        <PauseIcon className="h-3.5 w-3.5" aria-hidden />
      ) : (
        <SpeakerIcon className="h-3.5 w-3.5" aria-hidden />
      )}
      <span className="text-xs">{isActive ? "stop" : "listen"}</span>
    </button>
  );
}

/** Render one chat message. User → right-aligned plain bubble. Assistant →
 * left-aligned card with: thinking steps (collapsible) + roast text (now
 * rendered via MarkdownRenderer so bullets/headers/code/blockquotes work)
 * + receipts panel + listen button.
 *
 * The listen button surfaces a callback (`onSpeak`) instead of owning the
 * playback itself; the page lifts the AudioPlayer state so only ONE bar
 * is ever visible at a time. */
export function MessageBubble({
  message,
  target,
  onSpeak,
  speakingId,
}: {
  message: ChatMessage;
  target?: string;
  /** Called when the user hits "listen" on this bubble. Pass null to stop. */
  onSpeak?: (text: string | null, id: string) => void;
  /** The id of the message whose text is currently in the floating player. */
  speakingId?: string | null;
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
  const isSpeaking = speakingId === message.id;
  const handleSpeak = onSpeak
    ? () => onSpeak(isSpeaking ? null : message.content, message.id)
    : undefined;

  return (
    <div className="flex w-full justify-start">
      <div className="iai-card w-full">
        {/* Plan checklist (signal) sits ABOVE the raw thinking panel (detail).
            Both can be present — they read different events (plan vs tool_call)
            and one of them may be empty depending on the backend. */}
        <PlanChecklist plan={message.plan} />
        <ThinkingPanel steps={message.steps} status={message.status} target={target} />
        {/* Rendering rules:
          *   - Thinking with no content yet: paint the EnvelopeSkeleton so
          *     the 25-40s clinical wait isn't a blank card. The skeleton
          *     mirrors the eventual envelope shape (roast line + body bars
          *     + action box + follow-up) AND surfaces the slow-banner at
          *     12s / "still going" at 30s. We can't yet tell clinical
          *     from roast/brief from here, so we show the skeleton on
          *     ANY in-flight assistant turn that doesn't have content —
          *     the bars work for both shapes.
          *   - Streaming with content: lighter <RoastText> with a caret.
          *     The envelope isn't valid mid-stream (partial JSON), so we
          *     can't parse it yet. Don't try.
          *   - Settled: try to parse as a clinical envelope. If it
          *     parses, use <ClinicalEnvelopeView>. If not, fall back to
          *     <MarkdownRenderer> (roast/brief modes ship plain text).
          * One bubble renderer, three mode shapes + a loading mode —
          * picked at runtime without the bubble knowing what mode the
          * page is in. */}
        {!message.content && (message.status === "thinking" || message.status === "streaming") && (
          <EnvelopeSkeleton />
        )}
        {message.content && message.status === "streaming" && (
          <RoastText text={message.content} caret={true} />
        )}
        {message.content &&
          message.status !== "streaming" &&
          (() => {
            const env = parseEnvelope(message.content);
            return env ? (
              <>
                <ClinicalEnvelopeView env={env} />
                <ClinicalEnvelopeTrace env={env} />
              </>
            ) : (
              <MarkdownRenderer content={message.content} />
            );
          })()}
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
        {message.status !== "streaming" &&
          message.status !== "error" &&
          message.content &&
          handleSpeak && (
            <ListenButton onClick={handleSpeak} isActive={isSpeaking} />
          )}
        {message.meta && <MetaFooter meta={message.meta} />}
      </div>
    </div>
  );
}
