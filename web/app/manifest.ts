import type { MetadataRoute } from "next";

// Required when output: "export" is set in next.config.ts — the manifest is
// a Route Handler under the hood, and the static-export builder won't
// pre-render dynamic routes. force-static guarantees the manifest lands as
// a plain /manifest.webmanifest in the SWA bundle.
export const dynamic = "force-static";

// PWA manifest — served at /manifest.webmanifest by Next.js 16's file-based
// convention. The <link rel="manifest"> tag is injected automatically into
// every page's <head>; no need to wire it through `metadata` in layout.tsx.
//
// theme_color is iai-fire (#FF5C28) — the only color that says "Insult AI"
// without text. On Android, this paints the chrome bar and the status-bar
// tint when the app is installed to home screen. background_color is iai-bg
// (kept in sync with web/app/globals.css @theme tokens), used by Android to
// paint the splash before the JS bundle paints anything.
//
// Description avoids "receipts" globally: clinical mode is conversational
// and has no Bright Data, so the receipts pitch doesn't apply across all
// three personas. The current line names the three modes' shape (roast,
// brief, coaching) without overpromising sources where they don't exist.

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Insult AI",
    short_name: "Insult AI",
    description:
      "AI roasts, intelligence briefs, and sharp coaching — with guardrails.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone", "browser"],
    background_color: "#091B36",
    theme_color: "#FF5C28",
    categories: ["productivity", "utilities", "entertainment"],
    orientation: "portrait-primary",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Start Roast",
        short_name: "Roast",
        description: "Open Insult AI in roast mode.",
        url: "/chat?mode=roast",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Get Briefed",
        short_name: "Brief",
        description: "Open Insult AI in intelligence brief mode.",
        url: "/chat?mode=brief",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Clinical Coaching",
        short_name: "Clinical",
        description: "Open Insult AI in clinical coaching mode.",
        url: "/chat?mode=clinical",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
