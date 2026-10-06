#!/usr/bin/env python3
"""Draws the Android app's launcher icons and splash screens: a pixel-art F1 car,
top-down, on asphalt between red-and-white kerbs, in the game's colours.

    python3 tools/android-art.py        (needs Pillow: pip install pillow)

Writes into android/app/src/main/res/ (commit the results).
"""
from pathlib import Path

from PIL import Image, ImageDraw

RES = Path(__file__).resolve().parent.parent / 'android/app/src/main/res'

DECK = (14, 13, 22)  # the page background, #0e0d16
ASPHALT = (58, 58, 72)
LINE = (232, 232, 240)
KERB_RED = (216, 50, 60)
KERB_WHITE = (244, 244, 248)
GRASS = (63, 154, 76)
COLORS = {
    'W': (244, 244, 248),  # wings
    'R': (216, 50, 60),  # body
    'D': (150, 28, 38),  # body shade
    'T': (24, 24, 30),  # tyres
    'Y': (242, 193, 78),  # helmet
    'K': (27, 27, 38),  # cockpit
}

# the car, nose up; one character per pixel
CAR = """
...WWWWWWW...
...WWWWWWW...
.....RRR.....
.....RRR.....
TTT..RRR..TTT
TTT.RRRRR.TTT
TTT.RRRRR.TTT
.....RRR.....
....RKYKR....
...RRKYKRR...
..RRRRRRRRR..
..RDRRRRRDR..
..RDRRRRRDR..
TTTRRRRRRRTTT
TTTRRRRRRRTTT
TTT.RRRRR.TTT
TTT..RRR..TTT
..WWWWWWWWW..
..WWWWWWWWW..
""".strip().splitlines()


def car(scale: int) -> Image.Image:
    """The car, each pixel `scale` px square, on a transparent background."""
    w, h = len(CAR[0]), len(CAR)
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    for y, row in enumerate(CAR):
        for x, c in enumerate(row):
            if c in COLORS:
                im.putpixel((x, y), COLORS[c] + (255,))
    return im.resize((w * scale, h * scale), Image.NEAREST)


def track(size: tuple[int, int], cell: int, margin: int = 0) -> Image.Image:
    """Asphalt with kerbs down both sides (`margin` px in from the edges, grass beyond) and a
    dashed centre line, `cell` px to a pixel."""
    w, h = size
    im = Image.new('RGBA', size, ASPHALT + (255,))
    d = ImageDraw.Draw(im)
    if margin:
        d.rectangle([0, 0, margin - 1, h], fill=GRASS)
        d.rectangle([w - margin, 0, w, h], fill=GRASS)
    kerb = cell * 3
    for side in (margin, w - margin - kerb):
        for i, y in enumerate(range(0, h, cell * 3)):
            d.rectangle([side, y, side + kerb - 1, y + cell * 3 - 1], fill=KERB_RED if i % 2 else KERB_WHITE)
    for y in range(cell, h, cell * 6):
        d.rectangle([w // 2 - cell // 2, y, w // 2 + cell // 2 - 1, y + cell * 3 - 1], fill=LINE)
    return im


def centred(base: Image.Image, top: Image.Image) -> Image.Image:
    base = base.copy()
    base.alpha_composite(top, ((base.width - top.width) // 2, (base.height - top.height) // 2))
    return base


def rounded(im: Image.Image, radius: int) -> Image.Image:
    mask = Image.new('L', im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, im.width - 1, im.height - 1], radius, fill=255)
    out = Image.new('RGBA', im.size, (0, 0, 0, 0))
    out.paste(im, mask=mask)
    return out


def circle(im: Image.Image) -> Image.Image:
    mask = Image.new('L', im.size, 0)
    ImageDraw.Draw(mask).ellipse([0, 0, im.width - 1, im.height - 1], fill=255)
    out = Image.new('RGBA', im.size, (0, 0, 0, 0))
    out.paste(im, mask=mask)
    return out


DENSITIES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}

for name, k in DENSITIES.items():
    folder = RES / f'mipmap-{name}'
    # adaptive icon (Android 8+): 108 dp layers, the car inside the 66 dp safe zone
    layer = round(108 * k)
    cell = max(1, round(layer / 36))
    # (launchers mask the outer part of the layer: the kerbs sit inside the part that shows)
    track((layer, layer), cell, margin=round(layer * 0.2)).convert('RGB').save(folder / 'ic_launcher_background.png')
    fg = car(max(1, round(layer * 0.5 / len(CAR))))
    centred(Image.new('RGBA', (layer, layer), (0, 0, 0, 0)), fg).save(folder / 'ic_launcher_foreground.png')
    # legacy icons (48 dp): square with rounded corners, and round
    size = round(48 * k)
    legacy = centred(track((size, size), max(1, round(size / 24))), car(max(1, round(size * 0.66 / len(CAR)))))
    rounded(legacy, round(size * 0.18)).save(folder / 'ic_launcher.png')
    circle(legacy).save(folder / 'ic_launcher_round.png')

# splash screens: the car on the page background, portrait and landscape
SPLASH = {'mdpi': (320, 480), 'hdpi': (480, 800), 'xhdpi': (720, 1280), 'xxhdpi': (960, 1600), 'xxxhdpi': (1280, 1920)}
for name, (w, h) in SPLASH.items():
    scale = max(2, round(min(w, h) * 0.28 / len(CAR)))
    for orient, size in (('port', (w, h)), ('land', (h, w))):
        centred(Image.new('RGBA', size, DECK + (255,)), car(scale)).convert('RGB').save(RES / f'drawable-{orient}-{name}' / 'splash.png')
centred(Image.new('RGBA', (480, 320), DECK + (255,)), car(4)).convert('RGB').save(RES / 'drawable' / 'splash.png')
print('android art written to', RES)
