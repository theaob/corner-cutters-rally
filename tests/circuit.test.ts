import { describe, expect, it } from 'vitest';
import { HALF_WIDTH, buildCircuit } from '../src/f1/circuit';
import { ALPINE_RING, ARDENNES, BAKU, CRESCENT_PARK, DUST_BOWL, GLACIER_PASS, SUZUKA, HARBOUR, LAYOUTS, OASIS, ROYAL_PARK, SILVER_HEATH, TWIN_LAKES, layoutById, type CircuitLayout } from '../src/f1/layouts';
import { angleDiff, carClass, newCar, speedOf, stepCar } from '../src/engine/driving';
import { groundAt } from '../src/engine/sim';
import { RACE_HANDLING, aiInput, keysWheel, wheelInput, lineCornerSpeed, lineDecel, newProgress, stepProgress } from '../src/f1/racing';

const f1 = carClass('f1');

/** What each circuit should measure up to: its lap length (px), the AI's lap time (s), and how close to flat out the line is. */
const EXPECT: { layout: CircuitLayout; length: [number, number]; lap: [number, number]; flatGap: number; braking?: number }[] = [
  // over the hills: flat out almost everywhere, a lift for Turn 12
  { layout: CRESCENT_PARK, length: [9600, 10600], lap: [27, 33], flatGap: 1 },
  // the hook's hairpin and the last complex want a lift
  { layout: SILVER_HEATH, length: [9500, 10500], lap: [26, 33], flatGap: 0.75 },
  // the streets: tight, but the cars grip enough to take nearly all of it flat out too
  { layout: HARBOUR, length: [8300, 9300], lap: [24, 34], flatGap: 0.5 },
  // the temple of speed: flat out all the way round, the banking included
  { layout: ROYAL_PARK, length: [9000, 10000], lap: [26, 32], flatGap: 0.5 },
  // the longest: up and down through the forest, three hard stops
  { layout: ARDENNES, length: [13000, 14000], lap: [38, 46], flatGap: 1.5, braking: 1.2 },
  // short and steep: a lift for the hairpin at the top and the stop at the bottom of the back straight
  { layout: ALPINE_RING, length: [8000, 9000], lap: [23, 29], flatGap: 1 },
  // the esses and the infield want a lift or two
  { layout: TWIN_LAKES, length: [7400, 8400], lap: [22, 28], flatGap: 1.5, braking: 1 },
  // the heavy stops: Turn 1, the hairpin and the downhill Turn 10
  { layout: OASIS, length: [8500, 9400], lap: [25, 31], flatGap: 1.5, braking: 1.2 },
  // the castle section, then the longest run flat out
  { layout: BAKU, length: [10400, 11400], lap: [30, 38], flatGap: 1.5, braking: 1.2 },
  // the figure of eight: the esses, the hairpin and the chicane want a lift
  { layout: SUZUKA, length: [9800, 10600], lap: [28, 35], flatGap: 1.5, braking: 1.2 },
  // the mountain: the switchbacks' hairpins want a stop each, the jumps are flat out
  { layout: GLACIER_PASS, length: [9800, 10800], lap: [28, 36], flatGap: 2, braking: 1.5 },
  // the dirt: short and twisty, but flat out all the way round on tarmac's grip (on dirt's, the cars slide: tyres.test.ts)
  { layout: DUST_BOWL, length: [5800, 6800], lap: [16, 22], flatGap: 0.5 },
];

describe('circuit list', () => {
  it('covers every layout, each with its own id', () => {
    expect(EXPECT.map((e) => e.layout)).toEqual(LAYOUTS);
    expect(new Set(LAYOUTS.map((l) => l.id)).size).toBe(LAYOUTS.length);
    expect(layoutById('silver-heath')).toBe(SILVER_HEATH);
    expect(layoutById('nowhere')).toBeUndefined();
  });

  it('puts only Oasis in the desert', () => {
    expect(LAYOUTS.filter((l) => l.desert)).toEqual([OASIS]);
    expect(LAYOUTS.filter((l) => l.forest)).toEqual([ARDENNES, ALPINE_RING]);
  });

  it('starts and ends each elevation profile at the same height, in lap order', () => {
    for (const { elevation } of LAYOUTS) {
      expect(elevation[0][0]).toBe(0);
      expect(elevation[elevation.length - 1]).toEqual([1, elevation[0][1]]);
      for (let i = 1; i < elevation.length; i++) expect(elevation[i][0]).toBeGreaterThan(elevation[i - 1][0]);
    }
  });
});

describe.each(EXPECT)('$layout.name circuit', ({ layout, length, lap, flatGap, braking = 0.5 }) => {
  const circuit = buildCircuit(layout, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });
  const { grid, track } = circuit;
  const cellAt = (x: number, y: number) => circuit.cells[Math.floor(y / 16) * circuit.width + Math.floor(x / 16)];

  it('is a lap of the right length with run-off (on the streets, pavement to the walls), kerbs and gravel (none on the streets)', () => {
    expect(track.length).toBeGreaterThan(length[0]);
    expect(track.length).toBeLessThan(length[1]);
    for (const c of ['track', 'kerb', 'grass', 'wall'] as const) expect(circuit.cells).toContain(c);
    if (layout.street) expect(circuit.cells).not.toContain('gravel');
    else expect(circuit.cells).toContain('gravel');
  });

  it('lines the starting grid up on the track, behind the line', () => {
    for (const s of circuit.slots) expect(cellAt(s.x, s.y)).toBe('track');
  });

  it('keeps the centreline on the track all the way round', () => {
    for (const p of track.samples) expect(['track']).toContain(cellAt(p.x, p.y));
  });

  it('has gentle gradients on the racing line', () => {
    let worst = 0;
    for (let i = 0; i < track.samples.length; i++) {
      const p = track.samples[i];
      const g = groundAt(grid, p.x, p.y);
      worst = Math.max(worst, Math.abs(g.gx * Math.sin(p.dir) - g.gy * Math.cos(p.dir)));
    }
    expect(worst).toBeGreaterThan(0.02);
    expect(worst).toBeLessThan(0.2);
  });

  it('can be lapped by an AI F1 car on the real physics, unhurt', () => {
    const start = circuit.slots[0];
    const car = newCar(f1, start.x, start.y, start.heading);
    let p = newProgress(track.samples.length - 3);
    let t = 0;
    for (; t < 80 && p.lap < 1; t += 1 / 60) {
      stepCar(car, aiInput(car, track, p.idx, { lane: 0, pace: 1 }), RACE_HANDLING, 1 / 60, grid);
      p = stepProgress(p, track, car, t, 3, 1 / 60);
    }
    expect(p.lap).toBe(1);
    expect(p.lapTimes[0]).toBeGreaterThan(lap[0]);
    expect(p.lapTimes[0]).toBeLessThan(lap[1]);
    expect(car.health).toBe(f1.health);
    expect(speedOf(car)).toBeGreaterThan(100);
  });

  it('can be lapped on the keyboard (car-relative: up gas, down brake, left and right steer at full lock), unhurt', () => {
    const start = circuit.slots[0];
    const car = newCar(f1, start.x, start.y, start.heading);
    let p = newProgress(track.samples.length - 3);
    const n = track.samples.length;
    for (let t = 0; t < 80 && p.lap < 1; t += 1 / 60) {
      // a simple player: steer toward a point on the line a little ahead, a key at a time; lift, then brake, when well off it
      const ahead = track.samples[(p.idx + 10) % n];
      const off = angleDiff(Math.atan2(ahead.x - car.x, -(ahead.y - car.y)), car.heading);
      const keys = { left: off < -0.04, right: off > 0.04, up: Math.abs(off) < 0.35, down: Math.abs(off) > 0.6 && speedOf(car) > 150 };
      stepCar(car, wheelInput(keysWheel(keys, false), car), RACE_HANDLING, 1 / 60, grid);
      p = stepProgress(p, track, car, t, 3, 1 / 60);
    }
    expect(p.lap).toBe(1);
    expect(p.lapTimes[0]).toBeLessThan(lap[1] + 3);
    expect(car.health).toBe(f1.health);
  });

  it('has an AI that goes flat out almost everywhere, like a player can', () => {
    const lapWith = (pace: number) => {
      const start = circuit.slots[0];
      const car = newCar(f1, start.x, start.y, start.heading);
      let p = newProgress(track.samples.length - 3);
      let braking = 0;
      for (let t = 0; t < 120 && p.lap < 1; t += 1 / 60) {
        const input = aiInput(car, track, p.idx, { lane: 0, pace });
        if (input.brake) braking += 1 / 60;
        stepCar(car, input, RACE_HANDLING, 1 / 60, grid);
        p = stepProgress(p, track, car, t, 3, 1 / 60);
      }
      return { time: p.lapTimes[0], braking };
    };
    const line = lapWith(1);
    const flat = lapWith(10); // never brakes at all
    expect(line.braking).toBeLessThan(braking);
    expect(Math.abs(line.time - flat.time)).toBeLessThan(flatGap);
    expect(line.time).toBeLessThan(lap[1]);
  });
});

describe('the banking at Royal Park', () => {
  const circuit = buildCircuit(ROYAL_PARK, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });
  const { track, grid, bank } = circuit;
  const n = track.samples.length;
  const { from, to, grade } = ROYAL_PARK.banking!;
  const across = (i: number, a: number) => {
    const p = track.samples[i];
    return groundAt(grid, p.x + Math.cos(p.dir) * a, p.y + Math.sin(p.dir) * a).h;
  };

  it('is the long right onto the main straight', () => {
    const mid = Math.round((from + to) / 2 / track.spacing);
    let turn = 0;
    for (let i = Math.round(from / track.spacing); i < Math.round(to / track.spacing); i++) turn += track.samples[i].curve * track.spacing;
    // (a half circle, to the right)
    expect(turn).toBeGreaterThan(Math.PI * 0.85);
    expect(track.samples[mid].curve).toBeGreaterThan(0);
  });

  it('tilts the track up toward the outside, at its grade, from the inside edge to the walls', () => {
    const mid = Math.round((from + to) / 2 / track.spacing);
    // (a right-hander: the outside is on the left, at −across)
    const inner = across(mid, 44);
    const centre = across(mid, 0);
    const outer = across(mid, -44);
    expect((outer - centre) / 44).toBeGreaterThan(grade * 0.8);
    expect((centre - inner) / 44).toBeGreaterThan(grade * 0.8);
    expect(across(mid, -110)).toBeGreaterThan(outer + 15);
    // the inside run-off stays flat
    expect(Math.abs(across(mid, 100) - inner)).toBeLessThan(3);
    expect(bank[mid]).toBeCloseTo(-grade, 5);
  });

  it('eases in and out, and nowhere else is banked', () => {
    for (let i = 0; i < n; i++) {
      const s = track.samples[i].s;
      if (s < from || s > to) expect(Math.abs(bank[i])).toBe(0);
    }
    const first = Math.round(from / track.spacing) + 2;
    expect(Math.abs(bank[first])).toBeLessThan(grade * 0.05);
  });

  it('has concrete run-off (smooth, not grass) up to the walls round it, and none anywhere else', () => {
    expect(circuit.cells).toContain('apron');
    circuit.cells.forEach((c, k) => {
      if (c !== 'apron') return;
      expect(grid.rough![k]).toBe(false);
      const x = ((k % circuit.width) + 0.5) * 16;
      const y = (Math.floor(k / circuit.width) + 0.5) * 16;
      let best = 0;
      let bestD = Infinity;
      track.samples.forEach((p, i) => {
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < bestD) [best, bestD] = [i, d];
      });
      expect(bank[best]).not.toBe(0);
    });
    for (const l of LAYOUTS.filter((l) => l !== ROYAL_PARK)) {
      const c = buildCircuit(l, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });
      expect(c.cells).not.toContain('apron');
      expect(c.bank.every((b) => b === 0)).toBe(true);
    }
  }, 30_000);
});

describe('Ardennes', () => {
  const build = (l: CircuitLayout) => buildCircuit(l, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });
  const circuits = LAYOUTS.map(build);
  const ardennes = circuits[LAYOUTS.indexOf(ARDENNES)];
  /** the steepest grade along the centreline, and the most it climbs in one go */
  const hills = (c: ReturnType<typeof build>) => {
    let steepest = 0;
    let climb = 0;
    let low = Infinity;
    for (const p of c.track.samples) {
      const g = groundAt(c.grid, p.x, p.y);
      steepest = Math.max(steepest, Math.abs(g.gx * Math.sin(p.dir) - g.gy * Math.cos(p.dir)));
      low = Math.min(low, g.h);
      climb = Math.max(climb, g.h - low);
    }
    const heights = c.track.samples.map((p) => groundAt(c.grid, p.x, p.y).h);
    return { steepest, climb, range: Math.max(...heights) - Math.min(...heights) };
  };

  it('is the longest lap of all', () => {
    for (const c of circuits) if (c !== ardennes) expect(ardennes.track.length).toBeGreaterThan(c.track.length * 1.2);
  });

  it('goes up and down the most, and climbs the steepest (out of the bottom of the valley)', () => {
    const a = hills(ardennes);
    expect(a.range).toBeGreaterThan(100);
    expect(a.steepest).toBeGreaterThan(0.16);
    // (the mountain aside: it climbs higher still, but more gently, up its switchbacks)
    for (const c of circuits) {
      if (c === ardennes || c.layout.mountain) continue;
      const h = hills(c);
      expect(a.range).toBeGreaterThan(h.range * 1.5);
      expect(a.steepest).toBeGreaterThan(h.steepest);
    }
    // the steepest climb: within the first quarter of the lap, after the plunge from the hairpin
    let at = 0;
    let most = 0;
    for (const p of ardennes.track.samples) {
      const g = groundAt(ardennes.grid, p.x, p.y);
      const grade = g.gx * Math.sin(p.dir) - g.gy * Math.cos(p.dir);
      if (grade > most) [most, at] = [grade, p.s];
    }
    expect(at / ardennes.track.length).toBeGreaterThan(0.12);
    expect(at / ardennes.track.length).toBeLessThan(0.25);
  });

  it('has no bend tighter than the track is wide, its tightest opened out from the tracing (its edges never cross)', () => {
    expect(Math.max(...ardennes.track.samples.map((p) => Math.abs(p.curve)))).toBeLessThan(1 / (HALF_WIDTH + 6));
  });
});

describe('the kerbs', () => {
  it('run whole round every tight bend: no scraps, no short gaps, and the kerb tiles where they are', async () => {
    const { KERB, TIGHT, kerbed } = await import('../src/f1/circuit');
    for (const layout of LAYOUTS) {
      const c = buildCircuit(layout, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });
      const { track } = c;
      const n = track.samples.length;
      const k = kerbed(track);
      // every tight bend kerbed
      track.samples.forEach((p, i) => {
        if (Math.abs(p.curve) >= TIGHT) expect(k[i]).toBe(true);
      });
      // the runs and the gaps between them, round the lap
      const start = k.findIndex((f, i) => !f && k[(i + 1) % n]);
      if (start < 0) continue;
      const lengths: { on: boolean; len: number }[] = [];
      for (let j = 1; j <= n; j++) {
        const f = k[(start + j) % n];
        if (lengths.length && lengths[lengths.length - 1].on === f) lengths[lengths.length - 1].len++;
        else lengths.push({ on: f, len: 1 });
      }
      for (const r of lengths) {
        if (r.on) expect(r.len * track.spacing).toBeGreaterThanOrEqual(KERB.shortest);
        else expect(r.len * track.spacing).toBeGreaterThanOrEqual(KERB.gap - 2 * KERB.lead - track.spacing);
      }
      expect(c.cells).toContain('kerb');
    }
  }, 30_000);
});

describe('stretches side by side', () => {
  it.each(LAYOUTS)("$name: a barrier between any two that run side by side, so no one drives across from one to the other (Suzuka's figure of eight)", (layout) => {
    const c = buildCircuit(layout, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });
    const s = c.track.samples;
    const n = s.length;
    const T = c.grid.tile;
    const solid = (x: number, y: number) => c.grid.solid[Math.floor(y / T) * c.grid.width + Math.floor(x / T)];
    const reach = HALF_WIDTH + (layout.street?.runoff ?? 72);
    for (let i = 0; i < n; i += 6) {
      for (let j = 0; j < n; j += 6) {
        if (Math.min(Math.abs(i - j), n - Math.abs(i - j)) < 120) continue;
        const d = Math.hypot(s[i].x - s[j].x, s[i].y - s[j].y);
        if (d > 2 * reach || d < 2 * HALF_WIDTH) continue;
        // (a way across the run-off only: over no road but at its ends)
        const at = (t: number) => ({ x: s[i].x + (s[j].x - s[i].x) * t, y: s[i].y + (s[j].y - s[i].y) * t });
        let road = false;
        for (let t = 0.15; t < 0.85 && !road; t += 0.05) {
          const p = at(t);
          road = s.some((q, k) => k % 2 === 0 && Math.hypot(q.x - p.x, q.y - p.y) < HALF_WIDTH);
        }
        if (road) continue;
        let wall = false;
        for (let t = 0.02; t < 1 && !wall; t += 0.01) wall = solid(at(t).x, at(t).y);
        expect(wall, `${layout.name}: samples ${i} and ${j}`).toBe(true);
      }
    }
  }, 60_000);
});

describe('Glacier Pass', () => {
  const c = buildCircuit(GLACIER_PASS, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });
  const others = LAYOUTS.filter((l) => !l.jumps).map((l) => buildCircuit(l, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) }));
  const range = (x: typeof c) => {
    const h = x.track.samples.map((p) => groundAt(x.grid, p.x, p.y).h);
    return Math.max(...h) - Math.min(...h);
  };

  it('climbs the highest of all: from the valley floor to the summit', () => {
    for (const o of others) expect(range(c)).toBeGreaterThan(range(o) * 1.4);
  });

  it('flies the cars off both its jumps at speed, half a second or so in the air, and lands them unhurt; nowhere else', () => {
    const start = c.slots[0];
    const car = newCar(f1, start.x, start.y, start.heading);
    let p = newProgress(c.track.samples.length - 3);
    let up: { t: number; s: number } | undefined;
    const hops: { s: number; air: number; land: number }[] = [];
    for (let t = 0; t < 80 && p.lap < 1; t += 1 / 60) {
      const ev = stepCar(car, aiInput(car, c.track, p.idx, { lane: 0, pace: 1 }), RACE_HANDLING, 1 / 60, c.grid);
      if (car.airborne && !up) up = { t, s: c.track.samples[p.idx].s };
      if (!car.airborne && up) {
        hops.push({ s: up.s, air: t - up.t, land: ev.landed });
        up = undefined;
      }
      p = stepProgress(p, c.track, car, t, 3, 1 / 60);
    }
    expect(hops.length).toBe(GLACIER_PASS.jumps!.length);
    hops.forEach((h, k) => {
      expect(Math.abs(h.s - GLACIER_PASS.jumps![k].at)).toBeLessThan(40);
      expect(h.air).toBeGreaterThan(0.3);
      expect(h.air).toBeLessThan(0.8);
      expect(h.land).toBeLessThan(RACE_HANDLING.landThreshold);
    });
    expect(car.health).toBe(f1.health);
  });

  it("has no jump on a circuit without any: none of them throws a car in the air", () => {
    for (const o of others) {
      const start = o.slots[0];
      const car = newCar(f1, start.x, start.y, start.heading);
      let p = newProgress(o.track.samples.length - 3);
      let flew = false;
      for (let t = 0; t < 80 && p.lap < 1; t += 1 / 60) {
        stepCar(car, aiInput(car, o.track, p.idx, { lane: 0, pace: 1 }), RACE_HANDLING, 1 / 60, o.grid);
        flew ||= car.airborne;
        p = stepProgress(p, o.track, car, t, 3, 1 / 60);
      }
      expect(flew).toBe(false);
    }
  });
});
