import { describe, expect, it } from 'vitest';
import { deckLabels, type DeckState } from '../src/f1/race/deckLabels';
import { bannerMessage, evenLines, type BannerState } from '../src/f1/race/banner';
import { blocks, readoutRows, readoutText, tyreText } from '../src/f1/race/readout';
import { ICON_ART } from '../src/f1/race/icons';

const deck = (s: Partial<DeckState> = {}): DeckState => ({
  settings: false, resultsUp: false, tutorial: false, learnt: false, done: false, paused: false, ...s,
});

describe('the deck labels', () => {
  it('driving a stage: SELECT pauses (no A on the touch deck), B drifts, START restarts', () => {
    expect(deckLabels(deck())).toEqual({ a: '', b: 'DRIFT', start: 'RESTART', select: 'PAUSE' });
  });
  it('driving without a drift (TAP on a touch screen): nothing on B', () => {
    expect(deckLabels(deck({ drift: false })).b).toBe('');
  });
  it("paused: nothing on A (the pause screen resumes), no RESTART or EXIT (the pause screen's own; EXIT asked first); the settings: DONE alone", () => {
    expect(deckLabels(deck({ paused: true }))).toEqual({ a: '', b: '', start: '', select: '' });
    expect(deckLabels(deck({ settings: true }))).toEqual({ a: '', b: '', start: '', select: '' });
  });
  it('skips the wait after the finish and the controls lap; NEXT once the results are up (no running a stage again); MENU once the lesson is learnt', () => {
    expect(deckLabels(deck({ done: true })).a).toBe('SKIP');
    expect(deckLabels(deck({ done: true, resultsUp: true }))).toEqual({ a: 'NEXT', b: '', start: '', select: 'EXIT' });
    expect(deckLabels(deck({ tutorial: true })).a).toBe('SKIP');
    expect(deckLabels(deck({ tutorial: true, learnt: true })).a).toBe('MENU');
    // (and nothing else: no DRIFT then)
    expect(deckLabels(deck({ tutorial: true, learnt: true })).b).toBe('');
    expect(deckLabels(deck({ tutorial: true, learnt: false })).b).toBe('DRIFT');
  });
});

const banner = (s: Partial<BannerState> = {}): BannerState => ({
  out: false, done: false, resultsUp: false, wrongWay: 0, clock: 30, notice: { text: '', color: '', until: 0 }, ...s,
});

describe('the banner', () => {
  it('says the most urgent thing', () => {
    expect(bannerMessage(banner())).toEqual(['', '']);
    expect(bannerMessage(banner({ clock: 0.5 }))[0]).toBe('GO!');
    expect(bannerMessage(banner({ done: true, finishedPlace: 2 }))).toEqual(['FINISHED · P2', '#f2c14e']);
    expect(bannerMessage(banner({ done: true, finishedPlace: 7 }))).toEqual(['FINISHED · P7', '#f4f4f8']);
    // (gone once the results are up, and nothing for a stage not finished)
    expect(bannerMessage(banner({ done: true, finishedPlace: 2, resultsUp: true }))).toEqual(['', '']);
    expect(bannerMessage(banner({ done: true }))).toEqual(['', '']);
    expect(bannerMessage(banner({ out: true }))).toEqual(['OUT OF THE STAGE', '#d8323c']);
    expect(bannerMessage(banner({ wrongWay: 2 }))[0]).toBe('WRONG WAY');
    expect(bannerMessage(banner({ wrongWay: 0.5 }))[0]).toBe('');
    expect(bannerMessage(banner({ notice: { text: 'SPLIT 1', color: '#5fe0d0', until: 31 } }))).toEqual(['SPLIT 1', '#5fe0d0']);
  });
  it("on the controls lap: its prompt (the last in gold), and no GO! over it", () => {
    expect(bannerMessage(banner({ clock: 0.5, learn: { text: 'STEER', last: false } }))).toEqual(['STEER', '#f4f4f8']);
    expect(bannerMessage(banner({ learn: { text: 'WELL DONE', last: true } }))).toEqual(['WELL DONE', '#f2c14e']);
  });
  it('splits a long message over two lines, at its dot or evenly', () => {
    expect(evenLines('FINISHED · P2')).toBe('FINISHED\nP2');
    expect(evenLines('OUT OF THE STAGE')).toBe('OUT OF\nTHE STAGE');
    expect(evenLines('GO!')).toBe('GO!');
  });
});

describe('the readout', () => {
  it('the stage clock, your best on the stage, and the car and the tyres as five blocks', () => {
    expect(blocks(1)).toBe('■■■■■');
    expect(blocks(0.41)).toBe('■■■□□');
    expect(readoutText({ time: 12.5, best: 301.2, health: 0.5, wrecked: false })).toBe('TIME 0:12.50\nBEST 5:01.20\nCAR  ■■■□□\n');
    const wrecked = readoutText({ health: 0, wrecked: true });
    expect(wrecked).toContain('TIME –');
    expect(wrecked).toContain('CAR  WRECKED');
    // (WORN on a line of its own, lined up with the labels: beside the blocks it widened the readout)
    expect(tyreText('SFT', 0.8, true)).toBe('TYRE SFT ■□□□□ 20%\nWORN\n');
    expect(tyreText('SFT', 0.8, false)).toBe('TYRE SFT ■□□□□\nWORN\n');
    expect(tyreText('MED', 0, false)).toBe('TYRE MED ■■■■■\n');
  });
});

describe("the readout's rows", () => {
  it('each line an icon, its label and its value; a word alone a value under the values; long labels across both columns', () => {
    expect(readoutRows(readoutText({ time: 31.2, health: 0.8, wrecked: false }))).toEqual([
      { icon: 'watch', label: 'TIME', value: '0:31.20' },
      { icon: 'star', label: 'BEST', value: '–' },
      { icon: 'car', label: 'CAR', value: '■■■■□' },
    ]);
    expect(readoutRows(tyreText('SFT', 0.8, false))).toEqual([
      { icon: 'tyre', label: 'TYRE', value: 'SFT ■□□□□' },
      { label: '', value: 'WORN' },
    ]);
    expect(readoutRows('')).toEqual([]);
  });

  it('each icon whole: 7 × 7 pixels', () => {
    for (const [name, rows] of Object.entries(ICON_ART)) {
      expect(rows, name).toHaveLength(7);
      for (const r of rows) expect(r, name).toMatch(/^[#.]{7}$/);
    }
  });
});

describe('the split lines', () => {
  it("are painted on a stage at its splits: a third and two thirds of the way from the start line to the flying finish", async () => {
    const { sectorStarts, stageSplits, SECTORS, lineCornerSpeed, lineDecel } = await import('../src/f1/racing');
    const { buildCircuit } = await import('../src/f1/circuit');
    const { SHAKEDOWN, stageById } = await import('../src/f1/stages');
    const { carClass } = await import('../src/engine/driving');
    const f1 = carClass('f1');
    const c = buildCircuit(stageById(SHAKEDOWN)!, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });
    const { start, finish } = c.track.stage!;
    const starts = sectorStarts(c.track);
    expect(starts).toHaveLength(SECTORS - 1);
    expect(starts).toEqual(stageSplits(c.track).map((s) => Math.round(s / c.track.spacing)));
    starts.forEach((s, k) => {
      expect(s * c.track.spacing).toBeCloseTo(start + ((finish - start) * (k + 1)) / SECTORS, -1);
      if (k) expect(s).toBeGreaterThan(starts[k - 1]);
    });
  }, 30_000);
});
