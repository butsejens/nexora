from PIL import Image
import os

logo = Image.open("app/assets/images/logo.png").convert("RGBA")

icon_sizes = {
    "mipmap-mdpi":    48,
    "mipmap-hdpi":    72,
    "mipmap-xhdpi":   96,
    "mipmap-xxhdpi":  144,
    "mipmap-xxxhdpi": 192,
}

adaptive_sizes = {
    "mipmap-mdpi":    108,
    "mipmap-hdpi":    162,
    "mipmap-xhdpi":   216,
    "mipmap-xxhdpi":  324,
    "mipmap-xxxhdpi": 432,
}

base = "app/android/app/src/main/res"

for folder, size in icon_sizes.items():
    path = os.path.join(base, folder)
    for name in ["ic_launcher.webp", "ic_launcher_round.webp"]:
        img = logo.resize((size, size), Image.LANCZOS)
        img.save(os.path.join(path, name), "WEBP", quality=90)
        print(f"OK {folder}/{name} ({size}x{size})")

for folder, size in adaptive_sizes.items():
    path = os.path.join(base, folder)

    # foreground: logo centered on transparent canvas (72% of canvas = safe zone)
    icon_sz = int(size * 0.72)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    icon_img = logo.resize((icon_sz, icon_sz), Image.LANCZOS)
    offset = (size - icon_sz) // 2
    canvas.paste(icon_img, (offset, offset), icon_img)
    canvas.save(os.path.join(path, "ic_launcher_foreground.webp"), "WEBP", quality=90)
    print(f"OK {folder}/ic_launcher_foreground.webp ({size}x{size})")

    # background: solid #0B0F17
    bg = Image.new("RGBA", (size, size), (11, 15, 23, 255))
    bg.save(os.path.join(path, "ic_launcher_background.webp"), "WEBP", quality=90)
    print(f"OK {folder}/ic_launcher_background.webp")

    # monochrome: same as foreground for now
    canvas.save(os.path.join(path, "ic_launcher_monochrome.webp"), "WEBP", quality=90)
    print(f"OK {folder}/ic_launcher_monochrome.webp")

print("Done!")
