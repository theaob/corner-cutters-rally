import { describe, expect, it } from 'vitest';
import { carClass } from '../src/engine/driving';
import { HD2D_VIEW } from '../src/engine/look';
import { seededRandom } from '../src/engine/rng';
import { HALF_WIDTH, buildCircuit } from '../src/f1/circuit';
import { CASTLE, SEEN, SURFACE_SEEN, castleFootprints, castleOf, inView, inside, landmarkSeeOver, landmarksOf, seaOf, seeOver, seeSurfaceOver, townBlocks } from '../src/f1/town3d';
import { GARAGE_ACROSS } from '../src/f1/pits';
import { BAKU, HARBOUR } from '../src/f1/layouts';
import { lineCornerSpeed, lineDecel } from '../src/f1/racing';

const f1 = carClass('f1');

describe('the harbour town', () => {
  const c = buildCircuit(HARBOUR, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });
  const samples = c.track.samples;
  const fromTrack = (x: number, y: number) => Math.min(...samples.map((p) => Math.hypot(p.x - x, p.y - y)));
  const reach = HALF_WIDTH + HARBOUR.street!.runoff;
  const sea = seaOf(c)!;
  const marks = landmarksOf(c);
  const blocks = townBlocks(c, sea, fromTrack, reach + 40, seededRandom(29), marks);
  it('is an old town: a few hundred houses, several storeys tall, packed in right behind the barriers, with towers and battlements among them', () => {
    expect(blocks.length).toBeGreaterThan(200);
    expect(blocks.filter((b) => b.h >= 36).length).toBeGreaterThan(80);
    // (the landmarks have some of the frontage)
    expect(blocks.filter((b) => fromTrack(b.x, b.y) < reach + 60).length).toBeGreaterThan(30);
    expect(blocks.filter((b) => b.top === 'spire').length).toBeGreaterThan(3);
    expect(blocks.filter((b) => b.top === 'battlements').length).toBeGreaterThan(20);
  });
  it('stands on the land, off the track and its barriers', () => {
    for (const b of blocks) {
      expect(inside(sea, b.x, b.y)).toBe(false);
      expect(fromTrack(b.x, b.y) - Math.hypot(b.w, b.d) / 2).toBeGreaterThan(reach - 30);
    }
  });
  it('never hides the track from the camera (looking down from the south, over the blocks)', () => {
    const hides = 1 / Math.tan((HD2D_VIEW.pitch * Math.PI) / 180);
    for (const b of blocks) {
      for (const p of samples) {
        // track behind the block's front, in line with it: further than the ground the block hides
        if (Math.abs(p.x - b.x) > b.w / 2 + reach || p.y + reach > b.y - b.d / 2) continue;
        expect(b.y - b.d / 2 - (p.y + reach)).toBeGreaterThan(b.h * hides);
      }
    }
  });

  describe('its landmarks', () => {
    it('are the casino, an open-air pool and a tennis court', () => {
      expect(marks.map((l) => l.kind).sort()).toEqual(['casino', 'pool', 'tennis']);
    });
    it('stand on land, clear of the track and its barriers', () => {
      for (const l of marks) {
        for (const [dx, dy] of [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) expect(inside(sea, l.x + (dx * l.w) / 2, l.y + (dy * l.d) / 2)).toBe(false);
        for (const p of samples) expect(Math.abs(p.x - l.x) > l.w / 2 + reach || Math.abs(p.y - l.y) > l.d / 2 + reach).toBe(true);
      }
    });
    it('are each at least half in the picture at once as you drive by (not a corner at its edge): the camera shows little either side of a phone, more up and down', () => {
      for (const l of marks) {
        expect(inView(samples, l.x, l.y, l.w, l.d), l.kind).toBeGreaterThanOrEqual(SEEN[l.kind]);
      }
    });
    it('the casino stands by the hairpin, and never hides the track from the camera', () => {
      const casino = marks.find((l) => l.kind === 'casino')!;
      // (the hairpin: the tightest bend on the lap)
      const hairpin = [...samples].sort((a, b) => Math.abs(b.curve) - Math.abs(a.curve))[0];
      expect(Math.hypot(hairpin.x - casino.x, hairpin.y - casino.y)).toBeLessThan(400);
      expect(casino.h).toBeLessThan(seeOver(c, casino.x, casino.y, casino.w, casino.d));
    });
    it('have no houses built on them', () => {
      for (const l of marks) for (const b of blocks) expect(Math.abs(b.x - l.x) >= (b.w + l.w) / 2 || Math.abs(b.y - l.y) >= (b.d + l.d) / 2).toBe(true);
    });
  });
});

describe('Caspian Shores (Baku)', () => {
  const c = buildCircuit(BAKU, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });
  const samples = c.track.samples;
  const fromTrack = (x: number, y: number) => Math.min(...samples.map((p) => Math.hypot(p.x - x, p.y - y)));
  const reach = HALF_WIDTH + BAKU.street!.runoff;
  const sea = seaOf(c)!;
  const marks = landmarksOf(c);
  const castle = castleOf(c);
  const blocks = townBlocks(c, sea, fromTrack, reach + 40, seededRandom(29), [...marks, ...castleFootprints(castle)]);
  it('has Qız Qalası (the Maiden Tower), the Flame Towers and the Crescent', () => {
    expect(marks.map((l) => l.kind).sort()).toEqual(['crescent', 'flames', 'maiden']);
  });
  it('has the Maiden Tower big, by the stretch out of the castle section, and the Crescent past the line on land, south of the run to the hairpin', () => {
    const maiden = marks.find((l) => l.kind === 'maiden')!;
    expect(maiden.w).toBeGreaterThanOrEqual(80);
    expect(maiden.h).toBeGreaterThanOrEqual(80);
    const crescent = marks.find((l) => l.kind === 'crescent')!;
    const n = samples.length;
    // (past the line, before the hairpin: the nearest stretch is in the lap's first 5%; and it's to the south of it, on land)
    const nearest = samples.reduce((a, p, i) => (Math.hypot(p.x - crescent.x, p.y - crescent.y) < Math.hypot(samples[a].x - crescent.x, samples[a].y - crescent.y) ? i : a), 0);
    expect(nearest / n).toBeLessThan(0.05);
    expect(crescent.y).toBeGreaterThan(samples[nearest].y);
    expect(inside(sea, crescent.x, crescent.y)).toBe(false);
    expect(crescent.h).toBeGreaterThanOrEqual(90);
  });
  it('stand on land, clear of the track, seen as you drive by, with no houses on them, never hiding the track', () => {
    for (const l of marks) {
      for (const [dx, dy] of [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) expect(inside(sea, l.x + (dx * l.w) / 2, l.y + (dy * l.d) / 2)).toBe(false);
      for (const p of samples) expect(Math.abs(p.x - l.x) > l.w / 2 + reach || Math.abs(p.y - l.y) > l.d / 2 + reach).toBe(true);
      expect(inView(samples, l.x, l.y, l.w, l.d), l.kind).toBeGreaterThanOrEqual(SEEN[l.kind]);
      // (the Maiden Tower, inside the walls, may hide what they do: the barriers and the run-off's edge, never the racing surface)
      expect(l.h, l.kind).toBeLessThanOrEqual(landmarkSeeOver(c, l.kind, l.x, l.y, l.w, l.d));
      if (l.kind === 'flames') expect(l.h).toBeLessThanOrEqual(seeOver(c, l.x, l.y, l.w, l.d));
      for (const b of blocks) expect(Math.abs(b.x - l.x) >= (b.w + l.w) / 2 || Math.abs(b.y - l.y) >= (b.d + l.d) / 2).toBe(true);
    }
  });
  it('stand where the layout puts them: the Maiden Tower inside the walls, the Flame Towers on the hill north-west of it', () => {
    for (const l of marks) {
      const want = BAKU.street!.landmarks![l.kind]!;
      expect(Math.hypot(l.x - (want.x * BAKU.scale - c.offset.x), l.y - (want.y * BAKU.scale - c.offset.y)), l.kind).toBeLessThan(200);
    }
  });
  it('has its pits on the town side of the straight, and the Caspian right up to the barriers on the other, no house between', () => {
    const pit = c.pit;
    expect(pit.side).toBe(-1);
    // (along the straight, just beyond the barriers on the side away from the pits: the sea)
    for (const q of pit.points.filter((p) => p.s >= pit.boxes[0] && p.s <= pit.boxes[pit.boxes.length - 1])) {
      const p = samples[q.idx];
      const out = reach + 50;
      expect(inside(sea, p.x - Math.cos(p.dir) * out * pit.side, p.y - Math.sin(p.dir) * out * pit.side)).toBe(true);
      expect(inside(sea, q.x + Math.cos(q.dir) * (GARAGE_ACROSS + 14) * pit.side, q.y + Math.sin(q.dir) * (GARAGE_ACROSS + 14) * pit.side)).toBe(false);
    }
    for (const b of blocks) for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) expect(inside(sea, b.x + (u * b.w) / 2, b.y + (v * b.d) / 2)).toBe(false);
  });
  describe('its old city walls', () => {
    it('run a long way along the castle section, with round towers along them and a gate tower', () => {
      const length = castle.walls.reduce((a, w) => a + Math.hypot(w.x2 - w.x1, w.y2 - w.y1), 0);
      expect(length).toBeGreaterThan(1000);
      expect(castle.towers.length).toBeGreaterThanOrEqual(6);
      expect(castle.towers.filter((t) => t.gate)).toHaveLength(1);
    });
    it('stand behind the barriers, clear of every stretch of track, and never hide the racing surface from the camera', () => {
      expect(SURFACE_SEEN).toBeGreaterThan(HALF_WIDTH);
      for (const w of castle.walls) {
        for (const [x, y] of [[w.x1, w.y1], [w.x2, w.y2]]) expect(fromTrack(x, y)).toBeGreaterThan(reach + CASTLE.thick / 2);
        // (every 8 px of it)
        const steps = Math.ceil(Math.hypot(w.x2 - w.x1, w.y2 - w.y1) / 8);
        const [dx, dy] = [(w.x2 - w.x1) / steps, (w.y2 - w.y1) / steps];
        for (let i = 0; i < steps; i++) {
          const [x, y] = [w.x1 + dx * (i + 0.5), w.y1 + dy * (i + 0.5)];
          expect(fromTrack(x, y)).toBeGreaterThan(reach);
          expect(w.h).toBeLessThanOrEqual(seeSurfaceOver(c, x, y, Math.abs(dx) + CASTLE.thick, Math.abs(dy) + CASTLE.thick));
        }
      }
      for (const t of castle.towers) {
        expect(fromTrack(t.x, t.y)).toBeGreaterThan(reach);
        expect(t.h).toBeLessThanOrEqual(seeSurfaceOver(c, t.x, t.y, 2 * t.r, 2 * t.r));
      }
    });
    it('run unbroken, on the inside of the castle section round the old town, the Maiden Tower inside them', () => {
      for (let i = 1; i < castle.walls.length; i++) {
        const [a, b] = [castle.walls[i - 1], castle.walls[i]];
        expect(Math.hypot(b.x1 - a.x2, b.y1 - a.y2)).toBeLessThan(0.001);
      }
      expect(BAKU.street!.castle!.side).toBe(-1);
      // (the castle section runs anticlockwise round the old town: its inside, the walls' side, is where the Maiden Tower stands)
      const maiden = marks.find((l) => l.kind === 'maiden')!;
      const n = samples.length;
      const nearest = samples.slice(Math.round(BAKU.street!.castle!.from * n), Math.round(BAKU.street!.castle!.to * n)).reduce((a, p) => (Math.hypot(p.x - maiden.x, p.y - maiden.y) < Math.hypot(a.x - maiden.x, a.y - maiden.y) ? p : a));
      expect((maiden.x - nearest.x) * Math.cos(nearest.dir) + (maiden.y - nearest.y) * Math.sin(nearest.dir)).toBeLessThan(0);
    });
    it('have no houses built on them', () => {
      for (const f of castleFootprints(castle)) for (const b of blocks) expect(Math.abs(b.x - f.x) >= (b.w + f.w) / 2 || Math.abs(b.y - f.y) >= (b.d + f.d) / 2).toBe(true);
    });
  });
});
