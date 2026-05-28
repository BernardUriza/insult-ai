"use client";

import type { ChatTone } from "./types";

/** Tone selector for the clinical_compadre mode.
 *
 * Four buttons, one selected at any time. The current tone gets the warm
 * iai-fire accent; the rest stay neutral chips. Compact horizontal layout
 * — meant to sit under the chat header without competing with the
 * conversation surface.
 *
 * Each tone carries a short hint describing what the persona does at that
 * level (no jab / one sharp line / sharper / direct coach mode). */

const TONES: { value: ChatTone; label: string; hint: string }[] = [
  { value: "soft", label: "Soft", hint: "no jab" },
  { value: "medium", label: "Medium", hint: "one sharp line" },
  { value: "spicy", label: "Spicy", hint: "sharper, never cruel" },
  { value: "no_insults", label: "No insults", hint: "direct coach mode" },
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
      aria-label="roast intensity"
    >
      <span className="iai-hint mr-1 text-[11px] uppercase tracking-wider">
        intensity
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
      title={`lower to ${next}`}
    >
      lower intensity
    </button>
  );
}

function nextLower(t: ChatTone): ChatTone | null {
  if (t === "spicy") return "medium";
  if (t === "medium") return "soft";
  // soft and no_insults have no lower notch
  return null;
}
