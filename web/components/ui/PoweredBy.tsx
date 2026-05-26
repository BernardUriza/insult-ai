/** "Powered by Bright Data" badge — the trust anchor.
 *
 * Two jobs:
 *   1. Lampshade the hackathon's MANDATORY product use (a judge scanning the
 *      page sees the Bright Data name immediately, on every screen).
 *   2. Visually quote the sponsor's brand — the "Bright Data" wordmark uses
 *      their primary blue (`--color-iai-brand`, which equals BD's --brand
 *      Pantone 2727 C). Familiar palette → faster recognition → kinder read.
 *
 * Kept tiny on purpose. The actual product is Insult AI; this is a deferential
 * footer credit, not a co-brand. Subtle ring + low opacity in idle, opacity
 * lifts on hover so a curious user can click into brightdata.com. */
export function PoweredBy() {
  return (
    <a
      href="https://brightdata.com"
      target="_blank"
      rel="noopener noreferrer"
      className="iai-powered-by inline-flex items-center gap-1.5 rounded-full
                 border border-iai-border bg-iai-surface/40 px-2.5 py-1
                 text-[10px] font-medium uppercase tracking-wider text-zinc-500
                 transition hover:border-iai-brand/60 hover:text-zinc-300"
      title="The hackathon's sponsor — Bright Data MCP supplies every receipt"
    >
      Powered by
      <span className="font-bold tracking-tight text-iai-brand">Bright Data</span>
    </a>
  );
}
