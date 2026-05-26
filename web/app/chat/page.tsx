"use client";

import Link from "next/link";
import { ChatInput } from "../../components/chat/ChatInput";
import { ChatView } from "../../components/chat/ChatView";
import { useChat } from "../../components/chat/useChat";
import { Button } from "../../components/ui/Button";
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
            <FlameIcon className="h-6 w-6 text-orange-400" aria-hidden />
            Insult <span className="iai-brand">AI</span>
            <span className="text-zinc-500">·</span>
            <span className="text-zinc-400">chat</span>
          </h1>
          <p className="iai-hint mt-1 text-sm">
            Conversación con chain-of-thought.{" "}
            <span className="iai-accent">Cada llamada a Bright Data se muestra en vivo</span> antes
            de que el roast aterrice.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="chip"
            onClick={reset}
            disabled={streaming || messages.length === 0}
            title="nueva conversación"
          >
            <NewIcon className="h-3.5 w-3.5" aria-hidden />
            nueva
          </Button>
          <Link
            href="/"
            className="iai-link inline-flex items-center gap-1 text-xs"
            title="modo single-shot"
          >
            <BackIcon className="h-3.5 w-3.5" aria-hidden />
            single-shot
          </Link>
        </div>
      </header>

      <ChatView messages={messages} />

      <div className="sticky bottom-2 mt-2">
        <ChatInput onSend={send} onAbort={abort} streaming={streaming} />
        <p className="iai-hint mt-2 text-center text-[10px]">
          API: <span className="font-mono">{apiUrl}/chat/stream</span> · live streaming requires
          backend=claude
        </p>
      </div>
    </main>
  );
}
