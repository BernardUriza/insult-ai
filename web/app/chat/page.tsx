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
import { ReportInput } from "../../components/roast/ReportInput";
import { ReportPlanPanel } from "../../components/roast/ReportPlanPanel";
import { ReportView } from "../../components/roast/ReportView";
import { ConversationShell } from "../../components/layout/ConversationShell";
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
  const [backend, setBackend] = useState<string | undefined>(undefined);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [debugPlayer, setDebugPlayer] = useState(false);
  const [apiDown, setApiDown] = useState(false);

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
    const backendParam = url.searchParams.get("backend");
    if (backendParam === "claude" || backendParam === "codex") setBackend(backendParam);
    setDebugPlayer(
      process.env.NODE_ENV !== "production" && url.searchParams.get("debugPlayer") === "1",
    );
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

  const { messages, streaming, send, abort, reset } = useChat({ corpusId, mode, tone, backend });

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080"}/health`)
      .then((r) => setApiDown(!r.ok))
      .catch(() => setApiDown(true));
  }, []);

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
    setDebugPlayer(false);
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

  // roast/brief render as a two-column REPORT (input at top, plan left,
  // response right); clinical stays a conversational chat (composer at
  // bottom). The split is the whole reason ConversationShell exists.
  const isReport = mode === "roast" || mode === "brief";
  const reportMode: "roast" | "brief" = mode === "brief" ? "brief" : "roast";
  // The report shows the LATEST assistant turn — roast/brief are
  // one-target-one-report, not a scrollback.
  const lastAssistant =
    [...messages].reverse().find((m) => m.role === "assistant") ?? null;

  // Docked audio player — rendered by the shell, never overlaps content.
  const player =
    debugPlayer || speakingId || tts.isLoading || tts.error ? (
      <AudioPlayer
        audioUrl={tts.audioUrl}
        isLoading={debugPlayer || tts.isLoading}
        error={tts.error}
        retryStatus={tts.retryStatus}
        onClose={handlePlayerClose}
        voiceLabel="onyx"
      />
    ) : null;

  const handleReset = useCallback(() => {
    reset();
    tts.close();
    setSpeakingId(null);
  }, [reset, tts]);

  // Footer (powered-by + library + new) — shown in both layouts.
  const footer = (
    <>
      {apiDown && (
        <p className="mb-2 rounded-lg border border-amber-700/60 bg-amber-950/40 px-3 py-2 text-center text-xs text-amber-300">
          API unreachable — check that the backend is running.
        </p>
      )}
      <div className="mt-1 flex flex-wrap items-center justify-center gap-2 text-[10px]">
        <PoweredBy />
        <span className="text-zinc-700">·</span>
        <a
          href="/library"
          className="iai-hint inline-flex min-h-[44px] items-center rounded-full px-2 hover:text-zinc-300"
          title="Manage uploaded documents and corpora"
        >
          Knowledge base →
        </a>
        {messages.length > 0 && (
          <>
            <span className="text-zinc-700">·</span>
            <button
              type="button"
              onClick={handleReset}
              disabled={streaming}
              className="iai-hint inline-flex min-h-[44px] items-center rounded-full px-2 hover:text-zinc-300 disabled:opacity-40"
              title="Clear conversation and start fresh"
            >
              New conversation
            </button>
          </>
        )}
      </div>
    </>
  );

  return (
    <>
      <ConversationShell
        header={
          <InsultHeader activeMode={mode} onModeChange={handleModeChange} isLoading={streaming} />
        }
        topBar={
          isReport ? (
            <ReportInput
              mode={reportMode}
              streaming={streaming}
              onSend={send}
              onAbort={abort}
              seed={seedDraft}
            />
          ) : (
            <div className="flex flex-col gap-2 rounded-xl border border-iai-border/70 bg-iai-surface/25 p-2 sm:flex-row sm:items-center sm:justify-between">
              <IntensitySelector value={tone} onChange={setTone} disabled={streaming} />
              <LowerIntensityButton value={tone} onLower={setTone} disabled={streaming} />
            </div>
          )
        }
        secondary={isReport ? <ReportPlanPanel message={lastAssistant} /> : undefined}
        bottomBar={
          isReport ? undefined : (
            <>
              <ChatInput
                onSend={send}
                onAbort={abort}
                streaming={streaming}
                seedDraft={seedDraft}
                mode={mode}
              />
              {footer}
            </>
          )
        }
        player={player}
      >
        {isReport ? (
          <div className="flex flex-col gap-4">
            <ReportView
              mode={reportMode}
              message={lastAssistant}
              onSpeak={handleSpeak}
              speakingId={speakingId}
            />
            {footer}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Demo prompts — clinical only, first turn. The crisis prompt is
              * the load-bearing demo differentiator (comedy as UX). */}
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
          </div>
        )}
      </ConversationShell>

      {/* Onboarding dialog — first clinical landing only; localStorage-gated. */}
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
    </>
  );
}
