"use client";

import { getStatusIcon, getUIIcon } from "../../lib/icons";
import type { Plan } from "./types";

const PlanIcon = getUIIcon("plan");
const WarnIcon = getStatusIcon("warning");

/** The agent's plan-of-action as a live checklist. Renders ONLY when the
 * agent called `declare_plan` (the persona's "PLAN BEFORE YOU ACT" contract —
 * see personas/roast.md). On backends that don't surface MCP inputs (codex —
 * see fi_runner._derive_plan_events) the plan stays null and this component
 * draws nothing — the ThinkingPanel below carries the live detail in that case.
 *
 * Visual rule: signal > detail. This panel says WHAT the agent committed to;
 * the ThinkingPanel below shows every tool_call as it happens. Two views,
 * intentionally separate — one is the contract, the other is the audit trail. */
export function PlanChecklist({ plan }: { plan: Plan | null }) {
  if (!plan || plan.steps.length === 0) return null;

  const done = plan.steps.filter((s) => s.status === "done").length;
  const total = plan.steps.length;
  const rejection = plan.rejection ?? null;
  // Index → matched-step map so we can highlight the rows the guard tripped on
  // without rescanning the matched list per row.
  const matchedIndexes = new Set(rejection?.matched.map((m) => m.index) ?? []);

  return (
    <div className="iai-card-soft mb-2 text-sm">
      <div className="flex items-center justify-between gap-2 text-zinc-300">
        <span className="inline-flex items-center gap-2 font-medium">
          <PlanIcon className="h-4 w-4 text-zinc-400" aria-hidden />
          plan
        </span>
        <span className="iai-hint text-xs tabular-nums">
          {done} / {total}
        </span>
      </div>
      {rejection && (
        <div className="mt-2 flex items-start gap-2 rounded border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-200">
          <WarnIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden />
          <div className="flex flex-col gap-0.5">
            <span className="font-medium">PlanGuard blocked this plan</span>
            <span className="text-amber-200/80">{rejection.reason}</span>
            {rejection.guard && (
              <span className="iai-hint text-[10px] uppercase tracking-wide text-amber-300/60">
                guard: {rejection.guard}
              </span>
            )}
          </div>
        </div>
      )}
      <ol className="mt-2 space-y-1.5">
        {plan.steps.map((step, i) => {
          const isRunning = step.status === "running";
          const isPending = step.status === "pending";
          const isDone = step.status === "done";
          const isFailed = step.status === "failed";
          const isRejected = matchedIndexes.has(i);
          const labelTone = isRejected
            ? "text-amber-300 line-through decoration-amber-500/60"
            : isFailed
              ? "text-red-400"
              : isDone
                ? "text-zinc-300"
                : isRunning
                  ? "text-zinc-100"
                  : "text-zinc-500";
          const railTone = isFailed
            ? "text-red-400"
            : isDone
              ? "text-emerald-400 bg-emerald-400"
              : isRunning
                ? "text-amber-300 bg-amber-300"
                : "text-zinc-600 bg-zinc-700";
          return (
            <li key={i} className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2 text-xs">
                <span
                  className={`h-5 w-1 shrink-0 rounded-full ${railTone} ${
                    isRunning ? "shadow-[0_0_10px_rgb(251_191_36/0.45)]" : ""
                  }`}
                  aria-label={step.status}
                />
                <span className={`flex-1 truncate ${labelTone}`}>{step.label}</span>
                {isPending && (
                  <span className="iai-hint text-[10px] uppercase tracking-wide">queued</span>
                )}
                {isRunning && (
                  <span className="text-[10px] uppercase tracking-wide text-amber-300">
                    running
                  </span>
                )}
              </div>
              {/* Summary / error renders under the row to keep the checklist
                  scannable. Persona-bound to be one short line — no wrapping
                  CSS guard needed. */}
              {step.summary && isDone && (
                <div className="iai-hint pl-5 font-mono text-[11px] text-zinc-500">
                  {step.summary}
                </div>
              )}
              {step.error && isFailed && (
                <div className="pl-5 font-mono text-[11px] text-red-400/80">{step.error}</div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
