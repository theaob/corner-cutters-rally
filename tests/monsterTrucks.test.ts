import { describe, expect, it } from 'vitest';
import { carClass } from '../src/engine/driving';
import { HALF_WIDTH, RUNOFF, buildCircuit } from '../src/f1/circuit';
import { DUST_BOWL, LAYOUTS } from '../src/f1/layouts';
import { TRUCKS, laneHeight, loopLength, truckPose, type Arena } from '../src/f1/monsterTrucks';
import { lineCornerSpeed, lineDecel } from '../src/f1/racing';
import { standsOf } from '../src/f1/stands';

const f1 = carClass('f1');
const c = buildCircuit(DUST_BOWL, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });
const mt = DUST_BOWL.monsterTrucks!;
const arena: Arena = { x: mt.at[0], y: mt.at[1], angle: mt.angle };
const lap = loopLength() / TRUCKS.speed;
/** the trucks' poses through a loop, every 1/60 s */
const poses = (k: number) => Array.from({ length: Math.ceil(lap * 60) }, (_, i) => truckPose(arena, i / 60, k));

describe('the monster trucks', () => {
  it('jump at Dust Bowl, and only there', () => {
    for (const l of LAYOUTS) if (l !== DUST_BOWL) expect(l.monsterTrucks).toBeUndefined();
  });

  it('keep to their arena in the infield, close by the track but clear of it, the pits and the grandstands', () => {
    const reach = HALF_WIDTH + RUNOFF + 40;
    let nearest = Infinity;
    for (const k of [0, 1]) {
      for (const p of poses(k).filter((_, i) => i % 10 === 0)) {
        for (const s of c.track.samples) {
          const d = Math.hypot(s.x - p.x, s.y - p.y);
          expect(d).toBeGreaterThan(reach);
          nearest = Math.min(nearest, d);
        }
        for (const q of c.pit.points) expect(Math.hypot(q.x - p.x, q.y - p.y)).toBeGreaterThan(150);
        for (const s of standsOf(c)) expect(Math.hypot(s.x - p.x, s.y - p.y)).toBeGreaterThan(s.len / 2 + 40);
      }
    }
    // (near enough to watch from the cars going by)
    expect(nearest).toBeLessThan(reach + 60);
  }, 30_000);

  it('go round and round: up a ramp, through the air over the pile, down the far ramp, and round the hairpin, smoothly', () => {
    const ps = poses(0);
    for (let i = 1; i < ps.length; i++) {
      // (no jump in where they are, from one moment to the next)
      expect(Math.hypot(ps[i].x - ps[i - 1].x, ps[i].y - ps[i - 1].y)).toBeLessThan((TRUCKS.speed / 60) * 1.05);
      expect(Math.abs(ps[i].z - ps[i - 1].z)).toBeLessThan(3);
    }
    // (back where it started, a loop on)
    const a = truckPose(arena, 0, 0);
    const b = truckPose(arena, lap, 0);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(0.5);
    // in the air twice a loop (once each way), high over the pile, the nose up off the lip and down to land
    const flights = ps.filter((p, i) => p.flying && !ps[i - 1]?.flying).length;
    expect(flights).toBe(2);
    expect(Math.max(...ps.map((p) => p.z))).toBeCloseTo(TRUCKS.rise + TRUCKS.apex, 0);
    expect(laneHeight(TRUCKS.length / 2 - TRUCKS.span / 2 + 1).slope).toBeGreaterThan(0);
    expect(laneHeight(TRUCKS.length / 2 + TRUCKS.span / 2 - 1).slope).toBeLessThan(0);
    // (on the ground, off the ramps; squatting on its springs just after landing)
    expect(laneHeight(10).z).toBe(0);
    expect(Math.max(...ps.map((p) => p.squat))).toBeGreaterThan(0.9);
  });

  it('pass each other going opposite ways, on lanes of their own, both in the air over the pile at once', () => {
    const [a, b] = [poses(0), poses(1)];
    let together = 0;
    for (let i = 0; i < a.length; i++) {
      // (never closer than the lanes are apart)
      expect(Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y)).toBeGreaterThan(TRUCKS.gap * 0.9);
      if (a[i].flying && b[i].flying) together++;
    }
    expect(together).toBeGreaterThan(10);
  });
});
