"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { PoweredBy } from "../ui/PoweredBy";

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
    badge: "Cross-Examination",
    title: "Roast",
    copy: "Claims, links, and arguments — pressured until they hold or break, every jab sourced.",
    cta: "Start Roast",
  },
  {
    mode: "brief",
    badge: "Intelligence Brief",
    title: "Brief",
    copy: "Live signals pressure-tested into a sharp, cited brief.",
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

const fadeUp = {
  hidden: { opacity: 0, y: 22 },
  visible: { opacity: 1, y: 0 },
};

const stagger = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.08,
    },
  },
};

export function LandingClient() {
  return (
    <main className="iai-landing-shell mx-auto flex w-full max-w-6xl flex-1 flex-col gap-20 px-5 py-12 md:py-20">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <motion.section
        className="iai-hero-banner flex flex-col items-center gap-6 px-2 py-8 text-center sm:px-8 md:py-12"
        variants={stagger}
        initial="hidden"
        animate="visible"
      >
        <motion.div
          variants={fadeUp}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="iai-logo-float"
        >
          <Image
            src="/logo.png"
            alt=""
            width={202}
            height={160}
            priority
            className="drop-shadow-[0_0_40px_rgb(var(--color-iai-fire-rgb)/0.5)]"
          />
        </motion.div>
        <motion.h1
          variants={fadeUp}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="iai-outline-title text-5xl font-black tracking-normal sm:text-6xl md:text-8xl"
        >
          Insult <span className="iai-outline-mark">AI</span>
        </motion.h1>
        <motion.p
          variants={fadeUp}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-4xl text-3xl font-black leading-tight text-zinc-100 sm:text-4xl md:text-6xl"
        >
          AI that roasts the pattern,
          <br />
          <span className="iai-outline-accent inline-block">not the person.</span>
        </motion.p>
        <motion.p
          variants={fadeUp}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-xl text-base font-semibold leading-relaxed text-zinc-100 drop-shadow-[0_2px_16px_rgb(0_0_0/0.75)] md:text-lg"
        >
          Put a claim under pressure: cross-examine it, brief it, or work through
          the mess — with guardrails.
        </motion.p>
        <motion.div
          variants={fadeUp}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="mt-2 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center"
        >
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
        </motion.div>
      </motion.section>

      {/* ── Segment cards ────────────────────────────────────────────────── */}
      <motion.section
        className="flex flex-col gap-6"
        variants={stagger}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
      >
        <header className="iai-glass-panel-soft mx-auto flex max-w-2xl flex-col items-center gap-2 px-5 py-4 text-center">
          <h2 className="text-2xl font-extrabold text-zinc-100 md:text-3xl">
            Three modes, one engine.
          </h2>
          <p className="text-base font-medium text-zinc-300">Pick the surface that matches the mess.</p>
        </header>
        <div className="grid gap-4 md:grid-cols-3">
          {SEGMENTS.map((s) => (
            <motion.article
              key={s.mode}
              variants={fadeUp}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              whileHover={{ y: -6, scale: 1.015 }}
              className="iai-card iai-motion-card bg-iai-bg/78 backdrop-blur-xl transition hover:border-iai-fire/40 hover:bg-iai-surface/55"
            >
              <Link
                href={`/chat?mode=${s.mode}`}
                className="flex h-full flex-col gap-4"
              >
                <span className="iai-tag self-start">{s.badge}</span>
                <h3 className="text-xl font-bold text-zinc-100">{s.title}</h3>
                <p className="flex-1 text-sm leading-relaxed text-zinc-300">
                  {s.copy}
                </p>
                <span className="iai-btn-primary" data-size="sm">
                  {s.cta}
                </span>
              </Link>
            </motion.article>
          ))}
        </div>
      </motion.section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <motion.section
        className="flex flex-col gap-6"
        variants={stagger}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
      >
        <header className="iai-glass-panel-soft mx-auto flex max-w-2xl flex-col items-center gap-2 px-5 py-4 text-center">
          <h2 className="text-2xl font-extrabold text-zinc-100 md:text-3xl">
            How it works
          </h2>
        </header>
        <ol className="grid gap-4 md:grid-cols-3">
          {HOW_STEPS.map((step, i) => (
            <motion.li
              key={i}
              variants={fadeUp}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="iai-card-soft iai-motion-card flex flex-col items-start gap-3 bg-iai-bg/72 backdrop-blur-xl"
            >
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-iai-fire/40 bg-iai-fire/10 text-base font-bold text-iai-fire">
                {i + 1}
              </span>
              <p className="text-base leading-relaxed text-zinc-200">{step}</p>
            </motion.li>
          ))}
        </ol>
      </motion.section>

      {/* ── Guardrails ───────────────────────────────────────────────────── */}
      <motion.section
        className="iai-card-sample iai-glass-panel iai-motion-card flex flex-col gap-4"
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <header className="flex flex-col gap-1">
          <p className="iai-tag self-start">Guardrails</p>
          <h2 className="text-2xl font-extrabold text-zinc-100 md:text-3xl">
            Sharp does not mean reckless.
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
      </motion.section>

      {/* ── Demo prompts ─────────────────────────────────────────────────── */}
      <motion.section
        className="flex flex-col gap-4"
        variants={stagger}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
      >
        <header className="iai-glass-panel-soft mx-auto flex max-w-2xl flex-col items-center gap-2 px-5 py-4 text-center">
          <h2 className="text-2xl font-extrabold text-zinc-100 md:text-3xl">
            Try one of these.
          </h2>
          <p className="text-base font-medium text-zinc-300">
            Click a prompt — it routes you into the right mode.
          </p>
        </header>
        <div className="flex flex-wrap justify-center gap-3">
          {DEMO_CHIPS.map((chip) => (
            <motion.div
              key={chip.text}
              variants={fadeUp}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              whileHover={{ y: -4 }}
            >
              <Link
                href={`/chat?mode=${chip.mode}&seed=${encodeURIComponent(chip.text)}`}
                className="iai-glass-panel-soft group flex max-w-md flex-col gap-1.5 px-4 py-3 text-left transition hover:border-iai-fire/50 hover:bg-iai-surface/70"
              >
                <span className="iai-hint text-[10px] font-semibold uppercase tracking-wider text-iai-fire/80 group-hover:text-iai-fire">
                  {chip.badge}
                </span>
                <span className="text-sm leading-snug text-zinc-100">
                  &ldquo;{chip.text}&rdquo;
                </span>
              </Link>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="iai-glass-panel-soft mt-auto flex flex-col items-center gap-3 px-5 py-5 text-center text-xs text-zinc-400">
        <p className="text-sm font-semibold text-zinc-400">
          Insult <span className="iai-brand">AI</span>
        </p>
        <p className="text-sm text-zinc-300">Every claim, cross-examined. Boundaries hold.</p>
        <PoweredBy />
        <span>Insult AI · Web Data UNLOCKED Hackathon</span>
      </footer>
    </main>
  );
}
