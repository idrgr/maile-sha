"""生成「买了啥」的 PWA / iOS 图标（仅依赖 Pillow）。"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parent.parent / "public" / "icons"
SIZE = 1024
CREAM = (255, 250, 243)
ACCENT_DARK = (211, 68, 35)


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def make_master():
    top = (243, 122, 82)
    bottom = (197, 54, 24)
    img = Image.new("RGB", (SIZE, SIZE), top)
    draw = ImageDraw.Draw(img)
    for y in range(SIZE):
        draw.line([(0, y), (SIZE, y)], fill=lerp(top, bottom, y / (SIZE - 1)))

    # 左上角柔光
    glow = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(glow).ellipse((-320, -420, 640, 420), fill=46)
    glow = glow.filter(ImageFilter.GaussianBlur(90))
    img = Image.composite(Image.new("RGB", (SIZE, SIZE), (255, 236, 220)), img, glow)
    draw = ImageDraw.Draw(img)

    # 提手（先画，袋身盖住下半部分）
    draw.arc((384, 250, 640, 560), start=180, end=360, fill=CREAM, width=36)

    # 袋身
    draw.rounded_rectangle((300, 396, 724, 792), radius=64, fill=CREAM)

    # 对勾
    draw.line([(432, 600), (500, 668), (610, 536)], fill=ACCENT_DARK, width=44, joint="curve")
    for cx, cy in ((432, 600), (610, 536)):
        draw.ellipse((cx - 22, cy - 22, cx + 22, cy + 22), fill=ACCENT_DARK)
    return img


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    master = make_master()
    master.save(OUT / "icon-1024.png")
    for size in (512, 192, 180):
        master.resize((size, size), Image.LANCZOS).save(OUT / f"icon-{size}.png")
    master.resize((180, 180), Image.LANCZOS).save(OUT / "apple-touch-icon.png")
    print("icons written to", OUT)


if __name__ == "__main__":
    main()
