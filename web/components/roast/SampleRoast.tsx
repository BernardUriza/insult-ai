"use client";

import { SAMPLE_ROAST } from "../../lib/sample_roast";
import { getStatusIcon, getUIIcon } from "../../lib/icons";
import { RoastText } from "./RoastText";

const ReceiptIcon = getUIIcon("receipts");
const ExternalIcon = getUIIcon("external");
const DoneIcon = getStatusIcon("done");
const FlameIcon = getUIIcon("brand");

function host(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Demo-proof card: the "what you'll get" sample roast, visible above-the-fold
 * on the empty home. Replaces the older empty-state card (which just repeated
 * the input placeholder). The judge / first visitor sees the format of the
 * output — bold sententia, voice, receipts panel — without typing anything.
 *
 * Marked with a SAMPLE tag so it isn't confused with a live result. Receipts
 * are real public URLs (IANA, RFC, Wikipedia) — clickable, verifiable.
 *
 * Optional ``onRunSample`` callback wires a "Run this live" button at the
 * bottom — closes the demo loop: judge reads the sample, clicks the button,
 * the input fills with the sample target and the agent fires for real. */
export function SampleRoast({ onRunSample }: { onRunSample?: (target: string) => void }) {
  const { target, text, receipts } = SAMPLE_ROAST;
  return (
    <section className="iai-card-sample flex flex-col gap-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="iai-tag">
            <DoneIcon className="h-3 w-3" aria-hidden />
            sample
          </span>
          <span className="iai-hint text-xs">what you'll get</span>
        </div>
        <a
          href={target}
          target="_blank"
          rel="noopener noreferrer"
          className="iai-link font-mono text-xs"
          title="the target the sample roasts"
        >
          {target}
        </a>
      </header>

      <RoastText text={text} />

      <div className="flex flex-col gap-2 border-t border-iai-border pt-3">
        <div className="inline-flex items-center gap-2 text-xs font-bold text-iai-accent">
          <ReceiptIcon className="h-3.5 w-3.5" aria-hidden />
          Receipts
          <span className="iai-hint font-normal tabular-nums">({receipts.length})</span>
        </div>
        <ul className="flex flex-col gap-1 text-xs">
          {receipts.map((u) => (
            <li key={u}>
              <a
                href={u}
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center gap-1.5 rounded px-1 -mx-1
                           text-zinc-400 transition hover:text-zinc-100"
              >
                <span className="font-semibold text-zinc-300">{host(u)}</span>
                <ExternalIcon
                  className="h-3 w-3 text-iai-link opacity-0 transition group-hover:opacity-100"
                  aria-hidden
                />
              </a>
            </li>
          ))}
        </ul>
      </div>

      {onRunSample && (
        <div className="flex items-center justify-between gap-3 border-t border-iai-border pt-3">
          <span className="iai-hint text-xs">
            This was pre-rendered. Want to see the agent do it for real?
          </span>
          <button
            type="button"
            onClick={() => onRunSample(target)}
            className="iai-btn-primary text-sm"
            title="Fires a live roast against the sample target via the Bright Data MCP"
          >
            Run this live
            <FlameIcon className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}
    </section>
  );
}
