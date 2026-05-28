# `his/` — autorecorder for the hackathon demo

Playwright-driven browser footage for the Insult AI submission video.

The face-cam + voice-over are recorded by the human in a separate track and
composited in the final edit. **This tool only produces clean, deterministic
browser clips** — no twitchy mouse, no typos, no inconsistent waits between
runs.

## What's here

| Path | What |
|---|---|
| `autorecorder.py` | Playwright script with one function per "take" — drives a headful Chromium against `iai.bernarduriza.com`, records the browser viewport to `.webm`. |
| `fixtures/nvidia_brief.md` | The doc uploaded in the `04_library` take. Public-source synthesis of NVIDIA strategy — nothing confidential. |
| `requirements.txt` | Just Playwright. |
| `output/` | Where `.webm` clips land. **Gitignored.** Regenerate from the script. |

## Install

```bash
cd his/
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium
```

## Run

One take:

```bash
python autorecorder.py --take 02_roast
```

All seven, in order:

```bash
python autorecorder.py --take all
```

Output lands in `his/output/<take_name>.webm`. The browser is **headful** on
purpose — you can see what's happening and Ctrl-C if Bright Data goes flaky
on a long turn.

## Cost

| Take | Burns |
|---|---|
| `00_landing` | nothing (static page) |
| `01_mode_tour` | nothing (no message sent) |
| `02_roast` | Bright Data + Anthropic (~$0.05) |
| `03_brief` | Bright Data + Anthropic (~$0.05) |
| `04_library` | one `/documents/upload` call (free) |
| `05_clinical` | Anthropic only (~$0.02) |
| `06_sensitive` | Anthropic only (~$0.02) |

`--take all` once ≈ **$0.15** plus retries. Cheaper than re-grabbing by hand.

## Conventions

- **Viewport** is locked to `1440x900` so every clip composites at the same
  scale as the screenshots in `_review/` already do.
- **Typing pace** is 80ms/char — the "Microsoft tutorial" cadence. Below
  ~60ms reads as bot; above ~120ms drags.
- **Onboarding** for clinical mode is pre-primed by setting the
  `insult_ai.clinical.onboarded.v1` localStorage key. The dialog stays out
  of every take, including the first clinical one.
- **Turn-done signal** is the `listen` button on the assistant bubble — it
  paints once the turn settles. 120s timeout per turn; flake re-runs the
  whole take.
- **Each take owns its own browser context.** A flaky run mid-roast doesn't
  poison the subsequent clip.

## Editing path (suggested)

1. Run `--take all`, get 7 clips in `output/`.
2. Convert webm → mp4 if your editor doesn't like webm:
   ```bash
   for f in output/*.webm; do
     ffmpeg -i "$f" -c:v libx264 -crf 18 "${f%.webm}.mp4"
   done
   ```
3. Import into the editor of choice (iMovie, Davinci Resolve, etc.).
4. Drop the face-cam track + voice-over over the top.
5. Speed-ramp the long Bright Data waits in `02_roast` / `03_brief` to 4x
   — the recording keeps the real cadence so a viewer never sees a fake
   "instant response."

## When to re-run vs salvage

A take is salvageable if:

- The voice-over fits the visible cadence with minor pacing tweaks.
- No on-screen typo or selector failure mid-take.

A take needs re-run if:

- The script times out (>120s on a turn) — Bright Data flaked.
- The wrong mode dispatched (rare; sanity-check the badge in frame 1).
- The page crashed / showed an error toast.

The script is idempotent. `python autorecorder.py --take 02_roast` again
overwrites `output/02_roast.webm` cleanly.

## What this is not

- Not a final video editor. No cut, no overlay, no audio.
- Not a test harness. There are no assertions on the response content — it
  records what the live deploy returns, period.
- Not a Playwright tutorial. The code is one-shot demo plumbing, not a
  shared library.
