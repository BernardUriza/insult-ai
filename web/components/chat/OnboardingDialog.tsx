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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
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
      <div className="iai-card-sample w-full max-w-lg flex flex-col gap-4">
        <h2 id="onboarding-title" className="text-2xl font-extrabold text-zinc-100">
          Antes de empezar
        </h2>
        <p className="text-zinc-200 leading-relaxed">
          Soy <span className="iai-brand font-semibold">El Compadre Clínico</span>.
          Te insulto con cariño, te empujo con coaching. Nada de identidad,
          nada de crueldad real.
        </p>
        <ul className="text-sm text-zinc-300 leading-relaxed space-y-1.5 list-disc pl-5">
          <li><span className="text-zinc-100">No soy</span> terapeuta, médico, ni línea de crisis.</li>
          <li><span className="text-zinc-100">Sí soy</span> el compa que ya vio el patrón, llama el bullshit y te deja con UNA acción concreta.</li>
          <li>Si dices algo grave, suelto el personaje y te paso un recurso real.</li>
          <li>Tú escoges la intensidad. Puedes bajarla en cualquier momento.</li>
        </ul>

        <div className="rounded-lg border border-iai-border bg-iai-surface/40 p-3">
          <IntensitySelector value={tone} onChange={setTone} />
          <p className="iai-hint mt-2 text-xs">
            Puedes cambiar la intensidad después, en el header del chat.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              markOnboarded();
              onDismiss();
            }}
            className="iai-btn-chip"
          >
            cerrar
          </button>
          <button
            type="button"
            onClick={accept}
            className="iai-btn-primary"
          >
            empezar
          </button>
        </div>
      </div>
    </div>
  );
}
