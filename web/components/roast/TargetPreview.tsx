"use client";

/** Browser-style live preview of the target URL, shown WHILE the roast streams.
 *
 *  Earlier attempts failed: microlink's free tier hit antibot protection on
 *  JMIR (EPROXYNEEDED), and a raw iframe showed cookie banners instead of the
 *  target page. Known-good targets can still use an allowlisted og:image, but
 *  every valid URL now gets a deterministic generic card so pasting a URL
 *  never leaves the preview area blank.
 *
 *  TODO when there's time: a backend /preview endpoint that fetches the target
 *  server-side and parses og:image + og:title, replacing this allowlist. */
type Props = { url: string };

type PreviewEntry = {
  image?: string;
  title: string;
  description: string;
};

const PREVIEW_ALLOWLIST: Array<{ match: RegExp; data: PreviewEntry }> = [
  {
    match: /mental\.jmir\.org/i,
    data: {
      image:
        "https://asset.jmir.pub/assets/71694ab078263b79711066f614b29fa8.png",
      title:
        "The Opportunities and Risks of Large Language Models in Mental Health",
      // Trimmed from the paper's own meta description so it stays within the
      // ~160-char sweet spot Slack/X/LinkedIn cards target.
      description:
        "Global rates of mental health concerns are rising and existing models of care will not adequately expand to meet the demand. JMIR Mental Health, 2024.",
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

function pathOf(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.hash}`.replace(/^\/$/, "") || "/";
  } catch {
    return "/";
  }
}

function lookupPreview(url: string): PreviewEntry {
  for (const entry of PREVIEW_ALLOWLIST) {
    if (entry.match.test(url)) return entry.data;
  }
  const host = hostOf(url);
  const path = pathOf(url);
  return {
    title: host,
    description: path === "/" ? "Ready for live cross-examination." : path,
  };
}

export function TargetPreview({ url }: Props) {
  const preview = lookupPreview(url);
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
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-iai-surface/20">
        {preview.image ? (
          /* eslint-disable-next-line @next/next/no-img-element -- cross-origin og:image, not optimizable by next/image */
          <img
            src={preview.image}
            alt={preview.title}
            className="h-full w-full object-cover object-top"
            referrerPolicy="no-referrer"
            loading="lazy"
          />
        ) : (
          <div className="iai-preview-fallback flex h-full w-full flex-col justify-between p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="iai-tag">Target</span>
              <span className="h-2 w-2 rounded-full bg-iai-accent shadow-[0_0_16px_rgb(77_248_226/0.75)]" />
            </div>
            <div className="flex flex-col gap-2 text-left">
              <span className="max-w-full truncate text-2xl font-black text-zinc-100">
                {host}
              </span>
              <span className="line-clamp-2 text-xs font-medium text-zinc-400">
                {pathOf(url)}
              </span>
            </div>
          </div>
        )}
      </div>
      {/* Title + description under the image — modern rich-link-card layout
          (Slack / X / LinkedIn shape: image on top, then headline, then a short
          description). Title clamped to 2 lines, description to 3, both
          truncate cleanly without pushing the layout. */}
      <div className="flex flex-col gap-1 px-3 pb-3 pt-2">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="line-clamp-2 text-sm font-semibold leading-snug text-zinc-100 transition-colors hover:text-iai-link"
        >
          {preview.title}
        </a>
        <p className="iai-hint line-clamp-3 text-xs leading-snug">
          {preview.description}
        </p>
      </div>
    </div>
  );
}
