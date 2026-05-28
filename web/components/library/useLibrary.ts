"use client";

import { useCallback, useEffect, useState } from "react";
import {
  MAX_LIBRARY_TEXT_CHARS,
  MAX_LIBRARY_UPLOAD_BYTES,
  API_REQUEST_TIMEOUT_MS,
  apiErrorMessage,
  apiHeaders,
  fetchApi,
} from "../../lib/api";
import { sourceIdFromName } from "./sourceIds";
import type { DocumentListPayload, IngestPayload, IngestedDoc } from "./types";

const LIBRARY_INGEST_TIMEOUT_MS = Math.max(API_REQUEST_TIMEOUT_MS, 60_000);


/** State + actions for the /library page.
 *
 * One thin hook so the page component stays declarative. The API returns the
 * persisted docs for a corpus, while local just-ingested rows keep their richer
 * preview text until the backend list grows a metadata endpoint. */
export function useLibrary() {
  // Last corpus the user typed — sticky across ingests so a "drop 5 docs into
  // the same corpus" flow doesn't require re-typing the corpus_id each time.
  // Default to a friendly name; user can replace it.
  const [corpusId, setCorpusId] = useState<string>("my-corpus");
  const [docs, setDocs] = useState<IngestedDoc[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>("");

  // Sync with persisted docs in pgvector when corpus changes. Preserve local
  // just-ingested rows so a slower /documents/list response cannot overwrite
  // the POST acknowledgement and make the doc appear to disappear.
  useEffect(() => {
    const corpus = corpusId.trim();
    if (!corpus) {
      setDocs([]);
      return;
    }
    let cancelled = false;
    fetchApi(`/documents/list?corpus_id=${encodeURIComponent(corpus)}`, {
      headers: apiHeaders(),
    })
      .then(async (res) => {
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as DocumentListPayload;
        if (cancelled) return;
        setDocs((prev) => {
          const local = prev.filter((d) => d.corpusId === data.corpus_id && d.at > 0);
          const byId = new Map<string, IngestedDoc>();
          for (const d of local) byId.set(d.docId, d);
          for (const d of data.documents) {
            const existing = byId.get(d.doc_id);
            byId.set(d.doc_id, {
              docId: d.doc_id,
              corpusId: data.corpus_id,
              preview: existing?.preview ?? d.doc_id,
              chunks: d.chunk_count,
              at: existing?.at ?? 0,
              suggestedQuestions: d.suggested_questions ?? existing?.suggestedQuestions ?? [],
            });
          }
          return [...byId.values()].sort((a, b) => b.at - a.at || a.docId.localeCompare(b.docId));
        });
      })
      .catch(() => {
        // Silently ignore — local dev without pgvector wired is common.
      });
    return () => {
      cancelled = true;
    };
  }, [corpusId]);

  const ingest = useCallback(
    async (text: string, sourceName = ""): Promise<IngestedDoc | null> => {
      const trimmed = text.trim();
      const corpus = corpusId.trim();
      if (!trimmed || !corpus || busy) return null;
      if (trimmed.length > MAX_LIBRARY_TEXT_CHARS) {
        setError(`document text too long (${trimmed.length}/${MAX_LIBRARY_TEXT_CHARS} chars)`);
        return null;
      }
      setBusy(true);
      setError("");
      const docId = sourceIdFromName(sourceName);
      try {
        const res = await fetchApi("/documents", {
          method: "POST",
          headers: apiHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            corpus_id: corpus,
            doc_id: docId,
            source_name: sourceName.trim() || undefined,
            text: trimmed,
          }),
        }, LIBRARY_INGEST_TIMEOUT_MS);
        if (!res.ok) {
          throw new Error(await apiErrorMessage(res));
        }
        const data = (await res.json()) as IngestPayload;
        const doc: IngestedDoc = {
          docId,
          corpusId: corpus,
          preview: trimmed.slice(0, 80),
          chunks: data.chunks ?? 0,
          at: Date.now(),
          suggestedQuestions: data.suggested_questions ?? [],
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
    async (file: File, sourceName = ""): Promise<IngestedDoc | null> => {
      const corpus = corpusId.trim();
      if (!corpus || busy) return null;
      const lower = file.name.toLowerCase();
      const ok = lower.endsWith(".txt") || lower.endsWith(".md");
      if (!ok) {
        setError(`unsupported file type — only .txt and .md are accepted (got ${file.name})`);
        return null;
      }
      if (file.size > MAX_LIBRARY_UPLOAD_BYTES) {
        setError(
          `file too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max is ${(
            MAX_LIBRARY_UPLOAD_BYTES /
            1024 /
            1024
          ).toFixed(0)} MB.`,
        );
        return null;
      }
      setBusy(true);
      setError("");
      const docId = sourceIdFromName(sourceName || file.name.replace(/\.[^.]+$/, ""));
      try {
        const form = new FormData();
        form.append("corpus_id", corpus);
        form.append("doc_id", docId);
        if (sourceName.trim()) form.append("source_name", sourceName.trim());
        form.append("file", file);
        // NOTE: deliberately NOT setting Content-Type — the browser sets
        // multipart/form-data + the boundary string for us. Setting it
        // manually drops the boundary and FastAPI rejects the body.
        const res = await fetchApi("/documents/upload", {
          method: "POST",
          headers: apiHeaders(),
          body: form,
        }, LIBRARY_INGEST_TIMEOUT_MS);
        if (!res.ok) {
          throw new Error(await apiErrorMessage(res));
        }
        const data = (await res.json()) as IngestPayload;
        const doc: IngestedDoc = {
          docId,
          corpusId: corpus,
          preview: `File: ${file.name}`,
          chunks: data.chunks ?? 0,
          at: Date.now(),
          suggestedQuestions: data.suggested_questions ?? [],
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
