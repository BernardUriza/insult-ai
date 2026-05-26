"use client";

import { useState } from "react";
import { type Step, stepLabel } from "./types";

/** Collapsible "🤖 pensando…" panel that lists every Bright Data / RAG step
 * as it happens. Auto-expands while the turn is streaming and collapses on
 * `done` so the conversation doesn't get noisy in retrospective view. */
export function ThinkingPanel({
  steps,
  status,
}: {
  steps: Step[];
  status: "thinking" | "streaming" | "done" | "error";
}) {
  // Default expanded while live; user can override either way after.
  const live = status === "thinking" || status === "streaming";
  const [openOverride, setOpenOverride] = useState<boolean | null>(null);
  const open = openOverride ?? live;

  if (steps.length === 0 && status === "done") return null;

  const summary =
    status === "thinking"
      ? "🤖 pensando…"
      : status === "streaming" && steps.length === 0
        ? "🤖 escribiendo…"
        : `🤖 ${steps.length} ${steps.length === 1 ? "paso" : "pasos"}`;

  return (
    <div className="iai-card-soft mb-2 text-sm">
      <button
        type="button"
        onClick={() => setOpenOverride(!open)}
        className="flex w-full items-center justify-between gap-2 text-left text-zinc-300 hover:text-zinc-100"
        aria-expanded={open}
      >
        <span className="font-medium">{summary}</span>
        <span className="iai-hint text-xs">{open ? "▾ ocultar" : "▸ ver"}</span>
      </button>
      {open && steps.length > 0 && (
        <ol className="mt-2 space-y-1">
          {steps.map((s, i) => {
            const { icon, short } = stepLabel(s.name);
            const errored = s.isError === true;
            const pending = s.isError === null;
            return (
              <li
                key={s.id ?? `${s.name}-${i}`}
                className={`flex items-center gap-2 font-mono text-xs ${
                  errored ? "text-red-400" : "text-zinc-400"
                }`}
              >
                <span>{icon}</span>
                <span className="truncate">{short}</span>
                {s.server && s.server !== "brightdata" && (
                  <span className="iai-hint text-[10px] uppercase">· {s.server}</span>
                )}
                <span aria-hidden className="ml-auto">
                  {errored ? "✗" : pending ? "…" : "✓"}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
