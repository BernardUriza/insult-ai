"use client";

import { useState } from "react";
import type { ChatTone } from "./useChat";
import { IntensitySelector } from "./IntensitySelector";

/** Consent + tone-pick dialog shown ONCE before the user starts a clinical
 * conversation. Two beats:
 *
 *   1. What this is (and what it isn't) — comedy as UX, infrastructure as
 *      behavior. Not therapy, not diagnosis, not crisis counseling. Hand-
 *      off rules are explicit.
 *   2. Pick the tone you want — the user owns the intensity ceiling
 *      throughout the session; safety can override DOWN but never up.
 *
 * Persisted in localStorage so a returning user isn't gated each time. The
 * key (`insult_ai.clinical.onboarded.v1`) is versioned so a content update
 * can re-show the dialog when the contract changes meaningfully.
 *
 * Modal but not blocking — the user can hit Escape / click outside to
 * dismiss. Dismissal counts as consent at default tone (medium); we don't
 * trap them in a yes-or-die dialog. */

const STORAGE_KEY = "insult_ai.clinical.onboarded.v1";

export function isOnboarded(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function markOnboarded(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* private mode, etc. — still let them through */
  }
}

export function OnboardingDialog({
  initialTone,
  onAccept,
  onDismiss,
}: {
  initialTone: ChatTone;
  onAccept: (tone: ChatTone) => void;
  onDismiss: () => void;
}) {
  const [tone, setTone] = useState<ChatTone>(initialTone);

  const accept = () => {
    markOnboarded();
    onAccept(tone);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          markOnboarded();
          onDismiss();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div className="iai-card-sample flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col gap-3 overflow-y-auto bg-iai-bg/95 p-4 sm:gap-4 sm:p-5">
        <h2 id="onboarding-title" className="text-xl font-extrabold text-zinc-100 sm:text-2xl">
          Before we start
        </h2>
        <p className="text-sm leading-relaxed text-zinc-200 sm:text-base">
          I'm the <span className="iai-brand font-semibold">Roast Coach</span>.
          I roast with affection and push with coaching. No identity attacks.
          No real cruelty.
        </p>
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-zinc-300">
          <li><span className="text-zinc-100">Not</span> a therapist, not a doctor, not a crisis line.</li>
          <li><span className="text-zinc-100">Am</span> the friend who's seen the pattern, calls the bullshit, and leaves you with ONE concrete action.</li>
          <li>If something serious comes up, I drop the persona and hand you a real resource.</li>
          <li>You pick the intensity. You can lower it at any time.</li>
        </ul>

        <div className="rounded-lg border border-iai-border bg-iai-surface/40 p-3">
          <IntensitySelector value={tone} onChange={setTone} />
          <p className="iai-hint mt-2 text-xs">
            You can change the intensity later, from the chat header.
          </p>
        </div>

        <div className="sticky bottom-0 -mx-4 -mb-4 flex items-center justify-end gap-2 border-t border-iai-border/60 bg-iai-surface/95 px-4 py-3 backdrop-blur sm:-mx-5 sm:-mb-5 sm:px-5">
          <button
            type="button"
            onClick={() => {
              markOnboarded();
              onDismiss();
            }}
            className="iai-btn-chip"
          >
            close
          </button>
          <button
            type="button"
            onClick={accept}
            className="iai-btn-primary"
          >
            start
          </button>
        </div>
      </div>
    </div>
  );
}
