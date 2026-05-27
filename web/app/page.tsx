import Image from "next/image";
import Link from "next/link";
import { PoweredBy } from "../components/ui/PoweredBy";

// Editorial landing — explicitly NOT a chat surface. The root page sells
// the product in 10 seconds; /chat is where the conversation happens. If
// you find yourself adding a composer here, stop — that belongs in /chat.
//
// Mobile-first: every grid collapses to 1 column under md, the hero scales
// down two type steps, and CTAs stack vertically. The dark-glass aesthetic
// is intentional — it matches the chat shell so the brand identity holds
// across the route boundary, but the chrome is editorial (cards, sections,
// no input field) so the surface reads as marketing, not app.
//
// CTAs route to /chat?mode=<roast|brief|clinical>. The chat page also
// reads ?seed=<text> and pre-fills the composer with it (used by the
// demo chips below). After applying the seed, /chat strips it from the
// URL so a refresh doesn't re-seed.

type Mode = "roast" | "brief" | "clinical";

interface SegmentCard {
  mode: Mode;
  badge: string;
  title: string;
  copy: string;
  cta: string;
}

const SEGMENTS: SegmentCard[] = [
  {
    mode: "roast",
    badge: "Witty Roast",
    title: "Roast",
    copy: "Claims, links, and messy thoughts — roasted with receipts.",
    cta: "Start Roast",
  },
  {
    mode: "brief",
    badge: "Intelligence Brief",
    title: "Brief",
    copy: "Live signals turned into a sharp, cited brief.",
    cta: "Get Briefed",
  },
  {
    mode: "clinical",
    badge: "Clinical Roast",
    title: "Clinical",
    copy: "Sharp coaching for bad patterns. Never cruel.",
    cta: "Work through it",
  },
];

interface DemoChip {
  mode: Mode;
  text: string;
  badge: string;
}

const DEMO_CHIPS: DemoChip[] = [
  {
    mode: "clinical",
    badge: "Clinical",
    text: "I've avoided a two-paragraph email for three weeks.",
  },
  {
    mode: "roast",
    badge: "Roast",
    text: "This article sounds fake.",
  },
  {
    mode: "brief",
    badge: "Brief",
    text: "Brief this competitor.",
  },
  {
    mode: "clinical",
    badge: "Clinical",
    text: "I'm spiraling about a meeting tomorrow.",
  },
];

const HOW_STEPS = [
  "Drop a claim, link, or messy thought.",
  "Pick the mode and intensity.",
  "Get a roast, brief, or micro-action with guardrails.",
];

const GUARDRAILS = [
  "No identity attacks.",
  "No crisis jokes.",
  "Clinical mode lowers intensity when needed.",
  "Micro-actions over moral lectures.",
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-20 px-5 py-12 md:py-20">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="flex flex-col items-center gap-6 text-center">
        <Image
          src="/logo.png"
          alt=""
          width={160}
          height={160}
          priority
          className="drop-shadow-[0_0_40px_rgb(var(--color-iai-fire-rgb)/0.5)]"
        />
        <h1 className="text-4xl font-extrabold tracking-tight text-zinc-100 sm:text-5xl md:text-6xl">
          Insult <span className="iai-brand">AI</span>
        </h1>
        <p className="max-w-2xl text-xl font-bold leading-tight text-zinc-100 md:text-3xl">
          AI that roasts the pattern,{" "}
          <span className="text-iai-fire">not the person.</span>
        </p>
        <p className="iai-hint max-w-xl text-base md:text-lg">
          Choose a mode: get roasted, get briefed, or work through the mess with
          guardrails.
        </p>
        <div className="mt-2 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          <Link
            href="/chat?mode=roast"
            className="iai-btn-primary"
            aria-label="Start a roast session"
          >
            Start roasting
          </Link>
          <Link
            href="/chat?mode=clinical"
            className="iai-btn-chip text-base px-5 py-3"
            aria-label="Try clinical coaching mode"
          >
            Try Clinical
          </Link>
        </div>
      </section>

      {/* ── Segment cards ────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-6">
        <header className="flex flex-col items-center gap-2 text-center">
          <h2 className="text-2xl font-extrabold text-zinc-100 md:text-3xl">
            Three modes, one engine.
          </h2>
          <p className="iai-hint text-base">Pick the surface that matches the mess.</p>
        </header>
        <div className="grid gap-4 md:grid-cols-3">
          {SEGMENTS.map((s) => (
            <article
              key={s.mode}
              className="iai-card flex flex-col gap-4 transition hover:border-iai-fire/40 hover:bg-iai-surface/30"
            >
              <span className="iai-tag self-start">{s.badge}</span>
              <h3 className="text-xl font-bold text-zinc-100">{s.title}</h3>
              <p className="iai-hint flex-1 text-sm leading-relaxed text-zinc-400">
                {s.copy}
              </p>
              <Link
                href={`/chat?mode=${s.mode}`}
                className="iai-btn-primary"
                data-size="sm"
              >
                {s.cta}
              </Link>
            </article>
          ))}
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-6">
        <header className="flex flex-col items-center gap-2 text-center">
          <h2 className="text-2xl font-extrabold text-zinc-100 md:text-3xl">
            How it works
          </h2>
        </header>
        <ol className="grid gap-4 md:grid-cols-3">
          {HOW_STEPS.map((step, i) => (
            <li
              key={i}
              className="iai-card-soft flex flex-col items-start gap-3"
            >
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-iai-fire/40 bg-iai-fire/10 text-base font-bold text-iai-fire">
                {i + 1}
              </span>
              <p className="text-base leading-relaxed text-zinc-200">{step}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Guardrails ───────────────────────────────────────────────────── */}
      <section className="iai-card-sample flex flex-col gap-4">
        <header className="flex flex-col gap-1">
          <p className="iai-tag self-start">Guardrails</p>
          <h2 className="text-2xl font-extrabold text-zinc-100 md:text-3xl">
            Funny does not mean reckless.
          </h2>
        </header>
        <ul className="grid gap-2 text-base leading-relaxed text-zinc-200 sm:grid-cols-2">
          {GUARDRAILS.map((g) => (
            <li key={g} className="flex items-start gap-2">
              <span aria-hidden className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-iai-fire" />
              <span>{g}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Demo prompts ─────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-4">
        <header className="flex flex-col items-center gap-2 text-center">
          <h2 className="text-2xl font-extrabold text-zinc-100 md:text-3xl">
            Try one of these.
          </h2>
          <p className="iai-hint text-base">
            Click a prompt — it routes you into the right mode.
          </p>
        </header>
        <div className="flex flex-wrap justify-center gap-3">
          {DEMO_CHIPS.map((chip) => (
            <Link
              key={chip.text}
              href={`/chat?mode=${chip.mode}&seed=${encodeURIComponent(chip.text)}`}
              className="group flex max-w-md flex-col gap-1.5 rounded-xl border border-iai-border bg-iai-surface/40 px-4 py-3 text-left transition hover:border-iai-fire/50 hover:bg-iai-surface"
            >
              <span className="iai-hint text-[10px] font-semibold uppercase tracking-wider text-iai-fire/80 group-hover:text-iai-fire">
                {chip.badge}
              </span>
              <span className="text-sm leading-snug text-zinc-200">
                &ldquo;{chip.text}&rdquo;
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="mt-auto flex flex-col items-center gap-3 pt-6 text-center text-xs text-zinc-600">
        <p className="text-sm font-semibold text-zinc-400">
          Insult <span className="iai-brand">AI</span>
        </p>
        <p className="iai-hint">Roasts with receipts. Boundaries included.</p>
        <PoweredBy />
        <span>Insult AI · Web Data UNLOCKED Hackathon</span>
      </footer>
    </main>
  );
}
