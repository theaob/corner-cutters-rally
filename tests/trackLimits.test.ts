import { describe, expect, it } from 'vitest';
import { carClass, newCar, type Car } from '../src/engine/driving';
import { HALF_WIDTH, TIGHT, buildCircuit } from '../src/f1/circuit';
import { LAYOUTS } from '../src/f1/layouts';
import { RACE_HANDLING, lineCornerSpeed, lineDecel, type Track } from '../src/f1/racing';
import { newRace, stepRace, type RaceEvent } from '../src/f1/raceControl';
import { LIMITS, cutting, judge, markCorners, newLimits, offTrack, type Corner } from '../src/f1/trackLimits';

const f1 = carClass('f1');
const dt = 1 / 60;
const build = (layout = LAYOUTS[0]) => buildCircuit(layout, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });

/** A point `lat` px right of the centreline at sample `i`. */
const at = (track: Track, i: number, lat: number) => {
  const s = track.samples[i];
  return { x: s.x + Math.cos(s.dir) * lat, y: s.y + Math.sin(s.dir) * lat };
};
const inside = (k: Corner, lat: number) => k.side * lat;

describe.each(LAYOUTS)('the marked corners at $name', (layout) => {
  const { track } = build(layout);
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
    const straight = (k.to + 30) % track.samples.length;
    const away = at(track, straight, 0);
    const strikes = [];
    for (let lap = 0; lap < LIMITS.warnings + 2; lap++) {
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

describe('track limits in a race', () => {
  it("adds the penalties to the cutter's time, and says so", () => {
    const c = build();
    const race = newRace(c.track, c.grid, RACE_HANDLING, 5, [{ car: newCar(f1, c.slots[0].x, c.slots[0].y, c.slots[0].heading) }], 0, c.pit);
    while (race.phase !== 'racing') stepRace(race, dt);
    const me = race.entrants[0];
    const events: RaceEvent[] = [];
    const put = (car: Car, idx: number, lat: number) => {
      const s = c.track.samples[idx];
      const p = at(c.track, idx, lat);
      Object.assign(car, { ...p, heading: s.dir, vx: 0, vy: 0 });
      me.progress = { ...me.progress, idx };
    };
    // each marked corner cut once, stopped on its inside
    for (const k of race.corners.slice(0, LIMITS.warnings + 1)) {
      put(me.car, k.apex, inside(k, HALF_WIDTH + 20));
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

describe('going off the track', () => {
  const { track } = build();
  const w = f1.width;
  const i = 40;
  it('is all four wheels past the white line, either side, anywhere; once each time off', () => {
    const l = newLimits();
    const off = (lat: number, excused = false) => {
      const p = at(track, i, lat);
      return offTrack(l, track, i, p.x, p.y, w, excused);
    };
    // a wheel still on the line: on the track
    expect(off(HALF_WIDTH + w / 2 - 2)).toBe(false);
    expect(off(HALF_WIDTH + w / 2 + 2)).toBe(true);
    // (still off: the same excursion)
    expect(off(HALF_WIDTH + 30)).toBe(false);
    expect(off(0)).toBe(false);
    // the other side, a new excursion
    expect(off(-(HALF_WIDTH + w / 2 + 2))).toBe(true);
    expect(off(0)).toBe(false);
    // off where it may be (onto the pit entry road): doesn't count
    expect(off(HALF_WIDTH + 30, true)).toBe(false);
  });
});

describe('going off in a race', () => {
  const c = build();
  const put = (race: ReturnType<typeof newRace>, idx: number, lat: number) => {
    const me = race.entrants[0];
    const s = c.track.samples[idx];
    Object.assign(me.car, { ...at(c.track, idx, lat), heading: s.dir, vx: 0, vy: 0 });
    me.progress = { ...me.progress, idx };
  };
  const racing = () => {
    const race = newRace(c.track, c.grid, RACE_HANDLING, 5, [{ car: newCar(f1, c.slots[0].x, c.slots[0].y, c.slots[0].heading) }], 0, c.pit);
    while (race.phase !== 'racing') stepRace(race, dt);
    return race;
  };
  it('running wide, on the outside of a corner, is off the track (said once) but no strike: it costs its own time', () => {
    const race = racing();
    const k = race.corners[1];
    put(race, k.apex, -k.side * (HALF_WIDTH + 20));
    const events: RaceEvent[] = [];
    for (let s = 0; s < 3; s++) events.push(...stepRace(race, dt).race);
    expect(events.filter((e) => e.kind === 'off-track')).toEqual([{ kind: 'off-track', who: 0 }]);
    expect(events.some((e) => e.kind === 'track-limits')).toBe(false);
    expect(race.entrants[0].progress.penalty).toBe(0);
  });
  it('turning off onto the pit entry road is not', () => {
    const race = racing();
    const pit = c.pit;
    const idx = (pit.entry + 6) % c.track.samples.length;
    put(race, idx, pit.side * (HALF_WIDTH + 12));
    const events: RaceEvent[] = [];
    for (let s = 0; s < 3; s++) events.push(...stepRace(race, dt).race);
    expect(events.some((e) => e.kind === 'off-track')).toBe(false);
  });
});
