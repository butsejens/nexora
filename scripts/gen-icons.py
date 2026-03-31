#!/usr/bin/env python3
"""Generate Android mipmap icons from the Nexora logo."""
from PIL import Image, ImageDraw
import os

BASE = "/Users/jens/Downloads/nexora"
LOGO = f"{BASE}/app/assets/images/logo.png"
BG_COLOR = (11, 15, 23)  # #0B0F17

DENSITIES = [
    ("mdpi",    48,  108),
    ("hdpi",    72,  162),
    ("xhdpi",   96,  216),
    ("xxhdpi",  144, 324),
    ("xxxhdpi", 192, 432),
]

logo = Image.open(LOGO).convert("RGBA")

for density, sz, fg_sz in DENSITIES:
    folder = f"{BASE}/android/app/src/main/res/mipmap-{density}"
    os.makedirs(folder, exist_ok=True)

    # ic_launcher — square with dark background
    bg = Image.new("RGBA", (sz, sz), (*BG_COLOR, 255))
    icon = logo.copy()
    icon.thumbnail((sz, sz), Image.LANCZOS)
    paste_x = (sz - icon.width) // 2
    paste_y = (sz - icon.height) // 2
    bg.paste(icon, (paste_x, paste_y), icon)
    bg.convert("RGB").save(f"{folder}/ic_launcher.webp", "WEBP", quality=95)

    # ic_launcher_round — circular crop
    mask = Image.new("L", (sz, sz), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((0, 0, sz, sz), fill=255)
    bg_round = Image.new("RGBA", (sz, sz), (*BG_COLOR, 255))
    bg_round.paste(icon, (paste_x, paste_y), icon)
    bg_round.putalpha(mask)
    bg_round.save(f"{folder}/ic_launcher_round.webp", "WEBP", quality=95)

    # ic_launcher_foreground — transparent bg, 72% padding for adaptive safe zone
    fg_bg = Image.new("RGBA", (fg_sz, fg_sz), (0, 0, 0, 0))
    fg_icon = logo.copy()
    target = int(fg_sz * 0.72)
    fg_icon.thumbnail((target, target), Image.LANCZOS)
    fx = (fg_sz - fg_icon.width) // 2
    fy = (fg_sz - fg_icon.height) // 2
    fg_bg.paste(fg_icon, (fx, fy), fg_icon)
    fg_bg.save(f"{folder}/ic_launcher_foreground.webp", "WEBP", quality=95)

    print(f"  {density}: launcher={sz}px  adaptive_fg={fg_sz}px")

print("Done!")
