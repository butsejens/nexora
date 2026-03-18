from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


BG = (12, 12, 18)
ACCENT = (229, 9, 20)
WHITE = (245, 245, 247)
ACCENT_SOFT = (255, 69, 88)


def make_logo(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), BG)
    draw = ImageDraw.Draw(img)

    for y in range(size):
        t = y / max(1, size - 1)
        r = int(12 + (36 - 12) * t)
        g = int(12 + (8 - 12) * t)
        b = int(18 + (30 - 18) * t)
        draw.line([(0, y), (size, y)], fill=(r, g, b, 255), width=1)

    outer_pad = int(size * 0.09)
    inner_pad = int(size * 0.15)
    outer_r = int(size * 0.25)
    inner_r = int(size * 0.2)

    draw.rounded_rectangle(
        (outer_pad, outer_pad, size - outer_pad, size - outer_pad),
        radius=outer_r,
        fill=ACCENT,
    )
    draw.rounded_rectangle(
        (inner_pad, inner_pad, size - inner_pad, size - inner_pad),
        radius=inner_r,
        fill=(15, 15, 24, 255),
    )

    stroke = int(size * 0.07)
    draw.rectangle((int(size * 0.29), int(size * 0.24), int(size * 0.29) + stroke, int(size * 0.76)), fill=WHITE)
    draw.rectangle((int(size * 0.64), int(size * 0.24), int(size * 0.64) + stroke, int(size * 0.76)), fill=WHITE)

    slash = int(size * 0.115)
    draw.polygon(
        [
            (int(size * 0.38), int(size * 0.24)),
            (int(size * 0.38) + slash, int(size * 0.24)),
            (int(size * 0.62), int(size * 0.76)),
            (int(size * 0.62) - slash, int(size * 0.76)),
        ],
        fill=ACCENT_SOFT,
    )

    return img


def main() -> None:
    out = Path(__file__).resolve().parents[1] / "assets" / "images"
    out.mkdir(parents=True, exist_ok=True)

    make_logo(1024).save(out / "icon.png", format="PNG")
    make_logo(1024).save(out / "android-icon-foreground.png", format="PNG")
    make_logo(1024).save(out / "android-icon-monochrome.png", format="PNG")

    bg = Image.new("RGBA", (1024, 1024), BG)
    bg_draw = ImageDraw.Draw(bg)
    for y in range(1024):
        t = y / 1023
        r = int(11 + (26 - 11) * t)
        g = int(11 + (7 - 11) * t)
        b = int(15 + (24 - 15) * t)
        bg_draw.line([(0, y), (1024, y)], fill=(r, g, b, 255), width=1)
    bg.save(out / "android-icon-background.png", format="PNG")

    splash = Image.new("RGBA", (1242, 2436), BG)
    draw = ImageDraw.Draw(splash)
    logo = make_logo(540)
    splash.alpha_composite(logo, ((1242 - 540) // 2, (2436 - 540) // 2 - 100))

    try:
        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 78)
    except Exception:
        font = ImageFont.load_default()
    draw.text((621, 1570), "NEXORA", fill=WHITE, font=font, anchor="mm")
    splash.save(out / "splash-icon.png", format="PNG")

    make_logo(192).resize((48, 48), Image.Resampling.LANCZOS).save(out / "favicon.png", format="PNG")

    for name in [
        "icon.png",
        "splash-icon.png",
        "android-icon-foreground.png",
        "android-icon-background.png",
        "android-icon-monochrome.png",
        "favicon.png",
    ]:
        path = out / name
        print(f"{name}: {path.stat().st_size} bytes")


if __name__ == "__main__":
    main()
