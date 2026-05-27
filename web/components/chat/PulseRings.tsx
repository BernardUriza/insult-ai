"use client";

import { motion } from "framer-motion";

/** Three concentric rings that expand and contract WITH the user's voice.
 *
 * `audioLevel` (0-255) drives the scale: silence keeps rings near 1.0; loud
 * speech pulls them out toward ~2.0. `isSilent` switches the color — red
 * when the recorder hears nothing (user might not realize the mic missed
 * them), green when voice is actually landing.
 *
 * Ported from aurity (components/recording/PulseRings.tsx, VAD variant
 * only — aurity ships ping/concentric/vad styles; we only need VAD here).
 * Adapted to inline CSS instead of `rec-pulse-*` classes so this drops in
 * without globals.css changes. */
export function PulseRings({
  audioLevel = 0,
  isSilent = true,
}: {
  audioLevel?: number;
  isSilent?: boolean;
}) {
  // audioLevel 0-255 → scale 1.0-2.0. Silence stays at 1.0 so the
  // rings don't twitch when nothing is happening.
  const audioScale = !isSilent ? Math.max(1, 1 + (audioLevel / 255) * 1.0) : 1;
  // rgb(239,68,68) = tailwind red-500; rgb(34,197,94) = green-500.
  const ringColor = isSilent ? "rgb(239, 68, 68)" : "rgb(34, 197, 94)";

  const rings = [
    { baseScale: 1.2, opacity: 0.6 },
    { baseScale: 1.4, opacity: 0.4 },
    { baseScale: 1.6, opacity: 0.2 },
  ];

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
    >
      {rings.map((ring, i) => (
        <motion.div
          key={i}
          className="absolute h-full w-full rounded-full border-2"
          style={{ borderColor: ringColor }}
          animate={{
            scale: audioScale * ring.baseScale,
            opacity: ring.opacity,
          }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}
