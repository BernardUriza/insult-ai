"use client";

import { useCallback, useEffect, useState } from "react";
import { AudioPlayer } from "../../components/chat/AudioPlayer";
import { ChatInput } from "../../components/chat/ChatInput";
import { ChatView } from "../../components/chat/ChatView";
import { DemoPrompts } from "../../components/chat/DemoPrompts";
import {
  IntensitySelector,
  LowerIntensityButton,
} from "../../components/chat/IntensitySelector";
import {
  OnboardingDialog,
  isOnboarded,
} from "../../components/chat/OnboardingDialog";
import { type ChatMode, type ChatTone, useChat } from "../../components/chat/useChat";
import { useTtsBlob } from "../../components/chat/useTtsBlob";
import { InsultHeader } from "../../components/layout/InsultHeader";
import { PoweredBy } from "../../components/ui/PoweredBy";

/** Multi-turn chat with live chain-of-thought. Streams /chat/stream (SSE) and
 * paints every Bright Data call as a step while the roast text arrives token
 * by token.
 *
 * The header (InsultHeader) is the product surface: brand block, the three
 * primary modes (roast / brief / clinical), the safety badge, and (in
 * clinical) the tone control. Everything off-mission lives on its own route
 * — the chat is intentionally focused on the three personas. */
export default function ChatPage() {
  // Mode + tone state. Default mode is "roast" to preserve the existing
  // demo behavior; `?mode=brief|clinical` on the URL deep-links to the
  // other personas. Tone only matters for clinical mode (the others
  // ignore it).
  const [mode, setMode] = useState<ChatMode>("roast");
  const [tone, setTone] = useState<ChatTone>("medium");
  const [corpusId, setCorpusId] = useState<string>("");
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Pick up deep-link params on mount. `?corpus=…` primes the agent to
  // search a document corpus; `?mode=…` lands the user directly in the
  // requested persona; `?seed=…` pre-fills the composer (used by the
  // landing's demo prompt chips so a click teleports the user into the
  // chat with the prompt already typed). Done in an effect because
  // `window` doesn't exist during static export pre-render.
  //
  // After seeding we strip `?seed` from the URL with replaceState so a
  // refresh doesn't re-seed (and the address bar stays clean for sharing).
  useEffect(() => {
    const url = new URL(window.location.href);
    const q = url.searchParams.get("corpus");
    if (q) setCorpusId(q);
    const modeParam = url.searchParams.get("mode");
    if (modeParam === "clinical" || modeParam === "brief" || modeParam === "roast") {
      setMode(modeParam);
      if (modeParam === "clinical" && !isOnboarded()) {
        setShowOnboarding(true);
      }
    }
    const seedParam = url.searchParams.get("seed");
    if (seedParam) {
      setSeedDraft(seedParam);
      url.searchParams.delete("seed");
      window.history.replaceState(null, "", url.toString());
    }
  }, []);

  const { messages, streaming, send, abort } = useChat({ corpusId, mode, tone });

  // Seed text injected from a DemoPrompts tap. ChatInput reads this once
  // per change and replaces its draft — user can edit or send.
  const [seedDraft, setSeedDraft] = useState<string | undefined>(undefined);

  // TTS playback lifted to page level: a single <AudioPlayer> floating
  // bar handles ALL bubbles, switching its source when the user hits
  // "listen" on a different one.
  const tts = useTtsBlob();
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  const handleSpeak = useCallback(
    (text: string | null, id: string) => {
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

  // Mode-switch: update state AND the URL (replaceState so back-button
  // history doesn't fill with every toggle). Onboarding gate only fires
  // on first-ever clinical landing — never again after the user accepts.
  const handleModeChange = useCallback((next: ChatMode) => {
    setMode(next);
    const url = new URL(window.location.href);
    url.searchParams.set("mode", next);
    window.history.replaceState(null, "", url.toString());
    if (next === "clinical" && !isOnboarded()) {
      setShowOnboarding(true);
    }
  }, []);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-5 pb-8">
      <InsultHeader
        activeMode={mode}
        onModeChange={handleModeChange}
        isLoading={streaming}
      />

      {/* Tone control — clinical-only, its own row so the global header
        * stays consistent across modes (and doesn't overflow on the chat's
        * max-w-3xl frame when the four-chip selector would compete with
        * the mode switcher). Safety can lower the effective tone server-
        * side regardless of what's picked here. */}
      {mode === "clinical" && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <IntensitySelector value={tone} onChange={setTone} disabled={streaming} />
          <LowerIntensityButton value={tone} onLower={setTone} disabled={streaming} />
        </div>
      )}

      {/* Demo prompts — only in clinical mode AND only when the chat is
        * empty (first turn). Tap fills the composer; user can edit before
        * sending. The crisis prompt is the load-bearing demo differentiator
        * — comedy as UX, infrastructure as behavior. */}
      {mode === "clinical" && messages.length === 0 && (
        <DemoPrompts
          disabled={streaming}
          onPick={(p) => {
            setSeedDraft(p.text);
            setTone(p.suggested_tone);
          }}
        />
      )}

      <ChatView
        messages={messages}
        onSpeak={handleSpeak}
        speakingId={speakingId}
        mode={mode}
      />

      <div className="sticky bottom-2 mt-2">
        <ChatInput
          onSend={send}
          onAbort={abort}
          streaming={streaming}
          seedDraft={seedDraft}
          mode={mode}
        />
        <div className="mt-2 flex items-center justify-center gap-3 text-[10px]">
          <PoweredBy />
          <span className="text-zinc-700">·</span>
          <a
            href="/library"
            className="iai-hint hover:text-zinc-300"
            title="Manage uploaded documents and corpora"
          >
            Knowledge base →
          </a>
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
          retryStatus={tts.retryStatus}
          onClose={handlePlayerClose}
          voiceLabel="onyx"
        />
      )}

      {/* Onboarding dialog — shown the first time a user lands on the
        * clinical persona (whether via deep-link or mode-switch).
        * localStorage gates re-show. */}
      {showOnboarding && (
        <OnboardingDialog
          initialTone={tone}
          onAccept={(t) => {
            setTone(t);
            setShowOnboarding(false);
          }}
          onDismiss={() => setShowOnboarding(false)}
        />
      )}
    </main>
  );
}
