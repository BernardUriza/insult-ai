"use client";

import { useEffect, useState } from "react";
import { getStatusIcon, getUIIcon } from "../../lib/icons";

const FlameIcon = getUIIcon("brand");
const WarnIcon = getStatusIcon("warning");

/** Skeleton paint while the clinical envelope is in-flight.
 *
 * The clinical turn takes ~25-40s end-to-end (the persona prompt is ~15K
 * tokens; first call to Azure misses the prompt cache). 30 seconds of
 * "thinking…" with no visual feedback reads as broken. The skeleton
 * paints the envelope's eventual shape — roast_line stripe, body bars,
 * action box, follow-up — so the user knows what's coming and roughly
 * where the wait is in the pipeline.
 *
 * Plus: a slow-response banner that flips on after 12 seconds with the
 * persona's voice intact ("sigo cocinando, no me abandones como a ese
 * correo"). After 30s the banner switches to a reassuring "casi listo"
 * line. Both keep the persona consistent during the dead air. */
const SLOW_THRESHOLD_MS = 12_000;
const STILL_GOING_THRESHOLD_MS = 30_000;

export function EnvelopeSkeleton() {
  const [elapsed, setElapsed] = useState(0);

  // Tick every 500ms. Cheap, accurate enough for the banner switching.
  useEffect(() => {
    const start = Date.now();
    const t = setInterval(() => setElapsed(Date.now() - start), 500);
    return () => clearInterval(t);
  }, []);

  const slow = elapsed >= SLOW_THRESHOLD_MS;
  const stillGoing = elapsed >= STILL_GOING_THRESHOLD_MS;

  return (
    <div className="flex flex-col gap-3" aria-label="cooking a roast with guardrails">
      {/* Status line — quiet, persona-consistent. */}
      <div className="iai-hint iai-hint-live inline-flex items-center gap-2 text-xs">
        <FlameIcon className="iai-flame h-3.5 w-3.5" aria-hidden />
        <span>cooking a roast with clinical guardrails…</span>
      </div>

      {/* Slow-banner — kicks in at 12s with the persona's voice. */}
      {slow && !stillGoing && (
        <div
          className="inline-flex items-start gap-2 rounded-lg border border-amber-700/40 bg-amber-950/20 p-2.5 text-xs text-amber-200"
          role="status"
        >
          <WarnIcon className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-400" aria-hidden />
          <span>
            still cooking. I won't abandon you like that email. promise: worth
            the wait.
          </span>
        </div>
      )}
      {stillGoing && (
        <div
          className="inline-flex items-start gap-2 rounded-lg border border-amber-700/40 bg-amber-950/20 p-2.5 text-xs text-amber-200"
          role="status"
        >
          <WarnIcon className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-400" aria-hidden />
          <span>
            almost there. the model is using the full persona context — this
            isn't lag, it's real thinking.
          </span>
        </div>
      )}

      {/* Roast-line slot — fire-italic line. */}
      <div className="inline-flex items-start gap-2">
        <FlameIcon className="iai-flame h-4 w-4 mt-1 shrink-0" aria-hidden />
        <div className="h-3.5 w-2/3 animate-pulse rounded bg-iai-fire/20" />
      </div>

      {/* Body bars — mirrors a 3-4 sentence main_response. */}
      <div className="flex flex-col gap-2">
        <div className="h-3 w-11/12 animate-pulse rounded bg-zinc-800" />
        <div className="h-3 w-full animate-pulse rounded bg-zinc-800" />
        <div className="h-3 w-5/6 animate-pulse rounded bg-zinc-800" />
        <div className="h-3 w-3/4 animate-pulse rounded bg-zinc-800" />
      </div>

      {/* Micro-action box — same shape as the rendered one. */}
      <div className="rounded-lg border border-iai-fire/20 bg-iai-fire/5 p-3">
        <div className="iai-hint mb-1.5 text-[10px] uppercase tracking-wider text-iai-fire/60">
          next action
        </div>
        <div className="h-3 w-4/5 animate-pulse rounded bg-zinc-800" />
      </div>

      {/* Follow-up — single quiet line. */}
      <div className="h-2.5 w-2/3 animate-pulse rounded bg-zinc-800/70" />
    </div>
  );
}
