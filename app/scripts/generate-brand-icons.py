from PIL import Image, ImageDraw, ImageFilter
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "assets" / "images"
OUT.mkdir(parents=True, exist_ok=True)


def make_background(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (8, 10, 24, 255))
    px = img.load()
    for y in range(size):
        t = y / max(1, size - 1)
        r = int(8 + (18 - 8) * t)
        g = int(10 + (14 - 10) * t)
        b = int(24 + (40 - 24) * t)
        for x in range(size):
            px[x, y] = (r, g, b, 255)

    draw = ImageDraw.Draw(img)
    pad = int(size * 0.06)
    draw.rounded_rectangle(
        (pad, pad, size - pad, size - pad),
        radius=int(size * 0.22),
        fill=(16, 20, 44, 255),
        outline=(58, 66, 110, 180),
        width=max(2, size // 128),
    )
    return img


def draw_n(img: Image.Image, mono: bool = False) -> None:
    size = img.size[0]
    draw = ImageDraw.Draw(img)
    pad = int(size * 0.2)
    top = pad
    bottom = size - pad
    left = pad
    right = size - pad
    stroke = max(8, int(size * 0.12))

    color_left = (240, 243, 255, 255) if not mono else (10, 10, 10, 255)
    color_mid = (255, 58, 92, 255) if not mono else (10, 10, 10, 255)
    color_right = (240, 243, 255, 255) if not mono else (10, 10, 10, 255)

    draw.rounded_rectangle((left, top, left + stroke, bottom), radius=stroke // 2, fill=color_left)
    draw.rounded_rectangle((right - stroke, top, right, bottom), radius=stroke // 2, fill=color_right)

    poly = [
        (left + stroke + int(size * 0.02), top),
        (left + stroke + int(size * 0.16), top),
        (right - stroke - int(size * 0.02), bottom),
        (right - stroke - int(size * 0.16), bottom),
    ]
    draw.polygon(poly, fill=color_mid)


def save_png(name: str, size: int, mono: bool = False, transparent_bg: bool = False) -> None:
    if transparent_bg:
        img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        draw_n(img, mono=mono)
    else:
        img = make_background(size)
        glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        glow_draw = ImageDraw.Draw(glow)
        center = size // 2
        radius = int(size * 0.28)
        glow_draw.ellipse((center - radius, center - radius, center + radius, center + radius), fill=(255, 35, 85, 40))
        glow = glow.filter(ImageFilter.GaussianBlur(max(2, size // 48)))
        img.alpha_composite(glow)
        draw_n(img, mono=mono)

    img.save(OUT / name)


if __name__ == "__main__":
    save_png("icon.png", 1024)
    save_png("splash-icon.png", 1024)
    save_png("android-icon-foreground.png", 1024, transparent_bg=True)
    save_png("android-icon-background.png", 1024)
    save_png("android-icon-monochrome.png", 1024, mono=True, transparent_bg=True)
    save_png("favicon.png", 256)
    print("Generated modern Nexora brand icons.")
