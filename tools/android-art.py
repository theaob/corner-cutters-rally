#!/usr/bin/env python3
"""Draws the game's icon, the gravel hairpin: a white-and-blue rally car cutting the inside
of a gravel bend through the pines, dust kicked up behind it. Pixel art, in the game's colours.

    python3 tools/android-art.py        (needs Pillow: pip install pillow)

Writes the Android launcher icons and splash screens into android/app/src/main/res/, and
the web icons (favicon, home-screen icon) into public/ (commit the results).
"""
import random
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / 'android/app/src/main/res'
PUBLIC = ROOT / 'public'

# The adaptive icon's 108 dp layer is drawn on a 54 px grid: every density's layer
# (108, 162, 216, 324, 432 px) is a whole number of px to the pixel. Launchers show
# the middle 72 dp (36 px here) and keep the middle 66 dp safe from their masks.
N = 54
VIS = 9  # (108 - 72) / 2 dp, in grid px: where the part a launcher shows starts

DECK = (14, 13, 22)  # the page background, #0e0d16
EARTH = (184, 116, 58)
EARTH_SPECKLE = [(160, 98, 46), (204, 138, 74)]
FOREST = (30, 86, 50)
PINE_DARK = (24, 74, 44)
PINE = (40, 112, 58)
TRUNK = (70, 40, 20)
ROAD = (92, 54, 26)
ROAD_EDGE = (120, 72, 34)
GRAVEL = (74, 42, 20)
TRACK = (108, 64, 30)
DUST = (226, 196, 148)
DUST_LIGHT = (242, 224, 190)

# the player's car in its first scheme, RACING STRIPES (src/f1/crews.ts), nose up
CAR = """
.YWWWWWY.
WWBWWWBWW
TWBWWWBWT
TWBWWWBWT
WWBWWWBWW
WKKKKKKKW
WKKKKKKKW
RWBWWWBWR
RWBWWWBWR
RWBWWWBWR
WKKKKKKKW
TWBWWWBWT
TWBWWWBWT
WWBWWWBWW
.LWWWWWL.
""".strip().splitlines()
CAR_COLORS = {
    'W': (244, 244, 248),  # body
    'B': (29, 79, 168),  # twin stripes
    'R': (216, 50, 60),  # sides
    'K': (27, 30, 44),  # glass
    'T': (18, 18, 24),  # tyres
    'Y': (242, 193, 78),  # spot lamps
    'L': (255, 90, 80),  # tail lights
}


def car(angle: float = 0, scale: float = 1) -> Image.Image:
    """The car, nose up, turned `angle` degrees anticlockwise and `scale` times its size:
    turned at 12 px to its pixel, then each block of the result takes its commonest
    colour, so it stays crisp pixel art in its own colours."""
    w, h = len(CAR[0]), len(CAR)
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    for y, row in enumerate(CAR):
        for x, c in enumerate(row):
            if c in CAR_COLORS:
                im.putpixel((x, y), CAR_COLORS[c] + (255,))
    if not angle and scale == 1:
        return im
    k = 12
    big = im.resize((w * k, h * k), Image.NEAREST).rotate(angle, Image.NEAREST, expand=True)
    b = round(k / scale)  # (the block each output pixel takes)
    out = Image.new('RGBA', (big.width // b, big.height // b), (0, 0, 0, 0))
    px = big.load()
    for oy in range(out.height):
        for ox in range(out.width):
            counts: dict = {}
            for y in range(oy * b, oy * b + b):
                for x in range(ox * b, ox * b + b):
                    c = px[x, y] if px[x, y][3] else None
                    counts[c] = counts.get(c, 0) + 1
            best = max(counts, key=counts.get)
            if best and counts[best] * 3 >= b * b:  # (no pixel for a sliver of the edge)
                out.putpixel((ox, oy), best)
    return out


def pine(d: ImageDraw.ImageDraw, x: int, y: int) -> None:
    """A pine, its tip at (x, y): three tiers, a trunk under."""
    for i in range(7):
        w = 1 + (i % 3) * 2 + (i // 3) * 2
        d.line([x - w // 2, y + i, x + w // 2, y + i], fill=PINE if i % 3 else PINE_DARK)
    d.point((x, y + 7), fill=TRUNK)


# the bend: a quarter circle around (BEND, BEND), up from the bottom and away to the right
BEND, RADIUS, WIDTH = 46, 24, 11
# the car, cutting inside the road's line, heading up and right
CAR_AT = (31, 30)


def ring(d: ImageDraw.ImageDraw, r: float, fill) -> None:
    d.ellipse([BEND - r, BEND - r, BEND + r, BEND + r], fill=fill)


def background() -> Image.Image:
    """Earth, the forest outside the bend, the gravel road, the trees on the infield."""
    rnd = random.Random(4)
    im = Image.new('RGBA', (N, N), EARTH + (255,))
    d = ImageDraw.Draw(im)
    for _ in range(110):
        im.putpixel((rnd.randrange(N), rnd.randrange(N)), rnd.choice(EARTH_SPECKLE) + (255,))
    d.ellipse([-30, -30, 27, 27], fill=FOREST)
    for x, y in [(3, 2), (10, 4), (17, 1), (24, 3), (4, 11), (11, 13), (18, 9), (3, 19)]:
        pine(d, x, y)
    half = WIDTH / 2
    ring(d, RADIUS + half + 1, ROAD_EDGE)
    ring(d, RADIUS + half, ROAD)
    ring(d, RADIUS - half, ROAD_EDGE)
    ring(d, RADIUS - half - 1, EARTH)
    for _ in range(70):
        x, y = rnd.randrange(N), rnd.randrange(N)
        if im.getpixel((x, y))[:3] == ROAD:
            im.putpixel((x, y), GRAVEL + (255,))
    # the car's tracks, straight across the inside of the bend
    for o in (-2, 2):
        d.line([BEND - RADIUS + 3 + o, N, CAR_AT[0] + 2 + o, CAR_AT[1] + 4], fill=TRACK)
    for x, y in [(42, 34), (37, 40), (44, 42)]:
        pine(d, x, y)
    return im


def foreground() -> Image.Image:
    """The car and its dust, on nothing (the adaptive icon's top layer)."""
    im = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for x, y, r in [(27, 37, 3), (23, 42, 4), (19, 47, 4), (16, 52, 3)]:
        d.ellipse([x - r, y - r, x + r, y + r], fill=DUST)
    for x, y, w, h in [(21, 44, 3, 2), (18, 49, 2, 2), (25, 39, 2, 1)]:
        d.rectangle([x, y, x + w - 1, y + h - 1], fill=DUST_LIGHT)
    c = car(-45, scale=6 / 5)
    im.alpha_composite(c, (CAR_AT[0] - c.width // 2, CAR_AT[1] - c.height // 2))
    return im


def scene() -> Image.Image:
    im = background()
    im.alpha_composite(foreground())
    return im


def scaled(im: Image.Image, px: int) -> Image.Image:
    """`im` at `px` square: pixels stay square and sharp where `px` is a whole multiple,
    and are blended down from the next multiple up where it isn't."""
    if px % im.width == 0:
        return im.resize((px, px), Image.NEAREST)
    k = -(-px // im.width)
    return im.resize((im.width * k, im.height * k), Image.NEAREST).resize((px, px), Image.LANCZOS)


def masked(im: Image.Image, shape: str) -> Image.Image:
    mask = Image.new('L', im.size, 0)
    d = ImageDraw.Draw(mask)
    if shape == 'circle':
        d.ellipse([0, 0, im.width - 1, im.height - 1], fill=255)
    else:
        d.rounded_rectangle([0, 0, im.width - 1, im.height - 1], round(im.width * 0.18), fill=255)
    out = Image.new('RGBA', im.size, (0, 0, 0, 0))
    out.paste(im, mask=mask)
    return out


def icon(px: int, shape: str) -> Image.Image:
    """The icon as a launcher shows it: the middle of the layer, at `px`, in `shape`."""
    return masked(scaled(scene().crop((VIS, VIS, N - VIS, N - VIS)), px), shape)


DENSITIES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}

for name, k in DENSITIES.items():
    folder = RES / f'mipmap-{name}'
    # adaptive icon (Android 8+): the scene behind, the car and its dust in front
    layer = round(108 * k)
    scaled(background(), layer).convert('RGB').save(folder / 'ic_launcher_background.png')
    scaled(foreground(), layer).save(folder / 'ic_launcher_foreground.png')
    # legacy icons (48 dp): square with rounded corners, and round
    size = round(48 * k)
    icon(size, 'square').save(folder / 'ic_launcher.png')
    icon(size, 'circle').save(folder / 'ic_launcher_round.png')

# splash screens (before Android 12, which draws the launcher icon itself): the icon on
# the page background, portrait and landscape
SPLASH = {'mdpi': (320, 480), 'hdpi': (480, 800), 'xhdpi': (720, 1280), 'xxhdpi': (960, 1600), 'xxxhdpi': (1280, 1920)}


def splash(size: tuple[int, int]) -> Image.Image:
    im = Image.new('RGBA', size, DECK + (255,))
    # (a whole number of px to the pixel, about a third of the short side)
    px = max(1, round(min(size) * 0.34 / 36)) * 36
    top = icon(px, 'square')
    im.alpha_composite(top, ((size[0] - px) // 2, (size[1] - px) // 2))
    return im.convert('RGB')


for name, (w, h) in SPLASH.items():
    for orient, size in (('port', (w, h)), ('land', (h, w))):
        splash(size).save(RES / f'drawable-{orient}-{name}' / 'splash.png')
splash((480, 320)).save(RES / 'drawable' / 'splash.png')

# the web: the tab's icon, and the one a phone puts on its home screen
icon(32, 'square').save(PUBLIC / 'favicon.png')
icon(192, 'square').save(PUBLIC / 'icon-192.png')
icon(512, 'square').save(PUBLIC / 'icon-512.png')
# (iOS rounds the corners itself, and shows transparency as black)
scaled(scene().crop((VIS, VIS, N - VIS, N - VIS)), 180).convert('RGB').save(PUBLIC / 'apple-touch-icon.png')
print('icons written to', RES, 'and', PUBLIC)
