"use client";

import Link from "next/link";
import { useState } from "react";
import { useLibrary } from "../../components/library/useLibrary";
import { Button } from "../../components/ui/Button";
import { Textarea } from "../../components/ui/Textarea";
import { PoweredBy } from "../../components/ui/PoweredBy";
import { getStatusIcon, getUIIcon } from "../../lib/icons";

const FlameIcon = getUIIcon("brand");
const BackIcon = getUIIcon("back");
const DoneIcon = getStatusIcon("done");
const WarnIcon = getStatusIcon("warning");

/** /library — feed the agent a document corpus it can mine during a later
 * roast/brief. Thin wrapper around the /documents endpoint + a session-local
 * list of what's been ingested so the user sees confirmation immediately.
 *
 * The corpus_id input is sticky across ingests (one corpus, many docs in
 * sequence). After ingesting, the user goes to /chat?corpus={id} so the
 * next turn's agent can `search_documents` over that corpus via the
 * rag_store MCP capability (already wired in runner.py). */
export default function LibraryPage() {
  const { corpusId, setCorpusId, docs, busy, error, ingest } = useLibrary();
  const [text, setText] = useState("");

  async function onIngest() {
    const doc = await ingest(text);
    if (doc) setText("");
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-5 py-10">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="inline-flex items-center gap-2 text-3xl font-extrabold tracking-tight">
            <FlameIcon className="iai-flame h-8 w-8" aria-hidden />
            Insult <span className="iai-brand">AI</span>
            <span className="text-zinc-500">·</span>
            <span className="text-zinc-400">library</span>
          </h1>
          <p className="mt-1 text-zinc-400">
            Feed the agent a document corpus. Paste bios, press releases,
            internal notes — the agent can mine them during a later roast or
            brief, alongside live web data.
          </p>
        </div>
        <Link
          href="/chat"
          className="iai-btn-chip shrink-0"
          title="back to chat"
        >
          <BackIcon className="h-3.5 w-3.5" aria-hidden />
          chat
        </Link>
      </header>

      {/* Form — corpus id + text. corpus_id is sticky so dropping multiple
       * docs into the same corpus doesn't require re-typing it. */}
      <section className="iai-card flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="iai-hint text-xs uppercase tracking-wide">Corpus ID</span>
          <input
            value={corpusId}
            onChange={(e) => setCorpusId(e.target.value)}
            placeholder="my-corpus"
            className="iai-input text-sm"
            disabled={busy}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="iai-hint text-xs uppercase tracking-wide">Document text</span>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste a bio, a press release, a financial report, internal sales notes. Anything the agent should know about the target before roasting / briefing."
            rows={8}
            disabled={busy}
          />
        </label>
        <div className="flex items-center justify-between gap-3">
          <span className="iai-hint text-xs">
            Stored as <span className="font-mono">corpus_id={corpusId || "—"}</span> · text
            is chunked + embedded ({"<"} 30 chars = skipped).
          </span>
          <Button
            type="button"
            variant="primary"
            onClick={onIngest}
            disabled={busy || !text.trim() || !corpusId.trim()}
          >
            {busy ? "Ingesting…" : "Ingest"}
          </Button>
        </div>
        {error && (
          <div className="iai-error inline-flex items-center gap-2 text-sm">
            <WarnIcon className="h-4 w-4 shrink-0 text-red-400" aria-hidden />
            {error}
          </div>
        )}
      </section>

      {/* Session-local list of what we just ingested. Append-only, newest
       * first. Each row links to /chat?corpus=<id> so a click reaches the
       * agent with that corpus pre-selected — closes the demo loop. */}
      {docs.length === 0 ? (
        <div className="iai-card-soft text-center text-sm text-zinc-500">
          Nothing ingested in this session yet.
        </div>
      ) : (
        <section className="flex flex-col gap-2">
          <h2 className="iai-hint text-xs uppercase tracking-wide">
            Ingested this session ({docs.length})
          </h2>
          <ul className="flex flex-col gap-2">
            {docs.map((d) => (
              <li
                key={d.docId}
                className="iai-card-soft flex items-start gap-3 text-sm"
              >
                <DoneIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
                <div className="flex flex-1 flex-col gap-1 min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-mono text-xs text-zinc-300">{d.docId}</span>
                    <span className="iai-hint text-[10px] uppercase">
                      {d.corpusId} · {d.chunks} chunk{d.chunks === 1 ? "" : "s"}
                    </span>
                  </div>
                  <p className="truncate font-mono text-[11px] text-zinc-500">
                    {d.preview}…
                  </p>
                </div>
                <Link
                  href={`/chat?corpus=${encodeURIComponent(d.corpusId)}`}
                  className="iai-btn-chip shrink-0 text-[10px]"
                  title={`Open chat with corpus=${d.corpusId}`}
                >
                  use →
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="mt-auto flex flex-col items-center gap-2 pt-6 text-center text-xs text-zinc-600">
        <PoweredBy />
        <span>Insult AI · Web Data UNLOCKED Hackathon</span>
      </footer>
    </main>
  );
}
