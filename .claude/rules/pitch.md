# Pitch — how to describe Insult AI externally

The product matured. The pitch must too.

This rule governs the **language used to describe the product to the outside
world** — demo script, judging video, slide deck, landing copy, Discord posts,
README intro, hackathon submission long-description. It does NOT govern how
the product *behaves* (that lives in `hackathon.md` Rule 0 and `clinical.md`)
or how the personas *speak* (that lives in `personas.md` and
`personas/*.md`).

## TL;DR — the one-liner

> **"A verbal boxing coach for your bad patterns — sharp, safe, and useful."**

That's the canonical one-liner. Use it verbatim in the demo opener, the
video hook, and the hackathon submission. If a surface needs fewer
characters, fall back to:

- **8 words**: *"Verbal boxing coach for your bad patterns."*
- **3 words**: *"Sparring partner, AI."*

## What the product is NOT (anymore)

The early framing was "an AI that insults you." That hook still sells
clicks, but it under-describes what the product actually does. **Stop
defaulting to it** in pitch material. Specifically:

- ❌ "AI that insults you" — reads as gimmick / shock value
- ❌ "Roast bot" — undersells the coaching arc + safety layer
- ❌ "Burn generator" — implies one-shot output, hides the dialogue
- ❌ "Mean AI" — wrong tone signal; the product is warm, not cruel

These framings ignore the load-bearing thing the product does:
**it attacks behaviors, not the person.**

## What the product IS

A **sparring partner with guardrails**. Pick whichever framing fits the
audience:

| Audience | Framing |
|---|---|
| **Hackathon judges** | "Verbal boxing coach for bad patterns — sharp, safe, useful." Pair with "Live web data via Bright Data; every jab traces to a fetched source." |
| **Enterprise / GTM track** | "Competitive intelligence with an attitude — battlecards and outreach briefs backed by live, cited web data." |
| **Well-being / clinical track** | "AI Sparring Hotline — coaching disguised as a friend who calls your bullshit. Comedy as interface, clinical infrastructure as behavior." |
| **Developer audience (DEV.to, GitHub)** | "Two backends, one persona dispatch. Bright Data MCP for live receipts, fi-runner for the agent loop, PlanGuard for ethics." |
| **General / curious user** | "It roasts your procrastination, not you." |

## What it fights against (the only permitted targets)

The product attacks **behaviors and patterns**, not identity or worth.
This list is canonical — when writing pitch copy, every jab example
must map to one of these:

1. **Procrastination** — "It's been three weeks. The Google Doc still
   says 'Draft v1'."
2. **Self-deception** — "You said this was 'almost done' two retros ago."
3. **Mild anxiety / spiraling** — "Your anxiety is building a
   PowerPoint about a meeting that hasn't happened."
4. **Excuses** — "You're not 'too busy.' You opened TikTok 42 times today."
5. **Dubious claims** — "You said the Great Wall is visible from space.
   It isn't. NASA's site says otherwise."

What it **NEVER** attacks (the hard floor — also encoded in
`policies/never_attack.md`):

- Identity, body, race, gender, orientation
- Mental health diagnoses, trauma, medications
- Family, deceased loved ones, personal worth
- Protected attributes of any kind

If a pitch example would land on the wrong side of this line, **cut it**.
The "sharp, safe, useful" trio in the one-liner is load-bearing — drop
"safe" and the whole pitch collapses into a different product.

## Naming

| Layer | Name | When to use |
|---|---|---|
| Product (consumer-facing) | **Insult AI** | Top of landing, repo name, social handles. The provocative hook — opens the conversation. |
| Category (industry-facing) | **AI Sparring Hotline** or **Roast Coach** | Pitch decks, "what category does this play in?", competitive positioning. |
| Persona inside the product | **The Roast Coach** (clinical mode), or just the mode name (`roast`, `brief`, `clinical`) | When describing what the user actually talks to. |

The provocative product name (**Insult AI**) and the mature category
(**AI Sparring Hotline**) are NOT in tension — they are different layers
that do different jobs. The name hooks. The category positions. The
persona delivers.

## How to apply (concrete checks)

When writing pitch copy:

1. **Lead with the one-liner.** Demo opener, video hook, deck slide 1
   — all start with the boxing-coach line. Earn the punchier framings
   later.
2. **Pair sharp with safe within 10 seconds.** If the opening line is
   the roast hook, the second beat MUST land the safety / coaching
   layer. Sharp alone reads as cruel; sharp + safe reads as the
   product.
3. **Show the receipt.** Every roast example in a pitch surface should
   be followed (in the same beat) by the *source* — Bright Data MCP
   fetched X, that's why the roast lands. No source = the example is
   indistinguishable from any other LLM roast.
4. **Three modes, one engine.** When describing technical depth, say
   roast + brief + clinical share the same Runner — that's the
   architectural punch line, not three separate products.
5. **Behaviors, not people.** If an example targets the person (their
   body, their identity, their worth), rewrite it to target the
   behavior (their procrastination, their excuse, their claim). If you
   can't rewrite it, cut it.

## Demo script implications (the 90-second beat sheet)

The pitch language above translates to a 90-second demo arc. Use this
when scripting the video or rehearsing the live demo:

| Beat | Time | What's on screen | What's said |
|---|---|---|---|
| Hook | 0–10s | Logo + tagline | "A verbal boxing coach for your bad patterns — sharp, safe, useful." |
| The receipt | 10–25s | `/` page running a roast on a real URL, receipts panel filling | "Every jab traces to a real source. Bright Data MCP scrapes the page live — no roasting from training memory." |
| The arc | 25–50s | `/chat` clinical mode, picking a procrastination prompt, envelope rendering | "Same engine, second persona: the Roast Coach. Validates, reflects, challenges, lands one concrete action." |
| The guardrail | 50–70s | Tone selector dropping to no_insults; OR a sensitive-signal triggering safer envelope | "Safety beats tone. The user picks the ceiling; the system can lower it. Crisis abandons the persona entirely and hands off." |
| The platform | 70–85s | Architecture slide: fi-runner + Bright Data + dual backend + PlanGuard | "Two backends, one persona dispatch. Plan declared before action. Guard rejects identity targeting before any scrape runs." |
| Close | 85–90s | URL + GitHub + tagline | "Insult AI · Web Data UNLOCKED Hackathon · iai.bernarduriza.com" |

If the demo runs short, cut **The platform** (judges can read the README).
Never cut **The guardrail** — without it the demo sells the wrong product.

## What this rule does NOT govern

- The model's actual output language (English vs target's language) —
  see `language.md`.
- The persona's voice rules (no emoji, no therapy speak, one move per
  turn) — see `personas.md` + `personas/*.md`.
- The Rule 0 ethical contract for the product (comedy as interface,
  clinical infrastructure as behavior) — see `hackathon.md`.
- The clinical envelope contract — see `clinical.md`.

This rule is upstream of those: it's how to *describe* the product
externally, given that those internal contracts hold.
