# Demo script — Insult AI · 90 seconds

Recording script for the hackathon video. On-screen action + exact narration,
beat by beat. Derived from `.claude/rules/pitch.md` (the canonical beat sheet),
updated with the current product state: PlanGuard live (declare_plan + plan
events), the Stoic corpus in clinical mode, the adversarial benchmark, and the
receipts safety belt.

**Assumptions** (change and re-cut if wrong):
- Live product demo (screen recording), not static slides.
- Narration in English (international lablab.ai judges).

---

## Beat 1 — Hook · 0–10s

**On screen:** Landing page (`iai.bernarduriza.com`), logo + tagline.

**Narration:**
> "This looks like an AI that insults you. It's actually a verbal boxing coach
> for your bad patterns — sharp, safe, and useful. Let me show you the
> difference."

## Beat 2 — The receipt · 10–25s

**On screen:** `/chat` in **roast mode**. Paste a real URL (a startup / landing
page). The **Steps panel** fills: `declare_plan` → Bright Data fetch → compose.
Receipts appear.

**Narration:**
> "Every jab traces to a real source. Bright Data scrapes the page live — no
> roasting from memory. And notice: the agent declares its plan *before* it
> acts. You're watching it cross-examine, step by step."

## Beat 3 — The arc · 25–50s

**On screen:** Switch to **clinical mode**. Procrastination prompt ("I keep
saying I'll start tomorrow"). The envelope renders: validate → reflect →
challenge → micro-action. The coach cites Stoic philosophy.

**Narration:**
> "Same engine, second persona — the Roast Coach. It validates, reflects,
> challenges, and lands one concrete action. And it's grounded in real Stoic
> philosophy — Marcus Aurelius, Epictetus — retrieved live from a public-domain
> corpus. Comedy as interface, clinical structure underneath."

## Beat 4 — The guardrail · 50–70s · ⚠️ NEVER CUT

**On screen:** Drop the tone selector to `no_insults`. Then show a message with
a sensitive signal → the system lowers the tone on its own / or a crisis signal
→ handoff to a resource.

**Narration:**
> "Safety beats tone. The user picks the ceiling — the system can only lower it,
> never raise it. On a crisis signal, it abandons the persona entirely and hands
> off to a real resource. The roast never wins over a person's safety."

## Beat 5 — The platform · 70–85s

**On screen:** Architecture slide (or the repo): fi-runner + Bright Data MCP +
dual backend + PlanGuard.

**Narration:**
> "Two backends, one persona dispatch. The plan is declared before any action —
> PlanGuard rejects identity-targeting steps before a single scrape runs. Live
> web data, cited receipts, adversarial reasoning. Measured, not vibes."

## Beat 6 — Close · 85–90s

**On screen:** URL + GitHub + tagline.

**Narration:**
> "Insult AI. Web Data UNLOCKED. iai.bernarduriza.com."

---

## Production notes

- **If short on time, cut Beat 5** (judges read the README). **Never cut Beat 4**
  — without the guardrail the demo sells the wrong product.
- **Beats 2 and 3 are the heart**: that's where the `declare_plan`, the receipts,
  and the Stoic grounding all show on screen.
- For Beat 4, have a test crisis message ready (one that triggers the handoff) so
  you don't improvise on camera.
- Before recording, confirm the clinical corpus is wired: the `.env` flag
  `INSULT_AI_PSYCH_CORPUS_ENABLED=1` must be set and pgvector populated, or the
  coach won't cite the Stoics.
