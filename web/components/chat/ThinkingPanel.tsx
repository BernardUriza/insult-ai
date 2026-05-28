"use client";

import { useEffect, useState } from "react";
import { getStatusIcon, getToolIcon, getUIIcon, shortToolName } from "../../lib/icons";
import { latestOpenToolIndex, toolStatusLabel, toolVisualStatus } from "./toolStatus";
import type { Step } from "./types";
import type { ChatMode } from "./types";

const BotIcon = getUIIcon("bot");
const WarnIcon = getStatusIcon("warning");

/** When a roast/brief turn drags past this threshold, surface a quiet
 *  reassurance line so the dead air doesn't read as broken. Clinical mode
 *  has its own slow-banner inside <EnvelopeSkeleton> — this one only fires
 *  for the agentic modes. */
const SLOW_THRESHOLD_MS = 12_000;

/** Collapsible "thinking" panel that lists every Bright Data / RAG step
 * as it happens. Auto-expands while the turn is streaming and collapses on
 * `done` so the conversation doesn't get noisy in retrospective view.
 *
 * The "thinking…" label reads as boring; the demo's selling point is that
 * the agent is LIVE-FETCHING the web right now via Bright Data MCP. When the
 * caller passes `target`, the empty-state label leans into that:
 * "Unlocking acme.com…" reads as "we are pulling fresh data right this
 * second" — which is literally what's happening. Tag-line tie-in to the
 * hackathon's "Web Data UNLOCKED" theming. */
export function ThinkingPanel({
  steps,
  status,
  target,
  mode = "roast",
}: {
  steps: Step[];
  status: "thinking" | "streaming" | "done" | "error";
  target?: string;
  /** Drives the slow-response banner: only fires when mode !== "clinical".
   *  Clinical mode delegates the slow-banner to <EnvelopeSkeleton>, whose
   *  voice + shape are tuned to that persona. */
  mode?: ChatMode;
}) {
  // Default expanded while live; user can override either way after.
  const live = status === "thinking" || status === "streaming";
  const [openOverride, setOpenOverride] = useState<boolean | null>(null);
  const open = openOverride ?? live;

  // Elapsed-time tick only matters for the agentic modes (roast / brief).
  // The interval is cleared the moment the turn settles or the panel
  // unmounts; no leaked timers across turns.
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!live || mode === "clinical") {
      setElapsed(0);
      return;
    }
    const start = Date.now();
    const t = setInterval(() => setElapsed(Date.now() - start), 500);
    return () => clearInterval(t);
  }, [live, mode]);
  const showSlowBanner = live && mode !== "clinical" && elapsed >= SLOW_THRESHOLD_MS;

  if (steps.length === 0 && status === "done") return null;

  // Trim long targets so the header doesn't blow the layout. A claim like
  // "Elon Musk founded OpenAI" is fine inline; a 80-char URL is not.
  const shortTarget =
    target && target.length > 36 ? `${target.slice(0, 33).trim()}…` : target;

  const summary =
    status === "thinking"
      ? shortTarget
        ? `Unlocking ${shortTarget}…`
        : "thinking…"
      : status === "streaming" && steps.length === 0
        ? "writing…"
        : `${steps.length} ${steps.length === 1 ? "step" : "steps"}`;
  const latestPendingIndex = live ? latestOpenToolIndex(steps) : -1;

  return (
    <div className="iai-card-soft mb-2 text-sm">
      <button
        type="button"
        onClick={() => setOpenOverride(!open)}
        className="flex w-full items-center justify-between gap-2 text-left text-zinc-300 hover:text-zinc-100"
        aria-expanded={open}
      >
        <span className="inline-flex items-center gap-2 font-medium">
          <BotIcon className="h-4 w-4 text-zinc-400" aria-hidden />
          {summary}
        </span>
        <span className="iai-hint text-xs">{open ? "hide" : "show"}</span>
      </button>
      {showSlowBanner && (
        <div
          className="mt-2 inline-flex items-start gap-2 rounded-lg border border-amber-700/40 bg-amber-950/20 p-2.5 text-xs text-amber-200"
          role="status"
        >
          <WarnIcon className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-400" aria-hidden />
          <span>Still working. Receipts take a second.</span>
        </div>
      )}
      {open && steps.length > 0 && (
        <ol className="mt-2 space-y-1">
          {steps.map((s, i) => {
            const ToolIcon = getToolIcon(s.name);
            const statusKey = toolVisualStatus(s, i, latestPendingIndex, live);
            const errored = statusKey === "error";
            const active = statusKey === "active";
            return (
              <li
                key={s.id ?? `${s.name}-${i}`}
                className={`flex items-center gap-2 font-mono text-xs ${
                  errored ? "text-red-400" : "text-zinc-400"
                }`}
              >
                <ToolIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate">{shortToolName(s.name)}</span>
                {s.server && s.server !== "brightdata" && (
                  <span className="iai-hint text-[10px] uppercase">· {s.server}</span>
                )}
                <span
                  className={`ml-auto rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-wide ${
                    active
                      ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
                      : statusKey === "sent"
                        ? "border-zinc-500/25 bg-zinc-500/10 text-zinc-400"
                        : errored
                          ? "border-red-400/30 bg-red-400/10 text-red-300"
                          : "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
                  }`}
                  aria-label={statusKey}
                >
                  {toolStatusLabel(statusKey)}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
