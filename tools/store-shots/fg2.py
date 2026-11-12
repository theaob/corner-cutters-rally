import sys
from PIL import Image, ImageDraw, ImageFont
src, cy, out, fontp = sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4]
DECK = (14, 13, 22)
im = Image.open(src).convert('RGB')
col = im.crop((86, 0, 920, im.height))
RW = 660
s = RW / col.width
col = col.resize((RW, round(col.height * s)), Image.LANCZOS)
cy = round(cy * s)
right = col.crop((0, cy - 250, RW, cy + 250))
bg = Image.new('RGB', (1024, 500), DECK)
bg.paste(right, (1024 - RW, 0))
shade = Image.new('L', (1024, 500)); d = ImageDraw.Draw(shade)
x0 = 1024 - RW
for x in range(x0, x0 + 160):
    d.line([(x, 0), (x, 500)], fill=int(255 * (1 - (x - x0) / 160) ** 1.5))
bg = Image.composite(Image.new('RGB', (1024, 500), DECK), bg, shade)
logo = Image.open('shots/logo.png').convert('RGBA')
lw = 380
logo = logo.resize((lw, round(logo.height * lw / logo.width)), Image.NEAREST)
lx, ly = 30, (500 - logo.height) // 2 - 28
bg.paste(logo, (lx, ly), logo)
font = ImageFont.truetype(fontp, 18)
d = ImageDraw.Draw(bg)
t = 'ONE THUMB · EVERY BEND CALLED'
tw = d.textlength(t, font=font)
d.text((lx + (lw - tw) / 2, ly + logo.height + 22), t, font=font, fill=(244, 242, 250))
bg.save(out, optimize=True)
