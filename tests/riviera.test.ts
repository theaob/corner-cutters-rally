import { describe, expect, it } from 'vitest';
import { carClass, newCar, speedOf, stepCar } from '../src/engine/driving';
import { groundAt } from '../src/engine/sim';
import { HALF_WIDTH, TIGHT_ROADSIDE, buildCircuit, edgeTiles, type Circuit } from '../src/f1/circuit';
import { FOREST, HIDES, PALMS, RIVIERA_TREES, roadsideOf, treesOf } from '../src/f1/forest3d';
import { newCaller, noteText, paceNotes, shown, spoken, stepCaller } from '../src/f1/paceNotes';
import { RACE_HANDLING, aiInput, lineCornerSpeed, lineDecel, newProgress, stepProgress } from '../src/f1/racing';
import { RALLIES, rallyById } from '../src/f1/rally';
import { RIVIERA, coastOf, inTunnel, ledgeLift, shoreAt, slopeAt } from '../src/f1/riviera';
import { ROUNDS, SEASON } from '../src/f1/season';
import { ROAD, STAGE_SPECS, TUNNEL, stageById } from '../src/f1/stages';
import { underRoof } from '../src/f1/tunnels3d';

const f1 = carClass('f1');
const built = new Map<string, Circuit>();
const circuitOf = (id: string) => {
  let c = built.get(id);
  if (!c) built.set(id, (c = buildCircuit(stageById(id)!, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) })));
  return c;
};
const RIVIERA_STAGES = STAGE_SPECS.filter((s) => s.scenery === 'riviera');

describe('the Riviera', () => {
  it('is a rally of three tarmac stages, the cliff road by the sea its Power Stage, and the last round of the season', () => {
    const rally = rallyById('riviera')!;
    expect(rally.surface).toBe('TARMAC');
    expect(rally.stages.map((s) => s.layout)).toEqual(['ss-les-lacets', 'ss-col-du-mistral', 'ss-corniche-bleue']);
    expect(RIVIERA_STAGES.map((s) => s.id).sort()).toEqual(rally.stages.map((s) => s.layout).sort());
    expect(RALLIES[RALLIES.length - 1]).toBe(rally);
    expect(SEASON.rounds[SEASON.rounds.length - 1]).toBe('riviera');
    expect(ROUNDS).toHaveLength(5);
  });

  it('has its shore a little way south of the road wherever the road is the last thing before the sea', () => {
    const road = [{ x: 400, y: 1000 }, { x: 800, y: 1000 }, { x: 1200, y: 1400 }, { x: 1600, y: 1400 }];
    const r = coastOf(road);
    for (const p of road) {
      expect(shoreAt(r, p.x) - p.y).toBeGreaterThanOrEqual(RIVIERA.shore * 0.8 - 1);
      expect(shoreAt(r, p.x) - p.y).toBeLessThan(RIVIERA.shore + 320);
    }
    // (the land climbs north from the shore; south of it, it's under the sea)
    expect(slopeAt(r, 400, 500)).toBeGreaterThan(slopeAt(r, 400, 900));
    expect(slopeAt(r, 400, shoreAt(r, 400) + 60)).toBeLessThan(0);
  });

  it('cuts the road a ledge: a rock face north of it, a drop south, nothing where it runs up the slope', () => {
    expect(ledgeLift(RIVIERA.run, 1)).toBeCloseTo(RIVIERA.face);
    expect(ledgeLift(RIVIERA.run, -1)).toBeCloseTo(-RIVIERA.face);
    expect(ledgeLift(RIVIERA.run, 0)).toBeCloseTo(0);
    expect(ledgeLift(0, 1)).toBe(0);
    expect(ledgeLift(RIVIERA.run + RIVIERA.ease + 1, 1)).toBe(0);
  });
});

describe.each(RIVIERA_STAGES)('the $name stage', (spec) => {
  const layout = stageById(spec.id)!;
  const circuit = circuitOf(spec.id);
  const { track, grid, cells, width: W, height: H } = circuit;
  const n = track.samples.length;
  const cellAt = (x: number, y: number) => cells[Math.floor(y / 16) * W + Math.floor(x / 16)];

  it('is on the Riviera: tarmac, no jumps, the sea along its southern side', () => {
    expect(layout.riviera).toBeDefined();
    expect(layout.dirt).toBeUndefined();
    expect(layout.jumps).toBeUndefined();
    const sea = circuit.sea!;
    expect(sea.filter(Boolean).length).toBeGreaterThan(300);
    // (all of it south of the road's southernmost point, or nearly)
    const south = Math.max(...track.samples.map((p) => p.y));
    const north = Math.min(...sea.map((s, k) => (s ? Math.floor(k / W) * 16 : Infinity)));
    expect(north).toBeGreaterThan(south - 0.6 * H * 16);
    // (and the sea is flat, at its level)
    sea.forEach((s, k) => s && expect(groundAt(grid, (k % W) * 16 + 8, Math.floor(k / W) * 16 + 8).h).toBe(0));
  });

  it('climbs north from the shore: the road well above the sea all the way, its gradients gentle', () => {
    let worst = 0;
    for (const p of track.samples) {
      const g = groundAt(grid, p.x, p.y);
      expect(g.h).toBeGreaterThan(RIVIERA.beach);
      worst = Math.max(worst, Math.abs(g.gx * Math.sin(p.dir) - g.gy * Math.cos(p.dir)));
    }
    expect(worst).toBeLessThan(0.2);
    const [a, b] = [track.samples.reduce((m, p) => (p.y < m.y ? p : m)), track.samples.reduce((m, p) => (p.y > m.y ? p : m))];
    expect(groundAt(grid, a.x, a.y).h).toBeGreaterThan(groundAt(grid, b.x, b.y).h + 40);
  });

  it('is tight: walled in close on both sides, the open ground level with the road', () => {
    let open = 0;
    let far = 0;
    for (let i = 60; i < n - 60; i += 5) {
      const p = track.samples[i];
      for (const side of [-1, 1]) {
        const at = (off: number) => cellAt(p.x + Math.cos(p.dir) * off * side, p.y + Math.sin(p.dir) * off * side);
        open++;
        if (at(HALF_WIDTH + 60) !== 'wall') far++;
      }
    }
    // (only the outsides of its tight bends have room to run wide)
    expect(far / open).toBeLessThan(0.2);
    cells.forEach((c, k) => {
      if (c === 'wall' || circuit.sea![k]) return;
      const g = groundAt(grid, (k % W) * 16 + 8, Math.floor(k / W) * 16 + 8);
      expect(Math.hypot(g.gx, g.gy)).toBeLessThan(0.25);
    });
  });

  it('has a rock face over the road where it runs across the slope, and a drop below it', () => {
    let faces = 0;
    let drops = 0;
    for (let i = 200; i < n - 200; i += 10) {
      const p = track.samples[i];
      // (running east or west, clear of its tunnels and of its own other stretches)
      if (Math.abs(Math.cos(p.dir)) > 0.25 || circuit.tunnel?.[i]) continue;
      if (track.samples.some((q, j) => Math.abs(j - i) > 60 && Math.hypot(q.x - p.x, q.y - p.y) < 260)) continue;
      const here = groundAt(grid, p.x, p.y).h;
      const off = HALF_WIDTH + TIGHT_ROADSIDE.far + RIVIERA.run + 20;
      if (groundAt(grid, p.x, p.y - off).h > here + RIVIERA.face * 0.5) faces++;
      if (groundAt(grid, p.x, p.y + off).h < here - RIVIERA.face * 0.4) drops++;
    }
    expect(faces).toBeGreaterThan(3);
    expect(drops).toBeGreaterThan(3);
  });

  it('has its tunnels on gentle road, clear of the start, the finish and each other', () => {
    const tunnels = layout.tunnels!;
    expect(tunnels.length).toBeGreaterThanOrEqual(2);
    expect(tunnels.length).toBeLessThanOrEqual(spec.tunnels!);
    tunnels.forEach((t, k) => {
      expect(t.to - t.from).toBeGreaterThanOrEqual(TUNNEL.shortest);
      expect(t.to - t.from).toBeLessThanOrEqual(TUNNEL.longest);
      expect(t.from).toBeGreaterThan(ROAD.start + TUNNEL.ends);
      expect(t.to).toBeLessThan(layout.stage!.finish - TUNNEL.ends);
      if (k) expect(t.from - tunnels[k - 1].to).toBeGreaterThan(TUNNEL.between);
      // (no bend in it tighter than a fast one)
      for (const p of track.samples) if (inTunnel([t], p.s)) expect(Math.abs(p.curve)).toBeLessThan(1 / 300);
    });
  });

  it('walls its tunnels right by the road, rock over them, and roofs the road inside', () => {
    for (let i = 0; i < n; i += 4) {
      const p = track.samples[i];
      if (!circuit.tunnel![i] || !circuit.tunnel![i - 12] || !circuit.tunnel![i + 12]) continue;
      expect(underRoof(circuit, p.x, p.y)).toBe(true);
      const here = groundAt(grid, p.x, p.y).h;
      for (const side of [-1, 1]) {
        const at = (off: number) => [p.x + Math.cos(p.dir) * off * side, p.y + Math.sin(p.dir) * off * side] as const;
        expect(cellAt(...at(HALF_WIDTH - 12))).not.toBe('wall');
        expect(cellAt(...at(HALF_WIDTH + RIVIERA.wall + 20))).toBe('wall');
        expect(groundAt(grid, ...at(HALF_WIDTH + RIVIERA.wall + 30)).h).toBeGreaterThan(here + RIVIERA.roof * 0.7);
      }
    }
    // (and nowhere else)
    const s = track.samples[Math.round(track.stage!.start / track.spacing)];
    expect(underRoof(circuit, s.x, s.y)).toBe(false);
  });

  it("has the co-driver call each tunnel's mouth, in time, with the bends round it", () => {
    const mouths = layout.tunnels!.map((t) => t.from);
    const notes = paceNotes(track, [], mouths);
    const called = notes.filter((note) => note.tunnel);
    expect(called.map((note) => note.at)).toEqual(mouths);
    expect(noteText(called[0])).toBe('TUNNEL');
    expect(spoken([called[0]])).toMatch(/^tunnel/);
    // (driven through at speed: every note is called before the car reaches it, the tunnels among them)
    const caller = newCaller(notes);
    const heard = new Map<number, number>();
    for (let at = track.stage!.start; at < track.stage!.finish; at += 5) for (const note of stepCaller(caller, at, 300) ?? []) heard.set(note.at, at);
    for (const note of notes) expect(heard.get(note.at), noteText(note)).toBeLessThanOrEqual(note.at);
    expect(shown([notes[0], notes[1], called[0], notes[2]], 2)).toContain('TUNNEL');
  });

  it('can be driven from the start to the flying finish by an AI car on the real physics, unhurt', () => {
    const start = circuit.slots[0];
    const car = newCar(f1, start.x, start.y, start.heading);
    let p = newProgress(Math.round((track.stage!.start - 24) / track.spacing));
    let t = 0;
    const done = () => p.idx * track.spacing >= track.stage!.finish;
    for (; t < 200 && !done(); t += 1 / 60) {
      stepCar(car, aiInput(car, track, p.idx, { lane: 0, pace: 1 }), RACE_HANDLING, 1 / 60, grid);
      p = stepProgress(p, track, car, t, 1, 1 / 60);
    }
    expect(done()).toBe(true);
    expect(car.health).toBe(f1.health);
    expect(speedOf(car)).toBeGreaterThan(100);
    // (a twisting road: slower than the other tarmac stages for its length)
    expect(t).toBeGreaterThan(spec.length / 420);
    expect(t).toBeLessThan(spec.length / 220);
  }, 30_000);

  it('lines its drops with a stone parapet, and leaves the rock faces and the tunnels bare', () => {
    const side = roadsideOf(circuit);
    const edges = edgeTiles(circuit);
    expect(side.every((t) => t.kind === 'block')).toBe(true);
    expect(side.length).toBeGreaterThan(edges.length * 0.4);
    expect(side.length).toBeLessThan(edges.length);
    // (each stone's top the parapet's height over the road beside it, never high enough to hide it)
    for (const t of side) expect(t.h).toBeGreaterThanOrEqual(RIVIERA_TREES.parapet);
    for (const t of side) expect(underRoof(circuit, t.x, t.y)).toBe(false);
  });

  it('grows cypresses, pines, palms by the shore and villas by the road: none in the sea, none hiding the road', () => {
    const trees = treesOf(circuit);
    for (const kind of ['cypress', 'broadleaf', 'palm', 'villa'] as const) expect(trees.some((t) => t.kind === kind), kind).toBe(true);
    expect(trees.filter((t) => t.kind === 'villa').length).toBeGreaterThan(8);
    const ground = track.samples.map((q) => groundAt(grid, q.x, q.y).h);
    const reach = HALF_WIDTH + 14;
    let worst = -Infinity;
    for (const t of trees) {
      const inside = t.x >= 0 && t.y >= 0 && t.x < W * 16 && t.y < H * 16;
      if (inside) {
        expect(cellAt(t.x, t.y)).toBe('wall');
        expect(circuit.sea![Math.floor(t.y / 16) * W + Math.floor(t.x / 16)]).toBe(false);
      }
      const cr = t.h * (t.kind === 'palm' ? PALMS.crown : t.kind === 'cypress' ? RIVIERA_TREES.spire : t.kind === 'villa' ? 0.7 : FOREST.crown);
      const top = groundAt(grid, t.x, t.y).h + t.h;
      track.samples.forEach((q, i) => {
        if (Math.abs(q.x - t.x) > cr + reach) return;
        const gap = t.y - cr - (q.y + reach);
        if (gap >= 0) worst = Math.max(worst, (top - ground[i]) * HIDES - gap);
      });
    }
    expect(worst).toBeLessThanOrEqual(0);
  }, 30_000);
});
