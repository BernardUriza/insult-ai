"use client";

import { type KeyboardEvent, useState } from "react";

/** Composer: textarea + send button. Enter sends, Shift+Enter newline. While
 * streaming, the button becomes "Stop" so the user can cancel mid-roast. */
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
      <textarea
        id="chat-input"
        name="message"
        className="iai-input min-h-[3rem] flex-1 resize-y"
        rows={2}
        value={draft}
        placeholder={placeholder ?? "URL o claim… (Enter para mandar, Shift+Enter para salto de línea)"}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={streaming}
        aria-label="mensaje al agente"
      />
      {streaming ? (
        <button type="button" onClick={onAbort} className="iai-btn-ghost h-12 px-5">
          ⏹ Parar
        </button>
      ) : (
        <button
          type="button"
          onClick={submit}
          disabled={!draft.trim()}
          className="iai-btn-primary h-12 px-5 disabled:opacity-40"
        >
          Roast ↵
        </button>
      )}
    </div>
  );
}
