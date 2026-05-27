"use client";

import { useCallback, useState } from "react";
import { apiHeaders, apiUrl } from "../../lib/api";

/** One document that's been ingested THIS browser session. The API has no
 * /documents/list endpoint yet, so the front holds its own session record —
 * good enough to show the demo flow ("look, I just uploaded this, now the
 * agent cites it"). On a hard reload the list resets; the chunks themselves
 * live in pgvector and survive. */
export type IngestedDoc = {
  /** Stable id we mint client-side so the same doc_id can't collide with a
   * future one on a fresh ingest. The backend uses `doc_id` as part of the
   * PRIMARY KEY ON (namespace, document_id) so the caller controls it. */
  docId: string;
  /** The corpus this doc lives under — keys multi-tenant isolation in
   * fi_core.rag's pgvector schema. */
  corpusId: string;
  /** First ~80 chars of the ingested text — UI preview. */
  preview: string;
  /** How many chunks fi-core's chunker produced. Returned by the API as
   * IngestResponse.chunks. Zero means the text was too short to chunk
   * (below `min_chunk_size=30`); the row is still kept so the user can
   * see why the corpus didn't grow. */
  chunks: number;
  /** When this doc was ingested THIS session, for sort order. */
  at: number;
};

/** Mint a short id without depending on `crypto.randomUUID` (Safari 14 etc.). */
function newId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** State + actions for the /library page.
 *
 * One thin hook so the page component stays declarative. The list of docs is
 * append-only inside this session — no edit / delete (the agent doesn't care
 * about THIS list, only what's in pgvector, and re-ingesting the same doc_id
 * just upserts). */
export function useLibrary() {
  // Last corpus the user typed — sticky across ingests so a "drop 5 docs into
  // the same corpus" flow doesn't require re-typing the corpus_id each time.
  // Default to a friendly name; user can replace it.
  const [corpusId, setCorpusId] = useState<string>("my-corpus");
  const [docs, setDocs] = useState<IngestedDoc[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>("");

  const ingest = useCallback(
    async (text: string): Promise<IngestedDoc | null> => {
      const trimmed = text.trim();
      const corpus = corpusId.trim();
      if (!trimmed || !corpus || busy) return null;
      setBusy(true);
      setError("");
      const docId = `doc-${newId()}`;
      try {
        const res = await fetch(apiUrl("/documents"), {
          method: "POST",
          headers: apiHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ corpus_id: corpus, doc_id: docId, text: trimmed }),
        });
        if (!res.ok) {
          // The API returns { detail: "..." } on 4xx via the FastAPI default.
          let detail = `${res.status}`;
          try {
            const j = (await res.json()) as { detail?: string };
            if (j?.detail) detail = j.detail;
          } catch {
            /* not JSON, keep the status code */
          }
          throw new Error(detail);
        }
        const data = (await res.json()) as { chunks?: number };
        const doc: IngestedDoc = {
          docId,
          corpusId: corpus,
          preview: trimmed.slice(0, 80),
          chunks: data.chunks ?? 0,
          at: Date.now(),
        };
        // Newest first — the just-ingested doc is the one the user wants to
        // see acknowledged.
        setDocs((prev) => [doc, ...prev]);
        return doc;
      } catch (e) {
        setError(e instanceof Error ? e.message : "ingest failed");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [corpusId, busy],
  );

  /** Upload a `.txt` or `.md` file as a corpus document. Mirrors `ingest`
   * but posts multipart instead of JSON — same downstream chunking +
   * embedding path on the backend, indistinguishable to the agent later.
   * Validates extension client-side so a bad file gives feedback before
   * even round-tripping. */
  const uploadFile = useCallback(
    async (file: File): Promise<IngestedDoc | null> => {
      const corpus = corpusId.trim();
      if (!corpus || busy) return null;
      const lower = file.name.toLowerCase();
      const ok = lower.endsWith(".txt") || lower.endsWith(".md");
      if (!ok) {
        setError(`unsupported file type — only .txt and .md are accepted (got ${file.name})`);
        return null;
      }
      setBusy(true);
      setError("");
      const docId = `doc-${newId()}`;
      try {
        const form = new FormData();
        form.append("corpus_id", corpus);
        form.append("doc_id", docId);
        form.append("file", file);
        // NOTE: deliberately NOT setting Content-Type — the browser sets
        // multipart/form-data + the boundary string for us. Setting it
        // manually drops the boundary and FastAPI rejects the body.
        const res = await fetch(apiUrl("/documents/upload"), {
          method: "POST",
          headers: apiHeaders(),
          body: form,
        });
        if (!res.ok) {
          let detail = `${res.status}`;
          try {
            const j = (await res.json()) as { detail?: string };
            if (j?.detail) detail = j.detail;
          } catch {
            /* not JSON */
          }
          throw new Error(detail);
        }
        const data = (await res.json()) as { chunks?: number };
        const doc: IngestedDoc = {
          docId,
          corpusId: corpus,
          preview: `📎 ${file.name}`,
          chunks: data.chunks ?? 0,
          at: Date.now(),
        };
        setDocs((prev) => [doc, ...prev]);
        return doc;
      } catch (e) {
        setError(e instanceof Error ? e.message : "upload failed");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [corpusId, busy],
  );

  return {
    corpusId,
    setCorpusId,
    docs,
    busy,
    error,
    ingest,
    uploadFile,
  };
}
