"use client";

import { useState } from "react";
import {
  getToolIcon,
  getUIIcon,
  shortToolName,
} from "../../lib/icons";
import { PlanChecklist } from "../chat/PlanChecklist";
import { latestOpenToolIndex, toolStatusLabel, toolVisualStatus } from "../chat/toolStatus";
import type { ChatMessage, Step } from "../chat/types";

type AssistantMessage = Extract<ChatMessage, { role: "assistant" }>;

const CheckIcon = getUIIcon("check");

const EMPTY_STEPS = [
  "Read the target",
  "Search for context",
  "Collect receipts",
  "Cross-examine the claim",
];

function totalsLabel(totalMs: number | null, toolCount: number): string {
  return [
    totalMs != null ? `${(totalMs / 1000).toFixed(1)}s` : null,
    `${toolCount} tools`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The raw tool-call list. Shared by the live side-panel and the settled bar's
 *  expanded body. `live` drives the kinetic glow + the in-flight "active" pip;
 *  a settled render passes live=false so nothing animates. */
function StepsList({
  steps,
  live,
  latestPendingIndex,
  totalMs,
  toolCount,
}: {
  steps: Step[];
  live: boolean;
  latestPendingIndex: number;
  totalMs: number | null;
  toolCount: number;
}) {
  if (steps.length === 0) return null;
  return (
    <div className={`iai-card-soft text-sm ${live ? "iai-kinetic-panel" : ""}`}>
      <div className="iai-kinetic-content mb-2 flex items-center justify-between gap-2 text-zinc-300">
        <span className="font-medium">Steps</span>
        <span className="iai-hint text-xs tabular-nums">{steps.length}</span>
      </div>
      <ol className="iai-kinetic-content space-y-1">
        {steps.map((s, i) => {
          const ToolIcon = getToolIcon(s.name);
          const statusKey = toolVisualStatus(s, i, latestPendingIndex, live);
          const errored = statusKey === "error";
          const active = statusKey === "active";
          // Bright Data steps are the live-web fetches — the hackathon's
          // "Application of Technology" proof. Brand-blue rail + wordmark badge.
          const isBrightData = s.server === "brightdata";
          return (
            <li
              key={s.id ?? `${s.name}-${i}`}
              className={`flex items-center gap-2 rounded-md text-xs ${
                errored ? "text-red-400" : "text-zinc-400"
              } ${isBrightData ? "border-l-2 border-iai-brand/60 bg-iai-brand/5 pl-1.5" : ""}`}
            >
              <span className="iai-hint w-4 shrink-0 text-right tabular-nums">{i + 1}</span>
              <ToolIcon
                className={`h-3.5 w-3.5 shrink-0 ${isBrightData ? "text-iai-brand" : ""}`}
                aria-hidden
              />
              <span className="flex-1 truncate">{shortToolName(s.name)}</span>
              {isBrightData ? (
                <span className="inline-flex shrink-0 items-center rounded-full border border-iai-brand/40 bg-iai-brand/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-iai-brand">
                  Bright Data
                </span>
              ) : (
                s.server && <span className="iai-hint text-[10px] uppercase">{s.server}</span>
              )}
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${
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
      {(totalMs != null || toolCount > 0) && (
        <div className="iai-hint iai-kinetic-content mt-3 flex items-center justify-between border-t border-iai-border/60 pt-2 text-xs">
          <span>Total</span>
          <span className="tabular-nums text-zinc-400">{totalsLabel(totalMs, toolCount)}</span>
        </div>
      )}
    </div>
  );
}

/** Settled state: a full-width horizontal TOOLBAR (not the narrow side column).
 *  Collapsed it's a single bar; clicking expands it DOWNWARD (vertical
 *  accordion) to reveal the plan + steps full-width, then the roast keeps the
 *  rest of the room. Own component so its useState doesn't sit behind the
 *  parent's conditional returns (hook-order safety). */
function PlanBar({ message }: { message: AssistantMessage }) {
  const [open, setOpen] = useState(false);
  const steps = message.steps;
  const meta = message.meta;
  const totalMs = typeof meta?.latency_ms === "number" ? meta.latency_ms : null;
  const toolCount = typeof meta?.tool_count === "number" ? meta.tool_count : steps.length;
  const planSteps = message.plan?.steps ?? [];
  const planDone = planSteps.filter((s) => s.status === "done").length;

  return (
    <div className="iai-card-soft">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left text-xs text-zinc-400 transition-colors hover:text-zinc-200"
        aria-expanded={open}
        aria-label={open ? "Hide the plan and steps" : "Show the plan and steps"}
      >
        <span className="inline-flex items-center gap-2">
          <CheckIcon className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
          <span className="font-semibold text-zinc-200">Plan complete</span>
          {planSteps.length > 0 && (
            <span className="iai-hint">
              {planDone}/{planSteps.length} steps
            </span>
          )}
        </span>
        <span className="iai-hint shrink-0 tabular-nums">
          {totalsLabel(totalMs, toolCount)} · {open ? "hide" : "show steps"}
        </span>
      </button>
      {open && (
        <div className="mt-3 flex flex-col gap-3 border-t border-iai-border/60 pt-3">
          <PlanChecklist plan={message.plan} />
          <StepsList
            steps={steps}
            live={false}
            latestPendingIndex={-1}
            totalMs={totalMs}
            toolCount={toolCount}
          />
        </div>
      )}
    </div>
  );
}

/** The agent's plan + raw tool calls.
 *
 *  Two shapes, picked by `variant`:
 *    - "panel" (live): the tall side-column view — watch the plan tick + tools
 *      fire while the turn runs.
 *    - "bar" (settled): a full-width horizontal toolbar that collapses
 *      vertically, so a finished turn hands the width back to the roast text.
 *
 *  Honesty rule: there's NO per-step timing on the wire, so this never fakes
 *  "0.7s / step" — it shows step labels + status + the one real number, the
 *  turn total from meta.latency_ms.
 */
export function ReportPlanPanel({
  message,
  variant = "panel",
}: {
  message: ChatMessage | null;
  variant?: "panel" | "bar";
}) {
  if (!message || message.role !== "assistant") {
    // The bar only exists for a settled turn; nothing to show without one.
    if (variant === "bar") return null;
    return (
      <aside className="iai-card-soft flex flex-col gap-4 bg-iai-bg/70 text-sm backdrop-blur-md">
        <div className="flex flex-col gap-2">
          <p className="iai-tag self-start">Plan</p>
          <h2 className="text-lg font-bold text-zinc-100">How the roast gets built</h2>
          <p className="leading-relaxed text-zinc-300">
            Drop a URL or claim. I&apos;ll inspect it, gather receipts, check the
            plan, then write the roast.
          </p>
        </div>
        <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
          {EMPTY_STEPS.map((step, i) => (
            <li
              key={step}
              className="flex items-center gap-3 rounded-lg border border-iai-border/70 bg-iai-surface/35 px-3 py-2 text-zinc-200"
            >
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-iai-fire/35 bg-iai-fire/10 text-xs font-bold text-iai-fire">
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </aside>
    );
  }

  if (variant === "bar") return <PlanBar message={message} />;

  // "panel" — the live side column.
  const steps = message.steps;
  const meta = message.meta;
  const totalMs = typeof meta?.latency_ms === "number" ? meta.latency_ms : null;
  const toolCount = typeof meta?.tool_count === "number" ? meta.tool_count : steps.length;
  const live = message.status === "thinking" || message.status === "streaming";
  const latestPendingIndex = live ? latestOpenToolIndex(steps) : -1;

  return (
    <div className="flex flex-col gap-4">
      <PlanChecklist plan={message.plan} />
      <StepsList
        steps={steps}
        live={live}
        latestPendingIndex={latestPendingIndex}
        totalMs={totalMs}
        toolCount={toolCount}
      />
    </div>
  );
}
