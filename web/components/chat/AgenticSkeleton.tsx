"use client";

import { getUIIcon } from "../../lib/icons";

const FlameIcon = getUIIcon("brand");

/** Loading skeleton for the agentic modes (roast / brief).
 *
 *  Picks up the LLD §5 default loading copy and paints a few pulsing text
 *  bars that loosely mirror an eventual markdown response. Clinical mode
 *  uses <EnvelopeSkeleton> instead — that one ships the envelope-shaped
 *  scaffolding (roast_line stripe, body, micro-action box, follow-up)
 *  because the clinical output is structured JSON rendered into that
 *  shape. Painting the envelope skeleton for roast/brief would lie about
 *  what's coming back.
 *
 *  The 12s slow-banner for roast/brief lives in <ThinkingPanel>, not here
 *  — that way the banner placement stays the same whether the panel or
 *  this skeleton is in view, and we don't double-paint the warning. */
export function AgenticSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-label="cooking a response with guardrails">
      <div className="iai-hint iai-hint-live inline-flex items-center gap-2 text-xs">
        <FlameIcon className="iai-flame h-3.5 w-3.5" aria-hidden />
        <span>cooking a response with guardrails…</span>
      </div>

      <div className="flex flex-col gap-2">
        <div className="h-3 w-11/12 animate-pulse rounded bg-zinc-800" />
        <div className="h-3 w-full animate-pulse rounded bg-zinc-800" />
        <div className="h-3 w-5/6 animate-pulse rounded bg-zinc-800" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-zinc-800" />
      </div>
    </div>
  );
}
