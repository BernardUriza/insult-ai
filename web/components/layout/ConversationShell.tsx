"use client";

import type { ReactNode } from "react";

/** ConversationShell — the one parent layout every mode mounts on.
 *
 *  Owns the GLOBAL frame and nothing else:
 *    - header region (full-bleed; InsultHeader self-positions sticky)
 *    - optional top bar (input bar / tone row, below the header)
 *    - main content area
 *    - optional secondary panel → switches the content into a responsive
 *      two-column grid (secondary left, main right on desktop; stacked on
 *      mobile with main first so the payoff leads)
 *    - a docked bottom region for the composer and/or the audio player
 *    - max-width, gutters, spacing, overflow, responsive stacking
 *
 *  Hard rules (the architecture correction that birthed this file):
 *    - NO mode view controls global layout. Modes fill slots, never
 *      position themselves against the viewport.
 *    - The docked player lives HERE, not inside a mode's content — that's
 *      why it can never overlap the composer the way the old fixed-position
 *      player did.
 *    - NO business logic. Pure structure. Anything mode-specific is passed
 *      in as a slot by the page.
 *
 *  Scroll model is page-scroll (not an internal scroll container) on
 *  purpose: ChatConversationView's auto-scroll reads window metrics, and an
 *  internal scroll container would silently break it. The docked region is
 *  `sticky bottom-0`, so it pins above the content without the fixed-position
 *  overlap the old player had.
 */
export function ConversationShell({
  header,
  topBar,
  secondary,
  bottomBar,
  player,
  children,
}: {
  header: ReactNode;
  /** Row directly under the header — the "Roast It" input bar (report
   *  modes) or the tone selector (clinical). */
  topBar?: ReactNode;
  /** Optional left/secondary panel. Presence flips the content into a
   *  two-column grid AND widens the frame (a report needs the room). */
  secondary?: ReactNode;
  /** Sticky-bottom composer (clinical). Report modes omit it — their input
   *  is the topBar. */
  bottomBar?: ReactNode;
  /** Docked audio player. Sits in the bottom region (above the composer if
   *  one exists, else bottom-right on its own). */
  player?: ReactNode;
  children: ReactNode;
}) {
  const twoCol = secondary != null;
  // Wider frame for the two-column report; narrower for single-column chat.
  // Switching modes changes only this token — spacing/gutters stay constant.
  const maxW = twoCol ? "max-w-6xl" : "max-w-3xl";
  const hasDock = player != null || bottomBar != null;

  return (
    <main className={`mx-auto flex w-full flex-1 flex-col px-5 ${maxW}`}>
      {header}

      {topBar && <div className="mt-3">{topBar}</div>}

      <div className="flex-1 py-4">
        {twoCol ? (
          <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
            {/* main first in the DOM so mobile stacks payoff-first; desktop
                order swaps the secondary back to the left column. */}
            <div className="order-2 lg:order-1">{secondary}</div>
            <div className="order-1 lg:order-2">{children}</div>
          </div>
        ) : (
          children
        )}
      </div>

      {hasDock && (
        <div className="sticky bottom-0 z-30 -mx-5 border-t border-iai-border/60 bg-iai-bg/90 px-5 py-3 backdrop-blur-md">
          {player && <div className="mb-2 flex justify-end">{player}</div>}
          {bottomBar}
        </div>
      )}
    </main>
  );
}
