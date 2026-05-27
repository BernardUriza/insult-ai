"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { MessageBubble } from "./MessageBubble";
import type { ChatMessage } from "./types";
import type { ChatMode } from "./useChat";

const EMPTY_STATE_BY_MODE: Record<ChatMode, { headline: string; subcopy: string }> = {
  roast: {
    headline: "What are we roasting today?",
    subcopy:
      "Bring a claim, a link, or a thought that's been freeloading in your head.",
  },
  brief: {
    headline: "Who needs a brief?",
    subcopy:
      "Drop a company, product, article, or claim. I'll turn signals into a sharp brief.",
  },
  clinical: {
    headline: "What's on your mind?",
    subcopy:
      "Bring the messy thought. The roast stays on the pattern, not on you.",
  },
};

/** Conversation surface: vertically stacked messages with a **sticky-bottom**
 * auto-scroll. Naïve scroll-on-every-update fires ~30x/s during text streaming
 * (smooth-scroll animations end up fighting each other) AND yanks the user back
 * to the tail when they scrolled up to re-read an earlier roast. Both bad.
 *
 * Policy: scroll iff (a) a NEW message landed (turn boundary — always honor),
 * or (b) the user is already near the bottom (within one viewport + a margin).
 * If they scrolled up to read, deltas don't drag them down. */
export function ChatView({
  messages,
  onSpeak,
  speakingId,
  mode = "roast",
}: {
  messages: ChatMessage[];
  /** Page-level handler that lifts the TTS playback to a single floating
   * AudioPlayer (see chat/page.tsx). Optional — when absent the listen
   * button is hidden in each bubble. */
  onSpeak?: (text: string | null, id: string) => void;
  speakingId?: string | null;
  /** Drives empty-state headline + subcopy so the conversation surface
   * tells the truth about what the active mode will do. */
  mode?: ChatMode;
}) {
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
    // Clinical mode renders DemoPrompts as its empty-state surface (a richer
    // grid of curated cases). Painting the generic empty-state card on top
    // would duplicate the "what should I say?" prompt without adding info.
    if (mode === "clinical") return null;
    const empty = EMPTY_STATE_BY_MODE[mode];
    return (
      <div className="iai-card-soft flex flex-col items-center gap-3 py-12 text-center">
        <Image
          src="/logo.png"
          alt=""
          width={80}
          height={80}
          priority
          className="opacity-90 drop-shadow-[0_0_24px_rgb(var(--color-iai-fire-rgb)/0.4)]"
        />
        <div className="text-base font-semibold text-zinc-100">{empty.headline}</div>
        <div className="iai-hint max-w-prose text-sm">{empty.subcopy}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {messages.map((m, i) => {
        // Find the user message that prompted THIS assistant turn — the
        // closest preceding user-role message. ThinkingPanel uses it for
        // the "Unlocking <target>…" live label.
        let target: string | undefined;
        if (m.role === "assistant") {
          for (let j = i - 1; j >= 0; j--) {
            if (messages[j].role === "user") {
              target = messages[j].content;
              break;
            }
          }
        }
        return (
          <MessageBubble
            key={m.id}
            message={m}
            target={target}
            mode={mode}
            onSpeak={onSpeak}
            speakingId={speakingId}
          />
        );
      })}
      <div ref={tailRef} />
    </div>
  );
}
