/** Curated demo prompts for the hackathon flow.
 *
 * Five hand-picked cases that exercise the Roast Coach persona's range
 * in a single sitting. Wired to <DemoPrompts> on /chat (clinical mode) —
 * the user sees the buttons when the conversation is empty, taps one,
 * the input fills with the canonical text, the persona does its thing.
 *
 * Picked so a judge cycling through them in 90 seconds sees:
 *   - normal procrastination (the bread-and-butter)
 *   - mild anxiety (the safety-aware turn → sensitive level)
 *   - fact-check ask (cross-product nod to roast mode without leaving
 *     clinical — the persona handles it as a research request)
 *   - tone lowering (consent in action, mid-conversation)
 *   - crisis-shape (the boundary move + resource hand-off — the demo's
 *     load-bearing differentiator)
 *
 * The texts are stable. DO NOT bowdlerize — the demo's whole point is
 * that the persona handles real signals safely. The crisis prompt is
 * the one that proves "comedy as interface, responsible clinical
 * infrastructure as behavior" (hackathon.md Rule 0). */

export type DemoTone = "soft" | "medium" | "spicy" | "no_insults";

export interface DemoPrompt {
  /** Stable id — used as React key + analytics. */
  id: string;
  /** Short label that fits on a chip button. ~3-5 words. */
  label: string;
  /** One-line description shown in the chip's title attr. */
  hint: string;
  /** The actual text dropped into the composer. */
  text: string;
  /** What the demo audience should expect this prompt to surface. */
  showcases: string;
  /** Suggested tone for the demo flow. The user can override before
   * sending. */
  suggested_tone: DemoTone;
}

export const DEMO_PROMPTS: DemoPrompt[] = [
  {
    id: "procrastination",
    label: "Procrastination",
    hint: "Bread-and-butter case — classic avoidance loop",
    text: "I've avoided a two-paragraph email for three weeks.",
    showcases: "behavioral_activation + roast of the pattern, not the person",
    suggested_tone: "medium",
  },
  {
    id: "anxiety",
    label: "Mild anxiety",
    hint: "The Roast Coach drops the jab — safety override in action",
    text: "I'm spiraling about a meeting tomorrow.",
    showcases: "cognitive_reframe + safety escalation to sensitive (no jab)",
    suggested_tone: "medium",
  },
  {
    id: "fact-check",
    label: "Fact-check",
    hint: "Use the product to tear apart a sus claim with evidence",
    text: "This article sounds fake. Help me tear it apart with evidence.",
    showcases: "reflection + planning toward research, not diagnosis",
    suggested_tone: "spicy",
  },
  {
    id: "lower-tone",
    label: "Lower intensity",
    hint: "Consent in action — user asks for less heat",
    text: "Okay, lower the intensity.",
    showcases: "validation + drop of roast_line (tone respects the user)",
    suggested_tone: "spicy",
  },
  {
    id: "crisis",
    label: "Crisis-safe",
    hint: "The demo's load-bearing differentiator — graceful degradation",
    text: "I can't keep going. I've been thinking life isn't worth it.",
    showcases: "boundary move + persona drop + real resource hand-off",
    suggested_tone: "medium",
  },
];
