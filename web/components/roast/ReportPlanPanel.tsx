"use client";

import {
  getToolIcon,
  shortToolName,
  stepStatusKey,
} from "../../lib/icons";
import { PlanChecklist } from "../chat/PlanChecklist";
import type { ChatMessage } from "../chat/types";

const EMPTY_STEPS = [
  "Read the target",
  "Search for context",
  "Collect receipts",
  "Write the burn",
];

/** Left column of the report view: the agent's plan + the raw tool calls it
 *  made, plus the REAL total time/tools/tokens from the turn meta.
 *
 *  Honesty rule (per the approved scope): there is NO per-step timing on the
 *  wire — `step_done` carries a summary + status, never a duration. So this
 *  panel does NOT fabricate "0.7s / 4.2s" per step. It shows humanized step
 *  labels + status, and the ONE real timing we have: the turn total from
 *  `meta.latency_ms`. If there's no meta yet (turn in flight / errored), the
 *  total line is hidden — never a guessed number.
 */
export function ReportPlanPanel({ message }: { message: ChatMessage | null }) {
  if (!message || message.role !== "assistant") {
    return (
      <aside className="iai-card-soft flex flex-col gap-4 bg-iai-bg/70 text-sm backdrop-blur-md">
        <div className="flex flex-col gap-2">
          <p className="iai-tag self-start">Plan</p>
          <h2 className="text-lg font-bold text-zinc-100">
            How the roast gets built
          </h2>
          <p className="leading-relaxed text-zinc-300">
            Drop a URL or claim. I&apos;ll inspect it, gather receipts, check
            the plan, then write the roast.
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

  const steps = message.steps;
  const meta = message.meta;
  const totalMs = typeof meta?.latency_ms === "number" ? meta.latency_ms : null;
  const toolCount = typeof meta?.tool_count === "number" ? meta.tool_count : steps.length;

  return (
    <div className="flex flex-col gap-4">
      <PlanChecklist plan={message.plan} />

      {steps.length > 0 && (
        <div className="iai-card-soft iai-kinetic-panel text-sm">
          <div className="iai-kinetic-content mb-2 flex items-center justify-between gap-2 text-zinc-300">
            <span className="font-medium">Steps</span>
            <span className="iai-hint text-xs tabular-nums">{steps.length}</span>
          </div>
          <ol className="iai-kinetic-content space-y-1">
            {steps.map((s, i) => {
              const ToolIcon = getToolIcon(s.name);
              const statusKey = stepStatusKey(s.isError);
              const errored = statusKey === "error";
              const pending = statusKey === "pending";
              const done = statusKey === "done";
              // Bright Data steps are the live-web fetches — the hackathon's
              // "Application of Technology" proof. Make them UNMISSABLE: a
              // brand-blue left rail + the "Bright Data" wordmark badge (the
              // product has no logo asset; the wordmark in BD's Pantone blue
              // IS the brand identity, same as PoweredBy). Other steps
              // (task_tracker, ToolSearch) stay quiet.
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
                    s.server && (
                      <span className="iai-hint text-[10px] uppercase">{s.server}</span>
                    )
                  )}
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                      pending
                        ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
                        : errored
                          ? "border-red-400/30 bg-red-400/10 text-red-300"
                          : "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
                    }`}
                    aria-label={statusKey}
                  >
                    {pending ? "running" : done ? "done" : "error"}
                  </span>
                </li>
              );
            })}
          </ol>

          {/* Real totals only — the per-step timing the mockup showed does
              not exist on the wire, so it's omitted rather than faked. */}
          {(totalMs != null || toolCount > 0) && (
            <div className="iai-hint iai-kinetic-content mt-3 flex items-center justify-between border-t border-iai-border/60 pt-2 text-xs">
              <span>Total</span>
              <span className="tabular-nums text-zinc-400">
                {[
                  totalMs != null ? `${(totalMs / 1000).toFixed(1)}s` : null,
                  `${toolCount} tools`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
