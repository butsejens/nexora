from PIL import Image, ImageDraw, ImageFilter
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "assets" / "images"
OUT.mkdir(parents=True, exist_ok=True)
ANDROID_RES = Path(__file__).resolve().parents[1] / "android" / "app" / "src" / "main" / "res"

DENSITIES = {
    "drawable-mdpi": 220,
    "drawable-hdpi": 330,
    "drawable-xhdpi": 440,
    "drawable-xxhdpi": 660,
    "drawable-xxxhdpi": 880,
}


def make_background(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (9, 11, 16, 255))
    px = img.load()
    for y in range(size):
        t = y / max(1, size - 1)
        r = int(9 + (22 - 9) * t)
        g = int(11 + (18 - 11) * t)
        b = int(16 + (32 - 16) * t)
        for x in range(size):
            px[x, y] = (r, g, b, 255)

    draw = ImageDraw.Draw(img)
    pad = int(size * 0.06)
    draw.rounded_rectangle(
        (pad, pad, size - pad, size - pad),
        radius=int(size * 0.22),
        fill=(16, 18, 26, 255),
        outline=(255, 255, 255, 28),
        width=max(2, size // 128),
    )

    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.ellipse(
        (int(size * 0.08), int(size * 0.04), int(size * 0.72), int(size * 0.68)),
        fill=(255, 90, 95, 44),
    )
    glow_draw.ellipse(
        (int(size * 0.38), int(size * 0.44), int(size * 0.92), int(size * 0.98)),
        fill=(77, 226, 255, 36),
    )
    img.alpha_composite(glow.filter(ImageFilter.GaussianBlur(max(6, size // 24))))
    return img


def draw_pulse(img: Image.Image, mono: bool = False) -> None:
    size = img.size[0]
    draw = ImageDraw.Draw(img)
    ring_color = (245, 247, 251, 255) if not mono else (16, 16, 16, 255)
    core_color = (255, 90, 95, 255) if not mono else (16, 16, 16, 255)
    line_color = (10, 12, 18, 255) if not mono else (250, 250, 250, 255)

    outer_pad = int(size * 0.16)
    inner_pad = int(size * 0.3)
    draw.ellipse(
        (outer_pad, outer_pad, size - outer_pad, size - outer_pad),
        outline=ring_color,
        width=max(6, size // 36),
    )
    draw.ellipse(
        (inner_pad, inner_pad, size - inner_pad, size - inner_pad),
        fill=core_color,
    )

    mid_y = size // 2
    left_x = int(size * 0.34)
    right_x = int(size * 0.64)
    stroke = max(8, size // 30)
    draw.rounded_rectangle((left_x, mid_y - stroke // 2, right_x, mid_y + stroke // 2), radius=stroke // 2, fill=line_color)

    dot_radius = max(10, size // 18)
    dot_center_x = int(size * 0.65)
    draw.ellipse(
        (dot_center_x - dot_radius, mid_y - dot_radius, dot_center_x + dot_radius, mid_y + dot_radius),
        fill=line_color,
    )


def save_png(name: str, size: int, mono: bool = False, transparent_bg: bool = False) -> None:
    if transparent_bg:
        img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        draw_pulse(img, mono=mono)
    else:
        img = make_background(size)
        draw_pulse(img, mono=mono)

    img.save(OUT / name)


def save_android_splash_assets() -> None:
    base = make_background(1024)
    draw_pulse(base, mono=False)
    for folder, size in DENSITIES.items():
        target_dir = ANDROID_RES / folder
        target_dir.mkdir(parents=True, exist_ok=True)
        base.resize((size, size), Image.Resampling.LANCZOS).save(target_dir / "splashscreen_logo.png")


if __name__ == "__main__":
    save_png("icon.png", 1024)
    save_png("splash-icon.png", 1024)
    save_png("android-icon-foreground.png", 1024, transparent_bg=True)
    save_png("android-icon-background.png", 1024)
    save_png("android-icon-monochrome.png", 1024, mono=True, transparent_bg=True)
    save_png("favicon.png", 256)
    save_android_splash_assets()
    print("Generated Pulse brand icons and native splash assets.")
