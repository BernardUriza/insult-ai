"use client";

import Link from "next/link";
import { ReceiptsPanel } from "../components/roast/ReceiptsPanel";
import { RoastInput } from "../components/roast/RoastInput";
import { RoastSkeleton } from "../components/roast/RoastSkeleton";
import { RoastView } from "../components/roast/RoastView";
import { SampleRoast } from "../components/roast/SampleRoast";
import { useRoast } from "../components/roast/useRoast";
import { PoweredBy } from "../components/ui/PoweredBy";
import { getStatusIcon, getUIIcon } from "../lib/icons";

const FlameIcon = getUIIcon("brand");
const ForwardIcon = getUIIcon("forward");
const WarnIcon = getStatusIcon("warning");

export default function Home() {
  const { target, setTarget, roast, loading, error, run, receipts, apiUrl } = useRoast();
  const idle = !roast && !loading && !error;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-5 py-10">
      <header className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <h1 className="inline-flex items-center gap-2.5 text-4xl font-extrabold tracking-tight md:text-5xl">
            <FlameIcon className="iai-flame h-10 w-10 md:h-11 md:w-11" aria-hidden />
            Insult <span className="iai-brand">AI</span>
          </h1>
          <nav className="flex shrink-0 items-center gap-2">
            <Link
              href="/library"
              className="iai-btn-chip"
              title="feed the agent a document corpus"
            >
              library
              <ForwardIcon className="h-3.5 w-3.5" aria-hidden />
            </Link>
            <Link
              href="/chat"
              className="iai-btn-chip"
              title="multi-turn chat with live chain-of-thought"
            >
              chat
              <ForwardIcon className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </nav>
        </div>
        {/* Hero copy — split in two: the punch line first (loud), then the
         * mechanic (quieter). The old paragraph buried the promise under a
         * Bright Data attribution; this version puts the voice up front. */}
        <p className="text-xl font-bold leading-tight text-zinc-100 md:text-2xl">
          Don't trust the pitch.{" "}
          <span className="text-iai-fire">We scraped it.</span>
        </p>
        <p className="iai-hint text-base">
          Live web data via{" "}
          <span className="iai-brand font-semibold">Bright Data</span>. Every
          roast comes with receipts.
        </p>
      </header>

      <RoastInput target={target} loading={loading} onChange={setTarget} onRun={run} />

      {error && (
        <div className="iai-error inline-flex flex-col">
          <span className="inline-flex items-center gap-2">
            <WarnIcon className="h-4 w-4 shrink-0 text-amber-400" aria-hidden />
            {error}
          </span>
          <span className="mt-1 block text-xs text-red-400/70">
            Is the API running at {apiUrl}?
          </span>
        </div>
      )}

      {/* Idle / loading / done — three exclusive states.
       * Idle now shows a REAL sample roast (text + receipts) instead of a
       * placeholder card that just echoed the input. Demo proof above-the-fold:
       * a judge sees the format before typing anything. */}
      {idle && <SampleRoast />}
      {loading && !roast && <RoastSkeleton />}
      {roast && <RoastView text={roast} />}
      <ReceiptsPanel urls={receipts} />

      <footer className="mt-auto flex flex-col items-center gap-2 pt-6 text-center text-xs text-zinc-600">
        <PoweredBy />
        <span>Insult AI · Web Data UNLOCKED Hackathon</span>
      </footer>
    </main>
  );
}
