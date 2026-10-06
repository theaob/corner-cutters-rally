import { describe, expect, it } from 'vitest';
import { carClass } from '../src/engine/driving';
import { groundAt } from '../src/engine/sim';
import { HALF_WIDTH, buildCircuit } from '../src/f1/circuit';
import { treesOf } from '../src/f1/forest3d';
import { LAYOUTS, SUZUKA } from '../src/f1/layouts';
import { PETALS, PetalField } from '../src/f1/petals';
import { lateralOffset, lineCornerSpeed, lineDecel, nearestSample } from '../src/f1/racing';

const f1 = carClass('f1');
const c = buildCircuit(SUZUKA, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });
const trees = treesOf(c).filter((t) => t.kind === 'blossom');
const field = () => new PetalField(c.grid, c.track, trees);
/** a petal's way across the track, from its centreline (px), and the sample it's beside */
const onTrack = (x: number, y: number) => {
  const i = nearestSample(c.track, x, y);
  return { i, across: Math.abs(lateralOffset(c.track, i, x, y)) };
};

describe('the cherry trees at Nippon', () => {
  it('are in blossom there, and only there: groves of them, and clumps lining the lap', () => {
    expect(trees.length).toBeGreaterThan(200);
    for (const l of LAYOUTS) if (l !== SUZUKA) expect(l.blossoms).toBeFalsy();
    // (some close by the track: their petals reach it)
    expect(trees.filter((t) => onTrack(t.x, t.y).across < 240).length).toBeGreaterThan(40);
  }, 30_000);
});

describe('the petals', () => {
  it('lie on the track from the start, under the trees lining it; none on the bridge (they would be under its deck)', () => {
    const f = field();
    const lying = f.petals.filter((p) => p.resting);
    expect(lying.length).toBe(PETALS.onTrack);
    const l = c.track.levels!;
    for (const p of lying) {
      const { i, across } = onTrack(p.x, p.y);
      expect(across).toBeLessThanOrEqual(HALF_WIDTH + 10);
      expect(trees.some((t) => Math.hypot(t.x - p.x, t.y - p.y) < HALF_WIDTH * 2 + 210)).toBe(true);
      expect(i >= l.from && i <= l.to).toBe(false);
    }
  });

  it('fall from the trees round the camera, drift on the breeze and settle on the ground', () => {
    const f = field();
    const before = f.petals.length;
    const near = trees[0];
    for (let t = 0; t < 2; t += 1 / 60) f.step(1 / 60, [], near);
    expect(f.petals.length).toBeGreaterThan(before + 20);
    const flying = f.petals.filter((p) => !p.resting);
    expect(flying.length).toBeGreaterThan(5);
    // (all of them from trees near the camera)
    for (const p of flying) expect(Math.hypot(p.x - near.x, p.y - near.y)).toBeLessThan(PETALS.near * 1.5 + 200);
    // given time, they all come down
    for (let t = 0; t < 12; t += 1 / 60) f.step(1 / 60, [], { x: -99999, y: -99999 });
    expect(f.counts().flying).toBe(0);
    for (const p of f.petals) expect(p.z).toBeCloseTo(groundAt(c.grid, p.x, p.y).h, 0);
  });

  it('a car driving over them at speed kicks them up, out from under it and along with it; they come down a way on', () => {
    const f = field();
    const p = f.petals.find((q) => q.resting)!;
    const at = { x: p.x, y: p.y };
    const car = { x: p.x - 5, y: p.y, vx: 300, vy: 0, z: p.z };
    f.step(1 / 60, [car], { x: -99999, y: -99999 });
    expect(p.resting).toBe(false);
    expect(p.vz).toBeGreaterThan(10);
    expect(p.vx).toBeGreaterThan(50);
    for (let t = 0; t < 10; t += 1 / 60) f.step(1 / 60, [], { x: -99999, y: -99999 });
    expect(p.resting).toBe(true);
    expect(p.x - at.x).toBeGreaterThan(10);
  });

  it("a slow car, one up on a bridge above them, or one in the air leaves them be", () => {
    for (const car of [{ vx: 30, z: 0 }, { vx: 300, z: 36 }, { vx: 300, z: 0, airborne: true }]) {
      const f = field();
      const p = f.petals.find((q) => q.resting)!;
      f.step(1 / 60, [{ x: p.x, y: p.y, vy: 0, ...car, z: p.z + car.z }], { x: -99999, y: -99999 });
      expect(p.resting).toBe(true);
    }
  });

  it('never more than PETALS.max at once (those on the grass farthest from the camera go first)', () => {
    const f = field();
    for (let t = 0; t < 30; t += 1 / 30) f.step(1 / 30, [], trees[0]);
    expect(f.petals.length).toBeLessThanOrEqual(PETALS.max);
  });

  it('on the track, lie there lap after lap till a car kicks them off; on the grass, go after their while', () => {
    const f = field();
    const start = f.petals.filter((p) => p.resting && p.onTrack);
    expect(start.length).toBe(PETALS.onTrack);
    // three laps' worth of petals falling all round the lap (the camera going round with the cars), no car on them
    const round = c.track.samples.filter((_, i) => i % 40 === 0);
    for (let t = 0; t < 100; t += 1 / 20) f.step(1 / 20, [], round[Math.floor(t / 2) % round.length]);
    for (const p of start) expect(f.petals).toContain(p);
    for (const p of f.petals.filter((q) => q.resting)) {
      const i = nearestSample(c.track, p.x, p.y);
      expect(p.onTrack).toBe(Math.abs(lateralOffset(c.track, i, p.x, p.y)) <= HALF_WIDTH);
      // (on the grass, gone within their while)
      if (!p.onTrack) expect(p.life).toBeLessThanOrEqual(PETALS.life);
    }
    // with none falling (those still in the air landing first), those on the grass go; those on the track stay
    for (let t = 0; t < PETALS.life + 20; t += 1 / 10) f.step(1 / 10, [], { x: -99999, y: -99999 });
    expect(f.petals.every((p) => p.onTrack)).toBe(true);
    expect(f.petals.length).toBeGreaterThanOrEqual(PETALS.onTrack);
  });
});
