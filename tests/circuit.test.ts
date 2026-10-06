import { describe, expect, it } from 'vitest';
import { HALF_WIDTH, KERB, RUNOFF, TIGHT, buildCircuit, kerbed, type Circuit } from '../src/f1/circuit';
import { layoutById } from '../src/f1/layouts';
import { ROAD, SHAKEDOWN, STAGE_SPECS, stageById } from '../src/f1/stages';
import { angleDiff, carClass, newCar, speedOf, stepCar } from '../src/engine/driving';
import { groundAt } from '../src/engine/sim';
import { RACE_HANDLING, aiInput, buildTrack, keysWheel, wheelInput, lineCornerSpeed, lineDecel, newProgress, stepProgress, type Track } from '../src/f1/racing';

const f1 = carClass('f1');

/** Each stage's circuit, built the first time it's asked for (a stage takes a second or two to build). */
const built = new Map<string, Circuit>();
const circuitOf = (id: string) => {
  let c = built.get(id);
  if (!c) built.set(id, (c = buildCircuit(stageById(id)!, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) })));
  return c;
};

/** A few stages to stand for them all: the shakedown, a gravel stage with a jump, a tarmac stage and a snow stage; and the AI's time over each (s). */
const EXPECT: { id: string; time: [number, number] }[] = [
  // short, gravel: a few bends to try the car on
  { id: SHAKEDOWN, time: [16, 26] },
  // gravel, fast through the pines, a jump in the middle
  { id: 'ss-pine-ridge', time: [44, 62] },
  // tarmac: hairpins up to the col
  { id: 'ss-mountain-col', time: [46, 64] },
  // snow, up to the glacier
  { id: 'ss-glacier-road', time: [44, 62] },
];

/** The sample a car starts its progress from: the start of the stage, behind the line. */
const startIdx = (track: Track) => Math.round((track.stage!.start - 24) / track.spacing);
/** Whether a car's progress has reached the flying finish. */
const finished = (track: Track, idx: number) => idx * track.spacing >= track.stage!.finish;

describe('the stage list', () => {
  it('finds only the stages by id: the old circuits are gone', () => {
    expect(layoutById(SHAKEDOWN)).toBe(stageById(SHAKEDOWN));
    for (const s of STAGE_SPECS) expect(layoutById(s.id)?.stage, s.id).toBeDefined();
    expect(layoutById('silver-heath')).toBeUndefined();
    expect(layoutById('nowhere')).toBeUndefined();
    expect(layoutById(undefined)).toBeUndefined();
    expect(layoutById(null)).toBeUndefined();
  });

  it('puts the dirt stages on dirt, the sand ones in the desert and the snow ones under snow; tarmac on none', () => {
    for (const s of STAGE_SPECS) {
      const l = stageById(s.id)!;
      expect(!!l.dirt, s.id).toBe(s.surface !== 'tarmac');
      expect(!!l.desert, s.id).toBe(s.surface === 'sand');
      expect(!!l.snow, s.id).toBe(s.surface === 'snow');
    }
  });

  it("runs each elevation profile from the road's start to its end, in order along it", () => {
    for (const { id } of STAGE_SPECS) {
      const { elevation } = stageById(id)!;
      expect(elevation[0][0]).toBe(0);
      expect(elevation[elevation.length - 1][0]).toBe(1);
      for (let i = 1; i < elevation.length; i++) expect(elevation[i][0]).toBeGreaterThan(elevation[i - 1][0]);
    }
  });

  it('has no bend on any stage tighter than the road is wide (its edges never cross)', () => {
    for (const { id } of STAGE_SPECS) {
      const track = buildTrack(stageById(id)!.points, 8, lineCornerSpeed(f1), lineDecel(f1), true);
      expect(Math.max(...track.samples.map((p) => Math.abs(p.curve))), id).toBeLessThan(1 / (HALF_WIDTH + 6));
    }
  });
});

describe.each(EXPECT)('the $id stage', ({ id, time }) => {
  const circuit = circuitOf(id);
  const spec = STAGE_SPECS.find((s) => s.id === id)!;
  const { grid, track } = circuit;
  const n = track.samples.length;
  const cellAt = (x: number, y: number) => circuit.cells[Math.floor(y / 16) * circuit.width + Math.floor(x / 16)];

  it('is an open road of the right length with run-off, kerbs and gravel, walled in', () => {
    expect(track.open).toBe(true);
    expect(track.stage).toEqual(stageById(id)!.stage);
    const whole = ROAD.start + spec.length + ROAD.runout;
    expect(track.length).toBeGreaterThan(whole - 50);
    expect(track.length).toBeLessThan(whole * 1.3);
    for (const c of ['track', 'kerb', 'grass', 'gravel', 'wall'] as const) expect(circuit.cells).toContain(c);
  });

  it('is on dirt unless it is a tarmac stage', () => {
    expect(!!track.dirt).toBe(spec.surface !== 'tarmac');
  });

  it('is walled off beyond both ends of the road', () => {
    for (const [i, way] of [[0, -1], [n - 1, 1]] as const) {
      const p = track.samples[i];
      const past = HALF_WIDTH + RUNOFF + 24;
      const x = p.x + Math.sin(p.dir) * past * way;
      const y = p.y - Math.cos(p.dir) * past * way;
      expect(cellAt(x, y)).toBe('wall');
    }
  });

  it('lines the starting places up on the road, behind the start line', () => {
    for (const s of circuit.slots) expect(cellAt(s.x, s.y)).toBe('track');
  });

  it('keeps the centreline on the road from one end to the other', () => {
    for (const p of track.samples) expect(cellAt(p.x, p.y)).toBe('track');
  });

  it('has gentle gradients on the racing line', () => {
    let worst = 0;
    for (const p of track.samples) {
      const g = groundAt(grid, p.x, p.y);
      worst = Math.max(worst, Math.abs(g.gx * Math.sin(p.dir) - g.gy * Math.cos(p.dir)));
    }
    expect(worst).toBeGreaterThan(0.02);
    expect(worst).toBeLessThan(0.2);
  });

  it('can be driven from the start to the flying finish by an AI F1 car on the real physics, unhurt', () => {
    const start = circuit.slots[0];
    const car = newCar(f1, start.x, start.y, start.heading);
    let p = newProgress(startIdx(track));
    let t = 0;
    for (; t < 200 && !finished(track, p.idx); t += 1 / 60) {
      stepCar(car, aiInput(car, track, p.idx, { lane: 0, pace: 1 }), RACE_HANDLING, 1 / 60, grid);
      p = stepProgress(p, track, car, t, 1, 1 / 60);
    }
    expect(finished(track, p.idx)).toBe(true);
    expect(t).toBeGreaterThan(time[0]);
    expect(t).toBeLessThan(time[1]);
    expect(car.health).toBe(f1.health);
    expect(speedOf(car)).toBeGreaterThan(100);
  }, 30_000);

  it('can be driven on the keyboard (car-relative: up gas, down brake, left and right steer at full lock), unhurt', () => {
    const start = circuit.slots[0];
    const car = newCar(f1, start.x, start.y, start.heading);
    let p = newProgress(startIdx(track));
    let t = 0;
    for (; t < 200 && !finished(track, p.idx); t += 1 / 60) {
      // a simple player: steer toward a point on the line a little ahead, a key at a time; lift, then brake, when well off it
      const ahead = track.samples[Math.min(n - 1, p.idx + 10)];
      const off = angleDiff(Math.atan2(ahead.x - car.x, -(ahead.y - car.y)), car.heading);
      const keys = { left: off < -0.04, right: off > 0.04, up: Math.abs(off) < 0.35, down: Math.abs(off) > 0.6 && speedOf(car) > 150 };
      stepCar(car, wheelInput(keysWheel(keys, false), car), RACE_HANDLING, 1 / 60, grid);
      p = stepProgress(p, track, car, t, 1, 1 / 60);
    }
    expect(finished(track, p.idx)).toBe(true);
    expect(t).toBeLessThan(time[1] + 5);
    expect(car.health).toBe(f1.health);
  }, 30_000);

  it('has an AI that goes flat out almost everywhere, like a player can', () => {
    const runWith = (pace: number) => {
      const start = circuit.slots[0];
      const car = newCar(f1, start.x, start.y, start.heading);
      let p = newProgress(startIdx(track));
      let braking = 0;
      let t = 0;
      for (; t < 200 && !finished(track, p.idx); t += 1 / 60) {
        const input = aiInput(car, track, p.idx, { lane: 0, pace });
        if (input.brake) braking += 1 / 60;
        stepCar(car, input, RACE_HANDLING, 1 / 60, grid);
        p = stepProgress(p, track, car, t, 1, 1 / 60);
      }
      return { time: t, braking };
    };
    const line = runWith(1);
    const flat = runWith(10); // never brakes at all
    expect(line.braking).toBeLessThan(1);
    expect(Math.abs(line.time - flat.time)).toBeLessThan(1);
    expect(line.time).toBeLessThan(time[1]);
  }, 30_000);

  it('has its kerbs run whole round every tight bend: no scraps, no short gaps', () => {
    const k = kerbed(track);
    // every tight bend kerbed
    track.samples.forEach((p, i) => {
      if (Math.abs(p.curve) >= TIGHT) expect(k[i], `sample ${i}`).toBe(true);
    });
    // the runs and the gaps between them along the road (leaving out those at its very ends: before the start line, past the finish)
    const runs: { on: boolean; from: number; len: number }[] = [];
    k.forEach((f, i) => {
      const last = runs[runs.length - 1];
      if (last && last.on === f) last.len++;
      else runs.push({ on: f, from: i, len: 1 });
    });
    for (const r of runs) {
      if (r.from === 0 || r.from + r.len === n) continue;
      if (r.on) expect(r.len * track.spacing).toBeGreaterThanOrEqual(KERB.shortest);
      else expect(r.len * track.spacing).toBeGreaterThanOrEqual(KERB.gap - 2 * KERB.lead - track.spacing);
    }
  });

  it('has a barrier between any two stretches that run side by side, so no one drives across from one to the other', () => {
    const s = track.samples;
    const T = grid.tile;
    const solid = (x: number, y: number) => grid.solid[Math.floor(y / T) * grid.width + Math.floor(x / T)];
    const reach = HALF_WIDTH + RUNOFF;
    for (let i = 0; i < n; i += 6) {
      for (let j = i + 120; j < n; j += 6) {
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
        expect(wall, `samples ${i} and ${j}`).toBe(true);
      }
    }
  }, 30_000);

  it('rises and falls over its hills, never higher than they go (a jump aside)', () => {
    const heights = track.samples.map((p) => groundAt(grid, p.x, p.y).h);
    const high = spec.hills ?? 60;
    const rise = Math.max(0, ...(stageById(id)!.jumps ?? []).map((j) => j.rise));
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(high * 0.3);
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(-1);
    expect(Math.max(...heights)).toBeLessThanOrEqual(high + rise + 5);
  });
});

describe('the jumps', () => {
  /** Drive the AI over a stage, start to finish: where it left the ground, for how long, and how hard it came down. */
  const hopsOn = (c: Circuit) => {
    const { track, grid } = c;
    const start = c.slots[0];
    const car = newCar(f1, start.x, start.y, start.heading);
    let p = newProgress(startIdx(track));
    let up: { t: number; s: number } | undefined;
    const hops: { s: number; air: number; land: number }[] = [];
    for (let t = 0; t < 200 && !finished(track, p.idx); t += 1 / 60) {
      const ev = stepCar(car, aiInput(car, track, p.idx, { lane: 0, pace: 1 }), RACE_HANDLING, 1 / 60, grid);
      if (car.airborne && !up) up = { t, s: track.samples[p.idx].s };
      if (!car.airborne && up) {
        hops.push({ s: up.s, air: t - up.t, land: ev.landed });
        up = undefined;
      }
      p = stepProgress(p, track, car, t, 1, 1 / 60);
    }
    return { hops, health: car.health };
  };

  it("fly the cars off Pine Ridge's jump at speed, a third of a second or so in the air, and land them unhurt; nowhere else", () => {
    const layout = stageById('ss-pine-ridge')!;
    const { hops, health } = hopsOn(circuitOf('ss-pine-ridge'));
    expect(hops.length).toBe(layout.jumps!.length);
    hops.forEach((h, k) => {
      expect(Math.abs(h.s - layout.jumps![k].at)).toBeLessThan(40);
      expect(h.air).toBeGreaterThan(0.2);
      expect(h.air).toBeLessThan(0.8);
      expect(h.land).toBeLessThan(RACE_HANDLING.landThreshold);
    });
    expect(health).toBe(f1.health);
  }, 30_000);

  it('are nowhere on a stage without any: it never throws a car in the air', () => {
    expect(stageById('ss-mountain-col')!.jumps).toBeUndefined();
    expect(hopsOn(circuitOf('ss-mountain-col')).hops).toEqual([]);
  }, 30_000);
});
