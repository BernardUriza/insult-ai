"use client";

import { type KeyboardEvent, useId, useState } from "react";
import { getUIIcon } from "../../lib/icons";
import { Button } from "../ui/Button";
import { Textarea } from "../ui/Textarea";

const SendIcon = getUIIcon("send");
const StopIcon = getUIIcon("stop");

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
  // useId so a second ChatInput on the same page can't clash. Was hardcoded
  // "chat-input" which would have collided in any multi-chat surface.
  const inputId = useId();

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

  return (
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
          disabled={!draft.trim()}
          className="h-12 px-5"
          aria-label="send message"
        >
          Roast
          <SendIcon className="h-4 w-4" aria-hidden />
        </Button>
      )}
    </div>
  );
}
