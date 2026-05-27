"use client";

import { type KeyboardEvent, useId, useState } from "react";
import { getUIIcon } from "../../lib/icons";
import { Button } from "../ui/Button";
import { Textarea } from "../ui/Textarea";
import { useVoiceCapture } from "./useVoiceCapture";

const SendIcon = getUIIcon("send");
const StopIcon = getUIIcon("stop");
const MicIcon = getUIIcon("mic");

/** Composer: textarea + send button. Enter sends, Shift+Enter newline. While
 * streaming, the button becomes "Stop" so the user can cancel mid-roast.
 *
 * Built from the shared `<Textarea>` + `<Button>` primitives (single source for
 * iai-input / iai-btn-* styling); a previous version inlined the raw HTML which
 * was the only place in the app that diverged from the design-system surface. */
export function ChatInput({
  onSend,
  onAbort,
  streaming,
  placeholder,
}: {
  onSend: (text: string) => void;
  onAbort: () => void;
  streaming: boolean;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  // useId so a second ChatInput on the same page can't clash. Was hardcoded
  // "chat-input" which would have collided in any multi-chat surface.
  const inputId = useId();

  // Voice input — mic captures audio → Whisper → text appends to the draft.
  // We APPEND (with a leading space when the draft already has content)
  // instead of replacing, so a user can dictate multiple sentences in a row
  // by tapping the mic between each. Mic is disabled while the turn streams
  // — letting a user dictate over a live response would just queue confusion.
  const voice = useVoiceCapture({
    onTranscribed: (text) => {
      setDraft((prev) => (prev.trim() ? `${prev.trimEnd()} ${text}` : text));
      setVoiceError(null);
    },
    onError: (msg) => setVoiceError(msg),
  });

  const submit = () => {
    const t = draft.trim();
    if (!t || streaming) return;
    onSend(t);
    setDraft("");
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
          placeholder={placeholder ?? "URL or claim… (Enter sends · Shift+Enter newline)"}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={streaming}
          aria-label="message to the agent"
        />
        <div className="flex items-stretch gap-2">
          {/* Mic button — toggles recording. While recording, the icon
            * pulses red to make the active state unmistakable (browsers also
            * show a tab-level mic indicator, but the in-UI feedback is what
            * the user notices first). */}
          <Button
            type="button"
            variant="chip"
            onClick={voice.toggle}
            disabled={streaming || voice.state === "transcribing"}
            className={`h-12 w-12 justify-center px-0 ${
              voice.state === "recording"
                ? "border-red-500/60 bg-red-500/15 text-red-300 animate-pulse"
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
              Roast
              <SendIcon className="h-4 w-4" aria-hidden />
            </Button>
          )}
        </div>
      </div>
      {voiceError && (
        <span className="iai-hint text-xs text-amber-400">{voiceError}</span>
      )}
    </div>
  );
}
