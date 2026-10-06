import { describe, expect, it } from 'vitest';
import { MAX_STOPS, bestPlan, choices, pickFor, planText, plans, stintTime, type StrategyInput } from '../src/f1/strategy';
import { PIT } from '../src/f1/pits';
import { TYRES } from '../src/f1/tyres';

// a typical circuit: a 75 s lap, the game's own wear and stop
const input = (laps: number, more: Partial<StrategyInput> = {}): StrategyInput => ({ laps, lapTime: 75, perLap: TYRES.lapWear, stopCost: PIT.stop + TYRES.laneCost, ...more });
const stops = (laps: number) => bestPlan(input(laps)).stints.length - 1;

describe('a stint', () => {
  it('loses more the longer it runs, and more on worn tyres', () => {
    expect(stintTime('slick', 3, 0, TYRES.lapWear, 75)).toBeGreaterThan(stintTime('slick', 2, 0, TYRES.lapWear, 75));
    expect(stintTime('slick', 2, 0.5, TYRES.lapWear, 75)).toBeGreaterThan(stintTime('slick', 2, 0, TYRES.lapWear, 75));
  });

  it('the HARD: slower new, but it lasts', () => {
    expect(stintTime('hard', 1, 0, TYRES.lapWear, 75)).toBeGreaterThan(stintTime('slick', 1, 0, TYRES.lapWear, 75));
    expect(stintTime('hard', 6, 0, TYRES.lapWear, 75)).toBeLessThan(stintTime('slick', 6, 0, TYRES.lapWear, 75));
  });
});

describe('the plans', () => {
  it('cover every split up to three stops, the quickest first, each stint at least a lap but the last', () => {
    const all = plans(input(7));
    for (let k = 1; k < all.length; k++) expect(all[k].time).toBeGreaterThanOrEqual(all[k - 1].time - 1e-9);
    expect(Math.max(...all.map((p) => p.stints.length))).toBe(MAX_STOPS + 1);
    for (const p of all) {
      expect(p.stints.reduce((t, s) => t + s.laps, 0)).toBeCloseTo(7);
      for (const s of p.stints.slice(0, -1)) expect(s.laps).toBeGreaterThanOrEqual(1);
    }
    // (no more stops than laps)
    expect(Math.max(...plans(input(2)).map((p) => p.stints.length))).toBe(2);
  });

  it('mid-race, start on the set on now', () => {
    for (const p of plans(input(5, { current: { compound: 'hard', wear: 0.3 } }))) expect(p.stints[0].compound).toBe('hard');
  });

  it('a short race: no stop, on the SOFTs', () => {
    for (const n of [1, 2, 3]) expect(bestPlan(input(n)).stints).toEqual([{ compound: 'slick', laps: n }]);
  });

  it('the longer the race, the more stops', () => {
    const counts = [3, 5, 10, 20].map(stops);
    for (let k = 1; k < counts.length; k++) expect(counts[k]).toBeGreaterThanOrEqual(counts[k - 1]);
    expect(counts[3]).toBeGreaterThanOrEqual(2);
  });

  it('both compounds pay somewhere: the HARD is in a quick plan at some length, and so is a SOFT stint', () => {
    const used = new Set([5, 7, 10, 15, 20].flatMap((n) => choices(input(n)).flatMap((p) => p.stints.map((s) => s.compound))));
    expect(used).toEqual(new Set(['slick', 'hard']));
  });

  it('read as SFT → HRD · 1 STOP', () => {
    expect(planText({ stints: [{ compound: 'slick', laps: 3 }, { compound: 'hard', laps: 4 }], time: 0 })).toBe('SFT → HRD · 1 STOP');
    expect(planText({ stints: [{ compound: 'slick', laps: 3 }], time: 0 })).toBe('SFT · NO STOP');
    expect(planText({ stints: [{ compound: 'hard', laps: 1 }, { compound: 'slick', laps: 1 }, { compound: 'slick', laps: 1 }], time: 0 })).toBe('HRD → SFT → SFT · 2 STOPS');
  });
});

describe("the field's strategies", () => {
  it('a choice of each kind, all close to the quickest', () => {
    for (const n of [5, 7, 10, 15]) {
      const options = choices(input(n));
      const best = options[0].time;
      const kinds = options.map((p) => `${p.stints.length}:${p.stints[0].compound}`);
      expect(new Set(kinds).size).toBe(kinds.length);
      for (const p of options) expect(p.time - best).toBeLessThanOrEqual(Math.max(2.5, 0.006 * 75 * n));
    }
  });

  it('in a long race, more than one strategy to pick from', () => {
    for (const n of [5, 7, 10, 15, 20]) expect(choices(input(n)).length).toBeGreaterThan(1);
  });

  it('about half the field on the quickest, the rest spread over the others, each driver always the same', () => {
    const options = choices(input(10));
    const picks = Array.from({ length: 20 }, (_, k) => options.indexOf(pickFor(options, k)));
    const onBest = picks.filter((i) => i === 0).length;
    expect(onBest).toBeGreaterThanOrEqual(6);
    expect(onBest).toBeLessThanOrEqual(14);
    expect(new Set(picks).size).toBeGreaterThan(1);
    for (let k = 0; k < 20; k++) expect(pickFor(options, k)).toBe(options[picks[k]]);
    expect(pickFor([options[0]], 3)).toBe(options[0]);
  });
});

describe('a tie between plans', () => {
  it('the later stop first: the short stint last', () => {
    const one = bestPlan(input(5));
    if (one.stints.length === 2 && one.stints[0].compound === one.stints[1].compound) expect(one.stints[0].laps).toBeGreaterThan(one.stints[1].laps);
    const softs = plans(input(5)).find((p) => p.stints.length === 2 && p.stints.every((s) => s.compound === 'slick'))!;
    expect(softs.stints.map((s) => s.laps)).toEqual([3, 2]);
  });
});
