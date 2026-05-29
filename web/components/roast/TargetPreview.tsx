"use client";

import { useEffect, useState } from "react";

/** Browser-style live preview of the target URL, shown WHILE the roast streams.
 *
 *  Gives the viewer something to look at — "here's the page we're about to
 *  cross-examine" — during the 3-6 min agentic turn instead of a bare skeleton.
 *  Uses microlink's free API (client-side, no backend, no Bright Data credit)
 *  to fetch a real screenshot of the page. Purely decorative: any failure (rate
 *  limit, bad URL, network) silently drops the panel — the roast is unaffected.
 *
 *  microlink free tier is ~50 req/day; fine for a demo. For production this
 *  would move to a backend /preview endpoint we control. */
type PreviewData = { title?: string; screenshot?: string };

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function TargetPreview({ url }: { url: string }) {
  const [data, setData] = useState<PreviewData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setFailed(false);
    const endpoint = `https://api.microlink.io/?url=${encodeURIComponent(
      url,
    )}&screenshot=true&meta=true`;
    fetch(endpoint)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.status !== "success") {
          setFailed(true);
          return;
        }
        const d = json.data ?? {};
        setData({ title: d.title, screenshot: d.screenshot?.url });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (failed) return null; // decorative — never block the roast on a preview miss

  const host = hostOf(url);
  const loading = !data?.screenshot;

  return (
    <div className="iai-card overflow-hidden p-0">
      {/* Fake browser chrome — the "tipo navegador" look. */}
      <div className="flex items-center gap-2 border-b border-iai-border/60 bg-iai-surface/40 px-3 py-2">
        <span className="flex shrink-0 gap-1.5" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
        </span>
        <span className="iai-hint truncate text-xs">{host}</span>
        {loading && (
          <span className="iai-hint ml-auto shrink-0 animate-pulse text-[10px] uppercase tracking-wide">
            loading preview…
          </span>
        )}
      </div>
      {/* Screenshot, or a shimmer placeholder while microlink renders it. */}
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-iai-surface/20">
        {data?.screenshot ? (
          // eslint-disable-next-line @next/next/no-img-element -- external dynamic screenshot, not optimizable by next/image
          <img
            src={data.screenshot}
            alt={data.title ?? `preview of ${host}`}
            className="h-full w-full object-cover object-top"
          />
        ) : (
          <div className="h-full w-full animate-pulse bg-gradient-to-br from-iai-surface/40 to-iai-surface/10" />
        )}
      </div>
    </div>
  );
}
