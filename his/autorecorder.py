"""autorecorder.py — Playwright-driven browser footage for the hackathon demo.

Drives a HEADFUL Chromium against the live Insult AI deploy at
``iai.bernarduriza.com`` and records each scripted "take" as a clean ``.webm``
file. The bench is the user-facing browser; the Playwright video capture
records only the browser viewport (no OS chrome, no titlebar, no mouse twitch).

The face/voice track is recorded separately by the human — this tool exists
because hand-typing into a screen recorder produces a video full of
hesitations, typos, and inconsistent waits. Microsoft-tutorial cadence is
the target: every keystroke at a known pace, every wait exactly the same
length, every selector deterministic.

Usage:

    cd his/
    python -m venv .venv && source .venv/bin/activate
    pip install -r requirements.txt
    playwright install chromium

    # one take
    python autorecorder.py --take 02_roast

    # all of them, sequentially
    python autorecorder.py --take all

Each run lands a ``<take_name>.webm`` in ``his/output/`` (gitignored). The
deliverable for the editor is that set of clips, NOT a finished video — the
human keeps the cut, the voice-over, and the face-cam composition.

Cost note: takes ``02_roast`` and ``03_brief`` fire real
Bright Data + Anthropic calls (~$0.05/take). The clinical takes only spend
Anthropic tokens. Library is free. Running ``--take all`` once is ~$0.30.
"""

from __future__ import annotations

import argparse
import re
import sys
import time
from pathlib import Path
from typing import Callable

from playwright.sync_api import Page, sync_playwright

# ---------------------------------------------------------------------------
# Config — single source of truth for the demo target and visual constants.
# Bumping the typing delay slows the tutorial; below ~60ms it starts to look
# like a bot, above ~120ms it starts to drag. 80ms is the sweet spot.
# ---------------------------------------------------------------------------

BASE_URL = "https://iai.bernarduriza.com"
HERE = Path(__file__).parent
OUTPUT_DIR = HERE / "output"
FIXTURES_DIR = HERE / "fixtures"

VIEWPORT = {"width": 1440, "height": 900}
TYPING_DELAY_MS = 80

# Clinical onboarding gate — the dialog persists "did we onboard?" in
# localStorage. Setting the key before the first clinical navigation skips
# the modal so it doesn't poison the take. Source of truth lives in
# ``web/components/chat/OnboardingDialog.tsx``; keep this constant in sync
# if that file's STORAGE_KEY ever changes.
ONBOARDED_LS_KEY = "insult_ai.clinical.onboarded.v1"

# Wait ceilings — Bright Data + Anthropic turns are the slow path. If a turn
# hasn't settled inside this window the run fails loudly rather than capturing
# a hung browser. Re-run the take.
TURN_TIMEOUT_MS = 120_000


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _settle(page: Page, ms: int = 800) -> None:
    """A quiet pause so a beat reads cleanly. Tutorial cadence — viewers need
    roughly a second to absorb a state change between actions, more if the
    state is dense (a freshly-painted envelope, a receipts panel). Tune per
    beat; the default is "enough that the viewer has caught up."""
    page.wait_for_timeout(ms)


def _prime_onboarded(page: Page) -> None:
    """Mark the clinical persona as already-onboarded for this browsing
    context so the modal stays out of the recording. No-op if already set."""
    page.evaluate(
        f"window.localStorage.setItem({ONBOARDED_LS_KEY!r}, '1')"
    )


def _click_textbox(page: Page, accessible_name: str) -> None:
    """Click a textbox by its accessible-name (regex, case-insensitive).
    Centralised so a single selector tweak doesn't require touching every
    take."""
    page.get_by_role("textbox", name=re.compile(accessible_name, re.I)).click()


def _wait_turn_done(page: Page) -> None:
    """A clinical / roast / brief turn is "done" when the bubble paints its
    listen button. That button is gated on ``status !== "streaming"`` and the
    presence of ``message.content``, so it's a tight proxy for "envelope or
    markdown is fully rendered." Times out at ``TURN_TIMEOUT_MS`` — Bright
    Data flakes are the usual cause, re-run rather than salvage."""
    page.get_by_role("button", name="listen").first.wait_for(
        timeout=TURN_TIMEOUT_MS
    )


# ---------------------------------------------------------------------------
# Take scripts — one function per beat. Each is a pure sequence: navigate,
# act, wait, leave the viewer with the final state on screen for a
# breath-second before the recording stops.
# ---------------------------------------------------------------------------


def take_00_landing(page: Page) -> None:
    """Landing scroll → SampleRoast → back to headline. ~5s of footage."""
    page.goto(BASE_URL, wait_until="networkidle")
    _settle(page, 1200)
    page.mouse.wheel(0, 400)  # reveal the SampleRoast card
    _settle(page, 1800)
    page.mouse.wheel(0, -400)  # back to headline
    _settle(page, 1000)


def take_01_mode_tour(page: Page) -> None:
    """Tap each mode pill without sending — show how badge / tagline /
    placeholder mutate. The point is the chrome, not the agent."""
    page.goto(f"{BASE_URL}/chat?mode=roast", wait_until="networkidle")
    _prime_onboarded(page)
    _settle(page, 800)
    page.get_by_role("radio", name="Brief").click()
    _settle(page, 1400)
    page.get_by_role("radio", name="Clinical").click()
    _settle(page, 1400)
    page.get_by_role("radio", name="Roast").click()
    _settle(page, 1000)


def take_02_roast(page: Page) -> None:
    """Full roast turn against nvidia.com. The hero shot — plan declared,
    Bright Data tools streaming, roast text + receipts. Edit truncates the
    long Bright Data wait with a 4x speed-ramp in post; the recording itself
    keeps the real cadence so nothing looks faked."""
    page.goto(f"{BASE_URL}/chat?mode=roast", wait_until="networkidle")
    _settle(page, 600)
    _click_textbox(page, "message to the agent")
    page.keyboard.type("nvidia.com", delay=TYPING_DELAY_MS)
    _settle(page, 400)
    page.keyboard.press("Enter")
    _wait_turn_done(page)
    _settle(page, 1800)  # receipts panel needs a breath to be read


def take_03_brief(page: Page) -> None:
    """Brief turn against the same target on a *fresh* context. Switching
    mid-conversation from roast → brief pollutes the agent's prior turns;
    a clean slate makes the citation-rich brief read on its own."""
    page.goto(f"{BASE_URL}/chat?mode=brief", wait_until="networkidle")
    _settle(page, 600)
    _click_textbox(page, "message to the agent")
    page.keyboard.type("nvidia.com", delay=TYPING_DELAY_MS)
    _settle(page, 400)
    page.keyboard.press("Enter")
    _wait_turn_done(page)
    _settle(page, 1800)


def take_04_library(page: Page) -> None:
    """Library flow: set knowledge-base name, drop a file, watch the row
    appear, click `use →`, land in /chat with the corpus armed. Closes the
    RAG loop in 12 seconds of clean footage."""
    fixture = FIXTURES_DIR / "nvidia_brief.md"
    if not fixture.exists():
        raise FileNotFoundError(
            f"missing fixture for take_04_library: {fixture}"
        )

    page.goto(f"{BASE_URL}/library", wait_until="networkidle")
    _settle(page, 700)

    # Replace the default "my-corpus" with something topical for the demo.
    kb = page.get_by_role(
        "textbox", name=re.compile("knowledge base name", re.I)
    )
    kb.click()
    kb.fill("")  # clear (instant), then type with delay for the viewer
    page.keyboard.type("nvidia-notes", delay=TYPING_DELAY_MS)
    _settle(page, 500)

    # Upload the fixture via the FileDropzone. expect_file_chooser intercepts
    # the native picker that the dropzone's hidden <input type=file> would
    # otherwise pop.
    with page.expect_file_chooser() as fc_info:
        page.get_by_role("button", name=re.compile("Drop a file")).click()
    fc_info.value.set_files(str(fixture))

    # Server returns chunks > 0 → the "INGESTED THIS SESSION" header appears.
    page.get_by_text(re.compile("INGESTED THIS SESSION", re.I)).wait_for(
        timeout=30_000
    )
    _settle(page, 1500)

    # `use →` link teleports to /chat?corpus=nvidia-notes. The arrival is the
    # payoff — viewer sees the corpus name flow from library to chat.
    page.get_by_role("link", name=re.compile(r"use", re.I)).click()
    page.wait_for_url(re.compile(r"/chat\?.*corpus=nvidia-notes"))
    _settle(page, 1500)


def take_05_clinical(page: Page) -> None:
    """Clinical envelope on a normal-safety turn. Shows the four envelope
    pieces (roast_line, main_response, micro_action, follow_up_question)
    rendering as separate UI sections — the proof that this isn't roast
    output in different paint."""
    page.goto(f"{BASE_URL}/chat?mode=clinical", wait_until="networkidle")
    _prime_onboarded(page)
    _settle(page, 700)
    _click_textbox(page, "message to the agent")
    page.keyboard.type(
        "I've avoided a two-paragraph email for three weeks.",
        delay=TYPING_DELAY_MS,
    )
    _settle(page, 400)
    page.keyboard.press("Enter")
    _wait_turn_done(page)
    _settle(page, 1800)


def take_06_sensitive(page: Page) -> None:
    """Sensitive de-escalation. The mild-anxiety prompt trips the safety
    classifier into ``sensitive`` — tone overrides down to ``no_insults``
    effective, roast_line drops, but the coaching arc (micro_action +
    follow_up) survives. The crisis prompt would be heavier; this proves
    the same machinery without changing the video's tone."""
    page.goto(f"{BASE_URL}/chat?mode=clinical", wait_until="networkidle")
    _prime_onboarded(page)
    _settle(page, 700)
    _click_textbox(page, "message to the agent")
    page.keyboard.type(
        "I'm spiraling about a meeting tomorrow.",
        delay=TYPING_DELAY_MS,
    )
    _settle(page, 400)
    page.keyboard.press("Enter")
    _wait_turn_done(page)
    _settle(page, 1800)


TAKES: dict[str, Callable[[Page], None]] = {
    "00_landing": take_00_landing,
    "01_mode_tour": take_01_mode_tour,
    "02_roast": take_02_roast,
    "03_brief": take_03_brief,
    "04_library": take_04_library,
    "05_clinical": take_05_clinical,
    "06_sensitive": take_06_sensitive,
}


# ---------------------------------------------------------------------------
# Run loop
# ---------------------------------------------------------------------------


def run_take(name: str) -> Path:
    """Spin a fresh browser context for this take, run it, save the .webm.
    Each take gets its own context so videos are one-take-per-file and a
    crash mid-take doesn't poison a sibling clip."""
    if name not in TAKES:
        raise SystemExit(
            f"unknown take {name!r}; pick from {sorted(TAKES)} or 'all'"
        )

    OUTPUT_DIR.mkdir(exist_ok=True)
    take_fn = TAKES[name]

    started = time.monotonic()
    with sync_playwright() as p:
        # Headful — the browser MUST be visible to the OS so Playwright's
        # video recorder captures it. Headless mode still records (the
        # recorder is virtual), but a headful run lets the human see what's
        # happening and abort if Bright Data is wedged.
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(
            viewport=VIEWPORT,
            record_video_dir=str(OUTPUT_DIR),
            record_video_size=VIEWPORT,
        )
        page = context.new_page()
        try:
            take_fn(page)
        finally:
            video_path = page.video.path() if page.video else None
            context.close()  # flushes the video file to disk
            browser.close()

    if not video_path:
        raise RuntimeError(
            "playwright did not produce a video file — likely a context "
            "config bug. record_video_dir was set; check viewport too."
        )

    # Rename Playwright's random GUID-style filename to the take's name so
    # the editor's import dialog reads as a clean sequence.
    final = OUTPUT_DIR / f"{name}.webm"
    if final.exists():
        final.unlink()
    Path(video_path).rename(final)
    elapsed = time.monotonic() - started
    print(f"  → {final.name}  ({elapsed:.1f}s wall)")
    return final


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--take",
        required=True,
        help=(
            "Name of a take, or 'all' to run them in sequence. "
            f"Available: {', '.join(sorted(TAKES))}"
        ),
    )
    args = parser.parse_args()

    if args.take == "all":
        for name in sorted(TAKES):
            print(f"--- recording {name} ---")
            run_take(name)
        return 0

    run_take(args.take)
    return 0


if __name__ == "__main__":
    sys.exit(main())
