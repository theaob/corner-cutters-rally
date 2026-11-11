import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COLOR, CSS_VARS, TYPE, font } from '../src/f1/theme';
import { gapColor, gradeBand, gradeColor, splitColor } from '../src/f1/access';
import { gradeTone, hasVoice } from '../src/f1/race/rallyView';

describe('the theme', () => {
  it("index.html's colour variables are the theme's (the stylesheet's first paint matches what applyTheme sets)", () => {
    const html = readFileSync('index.html', 'utf8');
    for (const [name, value] of Object.entries(CSS_VARS)) {
      const m = html.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, 'i'));
      expect(m?.[1].toLowerCase(), name).toBe(value);
    }
  });
  it('five sizes of type, smallest first', () => {
    const sizes = Object.values(TYPE);
    expect(sizes).toHaveLength(5);
    expect([...sizes].sort((a, b) => a - b)).toEqual(sizes);
    expect(font('md')).toBe('calc(12px * var(--ts, 1)) Silkscreen, monospace');
    expect(font('md', true)).toBe('12px Silkscreen, monospace');
  });
  it("the HUD's text colours are no longer written out across the code (only the theme has them)", () => {
    for (const f of ['src/f1/race/hud.ts', 'src/f1/race/rallyView.ts', 'src/f1/race/banner.ts']) {
      const src = readFileSync(f, 'utf8');
      for (const c of [COLOR.gold, COLOR.teal, COLOR.muted, COLOR.red, COLOR.text]) expect(src.includes(c), `${f} ${c}`).toBe(false);
    }
  });
});

describe("the card's colours by grade", () => {
  it('red for a 1, a 2 or a hairpin, amber for 3 and 4, green for 5 and 6', () => {
    expect(gradeBand('hairpin')).toBe('tight');
    expect(gradeBand(2)).toBe('tight');
    expect(gradeBand(3)).toBe('medium');
    expect(gradeBand(4)).toBe('medium');
    expect(gradeBand(6)).toBe('fast');
  });
  it("COLOUR-SAFE uses the splits' palette, and no band shares a colour", () => {
    for (const safe of [false, true]) {
      const set = new Set([1, 3, 6].map((g) => gradeColor(g, safe)));
      expect(set.size).toBe(3);
    }
    expect(gradeColor(1, true)).toBe(splitColor('worse', true));
    expect(gradeColor(6, true)).toBe(splitColor('record', true));
    expect(gapColor(true, true)).not.toBe(gapColor(false, true));
  });
});

describe('the calls without a voice', () => {
  it('a tone per grade: low for a hairpin, rising to a 6', () => {
    const tones = (['hairpin', 1, 2, 3, 4, 5, 6] as const).map(gradeTone);
    for (let k = 1; k < tones.length; k++) expect(tones[k]).toBeGreaterThan(tones[k - 1]);
    expect(tones[0]).toBe(220);
  });
  it('the voice counts only with a voice to speak in', () => {
    expect(hasVoice(undefined)).toBe(false);
    expect(hasVoice({ getVoices: () => [] })).toBe(false);
    expect(hasVoice({ getVoices: () => [{} as SpeechSynthesisVoice] })).toBe(true);
  });
});
