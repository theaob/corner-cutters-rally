import { describe, expect, it } from 'vitest';
import { carClass } from '../src/engine/driving';
import { HALF_WIDTH, ROADSIDE, buildCircuit } from '../src/f1/circuit';
import { lineCornerSpeed, lineDecel } from '../src/f1/racing';
import { CROWD, spectatorsOf } from '../src/f1/spectators';
import { DRESSING, stopAt } from '../src/f1/stageDressing';
import { stageById } from '../src/f1/stages';

const f1 = carClass('f1');
const build = (id: string) => buildCircuit(stageById(id)!, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });

describe.each(['ss-pine-ridge', 'ss-dune-run', 'ss-mountain-col'])('the spectators on %s', (id) => {
  const circuit = build(id);
  const fans = spectatorsOf(circuit);
  const { track } = circuit;
  /** px from the road's middle, and where along it, of the nearest sample */
  const nearest = (x: number, y: number) => {
    let best = { d: Infinity, s: 0 };
    for (const p of track.samples) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < best.d) best = { d, s: p.s };
    }
    return best;
  };

  it('come in crowds: a good many along the stage, the most at its start and finish', () => {
    expect(fans.length).toBeGreaterThan(60);
    const at = (s: number) => fans.filter((f) => Math.abs(nearest(f.x, f.y).s - s) < CROWD.spread + 70).length;
    expect(at(track.stage!.start - 60)).toBeGreaterThanOrEqual(10);
    expect(at(track.stage!.finish + 30)).toBeGreaterThanOrEqual(4);
  }, 60_000);

  it('stand on the open ground beside the road, past its verge, never on it or in the trees', () => {
    for (const f of fans) {
      expect(nearest(f.x, f.y).d).toBeGreaterThan(HALF_WIDTH + ROADSIDE.verge);
      const cell = circuit.cells[Math.floor(f.y / 16) * circuit.width + Math.floor(f.x / 16)];
      expect(['grass', 'gravel']).toContain(cell);
    }
    // (and a step apart)
    for (const a of fans) for (const b of fans) if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(CROWD.apart);
  }, 60_000);

  it('face the road', () => {
    for (const f of fans) {
      const fx = Math.sin(f.heading);
      const fy = -Math.cos(f.heading);
      // (a step the way they face takes them nearer the road)
      expect(nearest(f.x + fx * 4, f.y + fy * 4).d).toBeLessThan(nearest(f.x, f.y).d);
    }
  }, 60_000);

  it('are the same every time', () => {
    expect(spectatorsOf(circuit)).toEqual(fans);
  }, 60_000);
});

describe('the finish', () => {
  it('has its stop control past the flying finish, short of the road\'s end', () => {
    const { track } = build('ss-pine-ridge');
    const stop = stopAt(track.stage!.finish, track.length);
    expect(stop).toBe(track.stage!.finish + DRESSING.stop);
    expect(stop).toBeLessThan(track.length - 50);
    expect(stopAt(1000, 1200)).toBe(1140);
  });
});
