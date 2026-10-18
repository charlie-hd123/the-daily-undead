"""Regenerate the font-independent paint texture. Requires Pillow."""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
font = ImageFont.truetype(str(ROOT / "assets/fonts/barlow-condensed-900.ttf"), 238)
mask = Image.new("L", (256, 256))
ImageDraw.Draw(mask).text((126, 143), "?", font=font, fill=255, anchor="mm")

# The same tiny, deterministic wear flecks are baked into every loading state.
for i in range(200):
    x, y = (i * 53) % 256, (i * 97) % 256
    opacity = .2 + (i % 5) * .12
    for py in range(y, min(y + 1 + i % 2, 256)):
        for px in range(x, min(x + 1 + i % 3, 256)):
            mask.putpixel((px, py), round(mask.getpixel((px, py)) * (1 - opacity)))

image = Image.new("RGBA", (256, 256), (225, 231, 220, 255))
image.putalpha(mask)
image.save(ROOT / "assets/mystery-box/painted-question.png", optimize=True)
