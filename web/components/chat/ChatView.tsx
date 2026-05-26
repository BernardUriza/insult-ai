"use client";

import { useEffect, useRef } from "react";
import { MessageBubble } from "./MessageBubble";
import type { ChatMessage } from "./types";

/** Conversation surface: vertically stacked messages with a **sticky-bottom**
 * auto-scroll. Naïve scroll-on-every-update fires ~30x/s during text streaming
 * (smooth-scroll animations end up fighting each other) AND yanks the user back
 * to the tail when they scrolled up to re-read an earlier roast. Both bad.
 *
 * Policy: scroll iff (a) a NEW message landed (turn boundary — always honor),
 * or (b) the user is already near the bottom (within one viewport + a margin).
 * If they scrolled up to read, deltas don't drag them down. */
export function ChatView({ messages }: { messages: ChatMessage[] }) {
  const tailRef = useRef<HTMLDivElement>(null);
  const lastCountRef = useRef(0);

  useEffect(() => {
    const doc = document.documentElement;
    const distanceFromBottom = doc.scrollHeight - (window.innerHeight + window.scrollY);
    const nearBottom = distanceFromBottom < 200;
    const newMessage = messages.length > lastCountRef.current;
    lastCountRef.current = messages.length;
    if (newMessage || nearBottom) {
      tailRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="iai-card-soft flex flex-col items-center gap-2 py-10 text-center text-zinc-400">
        <div className="text-2xl">🔥</div>
        <div className="font-medium text-zinc-300">Empieza con una URL o un claim.</div>
        <div className="iai-hint text-sm">
          Ej: <span className="font-mono text-zinc-300">acme.com</span> · &nbsp;
          <span className="font-mono text-zinc-300">&quot;Elon Musk founded OpenAI&quot;</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {messages.map((m) => (
        <MessageBubble key={m.id} message={m} />
      ))}
      <div ref={tailRef} />
    </div>
  );
}
