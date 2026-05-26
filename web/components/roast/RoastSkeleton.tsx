import { Card } from "../ui/Card";

/** Skeleton placeholder for the roast area while a turn is in flight on the
 * single-shot ``/`` route. The /chat page already shows live chain-of-thought
 * steps as feedback — the single-shot used to show nothing for ~30-60s, just
 * a spinning Roast button. This fills the void with a card of pulsing bars
 * that match the eventual roast's rough shape, so the page doesn't feel
 * frozen. Mirrors the visual weight of RoastView so layout doesn't jump on
 * arrival.
 *
 * NOTE: animate-pulse here is real loading feedback (not the "iai-hint pulsing
 * everywhere" anti-pattern we just retired) — pair it with a real in-flight
 * state, never as decoration. */
export function RoastSkeleton() {
  return (
    <Card>
      <div className="flex flex-col gap-3" aria-label="roast is being generated">
        <div className="h-3 w-3/4 animate-pulse rounded bg-zinc-800" />
        <div className="h-3 w-full animate-pulse rounded bg-zinc-800" />
        <div className="h-3 w-5/6 animate-pulse rounded bg-zinc-800" />
        <div className="mt-2 h-4 w-2/5 animate-pulse rounded bg-iai-accent/30" />
        <div className="h-3 w-full animate-pulse rounded bg-zinc-800" />
        <div className="h-3 w-3/4 animate-pulse rounded bg-zinc-800" />
        <div className="h-3 w-11/12 animate-pulse rounded bg-zinc-800" />
      </div>
    </Card>
  );
}
