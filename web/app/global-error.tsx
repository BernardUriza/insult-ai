"use client";

import Image from "next/image";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  if (typeof window !== "undefined") {
    console.error("[insult-ai] global error", error);
  }

  return (
    <html lang="en">
      <body className="min-h-screen bg-iai-bg text-zinc-200">
        <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
          <Image src="/logo.png" alt="" width={96} height={96} />
          <h1 className="text-3xl font-extrabold text-zinc-100">
            The app crashed before it could roast back.
          </h1>
          <p className="iai-hint max-w-md">
            Try again. The browser console has the trace if this keeps happening.
          </p>
          <button type="button" onClick={reset} className="iai-btn-primary">
            Reload app
          </button>
        </main>
      </body>
    </html>
  );
}
