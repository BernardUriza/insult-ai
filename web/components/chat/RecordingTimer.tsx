"use client";

import { motion } from "framer-motion";

/** MM:SS recording timer with a pulsing red dot.
 *
 * Ported from aurity (components/recording/RecordingTimer.tsx). Inline
 * tailwind in place of aurity's `rec-timer-*` classes so this drops in
 * without globals.css edits. Dot opacity pulses on a 1.5s loop —
 * unmistakable "we're rolling" cue next to the timer. */

export function formatRecordingTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function RecordingTimer({
  time,
  showDot = true,
  className = "",
}: {
  time: number;
  showDot?: boolean;
  className?: string;
}) {
  if (time <= 0) return null;
  return (
    <div
      className={`inline-flex items-center gap-1.5 text-sm font-mono tabular-nums text-zinc-200 ${className}`}
    >
      {showDot && (
        <motion.span
          aria-hidden
          className="block h-2 w-2 rounded-full bg-red-500"
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
      <span>{formatRecordingTime(time)}</span>
    </div>
  );
}
