import { describe, expect, it } from 'vitest';
import { HALF_WIDTH, ROADSIDE, RUNOFF, buildCircuit, edgeTiles, type Circuit } from '../src/f1/circuit';
import { carClass } from '../src/engine/driving';
import { groundAt } from '../src/engine/sim';
import { lineCornerSpeed, lineDecel } from '../src/f1/racing';
import { EDGE, FOREST, HIDES, MOUNTAIN, PALMS, roadsideOf, treesOf, type Tree } from '../src/f1/forest3d';
import { STAGE_SPECS, stageById } from '../src/f1/stages';

const f1 = carClass('f1');
// (each stage built once, for every block that wants it)
const builds = new Map<string, Circuit>();
const build = (id: string) => {
  let c = builds.get(id);
  if (!c) builds.set(id, (c = buildCircuit(stageById(id)!, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) })));
  return c;
};

describe('the forest', () => {
  const circuit = build('ss-pine-ridge');
  const trees = treesOf(circuit);

  it('grows only round a stage in a forest, the desert or the mountains (palms only in the desert)', () => {
    expect(circuit.layout.forest).toBe(true);
    // (the same road with none of them: bare)
    const bare = { ...circuit, layout: { ...circuit.layout, forest: false, desert: false, mountain: false } };
    expect(treesOf(bare)).toHaveLength(0);
    expect(trees.some((t) => t.kind === 'palm')).toBe(false);
  });

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
  { name: 'the forest on Pine Ridge', id: 'ss-pine-ridge', crown: FOREST.crown, clear: FOREST.clear },
  { name: 'the palms on Dune Run', id: 'ss-dune-run', crown: PALMS.crown, clear: PALMS.clear },
])('$name', ({ id, crown, clear }) => {
  const circuit = build(id);
  const trees: Tree[] = treesOf(circuit);
  // (the road and its verge: never hidden)
  const reach = HALF_WIDTH + ROADSIDE.verge;

  it('stands back past the treeline, off the open ground', () => {
    // (every open tile's middle at least `clear` px from each tree)
    const open: { x: number; y: number }[] = [];
    circuit.cells.forEach((c, k) => {
      if (c !== 'wall') open.push({ x: ((k % circuit.width) + 0.5) * 16, y: (Math.floor(k / circuit.width) + 0.5) * 16 });
    });
    let nearest = Infinity;
    for (const t of trees) for (const o of open) if (Math.abs(o.x - t.x) < 64 && Math.abs(o.y - t.y) < 64) nearest = Math.min(nearest, Math.hypot(o.x - t.x, o.y - t.y));
    expect(nearest).toBeGreaterThan(clear);
  }, 30_000);

  it('never hides the road from the camera, on the hillsides too', () => {
    const ground = circuit.track.samples.map((p) => groundAt(circuit.grid, p.x, p.y).h);
    let worst = -Infinity;
    for (const t of trees) {
      const cr = t.h * crown;
      const top = groundAt(circuit.grid, t.x, t.y).h + t.h;
      circuit.track.samples.forEach((p, i) => {
        if (Math.abs(p.x - t.x) > cr + reach) return;
        const gap = t.y - cr - (p.y + reach);
        if (gap < 0) return;
        // (how far north of its crown its top hides the ground, seen from the camera, against the road's height there, less the gap)
        worst = Math.max(worst, (top - ground[i]) * HIDES - gap);
      });
    }
    expect(worst).toBeLessThanOrEqual(0);
  }, 30_000);
});

describe('the palms on Dune Run', () => {
  const circuit = build('ss-dune-run');
  const palms = treesOf(circuit);

  it('stand in groves along the road and out over the sand, all palms, as tall as they may be', () => {
    expect(circuit.layout.desert).toBe(true);
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
  }, 30_000);

  it("line the road just past the roadside's rocks, where they are seen as you drive by", () => {
    const reach = HALF_WIDTH + RUNOFF;
    const near = palms.filter((t) => Math.min(...circuit.track.samples.map((p) => Math.hypot(p.x - t.x, p.y - t.y))) < reach + PALMS.clear + PALMS.liningOut[1] + 20);
    expect(near.length).toBeGreaterThan(150);
  }, 30_000);
});

describe('the mountains', () => {
  it('scatter spruces below the tree line only, and boulders all over (snowy up high), none tall enough to hide the road', () => {
    const c = build('ss-high-moor');
    expect(c.layout.mountain).toBe(true);
    const all = treesOf(c);
    const spruces = all.filter((t) => t.kind === 'spruce');
    const rocks = all.filter((t) => t.kind === 'rock');
    expect(spruces.length).toBeGreaterThan(500);
    expect(rocks.length).toBeGreaterThan(100);
    for (const t of spruces) expect(groundAt(c.grid, t.x, t.y).h).toBeLessThanOrEqual(MOUNTAIN.treeLine);
    for (const t of rocks) expect(t.h).toBeLessThanOrEqual(MOUNTAIN.rockSize[0] + MOUNTAIN.rockSize[1]);
    expect(all.some((t) => t.kind === 'palm' || t.kind === 'broadleaf')).toBe(false);
  }, 30_000);

  it('under snow (Glacier Road): every spruce laden with it, and only the snow stages under snow', () => {
    const c = build('ss-glacier-road');
    expect(c.layout.snow).toBe(true);
    expect(c.layout.mountain).toBe(true);
    const spruces = treesOf(c).filter((t) => t.kind === 'spruce');
    expect(spruces.length).toBeGreaterThan(0);
    expect(spruces.every((t) => t.snowy)).toBe(true);
    for (const spec of STAGE_SPECS) expect(!!stageById(spec.id)!.snow).toBe(spec.surface === 'snow');
  }, 60_000);
});

describe.each(['ss-pine-ridge', 'ss-high-moor', 'ss-dune-run', 'ss-glacier-road', 'ss-vineyards'])('the roadside on %s', (id) => {
  const circuit = build(id);
  const side = roadsideOf(circuit);
  const reach = HALF_WIDTH + ROADSIDE.verge;

  it('has a tree or a rock on every solid tile facing the open ground, and none anywhere else', () => {
    const edges = edgeTiles(circuit);
    expect(side).toHaveLength(edges.length);
    side.forEach((t, k) => {
      const [i, j] = edges[k];
      expect(Math.abs(t.x - (i + 0.5) * 16)).toBeLessThanOrEqual(EDGE.nudge);
      expect(Math.abs(t.y - (j + 0.5) * 16)).toBeLessThanOrEqual(EDGE.nudge);
    });
    // (the desert's mostly rocks; elsewhere mostly trees)
    const rocks = side.filter((t) => t.kind === 'rock').length / side.length;
    if (circuit.layout.desert) expect(rocks).toBeGreaterThan(0.7);
    else if (!circuit.layout.mountain) expect(rocks).toBeLessThan(0.5);
  }, 30_000);

  it('never stands on the road or its verge', () => {
    // (the nearest, of every tree and rock to every sample close by: its tile's middle is past the verge)
    let nearest = Infinity;
    for (const t of side) {
      for (const p of circuit.track.samples) if (Math.abs(p.x - t.x) < 80 && Math.abs(p.y - t.y) < 80) nearest = Math.min(nearest, Math.hypot(p.x - t.x, p.y - t.y));
    }
    expect(nearest).toBeGreaterThan(reach - EDGE.nudge);
  }, 30_000);

  it('never hides the road from the camera', () => {
    const ground = circuit.track.samples.map((p) => groundAt(circuit.grid, p.x, p.y).h);
    let worst = -Infinity;
    for (const t of side) {
      if (t.h <= EDGE.least) continue;
      const cr = t.h * (t.kind === 'rock' ? 0.5 : t.kind === 'palm' ? PALMS.crown : FOREST.crown);
      const top = groundAt(circuit.grid, t.x, t.y).h + t.h;
      circuit.track.samples.forEach((p, i) => {
        if (Math.abs(p.x - t.x) > cr + reach) return;
        const gap = t.y - cr - (p.y + reach);
        if (gap < 0) return;
        worst = Math.max(worst, (top - ground[i]) * HIDES - gap);
      });
    }
    expect(worst).toBeLessThanOrEqual(0);
  }, 30_000);
});
