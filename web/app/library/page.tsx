"use client";

import Link from "next/link";
import type { Route } from "next";
import { useState } from "react";
import { FileDropzone } from "../../components/library/FileDropzone";
import { SuggestedQuestions } from "../../components/library/SuggestedQuestions";
import { useLibrary } from "../../components/library/useLibrary";
import { ConversationShell } from "../../components/layout/ConversationShell";
import { InsultHeader } from "../../components/layout/InsultHeader";
import { Button } from "../../components/ui/Button";
import { PoweredBy } from "../../components/ui/PoweredBy";
import { Textarea } from "../../components/ui/Textarea";
import { getStatusIcon } from "../../lib/icons";

const DoneIcon = getStatusIcon("done");
const WarnIcon = getStatusIcon("warning");

/** /library — feed the agent a document corpus it can mine during a later
 * roast/brief. Thin wrapper around the /documents endpoint + a session-local
 * list of what's been ingested so the user sees confirmation immediately.
 *
 * Shares the app shell (InsultHeader) with /chat so the identity holds
 * across the route boundary. /library is the corpus surface, not a mode of
 * the agent, so the header shows a single Chat action instead of the chat
 * mode switcher.
 *
 * The corpus_id input is sticky across ingests (one corpus, many docs in
 * sequence). After ingesting, the user goes to /chat?corpus={id} so the
 * next turn's agent can `search_documents` over that corpus via the
 * rag_store MCP capability (already wired in runner.py). */
export default function LibraryPage() {
  const { corpusId, setCorpusId, docs, busy, error, ingest, uploadFile } = useLibrary();
  const [text, setText] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [editingBase, setEditingBase] = useState(false);

  async function onIngest() {
    const doc = await ingest(text, sourceName);
    if (doc) {
      setText("");
      setSourceName("");
      setEditingBase(false);
    }
  }

  const chatHref: Route = corpusId.trim()
    ? (`/chat?mode=brief&corpus=${encodeURIComponent(corpusId.trim())}` as Route)
    : "/chat";
  const baseLocked = docs.length > 0 && !editingBase;

  const ingestedPanel =
    docs.length === 0 ? (
      <div className="iai-card-soft text-center text-sm text-zinc-500">
        No sources saved in this knowledge base yet.
      </div>
    ) : (
      <section className="flex flex-col gap-2">
        <h2 className="iai-hint text-xs uppercase tracking-wide">
          Sources in this knowledge base ({docs.length})
        </h2>
        <ul className="flex flex-col gap-2">
          {docs.map((d) => (
            <li
              key={d.docId}
              className="iai-card-soft flex items-start gap-3 text-sm"
            >
              <DoneIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-mono text-xs text-zinc-300">{d.docId}</span>
                  <span className="iai-hint text-[10px] uppercase">
                    {d.corpusId} · {d.chunks} chunk{d.chunks === 1 ? "" : "s"}
                  </span>
                </div>
                <p className="truncate font-mono text-[11px] text-zinc-500">
                  {d.preview}…
                </p>
                <SuggestedQuestions corpusId={d.corpusId} questions={d.suggestedQuestions} />
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
    );

  return (
    <ConversationShell
      maxWidth="max-w-6xl"
      header={
        <InsultHeader
          activeMode="brief"
          action={
            <Link
              href={chatHref}
              className="iai-btn-chip inline-flex min-h-[44px] items-center px-4 text-sm"
              title="Return to chat"
            >
              Chat →
            </Link>
          }
        />
      }
      secondary={ingestedPanel}
    >
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-2">
          <h2 className="text-xl font-bold text-zinc-100">Knowledge base</h2>
          <p className="iai-hint text-sm">
            Save multiple sources into one knowledge base. Paste bios, press
            releases, internal notes — the agent can mine them during a later roast or
            brief, alongside live web data.
          </p>
        </section>

        {/* Form — corpus id + text. corpus_id is sticky so dropping multiple
         * sources into the same corpus doesn't require re-typing it. */}
        <section className="iai-card flex flex-col gap-3">
          <div className="flex flex-col gap-1 text-sm">
            <span className="iai-hint text-xs uppercase tracking-wide">
              Active knowledge base
            </span>
            <div className="flex gap-2">
              <input
                value={corpusId}
                onChange={(e) => setCorpusId(e.target.value)}
                placeholder="e.g. acme-research"
                className="iai-input min-w-0 flex-1 text-sm disabled:cursor-not-allowed disabled:opacity-70"
                disabled={busy || baseLocked}
              />
              {docs.length > 0 && (
                <button
                  type="button"
                  className="iai-btn-chip shrink-0"
                  onClick={() => setEditingBase((v) => !v)}
                  disabled={busy}
                >
                  {editingBase ? "Lock" : "Change"}
                </button>
              )}
            </div>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <span className="iai-hint text-xs uppercase tracking-wide">
              Source name
            </span>
            <input
              value={sourceName}
              onChange={(e) => setSourceName(e.target.value)}
              placeholder="e.g. founder-bio, q2-report, pitch-notes"
              className="iai-input text-sm"
              disabled={busy}
            />
          </label>
          <div className="flex flex-col gap-1">
            <span className="iai-hint text-xs uppercase tracking-wide">Upload a file</span>
            <FileDropzone
              onFile={(f) => {
                void uploadFile(f, sourceName).then((doc) => {
                  if (doc) {
                    setSourceName("");
                    setEditingBase(false);
                  }
                });
              }}
              disabled={busy || !corpusId.trim()}
            />
            {!corpusId.trim() && (
              <span className="iai-hint text-[11px]">
                Set a knowledge base name above before uploading.
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 text-[11px] uppercase tracking-wider text-zinc-500">
            <span className="h-px flex-1 bg-iai-border" />
            <span>or paste text</span>
            <span className="h-px flex-1 bg-iai-border" />
          </div>

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
            </span>{" "}
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

        <footer className="flex flex-col items-center gap-2 pt-2 text-center text-xs text-zinc-600">
          <PoweredBy />
          <span>Insult AI · Web Data UNLOCKED Hackathon</span>
        </footer>
      </div>
    </ConversationShell>
  );
}
