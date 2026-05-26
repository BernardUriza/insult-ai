"use client";

import Link from "next/link";
import { ChatInput } from "../../components/chat/ChatInput";
import { ChatView } from "../../components/chat/ChatView";
import { useChat } from "../../components/chat/useChat";
import { Button } from "../../components/ui/Button";
import { PoweredBy } from "../../components/ui/PoweredBy";
import { getUIIcon } from "../../lib/icons";

const FlameIcon = getUIIcon("brand");
const NewIcon = getUIIcon("new");
const BackIcon = getUIIcon("back");

/** Multi-turn chat with live chain-of-thought. Streams /chat/stream (SSE) and
 * paints every Bright Data call as a step while the roast text arrives token
 * by token. Sister page of the single-shot `/` (kept as the demo's "quick" mode). */
export default function ChatPage() {
  const { messages, streaming, send, abort, reset, apiUrl } = useChat();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-5 py-8">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="inline-flex items-center gap-2 text-2xl font-extrabold tracking-tight">
            <FlameIcon className="h-6 w-6 text-iai-accent" aria-hidden />
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
            href="/"
            className="iai-link inline-flex items-center gap-1 text-xs"
            title="switch to single-shot mode"
          >
            <BackIcon className="h-3.5 w-3.5" aria-hidden />
            single-shot
          </Link>
        </div>
      </header>

      <ChatView messages={messages} />

      <div className="sticky bottom-2 mt-2">
        <ChatInput onSend={send} onAbort={abort} streaming={streaming} />
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-[10px]">
          <PoweredBy />
          <span className="iai-hint">
            <span className="font-mono">{apiUrl}</span> · backend=claude
          </span>
        </div>
      </div>
    </main>
  );
}
