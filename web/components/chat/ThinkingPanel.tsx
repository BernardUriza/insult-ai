"use client";

import { useState } from "react";
import { getStatusIcon, getToolIcon, getUIIcon, shortToolName, stepStatusKey } from "../../lib/icons";
import type { Step } from "./types";

const BotIcon = getUIIcon("bot");

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
}: {
  steps: Step[];
  status: "thinking" | "streaming" | "done" | "error";
  target?: string;
}) {
  // Default expanded while live; user can override either way after.
  const live = status === "thinking" || status === "streaming";
  const [openOverride, setOpenOverride] = useState<boolean | null>(null);
  const open = openOverride ?? live;

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
      {open && steps.length > 0 && (
        <ol className="mt-2 space-y-1">
          {steps.map((s, i) => {
            const ToolIcon = getToolIcon(s.name);
            const statusKey = stepStatusKey(s.isError);
            const StatusIcon = getStatusIcon(statusKey);
            const errored = statusKey === "error";
            const pending = statusKey === "pending";
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
                <StatusIcon
                  className={`ml-auto h-3.5 w-3.5 shrink-0 ${
                    pending ? "animate-spin text-zinc-500" : errored ? "text-red-400" : "text-emerald-400"
                  }`}
                  aria-label={statusKey}
                />
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
