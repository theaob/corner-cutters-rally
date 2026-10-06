import { describe, expect, it } from 'vitest';
import { SIM_DT } from '../src/engine/fixedStep';
import { buildCircuit } from '../src/f1/circuit';
import { DIFFICULTIES, NORMAL, handlingFor } from '../src/f1/difficulty';
import { CRESCENT_PARK } from '../src/f1/layouts';
import { SECTORS, lineCornerSpeed, lineDecel } from '../src/f1/racing';
import { stepRace } from '../src/f1/raceControl';
import { newQualifying, referenceLap } from '../src/f1/qualifying';
import { referenceInput, type ReferencePlayer } from '../src/f1/referencePlayer';
import { recordAttack, emptyRecords } from '../src/f1/records';
import { ATTACK, bonus, distance, newAttack, stepAttack } from '../src/f1/timeAttack';
import { fitTyres } from '../src/f1/tyres';
import { carClass } from '../src/engine/driving';

describe('the Time Attack clock', () => {
  it("doesn't run till you cross the line, then starts with a little more than a sector's par", () => {
    const a = newAttack(30);
    expect(stepAttack(a, 1, false, 0, false)).toEqual({});
    expect(a.left).toBeUndefined();
    expect(stepAttack(a, 0.5, true, 0, false).started).toBe(true);
    expect(a.left).toBeCloseTo(10 * ATTACK.grace - 0.5);
  });

  it('adds time at each checkpoint, generous on the first lap and less each lap after, and takes some off for a cut', () => {
    const a = newAttack(30);
    expect(bonus(a, 0)).toBeGreaterThan(10);
    for (let k = SECTORS; k < SECTORS * 20; k += SECTORS) expect(bonus(a, k)).toBeLessThanOrEqual(bonus(a, k - SECTORS));
    expect(bonus(a, SECTORS * 4)).toBeLessThan(10);
    stepAttack(a, 0, true, 0, false);
    const before = a.left!;
    const s = stepAttack(a, 0.1, true, 1, true);
    expect(s.added).toBeCloseTo(bonus(a, 0));
    expect(s.lost).toBe(ATTACK.cut);
    expect(a.left).toBeCloseTo(before + bonus(a, 0) - ATTACK.cut - 0.1);
    // (two passed in one step: both counted)
    expect(stepAttack(a, 0, true, 3, false).added).toBeCloseTo(bonus(a, 1) + bonus(a, 2));
  });

  it('runs out: TIME UP once, and then it holds', () => {
    const a = newAttack(30);
    stepAttack(a, 0, true, 0, false);
    let up = 0;
    for (let t = 0; t < 20; t += 0.1) if (stepAttack(a, 0.1, true, 0, false).timeUp) up++;
    expect(up).toBe(1);
    expect(a.over).toBe(true);
    expect(a.left).toBe(0);
    expect(stepAttack(a, 0.1, true, 5, false)).toEqual({});
  });

  it('is kinder on easy and harder on hard', () => {
    const [easy, normal, hard] = DIFFICULTIES.map((d) => bonus(newAttack(30, d), 0));
    expect(easy).toBeGreaterThan(normal);
    expect(normal).toBeGreaterThan(hard);
  });

  it('says how far you got', () => {
    expect(distance(0)).toBe('NO SECTORS');
    expect(distance(2)).toBe('2 SECTORS');
    expect(distance(3)).toBe('1 LAP');
    expect(distance(7)).toBe('2 LAPS + 1 SECTOR');
  });

  it('keeps your best distance on each circuit', () => {
    const r = emptyRecords();
    expect(recordAttack(r, 'x', 0)).toBe(false);
    expect(recordAttack(r, 'x', 5)).toBe(true);
    expect(recordAttack(r, 'x', 4)).toBe(false);
    expect(recordAttack(r, 'x', 6)).toBe(true);
    expect(r.circuits.x.bestAttack).toBe(6);
  });
});

/** A Time Attack run at Crescent Park on NORMAL by the reference player: the checkpoints it passes before TIME UP. */
function run(player: ReferencePlayer): number {
  const f1 = carClass('f1');
  const handling = handlingFor(NORMAL);
  const c = buildCircuit(CRESCENT_PARK, { cornerSpeed: lineCornerSpeed(f1, handling), decel: lineDecel(f1) });
  const race = newQualifying(c.track, c.grid, handling, 'dry');
  const a = newAttack(referenceLap(c.track, c.grid, handling, 'dry'), NORMAL);
  const me = race.entrants[0];
  for (let t = 0; t < 600 && !a.over; t += SIM_DT) {
    const cut = stepRace(race, SIM_DT, (e) => referenceInput(e.car, c.track, e.progress.idx, player)).race.some((e) => e.kind === 'track-limits');
    // (fresh tyres all the way, as in a Time Trial)
    me.tyres.wear = 0;
    fitTyres(me.tyres, me.car, 'dry');
    const p = me.progress;
    stepAttack(a, SIM_DT, p.lapStart !== undefined, p.lapTimes.length * SECTORS + p.sector, cut);
  }
  expect(a.over).toBe(true);
  return a.passed;
}

describe('a Time Attack, driven', () => {
  it('lasts a good player a few laps, a better one longer, a steadier one less: and the clock always wins', () => {
    const steady = run({ device: 'touch', skill: 0.9 });
    const good = run({ device: 'touch', skill: 0.95 });
    const best = run({ device: 'touch', skill: 1 });
    expect(good).toBeGreaterThanOrEqual(2 * SECTORS);
    expect(good).toBeLessThanOrEqual(8 * SECTORS);
    expect(best).toBeGreaterThan(good);
    expect(steady).toBeLessThan(good);
    expect(steady).toBeGreaterThan(0);
  }, 120_000);
});

describe('the distance, short', () => {
  it('laps and sectors as 5L 1S, for where room is tight', async () => {
    const { shortDistance } = await import('../src/f1/timeAttack');
    const { SECTORS } = await import('../src/f1/racing');
    expect(shortDistance(5 * SECTORS + 1)).toBe('5L 1S');
    expect(shortDistance(6 * SECTORS)).toBe('6L');
    expect(shortDistance(2)).toBe('2S');
    expect(shortDistance(0)).toBe('0S');
  });
});
