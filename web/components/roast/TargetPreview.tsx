"use client";

/** Browser-style live preview of the target URL, shown WHILE the roast streams.
 *
 *  Earlier attempts failed: microlink's free tier hit antibot protection on
 *  JMIR (EPROXYNEEDED), and a raw iframe showed the JMIR newsletter signup +
 *  cookie banner instead of the article (the site rewrites the body when
 *  framed). For the hackathon demo we hardcode a small allowlist of known-good
 *  previews — the demo target (JMIR) + room for siblings — backed by the
 *  site's own og:image so it reads as "the page". Anything not in the
 *  allowlist renders nothing (silent), which is the same shape as a
 *  microlink-failure: never block the roast on a missing preview.
 *
 *  TODO when there's time: a backend /preview endpoint that fetches the target
 *  server-side and parses og:image + og:title, replacing this allowlist. */
type Props = { url: string };

type PreviewEntry = { image: string; title: string };

const PREVIEW_ALLOWLIST: Array<{ match: RegExp; data: PreviewEntry }> = [
  {
    match: /mental\.jmir\.org/i,
    data: {
      image:
        "https://asset.jmir.pub/assets/71694ab078263b79711066f614b29fa8.png",
      title:
        "The Opportunities and Risks of Large Language Models in Mental Health",
    },
  },
];

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function lookupPreview(url: string): PreviewEntry | null {
  for (const entry of PREVIEW_ALLOWLIST) {
    if (entry.match.test(url)) return entry.data;
  }
  return null;
}

export function TargetPreview({ url }: Props) {
  const preview = lookupPreview(url);
  if (!preview) return null;
  const host = hostOf(url);
  return (
    <div className="iai-card overflow-hidden p-0">
      {/* Fake browser chrome. */}
      <div className="flex items-center gap-2 border-b border-iai-border/60 bg-iai-surface/40 px-3 py-2">
        <span className="flex shrink-0 gap-1.5" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
        </span>
        <span className="iai-hint truncate text-xs">{host}</span>
      </div>
      {/* og:image — the site's own canonical card. */}
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-iai-surface/20">
        {/* eslint-disable-next-line @next/next/no-img-element -- cross-origin og:image, not optimizable by next/image */}
        <img
          src={preview.image}
          alt={preview.title}
          className="h-full w-full object-cover object-top"
          referrerPolicy="no-referrer"
          loading="lazy"
        />
      </div>
    </div>
  );
}
