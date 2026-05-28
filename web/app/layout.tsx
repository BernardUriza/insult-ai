import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { RouteBackground } from "../components/background/RouteBackground";
import { PageTransition } from "../components/layout/PageTransition";
import {
  OG_IMAGE,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TITLE,
  SITE_URL,
} from "../lib/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Branding assets in /public are generated from the source logo by
// `scripts/gen_branding.py` (run from repo root). Re-run that script when
// the source logo changes; never hand-edit the PNGs.
const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: SITE_NAME,
  alternateName: "IAI",
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  applicationCategory: "AIApplication",
  operatingSystem: "Web",
  browserRequirements: "Requires JavaScript. Works on modern mobile and desktop browsers.",
  image: `${SITE_URL}/og-image.png`,
  screenshot: `${SITE_URL}/og-image.png`,
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  featureList: [
    "Cross-examines claims with guardrails",
    "Live-source intelligence briefs",
    "Clinical coaching mode",
    "Knowledge base ingestion",
    "Shareable web app preview metadata",
  ],
};

// Without metadataBase, Next.js resolves OG image URLs against the build-time
// host — which is localhost:3000 in CI. That puts `content="http://localhost
// :3000/og-image.png"` into the head, and Slack/Twitter/iMessage fail to
// fetch the preview. Hardcoding the production host fixes social previews
// without needing a build-time env var. If we ever move the host, edit here.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "dark",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#091B36" },
    { media: "(prefers-color-scheme: light)", color: "#FF5C28" },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: "AI tool",
  keywords: [
    "Insult AI",
    "AI roast",
    "fact-checking",
    "live receipts",
    "Bright Data",
    "AI briefing",
    "clinical coaching",
  ],
  alternates: {
    canonical: "/",
  },
  appLinks: {
    web: {
      url: SITE_URL,
      should_fallback: true,
    },
  },
  referrer: "origin-when-cross-origin",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: SITE_NAME,
    statusBarStyle: "black-translucent",
    startupImage: [
      {
        url: "/apple-touch-icon.png",
        media: "(device-width: 390px) and (device-height: 844px)",
      },
    ],
  },
  formatDetection: {
    telephone: false,
    date: false,
    address: false,
    email: false,
    url: false,
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png" },
    ],
    apple: { url: "/apple-touch-icon.png", sizes: "180x180" },
  },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: "/",
    images: [OG_IMAGE],
    locale: "en_US",
    countryName: "United States",
    type: "website",
    siteName: SITE_NAME,
  },
  twitter: {
    card: "summary_large_image",
    site: "@insult_ai",
    creator: "@insult_ai",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-title": SITE_NAME,
    "apple-mobile-web-app-status-bar-style": "black-translucent",
    "msapplication-TileColor": "#091B36",
    "msapplication-config": "none",
    "theme-color": "#091B36",
    "color-scheme": "dark",
    "og:image:secure_url": `${SITE_URL}/og-image.png`,
    "og:image:type": "image/png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
        />
        <RouteBackground />
        <PageTransition>{children}</PageTransition>
      </body>
    </html>
  );
}
