#!/usr/bin/env python3
"""Build the experience icon and thumbnail shown on the Roblox game page.

Roblox wants a square icon (512x512) and 16:9 thumbnails (1920x1080). The splash art
is 3:2 and the logo is wide, so neither fits as-is:

- thumbnail: the whole splash, scaled to the full height, with the sides filled by a
  blurred, darkened copy of the splash (nothing is cropped), and the logo over the lake,
- icon: a square cut from the middle of the splash (the crystal peak and the lake),
  darkened a little so the logo stays readable, with the logo across it.

Inputs (never modified):
  art/ui/splash-ice-king.png
  art/ui/ice-king-logo.png
Outputs:
  art/store/icon.png
  art/store/thumbnail.png

Usage (from roblox/):  python3 scripts/build-store-art.py   # needs Pillow
"""

from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter

SPLASH_PATH = Path("art/ui/splash-ice-king.png")
LOGO_PATH = Path("art/ui/ice-king-logo.png")
OUT_DIR = Path("art/store")

THUMBNAIL_SIZE = (1920, 1080)
ICON_SIZE = 512


def scaled(image, width):
    height = round(image.height * width / image.width)
    return image.resize((width, height), Image.LANCZOS)


def paste_centered(base, overlay, center_y):
    x = (base.width - overlay.width) // 2
    y = round(center_y - overlay.height / 2)
    base.alpha_composite(overlay, (x, y))


def build_thumbnail(splash, logo):
    width, height = THUMBNAIL_SIZE
    # Background: the splash stretched to cover, then blurred and darkened.
    cover = splash.resize((width, round(splash.height * width / splash.width)), Image.LANCZOS)
    top = (cover.height - height) // 2
    background = cover.crop((0, top, width, top + height)).filter(ImageFilter.GaussianBlur(24))
    background = ImageEnhance.Brightness(background).enhance(0.55).convert("RGBA")

    art = splash.resize((round(splash.width * height / splash.height), height), Image.LANCZOS)
    background.alpha_composite(art.convert("RGBA"), ((width - art.width) // 2, 0))
    # The lake sits a little below the middle of the splash.
    paste_centered(background, scaled(logo, 760), height * 0.56)
    return background.convert("RGB")


def build_icon(splash, logo):
    side = splash.height
    left = (splash.width - side) // 2
    square = splash.crop((left, 0, left + side, side)).resize((ICON_SIZE, ICON_SIZE), Image.LANCZOS)
    icon = ImageEnhance.Brightness(square).enhance(0.8).convert("RGBA")
    paste_centered(icon, scaled(logo, 500), ICON_SIZE * 0.52)
    return icon.convert("RGB")


def main():
    splash = Image.open(SPLASH_PATH).convert("RGB")
    logo = Image.open(LOGO_PATH).convert("RGBA")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    build_thumbnail(splash, logo).save(OUT_DIR / "thumbnail.png", optimize=True)
    build_icon(splash, logo).save(OUT_DIR / "icon.png", optimize=True)
    print(f"Wrote {OUT_DIR / 'thumbnail.png'} and {OUT_DIR / 'icon.png'}")


if __name__ == "__main__":
    main()
