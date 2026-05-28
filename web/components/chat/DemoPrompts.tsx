"use client";

import { DEMO_PROMPTS, type DemoPrompt } from "../../lib/demo_prompts";
import { getUIIcon } from "../../lib/icons";

const ForwardIcon = getUIIcon("forward");

const FlameIcon = getUIIcon("brand");

/** Demo prompts grid — shown when the clinical conversation is empty.
 *
 * Five hand-picked cards covering the persona's range. Tap one and the
 * parent fills the composer with the canonical text + sets the
 * suggested tone. The user can edit before sending.
 *
 * Designed for live demos: a judge cycling through these in 90 seconds
 * sees procrastination → anxiety (safety dip) → fact-check → tone
 * lowering → crisis fallback. The last one is the load-bearing
 * differentiator — comedy as UX, infrastructure as behavior. */
export function DemoPrompts({
  onPick,
  disabled = false,
}: {
  onPick: (prompt: DemoPrompt) => void;
  disabled?: boolean;
}) {
  return (
    <section className="iai-card-sample flex flex-col gap-3">
      <header className="flex items-center gap-2">
        <FlameIcon className="iai-flame h-5 w-5" aria-hidden />
        <h2 className="text-base font-bold text-zinc-100">Try the Roast Coach</h2>
        <span className="iai-hint text-xs">5 curated cases</span>
      </header>
      <p className="iai-hint text-sm">
        Tap one to fill the composer. Edit before sending if you want.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {DEMO_PROMPTS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onPick(p)}
            disabled={disabled}
            title={p.hint}
            className="group flex flex-col items-start gap-1 rounded-lg border border-iai-border bg-iai-surface/40 p-3 text-left transition hover:border-iai-fire/50 hover:bg-iai-surface disabled:cursor-not-allowed disabled:opacity-50"
          >
            <div className="flex w-full items-center justify-between gap-2">
              <span className="text-sm font-semibold text-zinc-100">{p.label}</span>
              <ForwardIcon className="h-3.5 w-3.5 shrink-0 text-zinc-600 transition group-hover:text-iai-fire" aria-hidden />
            </div>
            <span className="text-xs italic text-zinc-400 line-clamp-2">
              {p.text}
            </span>
          </button>
        ))}
      </div>
      <p className="iai-hint text-[11px] text-zinc-500">
        The last example proves the graceful degradation — the persona drops
        the roast and hands off a real resource. That's the behavior that
        distinguishes the product.
      </p>
    </section>
  );
}
