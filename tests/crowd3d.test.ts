import { describe, expect, it } from 'vitest';
import { carClass } from '../src/engine/driving';
import { HALF_WIDTH, buildCircuit } from '../src/f1/circuit';
import { CROWD, excitement, spectatorPose, spectatorsOf } from '../src/f1/crowd3d';
import { DUST_BOWL, LAYOUTS } from '../src/f1/layouts';
import { lineCornerSpeed, lineDecel } from '../src/f1/racing';
import { standsOf } from '../src/f1/stands';

describe('the crowd in the grandstands', () => {
  it('is on its feet at Dust Bowl, and only there', () => {
    expect(DUST_BOWL.crowds).toBe(true);
    for (const l of LAYOUTS) if (l !== DUST_BOWL) expect(l.crowds).toBeFalsy();
  });

  it('gets excited quickly as the cars come by, the nearer the more, and settles slowly once they have gone', () => {
    let e = 0;
    for (let t = 0; t < 0.5; t += 1 / 60) e = excitement(e, CROWD.full, 1 / 60);
    expect(e).toBe(1);
    // (a car at the edge of its reach: a little)
    expect(excitement(0, (CROWD.near + CROWD.full) / 2, 10)).toBeCloseTo(0.5, 5);
    expect(excitement(0, CROWD.near + 1, 10)).toBe(0);
    // gone: still cheering a second on, settled a while later
    for (let t = 0; t < 1; t += 1 / 60) e = excitement(e, Infinity, 1 / 60);
    expect(e).toBeGreaterThan(0.4);
    for (let t = 0; t < 2; t += 1 / 60) e = excitement(e, Infinity, 1 / 60);
    expect(e).toBe(0);
  });

  it('settled, stands with its arms down, swaying; excited, hops and throws its arms up', () => {
    for (let t = 0; t < 3; t += 0.1) {
      const calm = spectatorPose(0, t, 1);
      expect(calm.hop).toBe(0);
      expect(calm.arms).toBe(0);
      expect(Math.abs(calm.sway)).toBeLessThan(0.07);
    }
    const hops = Array.from({ length: 60 }, (_, i) => spectatorPose(1, i / 60, 1));
    expect(Math.max(...hops.map((p) => p.hop))).toBeGreaterThan(CROWD.hop * 0.9);
    expect(Math.min(...hops.map((p) => p.arms))).toBeGreaterThan(0.45);
    // (each in step with no one else)
    expect(spectatorPose(1, 0.3, 0).hop).not.toBeCloseTo(spectatorPose(1, 0.3, 2).hop, 3);
  });

  it('stands on the steps in front of each stand, rows of them, between it and the track, the back rows higher', () => {
    const c = buildCircuit(DUST_BOWL, { cornerSpeed: lineCornerSpeed(carClass('f1')), decel: lineDecel(carClass('f1')) });
    for (const [k, s] of standsOf(c).entries()) {
      const people = spectatorsOf(s, k);
      expect(people.length).toBeGreaterThan((s.len / CROWD.spacing) * CROWD.rows * 0.7);
      for (const p of people) {
        // (in front of its face, −x; within its length)
        expect(p.x).toBeLessThan(-9);
        expect(p.x).toBeGreaterThan(-9 - CROWD.rows * CROWD.step - 1);
        expect(Math.abs(p.z)).toBeLessThan(s.len / 2);
        // on the map: off the track
        const turn = -s.dir + (s.side < 0 ? Math.PI : 0);
        const x = s.x + Math.cos(turn) * p.x + Math.sin(turn) * p.z;
        const y = s.y - Math.sin(turn) * p.x + Math.cos(turn) * p.z;
        expect(Math.min(...c.track.samples.map((q) => Math.hypot(q.x - x, q.y - y)))).toBeGreaterThan(HALF_WIDTH + 20);
      }
      const front = Math.min(...people.map((p) => p.x));
      expect(people.filter((p) => p.x < front + 1).every((p) => p.floor === CROWD.riser)).toBe(true);
      expect(Math.max(...people.map((p) => p.floor))).toBe(CROWD.rows * CROWD.riser);
    }
  }, 30_000);
});
