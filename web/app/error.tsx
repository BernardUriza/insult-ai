"use client";

import Image from "next/image";

// Global error boundary — must be a client component (Next.js requirement
// for error.tsx). Catches uncaught errors in any nested segment and gives
// the user a "try again" path without losing the brand.
//
// `reset` is the framework-supplied callback that re-renders the segment.
// We log the error to the console so a returning user can paste it into
// an issue if it persists; we don't surface the message in the UI because
// raw runtime errors leak implementation details and read as scary.
//
// Logo alt="" — decorative; the headline narrates the state.

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  if (typeof window !== "undefined") {
    console.error("[insult-ai] uncaught error", error);
  }
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-iai-bg px-6 text-center">
      <Image src="/logo.png" alt="" width={122} height={96} />
      <h1 className="text-3xl font-extrabold text-zinc-100">
        Something burned down.
      </h1>
      <p className="iai-hint max-w-md">
        An unexpected error short-circuited the page. Try again — if it
        keeps happening, the browser console has the trace.
      </p>
      <button type="button" onClick={reset} className="iai-btn-primary">
        Light it again
      </button>
    </main>
  );
}
