"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useLibrary } from "../../components/library/useLibrary";
import { InsultHeader } from "../../components/layout/InsultHeader";
import { Button } from "../../components/ui/Button";
import { PoweredBy } from "../../components/ui/PoweredBy";
import { Textarea } from "../../components/ui/Textarea";
import { getStatusIcon } from "../../lib/icons";
import type { ChatMode } from "../../components/chat/useChat";

const DoneIcon = getStatusIcon("done");
const WarnIcon = getStatusIcon("warning");

/** /library — feed the agent a document corpus it can mine during a later
 * roast/brief. Thin wrapper around the /documents endpoint + a session-local
 * list of what's been ingested so the user sees confirmation immediately.
 *
 * Shares the app shell (InsultHeader) with /chat so the identity holds
 * across the route boundary. /library is the corpus surface, not a mode of
 * the agent — but the header's mode switcher is still useful here because
 * the natural next action AFTER ingesting a doc is "now go talk to it",
 * which means picking a mode. So the switcher routes to /chat?mode=<next>
 * instead of swapping local state. Default-displayed mode is `brief`
 * because the brief persona is the one that uses the corpus most directly
 * (cited intelligence over ingested research).
 *
 * The corpus_id input is sticky across ingests (one corpus, many docs in
 * sequence). After ingesting, the user goes to /chat?corpus={id} so the
 * next turn's agent can `search_documents` over that corpus via the
 * rag_store MCP capability (already wired in runner.py). */
export default function LibraryPage() {
  const router = useRouter();
  const { corpusId, setCorpusId, docs, busy, error, ingest } = useLibrary();
  const [text, setText] = useState("");

  async function onIngest() {
    const doc = await ingest(text);
    if (doc) setText("");
  }

  // /library has no "active" mode of its own — the header's switcher is a
  // teleport, not a state toggle. Picking a mode hard-navigates to /chat
  // with that mode pre-selected. Brief is the visual default because the
  // corpus surface and the brief persona are the most directly linked.
  const handleModeChange = (next: ChatMode) => {
    router.push(`/chat?mode=${next}`);
  };

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-5 py-8">
      <InsultHeader activeMode="brief" onModeChange={handleModeChange} />

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-bold text-zinc-100">Knowledge base</h2>
        <p className="iai-hint text-sm">
          Feed the agent a document corpus. Paste bios, press releases,
          internal notes — the agent can mine them during a later roast or
          brief, alongside live web data.
        </p>
      </section>

      {/* Form — corpus id + text. corpus_id is sticky so dropping multiple
       * docs into the same corpus doesn't require re-typing it. */}
      <section className="iai-card flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="iai-hint text-xs uppercase tracking-wide">
            Knowledge base name
          </span>
          <input
            value={corpusId}
            onChange={(e) => setCorpusId(e.target.value)}
            placeholder="e.g. acme-research"
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
            Saving to{" "}
            <span className="font-mono text-zinc-300">
              {corpusId || "—"}
            </span>{" "}
            · text under 30 chars is skipped.
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
