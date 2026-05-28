"use client";

import Link from "next/link";
import { type KeyboardEvent, useRef } from "react";
import { getUIIcon } from "../../lib/icons";
import type { ChatMode } from "../chat/useChat";

const FlameIcon = getUIIcon("brand");

type ModeMeta = {
  label: string;
  badge: string;
  tagline: string;
  /** Tailwind classes for the mode badge pill — picks the warm/cool token
   *  that matches the mode's temperament without leaving the iai-* palette. */
  badgeTone: string;
};

const MODE_META: Record<ChatMode, ModeMeta> = {
  roast: {
    label: "Roast",
    badge: "Witty Roast",
    tagline: "Roasts with receipts. Boundaries included.",
    badgeTone: "border-iai-fire/40 bg-iai-fire/10 text-iai-fire",
  },
  brief: {
    label: "Brief",
    badge: "Intelligence Brief",
    tagline: "Live web intelligence, cited and ready.",
    badgeTone: "border-iai-accent/40 bg-iai-accent/10 text-iai-accent",
  },
  clinical: {
    label: "Clinical",
    badge: "Clinical Roast",
    tagline: "Sharp coaching. Never cruel.",
    badgeTone: "border-iai-ember/40 bg-iai-ember/10 text-iai-ember",
  },
};

const MODES: ChatMode[] = ["roast", "brief", "clinical"];

/** App header for the chat experience.
 *
 *  Three regions: brand block (icon + name + mode-aware badge + tagline),
 *  the mode switcher (segmented pill over the three personas), and
 *  the safety badge. The header is the load-bearing identity surface — it
 *  tells a first-time visitor in under three seconds what this is, what
 *  they can do, and that there are guardrails. Off-mission chrome (nav to
 *  /library, /single-shot, knowledge base) lives elsewhere now.
 *
 *  The tone/intensity selector is rendered separately by the page (clinical
 *  mode only). It's a contextual control on the *active mode*, not a global
 *  header element — keeping it out of the header lets the chrome stay
 *  consistent across all three personas without overflowing on narrower
 *  content widths. */
export function InsultHeader({
  activeMode,
  onModeChange,
  isLoading = false,
}: {
  activeMode: ChatMode;
  onModeChange: (next: ChatMode) => void;
  isLoading?: boolean;
}) {
  const meta = MODE_META[activeMode];
  return (
    <header
      role="banner"
      className="iai-app-header sticky top-0 z-30 -mx-4 border-b border-iai-border/70 bg-iai-bg/92 px-3 py-1.5 backdrop-blur-md sm:-mx-5 sm:px-5 sm:py-4"
    >
      <div className="flex items-center gap-2 sm:flex-col sm:items-start sm:gap-2.5 md:flex-row md:items-center md:justify-between md:gap-6">
        <BrandBlock badge={meta.badge} badgeTone={meta.badgeTone} tagline={meta.tagline} />
        <ModeSwitcher
          active={activeMode}
          onChange={onModeChange}
          disabled={isLoading}
        />
        <div className="flex shrink-0 items-center justify-end">
          <SafetyBadge />
        </div>
      </div>
    </header>
  );
}

function BrandBlock({
  badge,
  badgeTone,
  tagline,
}: {
  badge: string;
  badgeTone: string;
  tagline: string;
}) {
  return (
    <Link
      href="/"
      aria-label="Insult AI — go to home"
      className="group/brand flex h-11 w-11 shrink-0 items-center justify-center rounded-lg outline-offset-4 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-iai-fire sm:h-auto sm:w-auto sm:min-w-0 sm:items-start sm:justify-start sm:gap-2.5"
    >
      <FlameIcon
        className="iai-flame h-6 w-6 shrink-0 transition group-hover/brand:scale-105 sm:mt-0.5 sm:h-7 sm:w-7"
        aria-hidden
      />
      <div className="hidden min-w-0 flex-col sm:flex">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-extrabold tracking-tight text-zinc-100 transition group-hover/brand:text-white sm:text-xl">
            Insult <span className="iai-brand">AI</span>
          </h1>
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${badgeTone}`}
          >
            {badge}
          </span>
        </div>
        <p className="iai-hint mt-0.5 text-xs sm:text-[13px]">{tagline}</p>
      </div>
    </Link>
  );
}

function ModeSwitcher({
  active,
  onChange,
  disabled,
}: {
  active: ChatMode;
  onChange: (next: ChatMode) => void;
  disabled?: boolean;
}) {
  // Refs per radio so the WAI-ARIA radiogroup keyboard pattern can move
  // focus directly to the new option after arrow / Home / End keys.
  // Initialised on first render via ref-callback below; never resized
  // because MODES is a static three-tuple.
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const focusAndActivate = (index: number) => {
    const wrapped = (index + MODES.length) % MODES.length;
    const next = MODES[wrapped];
    onChange(next);
    refs.current[wrapped]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        focusAndActivate(currentIndex + 1);
        return;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        focusAndActivate(currentIndex - 1);
        return;
      case "Home":
        event.preventDefault();
        focusAndActivate(0);
        return;
      case "End":
        event.preventDefault();
        focusAndActivate(MODES.length - 1);
        return;
    }
  };

  return (
    <nav aria-label="Mode" className="min-w-0 flex-1 sm:self-start lg:self-auto">
      <div
        role="radiogroup"
        aria-label="active mode"
        className="flex w-full items-center gap-1 rounded-full border border-iai-border bg-iai-surface/30 p-1 sm:inline-flex sm:w-auto"
      >
        {MODES.map((m, i) => {
          const isActive = m === active;
          return (
            <button
              key={m}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={isActive}
              aria-current={isActive ? "page" : undefined}
              // Only the active radio sits in the natural tab sequence —
              // arrow keys then walk inside the group. This is the canonical
              // WAI-ARIA radiogroup behavior; without it, Tab visits every
              // radio individually which fights with the arrow-key model.
              tabIndex={isActive ? 0 : -1}
              disabled={disabled}
              onClick={() => {
                if (!isActive) onChange(m);
              }}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={[
                "inline-flex min-h-[44px] min-w-0 flex-1 items-center justify-center rounded-full px-2 py-2 text-xs font-semibold transition sm:flex-none sm:px-4 sm:text-sm",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iai-fire",
                isActive
                  ? "bg-iai-fire text-black shadow-[0_2px_12px_-3px_rgb(var(--color-iai-fire-rgb)/0.7)]"
                  : "text-zinc-300 hover:bg-iai-surface/60 hover:text-white",
                disabled ? "cursor-not-allowed opacity-50" : "",
              ].join(" ")}
            >
              {MODE_META[m].label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/** Safety status pill with a keyboard-accessible tooltip.
 *
 *  Cyan instead of green on purpose — green reads as medical/regulatory
 *  approval, which this product is not. Cyan keeps the "calm system status"
 *  feel without overclaiming. */
function SafetyBadge() {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-describedby="iai-safety-tooltip"
        aria-label="Guardrails on"
        className="inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-full border border-iai-accent/40 bg-iai-accent/10 px-0 text-[11px] font-semibold uppercase tracking-wider text-iai-accent transition hover:bg-iai-accent/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iai-accent sm:w-auto sm:px-3 sm:py-2"
      >
        <ShieldDot />
        <span className="sr-only sm:not-sr-only">Guardrails on</span>
      </button>
      <span
        id="iai-safety-tooltip"
        role="tooltip"
        className="pointer-events-none absolute right-0 top-full z-40 mt-2 w-64 rounded-lg border border-iai-border bg-iai-bg p-3 text-xs leading-relaxed text-zinc-300 opacity-0 shadow-2xl transition group-hover:opacity-100 group-focus-within:opacity-100"
      >
        No identity attacks. No crisis jokes. Micro-actions required.
      </span>
    </span>
  );
}

function ShieldDot() {
  return (
    <svg viewBox="0 0 8 8" className="h-2 w-2 fill-current" aria-hidden>
      <circle cx="4" cy="4" r="3" />
    </svg>
  );
}
