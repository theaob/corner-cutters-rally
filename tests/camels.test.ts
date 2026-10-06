import { describe, expect, it } from 'vitest';
import { carClass } from '../src/engine/driving';
import { HALF_WIDTH, RUNOFF, buildCircuit } from '../src/f1/circuit';
import { CAMELS, camelsAt, caravansOf, loopLength, pointOnLoop } from '../src/f1/camels';
import { treesOf } from '../src/f1/forest3d';
import { lineCornerSpeed, lineDecel } from '../src/f1/racing';
import { stageById } from '../src/f1/stages';

const f1 = carClass('f1');
const build = (id: string) => buildCircuit(stageById(id)!, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });

describe('the camels on Dune Run', () => {
  const circuit = build('ss-dune-run');
  const caravans = caravansOf(circuit);

  it('walk only in the desert: none in the forests or the snow', () => {
    expect(circuit.layout.desert).toBe(true);
    for (const id of ['ss-pine-ridge', 'ss-glacier-road']) expect(caravansOf(build(id))).toHaveLength(0);
  }, 30_000);

  it('are in caravans of three to five, spread along the road', () => {
    expect(caravans.length).toBeGreaterThanOrEqual(CAMELS.caravans - 2);
    for (const c of caravans) {
      expect(c.camels).toBeGreaterThanOrEqual(CAMELS.least);
      expect(c.camels).toBeLessThanOrEqual(CAMELS.least + CAMELS.more);
    }
  });

  it('go round their loops smoothly, nose to tail, at a walk', () => {
    for (const c of caravans) {
      const total = loopLength(c);
      for (let s = 0; s < total; s += 1) {
        const a = pointOnLoop(c, s);
        const b = pointOnLoop(c, s + 1);
        // (a px along the loop moves a px on the map, and the heading turns gently)
        expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(1, 1);
        expect(Math.abs(Math.atan2(Math.sin(b.heading - a.heading), Math.cos(b.heading - a.heading)))).toBeLessThan(0.15);
        // (heading where it goes)
        expect(Math.sin(a.heading) * (b.x - a.x) - Math.cos(a.heading) * (b.y - a.y)).toBeGreaterThan(0.9);
      }
      const [lead, next] = camelsAt(c, 3);
      // (a fifth of a second on: so short a way that round the end of the loop, it's as good as straight)
      const later = camelsAt(c, 3.2)[0];
      expect(Math.abs(Math.hypot(later.x - lead.x, later.y - lead.y) - CAMELS.speed * 0.2)).toBeLessThan(0.1);
      expect(Math.hypot(lead.x - next.x, lead.y - next.y)).toBeLessThanOrEqual(CAMELS.apart + 0.01);
      expect(Math.hypot(lead.x - next.x, lead.y - next.y)).toBeGreaterThan(CAMELS.apart * 0.6);
    }
  });

  it('keep clear of the road and its run-off, and of the palms, all the way round', () => {
    const reach = HALF_WIDTH + RUNOFF;
    const palms = treesOf(circuit);
    let road = Infinity;
    let palm = Infinity;
    for (const c of caravans) {
      for (let s = 0; s < loopLength(c); s += 4) {
        const p = pointOnLoop(c, s);
        for (const q of circuit.track.samples) road = Math.min(road, Math.hypot(q.x - p.x, q.y - p.y));
        for (const t of palms) palm = Math.min(palm, Math.hypot(t.x - p.x, t.y - p.y));
      }
    }
    expect(road).toBeGreaterThan(reach + CAMELS.clearTrack - 6);
    expect(palm).toBeGreaterThan(CAMELS.clearPalm - 1);
  }, 60_000);

  it('come close to the road, where you see them as you drive by', () => {
    const reach = HALF_WIDTH + RUNOFF;
    for (const c of caravans) {
      // (the loop's nearest point to the track: along its near line, just past the barriers)
      let nearest = Infinity;
      for (let s = 0; s < loopLength(c); s += 8) {
        const p = pointOnLoop(c, s);
        nearest = Math.min(nearest, ...circuit.track.samples.map((q) => Math.hypot(q.x - p.x, q.y - p.y)));
      }
      expect(nearest).toBeLessThan(reach + CAMELS.clearTrack + CAMELS.out + CAMELS.further + 4);
    }
  }, 30_000);
});
