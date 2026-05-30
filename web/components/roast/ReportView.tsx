"use client";

import Image from "next/image";
import type { CSSProperties } from "react";
import { useState } from "react";
import { getUIIcon } from "../../lib/icons";
import { AgenticSkeleton } from "../chat/AgenticSkeleton";
import { MarkdownRenderer } from "../chat/MarkdownRenderer";
import type { ChatMessage } from "../chat/types";

const FlameIcon = getUIIcon("brand");
const CopyIcon = getUIIcon("copy");
const CheckIcon = getUIIcon("check");
const SpeakerIcon = getUIIcon("speaker");
const PauseIcon = getUIIcon("pause");
const ErrorIcon = getUIIcon("close");

const HEADER: Record<"roast" | "brief", string> = { roast: "Roast", brief: "Brief" };
const EMPTY: Record<"roast" | "brief", { headline: string; subcopy: string }> = {
  roast: {
    headline: "What are we roasting today?",
    subcopy: "Paste a URL or a claim above. I'll fetch the evidence and see if it survives.",
  },
  brief: {
    headline: "Who needs a brief?",
    subcopy: "Drop a company or claim above. I'll pressure-test it against live signals.",
  },
};

function urlHost(value: string): string | null {
  const trimmed = value.trim();
  if (!/^https?:\/\/\S+$/i.test(trimmed)) return null;
  try {
    return new URL(trimmed).host.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function EvidenceDeck({
  mode,
  host,
}: {
  mode: "roast" | "brief";
  host: string | null;
}) {
  const armed = Boolean(host);
  const cards =
    mode === "brief"
      ? ["Signals", "Market", "Receipts"]
      : ["Target", "Claims", "Receipts"];

  return (
    <div className={`iai-empty-deck ${armed ? "is-armed" : ""}`} aria-hidden>
      <div className="iai-empty-deck-stage">
        {cards.map((label, i) => (
          <div key={label} className="iai-empty-deck-card" style={{ "--i": i } as CSSProperties}>
            <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-iai-fire">
                {label}
              </span>
              <span className="h-1.5 w-1.5 rounded-full bg-iai-accent shadow-[0_0_12px_rgb(77_248_226/0.7)]" />
            </div>
            <div className="flex flex-1 flex-col justify-end gap-2 p-3">
              <span className="h-1.5 w-9/12 rounded-full bg-white/18" />
              <span className="h-1.5 w-7/12 rounded-full bg-white/12" />
              <span className="h-1.5 w-10/12 rounded-full bg-white/10" />
            </div>
          </div>
        ))}
      </div>
      <div className="iai-empty-deck-target">
        {host ?? "Paste a URL"}
      </div>
    </div>
  );
}

/** Hostname-only label for a receipt URL — compact "Sources" line. */
function sourceLabel(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Right column of the report view: the agent's response as a card.
 *
 *  Mirrors MessageBubble's render decision (skeleton while thinking, caret
 *  while streaming, markdown when settled) but as a standalone report panel
 *  — header with a Copy button, the response body, an inline compact
 *  "Sources" line (not the heavy ReceiptsPanel), and a listen toggle.
 *
 *  Renders the LATEST assistant turn. roast/brief are one-target-one-report,
 *  so showing the latest (not a scrollback) matches the product shape. */
export function ReportView({
  mode,
  message,
  draft = "",
  onSpeak,
  speakingId,
}: {
  mode: "roast" | "brief";
  message: ChatMessage | null;
  draft?: string;
  onSpeak?: (text: string | null, id: string) => void;
  speakingId?: string | null;
}) {
  const [copied, setCopied] = useState(false);

  // Empty — no turn yet. The input bar is above; this is the canvas.
  if (!message || message.role !== "assistant") {
    const empty = EMPTY[mode];
    const host = urlHost(draft);
    return (
      <div className="iai-card iai-kinetic-panel flex min-h-[44vh] items-center justify-center overflow-hidden text-center">
        <div className="iai-kinetic-content grid w-full items-center gap-6 md:grid-cols-[1fr_1.05fr] md:text-left">
          <div className="flex flex-col items-center gap-3 md:items-start">
            <Image
              src="/logo.png"
              alt=""
              width={91}
              height={72}
              priority
              className="iai-drift-slow opacity-90 drop-shadow-[0_0_24px_rgb(var(--color-iai-fire-rgb)/0.4)]"
            />
            <div className="inline-flex items-center gap-2 text-base font-semibold text-zinc-100">
              <FlameIcon className="iai-wobble-slow h-4 w-4 text-iai-fire" aria-hidden />
              {host ? `${host} is on the table.` : empty.headline}
            </div>
            <div className="iai-hint max-w-prose text-sm">
              {host
                ? "The evidence deck is armed. Send it and I'll turn the fetches into a cited cross-exam."
                : empty.subcopy}
            </div>
          </div>
          <EvidenceDeck mode={mode} host={host} />
        </div>
      </div>
    );
  }

  const isSpeaking = speakingId === message.id;
  const live = message.status === "thinking" || message.status === "streaming";
  const settled = message.status !== "streaming" && message.status !== "thinking";
  const canCopy = settled && !!message.content;

  const onCopy = () => {
    if (!message.content) return;
    void navigator.clipboard.writeText(message.content).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className={`iai-card flex flex-col gap-3 ${live ? "iai-kinetic-panel" : ""}`}>
      <div className="iai-kinetic-content flex items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-base font-bold text-zinc-100">
          <FlameIcon className="iai-flame iai-wobble-slow h-5 w-5" aria-hidden />
          {HEADER[mode]}
        </h2>
        {canCopy && (
          <button
            type="button"
            onClick={onCopy}
            className="iai-btn-chip text-xs"
            aria-label="Copy the response"
          >
            {copied ? (
              <>
                <CheckIcon className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
                Copied
              </>
            ) : (
              <>
                <CopyIcon className="h-3.5 w-3.5" aria-hidden />
                Copy
              </>
            )}
          </button>
        )}
      </div>

      {/* Body — same three-state decision as MessageBubble, minus the
          clinical-envelope branch (report modes ship plain markdown). */}
      <div className="iai-kinetic-content">
        {!message.content && live && <AgenticSkeleton />}
        {message.content && message.status === "streaming" && (
          <MarkdownRenderer content={message.content} caret stripReceipts />
        )}
        {message.content && settled && (
          <MarkdownRenderer content={message.content} stripReceipts />
        )}
      </div>

      {message.status === "error" && (
        <div className="iai-error iai-kinetic-content inline-flex items-center gap-2 text-sm">
          <ErrorIcon className="h-4 w-4 shrink-0 text-red-400" aria-hidden />
          {message.errorMessage ?? "stream failed"}
        </div>
      )}

      {/* Sources — compact inline line (hostnames), not the heavy panel. */}
      {message.receipts.length > 0 && (
        <div className="iai-kinetic-content flex flex-wrap items-center gap-x-1.5 gap-y-1 border-t border-iai-border/60 pt-3 text-xs">
          <span className="iai-hint">Sources:</span>
          {message.receipts.map((u, i) => (
            <span key={u} className="inline-flex items-center gap-1.5">
              {i > 0 && <span className="text-zinc-700">·</span>}
              <a
                href={u}
                target="_blank"
                rel="noopener noreferrer"
                className="text-iai-link hover:underline"
              >
                {sourceLabel(u)}
              </a>
            </span>
          ))}
        </div>
      )}

      {settled && message.status !== "error" && message.content && onSpeak && (
        <button
          type="button"
          onClick={() => onSpeak(isSpeaking ? null : message.content, message.id)}
          className={`iai-btn-chip iai-kinetic-content self-start ${isSpeaking ? "border-iai-fire/60 text-iai-fire" : ""}`}
          aria-pressed={isSpeaking}
        >
          {isSpeaking ? (
            <PauseIcon className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <SpeakerIcon className="h-3.5 w-3.5" aria-hidden />
          )}
          <span className="text-xs">{isSpeaking ? "stop" : "listen"}</span>
        </button>
      )}
    </div>
  );
}
