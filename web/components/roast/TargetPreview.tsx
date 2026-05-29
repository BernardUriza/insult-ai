"use client";

/** Browser-style live preview of the target URL, shown WHILE the roast streams.
 *
 *  Renders the target page itself inside an iframe wrapped in fake browser
 *  chrome (the "tipo navegador" look — three dots + URL bar). This replaces an
 *  earlier microlink approach: microlink's free tier could not pass antibot
 *  protections on sites like JMIR (EPROXYNEEDED), so the preview silently
 *  disappeared. The iframe path is the page itself — no external service, no
 *  rate limit, no screenshot pipeline.
 *
 *  Caveat: a target that sends `X-Frame-Options: DENY|SAMEORIGIN` or a CSP
 *  `frame-ancestors` directive will render blank. The demo target (JMIR) sends
 *  neither. Sandbox flags + a stale referrer policy keep this defensive: the
 *  iframe runs with its own scripts but cannot reach top-level navigation. */
type Props = { url: string };

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function TargetPreview({ url }: Props) {
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
      {/* The page itself, embedded. */}
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-iai-surface/20">
        <iframe
          src={url}
          title={`preview of ${host}`}
          className="h-full w-full border-0"
          referrerPolicy="no-referrer"
          sandbox="allow-scripts allow-same-origin allow-popups"
          loading="lazy"
        />
      </div>
    </div>
  );
}
