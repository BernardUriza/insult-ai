import Image from "next/image";
import Link from "next/link";

// Global 404 — caught by Next.js when no route matches. Copy avoids the
// "we scraped the web" framing because /chat clinical and /library aren't
// scraping anything; the joke has to land for all three modes, so it
// targets the route itself, not what any mode does.
//
// Logo has alt="" (decorative) because the headline below already states
// the page's purpose — screen readers don't need both.

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-iai-bg px-6 text-center">
      <Image
        src="/logo.png"
        alt=""
        width={122}
        height={96}
        className="opacity-80"
      />
      <h1 className="text-3xl font-extrabold text-zinc-100">
        404 · this route got roasted before it shipped.
      </h1>
      <p className="iai-hint">
        The page you tried doesn&apos;t exist (yet).
      </p>
      <Link href="/" className="iai-btn-primary">
        Back to the fire
      </Link>
    </main>
  );
}
