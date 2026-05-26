"use client";

import Link from "next/link";
import { ReceiptsPanel } from "../components/roast/ReceiptsPanel";
import { RoastInput } from "../components/roast/RoastInput";
import { RoastView } from "../components/roast/RoastView";
import { useRoast } from "../components/roast/useRoast";
import { getStatusIcon, getUIIcon } from "../lib/icons";

const FlameIcon = getUIIcon("brand");
const ForwardIcon = getUIIcon("forward");
const WarnIcon = getStatusIcon("warning");

export default function Home() {
  const { target, setTarget, roast, loading, error, run, receipts, apiUrl } = useRoast();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-5 py-10">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="inline-flex items-center gap-2 text-3xl font-extrabold tracking-tight">
            <FlameIcon className="h-8 w-8 text-orange-400" aria-hidden />
            Insult <span className="iai-brand">AI</span>
          </h1>
          <p className="mt-1 text-zinc-400">
            Feed it a URL or a claim. It pulls{" "}
            <span className="iai-accent">live web data via Bright Data</span> and roasts the
            target — every jab with a real receipt.
          </p>
        </div>
        <Link
          href="/chat"
          className="iai-btn-chip inline-flex shrink-0 items-center gap-1 text-xs"
          title="multi-turn chat with live chain-of-thought"
        >
          chat
          <ForwardIcon className="h-3.5 w-3.5" aria-hidden />
        </Link>
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

      {roast && <RoastView text={roast} />}
      <ReceiptsPanel urls={receipts} />

      <footer className="mt-auto pt-6 text-center text-xs text-zinc-600">
        Insult AI · Web Data UNLOCKED Hackathon · Bright Data + fi-runner
      </footer>
    </main>
  );
}
