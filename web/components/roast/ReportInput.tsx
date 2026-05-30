"use client";

import { type KeyboardEvent, useEffect, useState } from "react";
import { getUIIcon } from "../../lib/icons";
import type { ChatMode } from "../chat/types";
import { Button } from "../ui/Button";

const FlameIcon = getUIIcon("brand");
const GlobeIcon = getUIIcon("external");
const StopIcon = getUIIcon("stop");

const LABEL: Record<Exclude<ChatMode, "clinical">, { run: string; placeholder: string }> = {
  roast: {
    run: "Roast It",
    placeholder: "Paste a company URL or a claim to fact-check…",
  },
  brief: {
    run: "Brief It",
    placeholder: "Paste a company URL or claim — I'll fetch live signals and brief you.",
  },
};

/** Top input bar for the report modes (roast / brief).
 *
 *  The report view's input lives at the TOP (not a bottom composer) — type a
 *  target, get a report below. Single-line URL/claim field + a mode-aware
 *  primary button, matching the approved mockup. While a turn streams the
 *  button flips to Stop so the user can cancel.
 *
 *  Deliberately leaner than the clinical composer: no mic, no paperclip —
 *  those belong to the conversational surface. A report target is a URL or a
 *  claim, typed once.
 */
export function ReportInput({
  mode,
  streaming,
  onSend,
  onAbort,
  seed,
  onDraftChange,
}: {
  mode: "roast" | "brief";
  streaming: boolean;
  onSend: (text: string) => void;
  onAbort: () => void;
  /** Optional pre-fill (deep-link `?seed=`). Applied once per change. */
  seed?: string;
  /** Lets the empty report canvas react while the user is still pasting. */
  onDraftChange?: (value: string) => void;
}) {
  const [value, setValue] = useState("");

  useEffect(() => {
    if (seed) {
      setValue(seed);
      onDraftChange?.(seed);
    }
  }, [seed, onDraftChange]);

  const updateValue = (next: string) => {
    setValue(next);
    onDraftChange?.(next);
  };

  const submit = () => {
    const t = value.trim();
    if (!t || streaming) return;
    onSend(t);
    // Keep the target in the field so the user sees what was roasted.
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  };

  const copy = LABEL[mode];

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="iai-input iai-kinetic-panel flex min-w-0 flex-1 items-center gap-2 py-0 pl-3 pr-0">
        <GlobeIcon className="iai-spin-slow relative z-10 h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
        <input
          type="text"
          value={value}
          onChange={(e) => updateValue(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={streaming}
          placeholder={copy.placeholder}
          aria-label={`${mode} target — a URL or a claim`}
          className="relative z-10 min-h-[44px] min-w-0 flex-1 bg-transparent text-zinc-100 outline-none placeholder:text-zinc-500"
        />
      </div>
      {streaming ? (
        <Button type="button" variant="ghost" onClick={onAbort} className="h-12 px-5" aria-label="stop the current turn">
          <StopIcon className="h-4 w-4" aria-hidden />
          Stop
        </Button>
      ) : (
        <Button
          type="button"
          variant="primary"
          onClick={submit}
          disabled={!value.trim()}
          className="h-12 px-5"
        >
          {copy.run}
          <FlameIcon className="iai-wobble-slow h-4 w-4" aria-hidden />
        </Button>
      )}
    </div>
  );
}
