"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AudioPlayer } from "../../components/chat/AudioPlayer";
import { ChatInput } from "../../components/chat/ChatInput";
import { ChatView } from "../../components/chat/ChatView";
import { useChat } from "../../components/chat/useChat";
import { useTtsBlob } from "../../components/chat/useTtsBlob";
import { Button } from "../../components/ui/Button";
import { PoweredBy } from "../../components/ui/PoweredBy";
import { getUIIcon } from "../../lib/icons";

const FlameIcon = getUIIcon("brand");
const NewIcon = getUIIcon("new");
const BackIcon = getUIIcon("back");

/** Multi-turn chat with live chain-of-thought. Streams /chat/stream (SSE) and
 * paints every Bright Data call as a step while the roast text arrives token
 * by token. Sister page of the single-shot `/` (kept as the demo's "quick" mode).
 *
 * Corpus selector: an optional `?corpus=<id>` query arg (set by a "Use →" link
 * on /library) primes the chat to mine that document corpus on every turn.
 * The user can also type the corpus_id manually in the input next to the
 * header — handy for switching between corpora mid-session. Empty = no rag. */
export default function ChatPage() {
  // Read ?corpus= from window.location on mount. We do it in an effect (not
  // during render) because window doesn't exist during the static export
  // pre-render — Next.js refuses to ship the chunk otherwise.
  const [corpusId, setCorpusId] = useState<string>("");
  useEffect(() => {
    const url = new URL(window.location.href);
    const q = url.searchParams.get("corpus");
    if (q) setCorpusId(q);
  }, []);

  const { messages, streaming, send, abort, reset } = useChat({ corpusId });

  // TTS playback lifted to page level: a single <AudioPlayer> floating
  // bar handles ALL bubbles, switching its source when the user hits
  // "listen" on a different one. This matches aurity's single-player
  // pattern and avoids the inline-audio-per-bubble we shipped before.
  const tts = useTtsBlob();
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  const handleSpeak = useCallback(
    (text: string | null, id: string) => {
      // null = the user toggled OFF the same bubble → close the player.
      if (text === null) {
        tts.close();
        setSpeakingId(null);
        return;
      }
      setSpeakingId(id);
      void tts.synthesize(text, "onyx");
    },
    [tts],
  );

  const handlePlayerClose = useCallback(() => {
    tts.close();
    setSpeakingId(null);
  }, [tts]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-5 py-8">
      <header className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="inline-flex items-center gap-2 text-2xl font-extrabold tracking-tight">
              <FlameIcon className="iai-flame h-6 w-6" aria-hidden />
              Insult <span className="iai-brand">AI</span>
              <span className="text-zinc-500">·</span>
              <span className="text-zinc-400">chat</span>
            </h1>
            <p className="iai-hint mt-1 text-sm">
              <span className="iai-accent">The web&apos;s data, unlocked.</span> Then roasted.
              Every jab traces to a fetched source.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="chip"
              onClick={reset}
              disabled={streaming || messages.length === 0}
              title="start a new conversation"
            >
              <NewIcon className="h-3.5 w-3.5" aria-hidden />
              new
            </Button>
            <Link
              href="/library"
              className="iai-btn-chip"
              title="add documents to a corpus"
            >
              library
            </Link>
            <Link
              href="/"
              className="iai-btn-chip"
              title="switch to single-shot mode"
            >
              <BackIcon className="h-3.5 w-3.5" aria-hidden />
              single-shot
            </Link>
          </div>
        </div>
        {/* Knowledge-base selector — small inline input. Editable so the user
         * can switch corpora mid-session WITHOUT leaving /chat. Empty = the
         * agent skips the document search step entirely. Copy says
         * "knowledge base" instead of "corpus / rag_store" — the latter is
         * the implementation detail (rag_store MCP), the former is what the
         * user actually understands. */}
        <label className="iai-hint flex items-center gap-2 text-xs">
          <span className="uppercase tracking-wider">Knowledge base</span>
          <input
            value={corpusId}
            onChange={(e) => setCorpusId(e.target.value)}
            placeholder="Optional — paste an ID from /library"
            disabled={streaming}
            className="iai-input flex-1 px-3 py-1.5 text-xs"
            aria-label="knowledge base id (optional)"
          />
          {corpusId && (
            <button
              type="button"
              onClick={() => setCorpusId("")}
              className="iai-btn-chip text-[10px]"
              title="clear — next turn searches the web only"
              disabled={streaming}
            >
              clear
            </button>
          )}
        </label>
      </header>

      <ChatView messages={messages} onSpeak={handleSpeak} speakingId={speakingId} />

      <div className="sticky bottom-2 mt-2">
        <ChatInput onSend={send} onAbort={abort} streaming={streaming} />
        <div className="mt-2 flex items-center justify-center text-[10px]">
          <PoweredBy />
        </div>
      </div>

      {/* Floating audio player — visible while a TTS request is in-flight
        * or playing. Position is fixed (out of normal flow); rendered as
        * a sibling of the chat so its z-index sits above messages. */}
      {(speakingId || tts.isLoading || tts.error) && (
        <AudioPlayer
          audioUrl={tts.audioUrl}
          isLoading={tts.isLoading}
          error={tts.error}
          onClose={handlePlayerClose}
          voiceLabel="onyx"
        />
      )}
    </main>
  );
}
