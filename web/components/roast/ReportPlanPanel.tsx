"use client";

import {
  getStatusIcon,
  getToolIcon,
  shortToolName,
  stepStatusKey,
} from "../../lib/icons";
import { PlanChecklist } from "../chat/PlanChecklist";
import type { ChatMessage } from "../chat/types";

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
  if (!message || message.role !== "assistant") return null;

  const steps = message.steps;
  const meta = message.meta;
  const totalMs = typeof meta?.latency_ms === "number" ? meta.latency_ms : null;
  const toolCount = typeof meta?.tool_count === "number" ? meta.tool_count : steps.length;

  return (
    <div className="flex flex-col gap-4">
      <PlanChecklist plan={message.plan} />

      {steps.length > 0 && (
        <div className="iai-card-soft text-sm">
          <div className="mb-2 flex items-center justify-between gap-2 text-zinc-300">
            <span className="font-medium">Steps</span>
            <span className="iai-hint text-xs tabular-nums">{steps.length}</span>
          </div>
          <ol className="space-y-1">
            {steps.map((s, i) => {
              const ToolIcon = getToolIcon(s.name);
              const statusKey = stepStatusKey(s.isError);
              const StatusIcon = getStatusIcon(statusKey);
              const errored = statusKey === "error";
              const pending = statusKey === "pending";
              return (
                <li
                  key={s.id ?? `${s.name}-${i}`}
                  className={`flex items-center gap-2 text-xs ${errored ? "text-red-400" : "text-zinc-400"}`}
                >
                  <span className="iai-hint w-4 shrink-0 text-right tabular-nums">{i + 1}</span>
                  <ToolIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="flex-1 truncate">{shortToolName(s.name)}</span>
                  {s.server && s.server !== "brightdata" && (
                    <span className="iai-hint text-[10px] uppercase">{s.server}</span>
                  )}
                  <StatusIcon
                    className={`h-3.5 w-3.5 shrink-0 ${
                      pending
                        ? "animate-spin text-zinc-500"
                        : errored
                          ? "text-red-400"
                          : "text-emerald-400"
                    }`}
                    aria-label={statusKey}
                  />
                </li>
              );
            })}
          </ol>

          {/* Real totals only — the per-step timing the mockup showed does
              not exist on the wire, so it's omitted rather than faked. */}
          {(totalMs != null || toolCount > 0) && (
            <div className="iai-hint mt-3 flex items-center justify-between border-t border-iai-border/60 pt-2 text-xs">
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
