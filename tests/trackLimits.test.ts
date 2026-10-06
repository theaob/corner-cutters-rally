import { describe, expect, it } from 'vitest';
import { carClass, newCar, type Car } from '../src/engine/driving';
import { HALF_WIDTH, TIGHT, buildCircuit, type Circuit } from '../src/f1/circuit';
import { SHAKEDOWN, stageById } from '../src/f1/stages';
import { RACE_HANDLING, lineCornerSpeed, lineDecel, type Track } from '../src/f1/racing';
import { newRace, stepRace, type RaceEvent } from '../src/f1/raceControl';
import { LIMITS, cutting, judge, markCorners, newLimits, offTrack, type Corner } from '../src/f1/trackLimits';

const f1 = carClass('f1');
const dt = 1 / 60;
/** Each stage's circuit, built the first time it's asked for (a stage takes a second or two to build). */
const built = new Map<string, Circuit>();
const build = (id = SHAKEDOWN) => {
  let c = built.get(id);
  if (!c) built.set(id, (c = buildCircuit(stageById(id)!, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) })));
  return c;
};

/** A point `lat` px right of the centreline at sample `i`. */
const at = (track: Track, i: number, lat: number) => {
  const s = track.samples[i];
  return { x: s.x + Math.cos(s.dir) * lat, y: s.y + Math.sin(s.dir) * lat };
};
const inside = (k: Corner, lat: number) => k.side * lat;

// (the shakedown, a gravel stage, a tarmac stage and a sand stage)
describe.each([SHAKEDOWN, 'ss-pine-ridge', 'ss-mountain-col', 'ss-dune-run'])('the marked corners on %s', (id) => {
  const { track } = build(id);
  const corners = markCorners(track);
  const n = track.samples.length;
  const covers = (k: Corner, i: number) => (k.from <= k.to ? i >= k.from && i <= k.to : i >= k.from || i <= k.to);
  it('are the kerbed bends: every tight sample is in one, turning its way', () => {
    expect(corners.length).toBeGreaterThan(3);
    track.samples.forEach((s, i) => {
      if (Math.abs(s.curve) < TIGHT) return;
      expect(corners.some((k) => covers(k, i) && k.side === Math.sign(s.curve))).toBe(true);
    });
    for (const k of corners) expect(covers(k, k.apex)).toBe(true);
  });
  it("don't take in the long straights", () => {
    const marked = track.samples.filter((_, i) => corners.some((k) => covers(k, i))).length;
    expect(marked).toBeLessThan(n * 0.7);
  });
  it('leave the opening straight up to the start line unmarked', () => {
    const line = Math.round(track.stage!.start / track.spacing);
    for (let i = 10; i < line; i++) expect(corners.some((k) => covers(k, i)), `sample ${i}`).toBe(false);
  });
});

describe('a cut', () => {
  const { track } = build();
  const corners = markCorners(track);
  const k = corners[0];
  it('is all four wheels past the edge on the inside of a marked corner', () => {
    const cut = at(track, k.apex, inside(k, HALF_WIDTH + f1.width / 2 + 2));
    expect(cutting(track, corners, k.apex, cut.x, cut.y, f1.width)).toBe(0);
    // on the kerb, two wheels over, or wide on the outside: fine
    for (const lat of [inside(k, HALF_WIDTH - 4), inside(k, HALF_WIDTH + 4), -inside(k, HALF_WIDTH + 30)]) {
      const p = at(track, k.apex, lat);
      expect(cutting(track, corners, k.apex, p.x, p.y, f1.width)).toBeUndefined();
    }
  });
  it('is a warning at first, then costs seconds; once per time through the corner', () => {
    const limits = newLimits();
    const cut = at(track, k.apex, inside(k, HALF_WIDTH + 20));
    const straight = Math.min(k.to + 30, track.samples.length - 1);
    const away = at(track, straight, 0);
    const strikes = [];
    for (let time = 0; time < LIMITS.warnings + 2; time++) {
      // cutting for a few steps is one strike
      for (let step = 0; step < 5; step++) {
        const r = judge(limits, track, corners, k.apex, cut.x, cut.y, f1.width);
        if (r) strikes.push(r);
      }
      judge(limits, track, corners, straight, away.x, away.y, f1.width);
    }
    expect(strikes.map((s) => s.strike)).toEqual([1, 2, 3, 4]);
    expect(strikes.map((s) => s.seconds)).toEqual([0, 0, LIMITS.penalty, LIMITS.penalty]);
  });
});

/** A stage under way, one car on it (lined up in the first place), the countdown over. */
const racing = (c: Circuit) => {
  const race = newRace(c.track, c.grid, RACE_HANDLING, 1, [{ car: newCar(f1, c.slots[0].x, c.slots[0].y, c.slots[0].heading) }], 0);
  while (race.phase !== 'racing') stepRace(race, dt);
  return race;
};
/** Put the car stopped `lat` px right of the centreline at sample `idx`, its progress with it. */
const put = (c: Circuit, race: ReturnType<typeof newRace>, car: Car, idx: number, lat: number) => {
  const s = c.track.samples[idx];
  Object.assign(car, { ...at(c.track, idx, lat), heading: s.dir, vx: 0, vy: 0 });
  race.entrants[0].progress = { ...race.entrants[0].progress, idx };
};

describe('track limits on a stage', () => {
  it("adds the penalties to the cutter's time, and says so", () => {
    const c = build();
    const race = racing(c);
    const me = race.entrants[0];
    const events: RaceEvent[] = [];
    // each marked corner cut once, stopped on its inside
    for (const k of race.corners.slice(0, LIMITS.warnings + 1)) {
      put(c, race, me.car, k.apex, inside(k, HALF_WIDTH + 20));
      for (let s = 0; s < 3; s++) events.push(...stepRace(race, dt).race);
    }
    expect(events.filter((e) => e.kind === 'track-limits')).toEqual([
      { kind: 'track-limits', who: 0, strike: 1, seconds: 0 },
      { kind: 'track-limits', who: 0, strike: 2, seconds: 0 },
      { kind: 'track-limits', who: 0, strike: 3, seconds: LIMITS.penalty },
    ]);
    expect(me.progress.penalty).toBe(LIMITS.penalty);
  });
});

describe('going off the road', () => {
  const { track } = build();
  const w = f1.width;
  // (on the stage, past the start line)
  const i = Math.round(track.stage!.start / track.spacing) + 40;
  it('is all four wheels past the white line, either side, anywhere; once each time off', () => {
    const l = newLimits();
    const off = (lat: number) => {
      const p = at(track, i, lat);
      return offTrack(l, track, i, p.x, p.y, w);
    };
    // a wheel still on the line: on the road
    expect(off(HALF_WIDTH + w / 2 - 2)).toBe(false);
    expect(off(HALF_WIDTH + w / 2 + 2)).toBe(true);
    // (still off: the same excursion)
    expect(off(HALF_WIDTH + 30)).toBe(false);
    expect(off(0)).toBe(false);
    // the other side, a new excursion
    expect(off(-(HALF_WIDTH + w / 2 + 2))).toBe(true);
    expect(off(0)).toBe(false);
  });
});

describe('going off on a stage', () => {
  it('running wide, on the outside of a corner, is off the road (said once) but no strike: it costs its own time', () => {
    const c = build();
    const race = racing(c);
    // (a corner on its own: at an S-bend, wide on one's outside is already on the next one's inside)
    const k = race.corners.find((k) => race.corners.every((o) => o === k || k.apex < o.from || k.apex > o.to))!;
    put(c, race, race.entrants[0].car, k.apex, -k.side * (HALF_WIDTH + 20));
    const events: RaceEvent[] = [];
    for (let s = 0; s < 3; s++) events.push(...stepRace(race, dt).race);
    expect(events.filter((e) => e.kind === 'off-track')).toEqual([{ kind: 'off-track', who: 0 }]);
    expect(events.some((e) => e.kind === 'track-limits')).toBe(false);
    expect(race.entrants[0].progress.penalty).toBe(0);
  });
});
