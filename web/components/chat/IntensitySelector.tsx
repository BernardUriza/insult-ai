"use client";

import type { ChatTone } from "./useChat";

/** Tone selector for the clinical_compadre mode.
 *
 * Four buttons, one selected at any time. The current tone gets the warm
 * iai-fire accent; the rest stay neutral chips. Compact horizontal layout
 * — meant to sit under the chat header without competing with the
 * conversation surface.
 *
 * The label triple is "compa-tone" first ("medio / cabrón controlado") then
 * the en-US gloss in parentheses — the user gets the persona's voice in
 * the chrome too, not just in the responses. */

const TONES: { value: ChatTone; label: string; hint: string }[] = [
  { value: "soft", label: "suave", hint: "sin jab" },
  { value: "medium", label: "medio", hint: "una línea punzante" },
  { value: "spicy", label: "cabrón", hint: "controlado, sin crueldad" },
  { value: "no_insults", label: "sin insultos", hint: "coach directo" },
];

export function IntensitySelector({
  value,
  onChange,
  disabled = false,
}: {
  value: ChatTone;
  onChange: (next: ChatTone) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      role="radiogroup"
      aria-label="intensidad del compadre"
    >
      <span className="iai-hint mr-1 text-[11px] uppercase tracking-wider">
        intensidad
      </span>
      {TONES.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(t.value)}
            title={t.hint}
            className={
              active
                ? "iai-btn-chip border-iai-fire/60 bg-iai-fire/15 text-iai-fire"
                : "iai-btn-chip"
            }
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/** Down-shift button: drops the current tone one notch. UX shortcut for
 * "this is too much" without making the user open the selector again.
 * No-op when already at `soft` or `no_insults` (no lower notch). */
export function LowerIntensityButton({
  value,
  onLower,
  disabled = false,
}: {
  value: ChatTone;
  onLower: (next: ChatTone) => void;
  disabled?: boolean;
}) {
  const next = nextLower(value);
  if (!next) return null;
  return (
    <button
      type="button"
      onClick={() => onLower(next)}
      disabled={disabled}
      className="iai-btn-chip text-xs"
      title={`bajar a ${next}`}
    >
      bajar intensidad
    </button>
  );
}

function nextLower(t: ChatTone): ChatTone | null {
  if (t === "spicy") return "medium";
  if (t === "medium") return "soft";
  // soft and no_insults have no lower notch
  return null;
}
