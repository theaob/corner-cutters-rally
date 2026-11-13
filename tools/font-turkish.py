"""Add the Turkish letters Silkscreen lacks (Ğ ğ İ ı Ş ş) to public/fonts/silkscreen.woff2.

Built from the font's own glyphs: a breve over G, a dot over I, the cedilla under S; ı is the font's i (it has no dot).
Run once (needs `pip install fonttools brotli`); a font that already has them is left alone."""
import sys
from fontTools.ttLib import TTFont
from fontTools.pens.ttGlyphPen import TTGlyphPen

PATH = sys.argv[1] if len(sys.argv) > 1 else 'public/fonts/silkscreen.woff2'
f = TTFont(PATH)
glyf, hmtx, cmap = f['glyf'], f['hmtx'], f.getBestCmap()
if 0x11E in cmap:
    sys.exit('already has the Turkish letters')

def rects(name, boxes):
    pen = TTGlyphPen(None)
    for x0, y0, x1, y1 in boxes:
        pen.moveTo((x0, y0)); pen.lineTo((x0, y1)); pen.lineTo((x1, y1)); pen.lineTo((x1, y0)); pen.closePath()
    glyf[name] = pen.glyph()
    hmtx[name] = (0, 0)

rects('uni0306', [(125, 875, 250, 1000), (500, 875, 625, 1000), (250, 750, 500, 875)])
rects('uni0307', [(125, 750, 250, 875)])

def compose(name, base, mark, dx=0, dy=0):
    pen = TTGlyphPen(f.getGlyphSet())
    pen.addComponent(base, (1, 0, 0, 1, 0, 0))
    pen.addComponent(mark, (1, 0, 0, 1, dx, dy))
    glyf[name] = pen.glyph()
    hmtx[name] = hmtx[base]

compose('Gbreve', 'G', 'uni0306')
compose('gbreve', 'g', 'uni0306')
compose('Idotaccent', 'I', 'uni0307')
compose('Scedilla', 'S', 'uni0327', -10)
compose('scedilla', 's', 'uni0327', -10)

for t in f['cmap'].tables:
    if t.isUnicode():
        t.cmap.update({0x11E: 'Gbreve', 0x11F: 'gbreve', 0x130: 'Idotaccent', 0x131: 'i', 0x15E: 'Scedilla', 0x15F: 'scedilla', 0x306: 'uni0306', 0x307: 'uni0307'})
f.setGlyphOrder(glyf.glyphOrder)
f['maxp'].numGlyphs = len(glyf.glyphOrder)
f['post'].extraNames = []
f['post'].mapping = {}
f.flavor = 'woff2'
f.save(PATH)
