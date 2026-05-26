"use client";

import Link from "next/link";
import { ReceiptsPanel } from "../components/roast/ReceiptsPanel";
import { RoastInput } from "../components/roast/RoastInput";
import { RoastView } from "../components/roast/RoastView";
import { useRoast } from "../components/roast/useRoast";

export default function Home() {
  const { target, setTarget, roast, loading, error, run, receipts, apiUrl } = useRoast();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-5 py-10">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">
            🔥 Insult <span className="iai-brand">AI</span>
          </h1>
          <p className="mt-1 text-zinc-400">
            Feed it a URL or a claim. It pulls{" "}
            <span className="iai-accent">live web data via Bright Data</span> and roasts the
            target — every jab with a real receipt.
          </p>
        </div>
        <Link
          href="/chat"
          className="iai-btn-chip shrink-0 text-xs"
          title="multi-turn chat with live chain-of-thought"
        >
          chat →
        </Link>
      </header>

      <RoastInput target={target} loading={loading} onChange={setTarget} onRun={run} />

      {error && (
        <div className="iai-error">
          ⚠️ {error}
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
