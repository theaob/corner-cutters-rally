import { describe, expect, it } from 'vitest';
import { deckLabels, type DeckState } from '../src/f1/race/deckLabels';
import { bannerMessage, type BannerState } from '../src/f1/race/banner';
import { blocks, ghostText, limitsText, readoutRows, readoutText, towText, tyreText } from '../src/f1/race/readout';
import { ICON_ART } from '../src/f1/race/icons';
import { qualifyingRows, raceSummary, resultRows } from '../src/f1/race/resultsView';
import { buildCircuit } from '../src/f1/circuit';
import { CRESCENT_PARK } from '../src/f1/layouts';
import { carClass, newCar } from '../src/engine/driving';
import { lineCornerSpeed, lineDecel } from '../src/f1/racing';
import { newRace } from '../src/f1/raceControl';
import { handlingFor, NORMAL } from '../src/f1/difficulty';

const deck = (s: Partial<DeckState> = {}): DeckState => ({
  settings: false, resultsUp: false, roundOver: false, qualifyingOver: false, attackOver: false, session: 'race', learnt: false, watching: false, done: false, paused: false, ...s,
});

describe('the deck labels', () => {
  it('racing: SELECT pauses (no A on the touch deck), B drifts, START restarts', () => {
    expect(deckLabels(deck())).toEqual({ a: '', b: 'DRIFT', start: 'RESTART', select: 'PAUSE' });
  });
  it("paused: nothing on A (the pause screen resumes), no RESTART or EXIT (the pause screen's own; EXIT asked first); the settings: DONE alone", () => {
    expect(deckLabels(deck({ paused: true }))).toEqual({ a: '', b: '', start: '', select: '' });
    expect(deckLabels(deck({ settings: true }))).toEqual({ a: '', b: '', start: '', select: '' });
  });
  it('skips the grid pan, a replay, qualifying and the wait after the flag; NEXT, RACE and AGAIN once they are over', () => {
    expect(deckLabels(deck({ watching: true })).a).toBe('SKIP');
    expect(deckLabels(deck({ session: 'qualifying' })).a).toBe('SKIP');
    expect(deckLabels(deck({ done: true })).a).toBe('SKIP');
    expect(deckLabels(deck({ done: true, resultsUp: true, roundOver: true }))).toEqual({ a: 'NEXT', b: '', start: '', select: 'EXIT' });
    expect(deckLabels(deck({ qualifyingOver: true })).a).toBe('RACE');
    expect(deckLabels(deck({ attackOver: true })).a).toBe('AGAIN');
    expect(deckLabels(deck({ session: 'tutorial', learnt: true })).a).toBe('MENU');
    // (and nothing else: no DRIFT then)
    expect(deckLabels(deck({ session: 'tutorial', learnt: true })).b).toBe('');
    expect(deckLabels(deck({ session: 'tutorial', learnt: false })).b).toBe('DRIFT');
  });
});

const banner = (s: Partial<BannerState> = {}): BannerState => ({
  replay: false, blink: false, ceremony: false, resultsUp: false, out: false, championship: false, done: false, boxBox: false, pitSide: 'LEFT',
  wrongWay: 0, clock: 30, session: 'race', notice: { text: '', color: '', until: 0 }, beforeLine: false, safetyCar: false, vsc: false, ...s,
});

describe('the banner', () => {
  it('says the most urgent thing', () => {
    expect(bannerMessage(banner())).toEqual(['', '']);
    expect(bannerMessage(banner({ clock: 0.5 }))[0]).toBe('GO!');
    expect(bannerMessage(banner({ replay: true, blink: true }))[0]).toBe('● REPLAY');
    expect(bannerMessage(banner({ done: true, finishedPlace: 2 }))).toEqual(['FINISHED · P2', '#f2c14e']);
    expect(bannerMessage(banner({ done: true, finishedPlace: 7 }))).toEqual(['FINISHED · P7', '#f4f4f8']);
    expect(bannerMessage(banner({ out: true }))[0]).toBe('DNF · RESTART to go again');
    expect(bannerMessage(banner({ out: true, championship: true }))[0]).toBe('DNF');
    expect(bannerMessage(banner({ pit: { stopped: true, left: 1.26, limiter: true } }))[0]).toBe('PIT STOP 1.3');
    expect(bannerMessage(banner({ pit: { stopped: false, left: 0, limiter: true } }))[0]).toBe('PIT LIMITER');
    expect(bannerMessage(banner({ boxBox: true, pitSide: 'RIGHT' }))[0]).toBe('BOX, BOX · PITS RIGHT');
    expect(bannerMessage(banner({ notice: { text: 'SAFETY CAR', color: '#f2c14e', until: 31 } }))[0]).toBe('SAFETY CAR');
    expect(bannerMessage(banner({ ceremony: true }))).toEqual(['', '']);
    expect(bannerMessage(banner({ session: 'timeattack', attackLeft: 3.04 }))).toEqual(['3.0 S', '#d8323c']);
    expect(bannerMessage(banner({ session: 'timetrial', beforeLine: true }))[0]).toBe('TIMING STARTS AT THE LINE');
  });
});

describe('the readout', () => {
  it('lap times, the gaps either side, the car and the tyres as five blocks', () => {
    expect(blocks(1)).toBe('■■■■■');
    expect(blocks(0.41)).toBe('■■■□□');
    const text = readoutText({ lapTime: 12.5, last: 30.1, best: 29.8, health: 0.5, wrecked: false, ahead: { name: 'HAM', gap: 0.42 }, behind: { name: 'LEC' } });
    expect(text).toContain('▲ HAM   +0.42');
    expect(text).toContain('▼ LEC   –');
    expect(text).toContain('CAR  ■■■□□');
    expect(readoutText({ health: 0, wrecked: true })).toContain('CAR  WRECKED');
    expect(readoutText({ health: 1, wrecked: false, attack: { left: 12.34, passed: 3 } })).toMatch(/^TIME 12\.3\n/);
    // (WORN on a line of its own, lined up with the labels: beside the blocks it widened the readout)
    expect(tyreText('SFT', 0.8, true, 'INT')).toBe('TYRE SFT ■□□□□ 20%\nWORN\nBOX  FOR INT\n');
    expect(tyreText('SFT', 0.8, false)).toBe('TYRE SFT ■□□□□\nWORN\n');
    expect(tyreText('MED', 0, false)).toBe('TYRE MED ■■■■■\n');
    expect(towText(0.05)).toBe('');
    expect(towText(0.5)).toBe('TOW  ▶▶▶\n');
    expect(limitsText(0)).toBe('');
    expect(ghostText(-0.5)).toBe('GAP  −0.50\n');
  });
});

describe("the readout's rows", () => {
  it('each line an icon, its label and its value; a word alone a value under the values; long labels across both columns', () => {
    expect(readoutRows('LAP  0:31.20\nLAST –\n▲ RUS   +0.50\nCAR  ■■■■□\n')).toEqual([
      { icon: 'watch', label: 'LAP', value: '0:31.20' },
      { icon: 'lap', label: 'LAST', value: '–' },
      { label: '▲', value: 'RUS   +0.50' },
      { icon: 'car', label: 'CAR', value: '■■■■□' },
    ]);
    expect(readoutRows(tyreText('SFT', 0.8, false, 'INTERS'))).toEqual([
      { icon: 'tyre', label: 'TYRE', value: 'SFT ■□□□□' },
      { label: '', value: 'WORN' },
      { icon: 'wrench', label: 'BOX', value: 'FOR INTERS' },
    ]);
    expect(readoutRows(limitsText(1))).toEqual([{ icon: 'warn', label: 'LIMITS', value: '1/2', span: true }]);
    expect(readoutRows('BRONZE 0:34.57\n')[0]).toMatchObject({ icon: 'medal', span: true });
    expect(readoutRows('GOLD ●\n')[0]).toMatchObject({ icon: 'medal', label: 'GOLD', value: '●' });
    expect(readoutRows('')).toEqual([]);
  });

  it('each icon whole: 7 × 7 pixels', () => {
    for (const [name, rows] of Object.entries(ICON_ART)) {
      expect(rows, name).toHaveLength(7);
      for (const r of rows) expect(r, name).toMatch(/^[#.]{7}$/);
    }
  });
});

describe('the results rows', () => {
  const f1 = carClass('f1');
  const c = buildCircuit(CRESCENT_PARK, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });
  const field = c.slots.slice(0, 3).map((s) => ({ car: newCar(f1, s.x, s.y, s.heading) }));
  const named = ['VER', 'YOU', 'HAM'].map((name, k) => ({ name, number: k + 1, team: { code: 'MLK' } }));

  it('the winner\'s time, gaps, laps or DNF; places from the grid; penalties and stops', () => {
    const race = newRace(c.track, c.grid, handlingFor(NORMAL), 3, field, 0.5, c.pit);
    race.entrants[1].progress = { ...race.entrants[1].progress, finished: 90, lapTimes: [30, 29.5, 30.5] };
    race.entrants[0].progress = { ...race.entrants[0].progress, finished: 91.25, penalty: 5, lapTimes: [31, 30, 30.25] };
    race.entrants[2].progress = { ...race.entrants[2].progress, retired: true };
    race.entrants[0].stops = 1;
    const rows = resultRows(race, [1, 0, 2], named, 1, 1);
    expect(rows.map((r) => r.name)).toEqual(['YOU', 'VER', 'HAM']);
    expect(rows[0]).toMatchObject({ place: 1, moved: 1, you: true, fastest: true, time: '1:30.00' });
    expect(rows[1]).toMatchObject({ moved: -1, time: '+6.25', notes: '+5S 1P' });
    expect(rows[2]).toMatchObject({ time: 'DNF', best: '–' });
    expect(rows[1]).toMatchObject({ stops: 1, penalty: 5, out: false, finished: true });
    expect(rows[2]).toMatchObject({ out: true, finished: true });
  });

  it('your race at a glance: five boxes, the place in the podium colours, the grid and places made, the gap, best lap, stops', () => {
    const race = newRace(c.track, c.grid, handlingFor(NORMAL), 3, field, 0.5, c.pit);
    race.entrants[1].progress = { ...race.entrants[1].progress, finished: 90, lapTimes: [30, 29.5, 30.5] };
    race.entrants[0].progress = { ...race.entrants[0].progress, finished: 91.25, penalty: 5, lapTimes: [31, 30, 30.25] };
    race.entrants[2].progress = { ...race.entrants[2].progress, retired: true };
    race.entrants[0].stops = 1;
    // (you won from P2, with the fastest lap)
    const won = raceSummary(resultRows(race, [1, 0, 2], named, 1, 1));
    expect(won.map((b) => [b.label, b.value])).toEqual([['FINISH', 'P1'], ['GRID', 'P2 ▲1'], ['TIME', '1:30.00'], ['FASTEST', '0:29.50'], ['STOPS', '0']]);
    expect(won[0].color).toBe('#f2c14e');
    // (you second from pole, a stop and a penalty)
    const second = raceSummary(resultRows(race, [1, 0, 2], named, 0, 1));
    expect(second.map((b) => [b.label, b.value])).toEqual([['FINISH', 'P2'], ['GRID', 'P1 ▼1'], ['GAP', '+6.25'], ['BEST', '0:30.00'], ['STOPS', '1 +5S']]);
    expect(second[4]).toMatchObject({ icon: 'warn', color: '#d8323c' });
    // (out of it)
    const out = raceSummary(resultRows(race, [1, 0, 2], named, 2, 1));
    expect(out[0]).toMatchObject({ value: 'OUT', color: '#d8323c' });
    expect(out[1].value).toBe('P3');
    for (const s of [won, second, out]) expect(s).toHaveLength(5);
  });

  it("qualifying's: the grid, NO TIME, the gap to pole", () => {
    const rows = qualifyingRows([2, 0, 1], [31.5, undefined, 31.2], named, 1);
    expect(rows.map((r) => r.name)).toEqual(['HAM', 'VER', 'YOU']);
    expect(rows[0].gap).toBe('');
    expect(rows[1].gap).toBe('+0.300');
    expect(rows[2]).toMatchObject({ time: 'NO TIME', gap: '', you: true });
  });
});

describe('the sector lines', () => {
  it("are painted where the lap's sectors start (the first at the line: chequered, not one of them)", async () => {
    const { sectorStarts, SECTORS, newProgress, stepProgress, lineCornerSpeed, lineDecel } = await import('../src/f1/racing');
    const { buildCircuit } = await import('../src/f1/circuit');
    const { LAYOUTS } = await import('../src/f1/layouts');
    const { carClass, newCar } = await import('../src/engine/driving');
    const f1 = carClass('f1');
    const c = buildCircuit(LAYOUTS[0], { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });
    const starts = sectorStarts(c.track);
    expect(starts).toHaveLength(SECTORS - 1);
    expect(starts).not.toContain(0);
    // driven round sample by sample: each sector's counted on its line's sample
    let p = newProgress(c.track.samples.length - 3);
    const car = newCar(f1, 0, 0);
    const counted: number[] = [];
    for (let i = 0; i < c.track.samples.length; i++) {
      const s = c.track.samples[i];
      Object.assign(car, { x: s.x, y: s.y });
      const before = p.sector;
      p = stepProgress(p, c.track, car, i, 3, 1 / 60);
      if (p.sector > before) counted.push(i);
    }
    expect(counted).toEqual(starts);
  });
});
