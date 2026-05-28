"use client";

import { type ChangeEvent, type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { MAX_CHAT_MESSAGE_CHARS, MAX_INLINE_ATTACHMENT_BYTES } from "../../lib/api";
import { getUIIcon } from "../../lib/icons";
import { Button } from "../ui/Button";
import { Textarea } from "../ui/Textarea";
import { PulseRings } from "./PulseRings";
import { RecordingTimer } from "./RecordingTimer";
import { useAudioAnalysis } from "./useAudioAnalysis";
import type { ChatMode } from "./useChat";
import { useVoiceCapture } from "./useVoiceCapture";

const SendIcon = getUIIcon("send");
const StopIcon = getUIIcon("stop");
const MicIcon = getUIIcon("mic");
const AttachIcon = getUIIcon("attach");

const PLACEHOLDER_BY_MODE: Record<ChatMode, string> = {
  roast:
    "Drop a claim, link, or messy thought. I'll bring receipts and a controlled burn.",
  brief: "Paste a company URL or claim. I'll fetch live signals and brief you.",
  clinical: "What's eating you today? I'll listen first, then we work.",
};

const PRIMARY_LABEL_EMPTY: Record<ChatMode, string> = {
  roast: "Start Roast",
  brief: "Start Brief",
  clinical: "Start",
};

const PRIMARY_LABEL_DRAFT: Record<ChatMode, string> = {
  roast: "Roast this",
  brief: "Brief this",
  clinical: "Work through this",
};

/** Composer: textarea + mic + send button. Enter sends, Shift+Enter newline.
 * While streaming, the send becomes "Stop" so the user can cancel mid-roast.
 *
 * Voice input wiring (aurity-style):
 *   - `useVoiceCapture` owns the mic lifecycle (MediaRecorder → POST
 *     /voice/transcribe → onTranscribed).
 *   - `useAudioAnalysis` reads the live MediaStream's FFT for VAD: gives
 *     us `audioLevel` (0-255) and `isSilent`.
 *   - `<PulseRings>` paints the VAD around the button (green for voice,
 *     red for silence) so the user knows the mic actually heard them.
 *   - `<RecordingTimer>` shows MM:SS while recording, with a pulsing dot.
 *
 * The mic input APPENDS to the existing draft (with a space separator)
 * — multi-sentence dictation across taps. */
export function ChatInput({
  onSend,
  onAbort,
  streaming,
  placeholder,
  seedDraft,
  mode = "roast",
}: {
  onSend: (text: string) => void;
  onAbort: () => void;
  streaming: boolean;
  placeholder?: string;
  /** When the parent wants to populate the composer (e.g. a DemoPrompts
   * tap), pass the text here. Each new value REPLACES the current draft.
   * Pass an object wrapper or bump a nonce externally if you need to
   * re-seed the SAME text twice in a row. */
  seedDraft?: string;
  /** Drives placeholder + primary button copy so the composer truthfully
   * announces what the current mode will do with the draft. */
  mode?: ChatMode;
}) {
  const [draft, setDraft] = useState("");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const inputId = useId();

  // Apply a parent-supplied seed when it changes. We compare against a
  // ref of the LAST applied value so the user's manual edits don't get
  // clobbered on re-render — only NEW seeds wins.
  const lastSeedRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (seedDraft !== undefined && seedDraft !== lastSeedRef.current) {
      lastSeedRef.current = seedDraft;
      setDraft(seedDraft);
    }
  }, [seedDraft]);

  const voice = useVoiceCapture({
    onTranscribed: (text) => {
      setDraft((prev) => (prev.trim() ? `${prev.trimEnd()} ${text}` : text));
      setVoiceError(null);
    },
    onError: (msg) => setVoiceError(msg),
  });

  // Pipe the live stream into the FFT analyser only while recording.
  // When the recorder stops the stream becomes null and `isActive` flips
  // false — the AudioContext is closed by the cleanup effect.
  const { audioLevel, isSilent } = useAudioAnalysis(voice.stream, {
    isActive: voice.state === "recording",
  });

  const submit = () => {
    const t = draft.trim();
    if (!t || streaming) return;
    onSend(t);
    setDraft("");
  };

  // Attach: a paperclip that reads a `.txt` or `.md` locally and APPENDS its
  // text to the current draft (fenced block + filename label). No backend
  // round-trip — the agent sees the file content as part of the user
  // message. For large RAG docs use /library instead; this is the inline
  // "drop one bio / snippet into the conversation" path.
  const attachRef = useRef<HTMLInputElement>(null);
  const [attachError, setAttachError] = useState<string | null>(null);

  const handleAttachChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so re-picking the SAME file fires onChange again.
    e.target.value = "";
    if (!file) return;
    setAttachError(null);
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".txt") && !lower.endsWith(".md")) {
      setAttachError(`only .txt and .md supported (got ${file.name})`);
      return;
    }
    if (file.size > MAX_INLINE_ATTACHMENT_BYTES) {
      setAttachError(
        `file too large (${(file.size / 1024).toFixed(0)} KB). Use /library for bigger docs.`,
      );
      return;
    }
    void file.text().then((content) => {
      const trimmed = content.trim();
      if (!trimmed) {
        setAttachError("file is empty");
        return;
      }
      const block = `\n\n--- ${file.name} ---\n${trimmed}\n--- end ---\n`;
      setDraft((prev) => {
        const next = prev ? prev + block : block.trimStart();
        if (next.length > MAX_CHAT_MESSAGE_CHARS) {
          setAttachError(`draft would exceed ${MAX_CHAT_MESSAGE_CHARS} chars`);
          return prev;
        }
        return next;
      });
    }).catch(() => {
      setAttachError("could not read file");
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const micBusy = voice.state !== "idle";
  const micTitle =
    voice.state === "recording"
      ? "tap to stop and transcribe"
      : voice.state === "transcribing"
        ? "transcribing…"
        : "tap to dictate";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Textarea
          id={inputId}
          name="message"
          className="min-h-[3rem] flex-1"
          rows={2}
          value={draft}
          placeholder={placeholder ?? PLACEHOLDER_BY_MODE[mode]}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={streaming}
          maxLength={MAX_CHAT_MESSAGE_CHARS}
          aria-label="message to the agent"
        />
        <div className="flex items-stretch gap-2">
          {/* Hidden file input + paperclip button. Reads .txt/.md locally
            * and inlines the text into the draft — no backend call. The
            * /library page is the place to push a doc into the pgvector
            * corpus; this is the inline "drop a bio into the conversation"
            * shortcut. */}
          <input
            ref={attachRef}
            type="file"
            accept=".txt,.md"
            className="hidden"
            onChange={handleAttachChange}
            aria-hidden
            tabIndex={-1}
          />
          <Button
            type="button"
            variant="chip"
            onClick={() => attachRef.current?.click()}
            disabled={streaming}
            className="h-12 w-12 justify-center px-0"
            title="attach a .txt or .md file (inline into your draft)"
            aria-label="attach a file"
          >
            <AttachIcon className="h-5 w-5" aria-hidden />
          </Button>
          {/* Mic button — wrapped in a relative shell so PulseRings can
            * paint on top while recording. Rings respond to the live
            * audioLevel; color flips between green (voice landing) and
            * red (silent — user might not realize). */}
          <div className="relative h-12 w-12">
            {voice.state === "recording" && (
              <PulseRings audioLevel={audioLevel} isSilent={isSilent} />
            )}
            <Button
              type="button"
              variant="chip"
              onClick={voice.toggle}
              disabled={streaming || voice.state === "transcribing"}
              className={`relative z-10 h-12 w-12 justify-center px-0 ${
                voice.state === "recording"
                  ? "border-iai-fire/60 bg-iai-fire/15 text-iai-fire"
                  : ""
              }`}
              title={micTitle}
              aria-label={micTitle}
              aria-pressed={voice.state === "recording"}
            >
              {voice.state === "transcribing" ? (
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
                </svg>
              ) : (
                <MicIcon className="h-5 w-5" aria-hidden />
              )}
            </Button>
          </div>
          {streaming ? (
            <Button
              type="button"
              variant="ghost"
              onClick={onAbort}
              className="h-12 px-5"
              aria-label="stop the current turn"
            >
              <StopIcon className="h-4 w-4" aria-hidden />
              Stop
            </Button>
          ) : (
            <Button
              type="button"
              variant="primary"
              onClick={submit}
              disabled={!draft.trim() || micBusy}
              className="h-12 px-5"
              aria-label="send message"
            >
              {draft.trim() ? PRIMARY_LABEL_DRAFT[mode] : PRIMARY_LABEL_EMPTY[mode]}
              <SendIcon className="h-4 w-4" aria-hidden />
            </Button>
          )}
        </div>
      </div>
      {/* Status row: timer when recording, error when something failed.
        * Retry feedback gets its own line ("rate-limited, retrying in
        * 32s") so a multi-second backoff doesn't look like a hang. */}
      <div className="flex items-center justify-between gap-2 px-1 min-h-[18px]">
        {voice.state === "recording" ? (
          <RecordingTimer time={voice.recordingTime} />
        ) : voice.state === "transcribing" ? (
          voice.retryStatus ? (
            <span className="iai-hint text-xs text-amber-300">
              rate-limited — retry {voice.retryStatus.attempt} in{" "}
              {Math.ceil(voice.retryStatus.waitMs / 1000)}s…
            </span>
          ) : (
            <span className="iai-hint iai-hint-live text-xs">transcribing…</span>
          )
        ) : (
          <span />
        )}
        {(voiceError || attachError) && (
          <span className="iai-hint text-xs text-amber-400">
            {voiceError ?? attachError}
          </span>
        )}
      </div>
    </div>
  );
}
