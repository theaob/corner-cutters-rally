import { describe, expect, it } from 'vitest';
import { HALF_WIDTH, RUNOFF, buildCircuit } from '../src/f1/circuit';
import { ARDENNES, LAYOUTS, OASIS, ROYAL_PARK } from '../src/f1/layouts';
import { carClass } from '../src/engine/driving';
import { groundAt } from '../src/engine/sim';
import { lineCornerSpeed, lineDecel } from '../src/f1/racing';
import { FOREST, PALMS, PARK, treesOf, type Tree } from '../src/f1/forest3d';
import { HIDES } from '../src/f1/town3d';
import { standsOf } from '../src/f1/stands';

const f1 = carClass('f1');
const build = (l: (typeof LAYOUTS)[number]) => buildCircuit(l, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });

describe('the forest', () => {
  const circuit = build(ARDENNES);
  const trees = treesOf(circuit);

  it('grows only round a circuit in a forest (palms only in the desert, parkland trees in a park, spruces and boulders in the mountains, cherry trees in blossom at Nippon)', () => {
    for (const l of LAYOUTS) {
      if (l.forest || l.desert || l.park || l.mountain || l.blossoms) continue;
      expect(treesOf(build(l))).toHaveLength(0);
    }
    expect(trees.some((t) => t.kind === 'palm')).toBe(false);
  }, 30_000);

  it('is thick: thousands of trees, mostly spruces, all round and out past the map', () => {
    expect(trees.length).toBeGreaterThan(8000);
    expect(trees.filter((t) => t.kind === 'spruce').length / trees.length).toBeGreaterThan(0.7);
    expect(trees.some((t) => t.kind === 'broadleaf')).toBe(true);
    const W = circuit.width * 16;
    const H = circuit.height * 16;
    expect(trees.some((t) => t.x < 0) && trees.some((t) => t.x > W) && trees.some((t) => t.y < 0) && trees.some((t) => t.y > H)).toBe(true);
    for (const t of trees) {
      expect(t.h).toBeGreaterThanOrEqual(FOREST.shortest);
      expect(t.h).toBeLessThanOrEqual(FOREST.tallest);
    }
  });

});

describe.each([
  { name: 'the forest at the Ardennes', layout: ARDENNES, crown: FOREST.crown, clear: FOREST.clear },
  { name: 'the palms at Oasis', layout: OASIS, crown: PALMS.crown, clear: PALMS.clear },
  { name: 'the trees at Royal Park', layout: ROYAL_PARK, crown: FOREST.crown, clear: PARK.clear },
])('$name', ({ layout, crown, clear }) => {
  const circuit = build(layout);
  const trees: Tree[] = treesOf(circuit);
  const reach = HALF_WIDTH + RUNOFF;

  it('stands clear of the track and its run-off, the pits and the grandstands', () => {
    const stands = standsOf(circuit);
    const closest = (t: { x: number; y: number }, pts: { x: number; y: number }[]) => Math.min(...pts.map((p) => Math.hypot(p.x - t.x, p.y - t.y)));
    let track = Infinity;
    let pits = Infinity;
    let grandstand = Infinity;
    for (const t of trees) {
      track = Math.min(track, closest(t, circuit.track.samples));
      pits = Math.min(pits, closest(t, circuit.pit.points));
      for (const s of stands) grandstand = Math.min(grandstand, Math.hypot(s.x - t.x, s.y - t.y) - s.len / 2);
    }
    expect(track).toBeGreaterThan(reach + clear - 1);
    expect(pits).toBeGreaterThan(100);
    expect(grandstand).toBeGreaterThan(0);
  });

  it('never hides the track from the camera, on the hillsides too', () => {
    const ground = circuit.track.samples.map((p) => groundAt(circuit.grid, p.x, p.y).h);
    let worst = -Infinity;
    for (const t of trees) {
      const cr = t.h * crown;
      const top = groundAt(circuit.grid, t.x, t.y).h + t.h;
      circuit.track.samples.forEach((p, i) => {
        if (Math.abs(p.x - t.x) > cr + reach) return;
        const gap = t.y - cr - (p.y + reach);
        if (gap < 0) return;
        // (how far north of its crown its top hides the ground, seen from the camera, against the track's height there, less the gap)
        worst = Math.max(worst, (top - ground[i]) * HIDES - gap);
      });
    }
    expect(worst).toBeLessThanOrEqual(0);
  });
});

describe('the palms at Oasis', () => {
  const circuit = build(OASIS);
  const palms = treesOf(circuit);

  it('stand in groves round the circuit and out over the sand, all palms, as tall as they may be', () => {
    expect(palms.length).toBeGreaterThan(150);
    expect(palms.every((t) => t.kind === 'palm')).toBe(true);
    for (const t of palms) {
      expect(t.h).toBeGreaterThanOrEqual(FOREST.shortest);
      expect(t.h).toBeLessThanOrEqual(PALMS.tallest);
    }
    // (in groves: most have a neighbour within a grove's reach; but not a carpet like the forest)
    const neighboured = palms.filter((t) => palms.some((o) => o !== t && Math.hypot(o.x - t.x, o.y - t.y) < PALMS.spread * 2)).length;
    expect(neighboured / palms.length).toBeGreaterThan(0.8);
    const W = circuit.width * 16;
    const H = circuit.height * 16;
    // (a scatter, not a carpet: far fewer than a forest would plant over the same ground)
    expect(palms.length).toBeLessThan(((W + 2 * PALMS.beyond) * (H + 2 * PALMS.beyond)) / (FOREST.spacing * FOREST.spacing) / 4);
    expect(palms.some((t) => t.x < 0 || t.y < 0 || t.x > W || t.y > H)).toBe(true);
  });

  it('line the circuit just past the barriers, where they are seen as you drive by', () => {
    const reach = HALF_WIDTH + RUNOFF;
    const near = palms.filter((t) => Math.min(...circuit.track.samples.map((p) => Math.hypot(p.x - t.x, p.y - t.y))) < reach + PALMS.clear + PALMS.liningOut[1] + 20);
    expect(near.length).toBeGreaterThan(150);
  });
});

describe('the trees at Royal Park', () => {
  const circuit = build(ROYAL_PARK);
  const trees = treesOf(circuit);
  const reach = HALF_WIDTH + RUNOFF;
  const fromTrack = (t: { x: number; y: number }, from = 0, to = circuit.track.samples.length) =>
    Math.min(...circuit.track.samples.slice(from, to).map((p) => Math.hypot(p.x - t.x, p.y - t.y)));

  it('stand in groves over the lawns, broadleaves with a cedar here and there: a park, not a forest', () => {
    expect(trees.length).toBeGreaterThan(150);
    expect(trees.some((t) => t.kind === 'palm')).toBe(false);
    const cedars = trees.filter((t) => t.kind === 'spruce').length / trees.length;
    expect(cedars).toBeGreaterThan(0.05);
    expect(cedars).toBeLessThan(0.3);
    for (const t of trees) expect(t.h).toBeLessThanOrEqual(PARK.tallest);
    const W = circuit.width * 16;
    const H = circuit.height * 16;
    expect(trees.length).toBeLessThan(((W + 2 * PARK.beyond) * (H + 2 * PARK.beyond)) / (FOREST.spacing * FOREST.spacing) / 4);
  });

  it('line the woods, both sides, just past the barriers', () => {
    const [from, to] = ROYAL_PARK.park!.avenue.map((d) => Math.round(d / circuit.track.spacing));
    const lining = trees.filter((t) => fromTrack(t, from, to + 1) < reach + PARK.clear + PARK.avenueOut[1] + 40);
    expect(lining.length).toBeGreaterThan(40);
    // (on each side: left of the lap and right of it)
    const side = (t: Tree) => {
      const s = circuit.track.samples;
      let best = from;
      for (let i = from; i <= to; i++) if (Math.hypot(s[i].x - t.x, s[i].y - t.y) < Math.hypot(s[best].x - t.x, s[best].y - t.y)) best = i;
      return Math.sign((t.x - s[best].x) * Math.cos(s[best].dir) + (t.y - s[best].y) * Math.sin(s[best].dir));
    };
    expect(lining.filter((t) => side(t) > 0).length).toBeGreaterThan(10);
    expect(lining.filter((t) => side(t) < 0).length).toBeGreaterThan(10);
  });
});

describe('the mountains', () => {
  it('scatter spruces below the tree line only, and boulders all over (snowy up high), none tall enough to hide the track', async () => {
    const { GLACIER_PASS } = await import('../src/f1/layouts');
    const { MOUNTAIN } = await import('../src/f1/forest3d');
    const { groundAt } = await import('../src/engine/sim');
    const c = build(GLACIER_PASS);
    const all = treesOf(c);
    const spruces = all.filter((t) => t.kind === 'spruce');
    const rocks = all.filter((t) => t.kind === 'rock');
    expect(spruces.length).toBeGreaterThan(500);
    expect(rocks.length).toBeGreaterThan(100);
    for (const t of spruces) expect(groundAt(c.grid, t.x, t.y).h).toBeLessThanOrEqual(MOUNTAIN.treeLine);
    for (const t of rocks) expect(t.h).toBeLessThanOrEqual(MOUNTAIN.rockSize[0] + MOUNTAIN.rockSize[1]);
    expect(all.some((t) => t.kind === 'palm' || t.kind === 'broadleaf')).toBe(false);
  }, 30_000);

  it('under snow (Glacier Pass): every spruce laden with it, and none under the tramway', async () => {
    const { GLACIER_PASS } = await import('../src/f1/layouts');
    const { TRAMWAY, tramwayOf } = await import('../src/f1/tramway');
    const c = build(GLACIER_PASS);
    const all = treesOf(c);
    expect(GLACIER_PASS.snow).toBe(true);
    expect(all.filter((t) => t.kind === 'spruce').every((t) => t.snowy)).toBe(true);
    const tram = tramwayOf(c)!;
    const [ux, uy] = [Math.cos(tram.angle), Math.sin(tram.angle)];
    for (const t of all) {
      const along = (t.x - tram.from.x) * ux + (t.y - tram.from.y) * uy;
      const off = Math.abs(-(t.x - tram.from.x) * uy + (t.y - tram.from.y) * ux);
      if (along > 0 && along < tram.length) expect(off).toBeGreaterThanOrEqual(TRAMWAY.corridor);
    }
    // (nowhere else under snow)
    for (const l of LAYOUTS) if (l !== GLACIER_PASS) expect(l.snow).toBeFalsy();
  }, 30_000);
});
