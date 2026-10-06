import { describe, expect, it } from 'vitest';
import { carClass } from '../src/engine/driving';
import { buildCircuit } from '../src/f1/circuit';
import { DIFFICULTIES, NORMAL, handlingFor } from '../src/f1/difficulty';

const [EASY, , HARD] = DIFFICULTIES;
import { layoutById } from '../src/f1/layouts';
import { lineCornerSpeed, lineDecel } from '../src/f1/racing';
import {
  RALLIES, RALLY, aiStage, crewName, gapText, loadBests, loadRally, newRally, nextStage, parseRally, rallyOver, recordBest, recordStage,
  referenceStage, saveRally, serviceAfter, stageOrder, standings, yourPlace,
} from '../src/f1/rally';
import { TEAMS } from '../src/f1/teams';

const forests = RALLIES[0];
const fresh = (seed = 7) => newRally({ event: forests, seed, team: TEAMS[1], seat: 0, difficulty: 'normal' });
/** Run stage `k` with your time `time` (undefined: didn't finish). */
const run = (r: ReturnType<typeof fresh>, time: number | undefined, health = 0.8) => recordStage(r, nextStage(r), { time, health }, aiStage(r, nextStage(r), 30, NORMAL));

describe('the rallies', () => {
  it('each run on stages that exist, with service after a stage that has one to follow', () => {
    for (const e of RALLIES) {
      expect(e.stages.length).toBeGreaterThanOrEqual(3);
      for (const s of e.stages) expect(layoutById(s.layout), s.layout).toBeDefined();
      for (const k of e.service) expect(k).toBeLessThan(e.stages.length - 1);
    }
  });
});

describe('a rally', () => {
  it('has ten crews, you among them once, the rest other drivers with a pace rank each', () => {
    const r = fresh();
    expect(r.crews).toHaveLength(RALLY.crews);
    expect(r.crews[r.you]).toEqual({ team: TEAMS[1].id, seat: 0 });
    const names = r.crews.map(crewName);
    expect(new Set(names).size).toBe(names.length);
    expect(r.crews.filter((_, i) => i !== r.you).map((c) => c.rank).sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });
  it('is the same rally from the same seed', () => {
    expect(fresh(3)).toEqual(fresh(3));
    expect(aiStage(fresh(3), 0, 30, NORMAL)).toEqual(aiStage(fresh(3), 0, 30, NORMAL));
  });
  it('gives the crews times off the reference, slower on EASY than on HARD', () => {
    const r = fresh();
    const { times } = aiStage(r, 0, 30, HARD);
    expect(times[r.you]).toBeUndefined();
    const clean = (d: typeof NORMAL) => aiStage(r, 0, 30, d);
    const mean = (d: typeof NORMAL) => {
      const t = clean(d).times.filter((x): x is number => x !== undefined);
      return t.reduce((a, b) => a + b, 0) / t.length;
    };
    expect(mean(EASY)).toBeGreaterThan(mean(HARD));
    for (const t of times) if (t !== undefined) expect(t).toBeGreaterThan(30 * 0.95);
  });
  it('now and then costs a crew time, and says what happened', () => {
    let notes = 0;
    for (let seed = 1; seed < 40; seed++) notes += aiStage(fresh(seed), 0, 30, NORMAL).notes.filter(Boolean).length;
    expect(notes).toBeGreaterThan(10);
    expect(notes).toBeLessThan(39 * 9 * 0.4);
  });
  it('adds up the stages into standings, the leader first, with each gap to the leader', () => {
    const r = fresh();
    run(r, 25);
    run(r, 25);
    const s = standings(r);
    expect(s[0].crew).toBe(r.you);
    expect(s[0].gap).toBe(0);
    expect(yourPlace(r)).toBe(1);
    s.forEach((x, i) => i && expect(x.gap).toBeGreaterThanOrEqual(s[i - 1].gap));
    expect(stageOrder(r, 1)[0]).toMatchObject({ crew: r.you, time: 25, gap: 0 });
  });
  it('gives a stage you did not finish the slowest time and a penalty, and patches your car up', () => {
    const r = fresh();
    run(r, undefined, 0);
    const slowest = Math.max(...r.stages[0].times.filter((_, i) => i !== r.you));
    expect(r.stages[0].times[r.you]).toBeCloseTo(slowest + RALLY.notFinished);
    expect(r.stages[0].notes[r.you]).toBe('DNF');
    expect(r.health).toBe(RALLY.patched);
  });
  it('carries your damage to the next stage, till the service park', () => {
    const r = fresh();
    run(r, 30, 0.6);
    expect(r.health).toBeCloseTo(0.6);
    expect(serviceAfter(r, 1)).toBe(true);
    run(r, 30, 0.4);
    expect(r.health).toBe(1);
  });
  it('is over after its last stage, and only records each stage once', () => {
    const r = fresh();
    for (let k = 0; k < forests.stages.length; k++) run(r, 30);
    expect(rallyOver(r)).toBe(true);
    recordStage(r, 1, { time: 1, health: 1 }, aiStage(r, 1, 30, NORMAL));
    expect(r.stages).toHaveLength(forests.stages.length);
  });
  it('is kept on the device, and a broken save is let go', () => {
    const r = fresh();
    run(r, 31.5);
    saveRally(r);
    expect(loadRally()).toEqual(r);
    expect(parseRally({ ...r, event: 'nowhere' })).toBeUndefined();
    expect(parseRally({ ...r, stages: [{ times: [1] }] })).toBeUndefined();
    expect(parseRally('rally')).toBeUndefined();
  });
  it('keeps your best finish in each rally', () => {
    const r = fresh();
    for (let k = 0; k < forests.stages.length; k++) run(r, 40);
    expect(recordBest(r)).toBe(true);
    const place = loadBests()[forests.id].place;
    const again = fresh(8);
    for (let k = 0; k < forests.stages.length; k++) run(again, 20);
    expect(recordBest(again)).toBe(place > 1);
    expect(loadBests()[forests.id].place).toBe(1);
  });
});

describe('a stage reference run', () => {
  it('runs the stage from a standing start, with a split at each sector', () => {
    const layout = layoutById('ss-dust-bowl')!;
    const h = handlingFor(NORMAL);
    const c = buildCircuit(layout, { cornerSpeed: lineCornerSpeed(carClass('f1'), h), decel: lineDecel(carClass('f1')) });
    const ref = referenceStage(c.track, c.grid, h, 'dry', c.slots[0]);
    expect(ref.time).toBeGreaterThan(10);
    expect(ref.time).toBeLessThan(40);
    expect(ref.splits).toHaveLength(2);
    expect(ref.splits[0]).toBeLessThan(ref.splits[1]);
    expect(ref.splits[1]).toBeLessThan(ref.time);
  }, 30000);
});

it('shows gaps under and over a minute', () => {
  expect(gapText(3.456)).toBe('+3.46');
  expect(gapText(62.5)).toBe('+1:02.50');
});
