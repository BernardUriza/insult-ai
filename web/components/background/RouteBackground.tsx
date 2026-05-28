"use client";

import { usePathname } from "next/navigation";
import { EmberField } from "./EmberField";
import { LavaShaderBackground } from "./LavaShaderBackground";

/** RouteBackground — picks the animated backdrop by route.
 *
 *  Landing ("/") gets the molten lava shader; every app surface (chat,
 *  library, …) gets the lighter curl-noise ember field.
 *
 *  Mounted ONCE at the root, as a sibling of (and BEFORE) PageTransition —
 *  deliberately outside the animated subtree. PageTransition wraps pages in
 *  a motion.div whose `transform`/`filter` create a containing block for
 *  `position: fixed`; rendering the backdrop here keeps it anchored to the
 *  viewport (not the scrolling/animating page) and lets it persist
 *  continuously while routes cross-fade.
 */
export function RouteBackground() {
  const pathname = usePathname();

  if (pathname === "/") return <LavaShaderBackground />;

  if (pathname === "/chat" || pathname === "/library") {
    return (
      <EmberField
        opacity={0.075}
        veilAlpha={0.42}
        glowScale={0.42}
        idleSpeed={0.18}
        activeSpeed={14}
        activityDriven
      />
    );
  }

  return <EmberField />;
}
