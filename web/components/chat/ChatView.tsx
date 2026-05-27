"use client";

import { useEffect, useRef } from "react";
import { getUIIcon } from "../../lib/icons";
import { MessageBubble } from "./MessageBubble";
import type { ChatMessage } from "./types";

const FlameIcon = getUIIcon("brand");

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
}: {
  messages: ChatMessage[];
  /** Page-level handler that lifts the TTS playback to a single floating
   * AudioPlayer (see chat/page.tsx). Optional — when absent the listen
   * button is hidden in each bubble. */
  onSpeak?: (text: string | null, id: string) => void;
  speakingId?: string | null;
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
    return (
      <div className="iai-card-soft flex flex-col items-center gap-2 py-10 text-center text-zinc-400">
        <FlameIcon className="h-7 w-7 text-orange-400" aria-hidden />
        <div className="font-medium text-zinc-300">Drop a URL or a claim to start.</div>
        <div className="iai-hint text-sm">
          Try: <span className="font-mono text-zinc-300">acme.com</span> · &nbsp;
          <span className="font-mono text-zinc-300">&quot;Elon Musk founded OpenAI&quot;</span>
        </div>
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
            onSpeak={onSpeak}
            speakingId={speakingId}
          />
        );
      })}
      <div ref={tailRef} />
    </div>
  );
}
