import Image from "next/image";

// App-shell splash — React Suspense boundary at the root. Shown while a
// route segment streams in or while the JS bundle hasn't hydrated yet.
// No copy nearby, so the alt is informative ("Insult AI") not decorative.
//
// 128px is the "hero scale" for the logo: smaller drops the embedded
// "I-AI" text into illegibility; larger competes with the actual landing
// hero when SSR hands off too slowly on a slow connection.
//
// `priority` is implied for above-the-fold imagery in Next.js 16; the
// drop-shadow uses --color-iai-fire-rgb so the glow tracks the brand token
// instead of a literal RGB value.

export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-iai-bg">
      <Image
        src="/logo.png"
        alt="Insult AI"
        width={162}
        height={128}
        priority
        className="animate-pulse drop-shadow-[0_0_40px_rgb(var(--color-iai-fire-rgb)/0.6)]"
      />
    </div>
  );
}
