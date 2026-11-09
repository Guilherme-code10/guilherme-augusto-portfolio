"""Gera uma capa social 1200x630 para a prévia do WhatsApp e das redes sociais."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "preview.png"
OUT.parent.mkdir(parents=True, exist_ok=True)

W, H = 1200, 630
img = Image.new("RGB", (W, H), "#071525")
pixels = img.load()
for y in range(H):
    for x in range(W):
        t = x / W * .50 + y / H * .32
        glow = max(0, 1 - math.hypot((x - 1000) / 650, (y - 140) / 570))
        pixels[x, y] = (
            int(6 + 4 * t + 4 * glow),
            int(19 + 12 * t + 20 * glow),
            int(36 + 13 * t + 29 * glow),
        )

WHITE, ACCENT, MUTED = "#f7fbff", "#67d9ff", "#b8ccda"

def font(weight, size):
    paths = {
        "heavy": [
            "/usr/share/fonts/truetype/lato/Lato-Heavy.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        ],
        "bold": [
            "/usr/share/fonts/truetype/lato/Lato-Bold.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        ],
        "regular": [
            "/usr/share/fonts/truetype/lato/Lato-Regular.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        ],
    }
    for path in paths[weight]:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()

d = ImageDraw.Draw(img)
d.rounded_rectangle((65, 57, 121, 113), radius=13, fill=ACCENT)
d.text((74, 70), "g.a", font=font("heavy", 27), fill="#061a31")
d.text((137, 67), "GUILHERME AUGUSTO", font=font("bold", 25), fill=WHITE)
d.text((138, 100), "DESENVOLVIMENTO WEB", font=font("regular", 15), fill=ACCENT)

d.text((65, 178), "Seu negócio merece", font=font("heavy", 66), fill=WHITE)
d.text((65, 252), "um site que", font=font("heavy", 63), fill=WHITE)
d.text((65, 325), "impressiona.", font=font("heavy", 63), fill=ACCENT)
d.rounded_rectangle((65, 413, 143, 421), radius=4, fill=ACCENT)

for x, width, label in [
    (65, 242, "SITES PROFISSIONAIS"),
    (318, 181, "LOJAS VIRTUAIS"),
    (510, 175, "MANUTENÇÃO"),
]:
    d.rounded_rectangle((x, 448, x + width, 490), radius=18, fill="#12314a", outline="#28526b", width=2)
    f = font("bold", 16)
    bbox = d.textbbox((0, 0), label, font=f)
    d.text((x + (width - bbox[2]) / 2, 459), label, font=f, fill="#d7f5ff")

d.line((65, 553, 1134, 553), fill="#285169", width=2)
d.text((65, 569), "PORTFÓLIO • PROJETOS • ORÇAMENTOS", font=font("bold", 18), fill=MUTED)

glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
gd = ImageDraw.Draw(glow)
gd.ellipse((750, 95, 1190, 550), fill=(40, 159, 232, 35))
img = Image.alpha_composite(img.convert("RGBA"), glow.filter(ImageFilter.GaussianBlur(58)))
d = ImageDraw.Draw(img)
d.arc((725, 88, 1180, 577), start=230, end=525, fill="#2a6888", width=2)
x, y = 770, 174
d.rounded_rectangle((x, y, 1135, 475), radius=17, fill="#0a2338", outline="#49718d", width=3)
d.rounded_rectangle((x + 9, y + 9, 1126, y + 37), radius=5, fill="#142c41")
for index, color in enumerate(["#ff8d84", "#f6cc66", "#7fdcb8"]):
    d.ellipse((x + 24 + 17 * index, y + 18, x + 32 + 17 * index, y + 26), fill=color)
d.text((x + 130, y + 14), "guilhermeaugusto.dev", font=font("regular", 13), fill="#9ecde1")
d.rounded_rectangle((x + 22, y + 61, 1114, y + 278), radius=13, fill="#113a55")
d.text((x + 40, y + 83), "Ideias que", font=font("bold", 29), fill=WHITE)
d.text((x + 40, y + 122), "ganham forma.", font=font("heavy", 34), fill=ACCENT)
d.text((x + 40, y + 173), "Desenvolvimento de sites", font=font("regular", 16), fill="#d4e7f2")
d.rounded_rectangle((x + 39, y + 215, x + 237, y + 255), radius=8, fill=ACCENT)
d.text((x + 57, y + 225), "Vamos conversar  ↗", font=font("bold", 16), fill="#06283e")

px, py = 1070, 328
d.rounded_rectangle((px, py, 1162, 521), radius=19, fill="#071728", outline="#5685a2", width=5)
d.rounded_rectangle((px + 10, py + 21, px + 82, py + 168), radius=7, fill="#1a5677")
d.rounded_rectangle((px + 20, py + 43, px + 70, py + 90), radius=7, fill=ACCENT)
for offset, end in [(112, 68), (128, 56)]:
    d.rounded_rectangle((px + 20, py + offset, px + end, py + offset + 6), radius=3, fill="#8db1c5")
d.ellipse((px + 39, py + 176, px + 49, py + 186), fill="#45718e")

img.convert("RGB").quantize(colors=64, method=Image.Quantize.FASTOCTREE).save(OUT, optimize=True)
print(f"Generated {OUT.name}: 1200x630")
