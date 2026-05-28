#!/usr/bin/env python3
"""Generate Insult AI branding assets from the base logo.

Takes the source PNG (Gemini-generated charcoal-and-flame logo with white
grid background) and produces a clean transparent asset set for the web
front-end:

  web/public/favicon.ico       multi-size .ico (16, 32, 48)
  web/public/apple-touch-icon.png   180×180 PNG, transparent
  web/public/icon.png          256×256 PNG, transparent (Next.js metadata)
  web/public/logo.png          512px wide PNG, transparent/tight (in-product use)
  web/public/icon-192.png      192×192 PNG, transparent (PWA manifest, Android)
  web/public/icon-512.png      512×512 PNG, transparent (PWA manifest, splash)
  web/public/icon-512-maskable.png   512×512 PNG, iai-bg filled + 60% safe zone
                                     (PWA adaptive icon — Android masks shapes)
  web/public/og-image.png      1200×630 social card (dark bg + tagline)

Decisions:
  - Background removal is a mask cut from the source's edges, followed by a
    targeted pass over the original tile-grid coordinates. This strips the
    white field and the gray grid lines while preserving the charcoal rock,
    saturated fire, and orange sparks.
  - All raster outputs are PNG with full alpha. ICO embeds 3 sizes so the
    OS picks a sharp one at different DPIs.
  - OG image is a separate concern (dark canvas + Helvetica titles +
    on-brand fire/brand colors). System font (Helvetica.ttc on macOS) is
    used; the SWA build doesn't run this script so we never need to ship
    Geist as a TTF in CI.

Run from repo root:
  python3 scripts/gen_branding.py
"""

from __future__ import annotations

from pathlib import Path
from collections import deque

from PIL import Image, ImageDraw, ImageFont

REPO = Path(__file__).resolve().parent.parent
PUBLIC = REPO / "web" / "public"
SRC = Path.home() / "Downloads" / "logo insult ai.png"

# Brand colors (kept in sync with web/app/globals.css @theme tokens).
BG_DARK = (9, 27, 54)        # --color-iai-bg #091B36
FIRE = (255, 92, 40)         # --color-iai-fire #FF5C28
BRAND_BLUE = (61, 127, 252)  # --color-iai-brand #3D7FFC
ZINC_100 = (244, 244, 245)
ZINC_400 = (161, 161, 170)

# Threshold for "this pixel is background, kill it". Calibrated against the
# specific source: corners (174,175,179) where the GRID lines live, white
# field (253-255) where the paper is. We need the cut at 170 to take BOTH
# the white field AND the grid lines — earlier 200 left ghostly grid in
# every icon. Safe vs the logo: darkest charcoal MIN(25,24,20)=20, brightest
# flame MIN(157,90,47)=47, both << 170.
WHITE_THRESHOLD = 170


def remove_white_bg(img: Image.Image, threshold: int = WHITE_THRESHOLD) -> Image.Image:
    """Remove the white/grid background from the generated source logo.

    The source has a white tile grid behind the rock. A global white-key leaves
    gray grid lines in the exported logo, so this first flood-fills background
    pixels reachable from the canvas edge, then removes the remaining straight
    grid fragments trapped inside the warm glow around the mark.
    """
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size

    def is_edge_background(x: int, y: int) -> bool:
        r, g, b, a = px[x, y]
        if a == 0:
            return True
        mx = max(r, g, b)
        mn = min(r, g, b)
        avg = (r + g + b) / 3
        neutral = mx - mn < 34
        return mn >= threshold or (neutral and avg >= 92)

    def mark_if_background(x: int, y: int) -> None:
        i = y * w + x
        if not seen[i] and is_edge_background(x, y):
            seen[i] = 1
            queue.append((x, y))

    seen = bytearray(w * h)
    queue: deque[tuple[int, int]] = deque()
    for x in range(w):
        mark_if_background(x, 0)
        mark_if_background(x, h - 1)
    for y in range(h):
        mark_if_background(0, y)
        mark_if_background(w - 1, y)

    while queue:
        x, y = queue.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h:
                mark_if_background(nx, ny)

    grid_rows = [0, 113, 234, 354, 477, 602, 724, 846, 967, 1023]
    grid_cols = [0, 113, 224, 352, 477, 603, 729, 857, 1023]
    grid_band = max(2, round(w / 512))

    def on_grid_line(x: int, y: int) -> bool:
        return any(abs(y - row) <= grid_band for row in grid_rows) or any(
            abs(x - col) <= grid_band for col in grid_cols
        )

    def is_grid_fragment(x: int, y: int) -> bool:
        if not on_grid_line(x, y):
            return False
        r, g, b, a = px[x, y]
        if a == 0:
            return True
        mx = max(r, g, b)
        mn = min(r, g, b)
        avg = (r + g + b) / 3
        saturated_fire = r - g > 35 or r - b > 65
        dark_rock = avg < 105
        return not saturated_fire and not dark_rock and (mx - mn < 70 or avg >= 130)

    for y in range(h):
        for x in range(w):
            if seen[y * w + x] or is_grid_fragment(x, y):
                px[x, y] = (0, 0, 0, 0)
    return img


def trim_to_content(img: Image.Image) -> Image.Image:
    """Crop to the bounding box of non-transparent pixels."""
    bbox = img.getbbox()
    if bbox:
        return img.crop(bbox)
    return img


def fit_square(img: Image.Image, size: int, padding_frac: float = 0.08) -> Image.Image:
    """Fit content inside a transparent square of `size` px with `padding_frac`
    padding on each side. Aspect-ratio preserving."""
    inner = int(size * (1 - 2 * padding_frac))
    ratio = img.width / img.height
    if ratio >= 1:
        new_w, new_h = inner, max(1, int(inner / ratio))
    else:
        new_h, new_w = inner, max(1, int(inner * ratio))
    resized = img.resize((new_w, new_h), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(resized, ((size - new_w) // 2, (size - new_h) // 2), resized)
    return canvas


def fit_width(img: Image.Image, width: int) -> Image.Image:
    """Resize to an exact width with no square canvas or extra padding."""
    height = max(1, round(width * img.height / img.width))
    return img.resize((width, height), Image.LANCZOS)


def load_font(size: int, *, bold: bool = False) -> ImageFont.ImageFont:
    """Best-effort system font load. macOS Helvetica covers most cases;
    falls back to PIL's bundled default if absent (CI Linux, etc.)."""
    candidates = [
        "/System/Library/Fonts/HelveticaNeue.ttc",
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def generate_og_image(logo_alpha: Image.Image, out_path: Path) -> None:
    """1200×630 social card: dark BG, logo on the left, tagline on the right."""
    W, H = 1200, 630
    canvas = Image.new("RGBA", (W, H), BG_DARK + (255,))

    # Logo block — 420px tall, padded
    logo_box = 420
    logo_resized = fit_square(logo_alpha, logo_box, padding_frac=0)
    canvas.paste(logo_resized, (80, (H - logo_box) // 2), logo_resized)

    # Title + tagline block (right side)
    draw = ImageDraw.Draw(canvas)
    f_brand = load_font(96)
    f_punch = load_font(56)
    f_sub = load_font(32)
    f_attr = load_font(24)

    x0 = 560
    # Brand: "Insult AI" — "Insult" white, "AI" brand-blue
    draw.text((x0, 150), "Insult ", font=f_brand, fill=ZINC_100 + (255,))
    insult_bbox = draw.textbbox((x0, 150), "Insult ", font=f_brand)
    draw.text((insult_bbox[2], 150), "AI", font=f_brand, fill=BRAND_BLUE + (255,))

    # Punch line — two halves, fire accent on the verb
    draw.text((x0, 290), "Don't trust the pitch.", font=f_punch, fill=ZINC_100 + (255,))
    draw.text((x0, 360), "We scraped it.", font=f_punch, fill=FIRE + (255,))

    # Subline — kept short to fit at 32px from x0=560 to W=1200 (640 budget).
    # The longer version "Live web data · Bright Data MCP · cited receipts"
    # truncates at 1200; this two-line variant always lands fully on canvas.
    draw.text((x0, 450), "Live web data, with receipts.", font=f_sub, fill=ZINC_400 + (255,))
    draw.text(
        (x0, 510),
        "Web Data UNLOCKED · Bright Data",
        font=f_attr,
        fill=(120, 120, 140, 255),
    )

    canvas.convert("RGB").save(out_path, "PNG", optimize=True)


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"source missing: {SRC}")
    src = Image.open(SRC)
    print(f"source: {SRC.name} {src.size} mode={src.mode}")

    alpha = remove_white_bg(src)
    alpha = trim_to_content(alpha)
    print(f"trimmed → {alpha.size} (alpha-cut at threshold {WHITE_THRESHOLD})")

    PUBLIC.mkdir(parents=True, exist_ok=True)

    logo_out = PUBLIC / "logo.png"
    logo = fit_width(alpha, 512)
    logo.save(logo_out, "PNG", optimize=True)
    print(f"  → web/public/logo.png  {logo.width}×{logo.height} tight")

    # Square icons — same cleaned source, padded because platform icon slots
    # crop/mask aggressively and require exact square pixel sizes.
    # icon-192/icon-512 are PWA-manifest siblings at the exact pixel sizes the
    # spec wants (web.dev's PWA guide: 192 + 512 are the two required entries).
    for name, size in [
        ("icon.png", 256),
        ("apple-touch-icon.png", 180),
        ("icon-192.png", 192),
        ("icon-512.png", 512),
    ]:
        out = PUBLIC / name
        fit_square(alpha, size, padding_frac=0.08).save(out, "PNG", optimize=True)
        print(f"  → web/public/{name}  {size}×{size}")

    # Maskable icon — Android adaptive-icon spec. Unlike the transparent PNGs
    # above, this one MUST have a solid background and the mark must fit
    # inside the central 80% safe zone (radius 40% of width, per web.dev
    # guidance). We use 60% inner content for extra margin: aggressive
    # mask shapes (squircle, leaf) still don't clip the flame. Background is
    # iai-bg so the mask matches the product's dark chrome on install.
    maskable_size = 512
    maskable = Image.new("RGBA", (maskable_size, maskable_size), BG_DARK + (255,))
    inner = int(maskable_size * 0.60)
    mark = fit_square(alpha, inner, padding_frac=0)
    offset = (maskable_size - inner) // 2
    maskable.paste(mark, (offset, offset), mark)
    maskable_out = PUBLIC / "icon-512-maskable.png"
    maskable.save(maskable_out, "PNG", optimize=True)
    print(f"  → web/public/icon-512-maskable.png  {maskable_size}×{maskable_size} (safe zone 60%)")

    # ICO multi-size — Pillow embeds all `sizes` into one file.
    ico_sizes = [(16, 16), (32, 32), (48, 48)]
    # PIL's ICO save uses the source's resolution; pre-fit to the largest so
    # downscale paths land on a clean version (not a 16px stretched up).
    base48 = fit_square(alpha, 48, padding_frac=0.05)
    ico_out = PUBLIC / "favicon.ico"
    base48.save(ico_out, format="ICO", sizes=ico_sizes)
    print(f"  → web/public/favicon.ico  multi-size 16/32/48")

    # OG card
    og_out = PUBLIC / "og-image.png"
    generate_og_image(alpha, og_out)
    print(f"  → web/public/og-image.png  1200×630")

    print("done.")


if __name__ == "__main__":
    main()
