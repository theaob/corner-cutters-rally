// The track designer's model: a circuit layout as the designer edits it (its
// control points each with a height, rather than an elevation profile along the
// lap), turned back into a layout for the game, written out as code to paste
// into layouts.ts, and checked: the lap's length, the main straight long enough
// for a pit lane with the whole lane on it, no bend tighter than the track is
// wide, no two stretches of track too close together, and an AI lap round it.
// Pure: no rendering.

import { atCrossing } from '../f1/bridge';
import { carClass, newCar, stepCar } from '../engine/driving';
import { groundAt } from '../engine/sim';
import { HALF_WIDTH, buildCircuit, type Circuit } from '../f1/circuit';
import type { CircuitLayout } from '../f1/layouts';
import { PIT_LANE_MIN, PIT_STRAIGHT_MIN, type PitSpec } from '../f1/pits';
import { RACE_HANDLING, aiInput, lineCornerSpeed, lineDecel, newProgress, stepProgress } from '../f1/racing';

/** A control point as the designer edits it: where it is (layout units) and how high the ground is there (px). */
export interface DraftPoint {
  x: number;
  y: number;
  h: number;
}

/** A circuit layout being edited. */
export interface Draft {
  id: string;
  name: string;
  about: string;
  /** px per layout unit */
  scale: number;
  /** in racing order, the first on the start/finish line */
  points: DraftPoint[];
  pit: PitSpec;
  /** the rest of the layout, carried through as it is (tyre wear, a forest, a street circuit's town, a banking…) */
  extras: Omit<CircuitLayout, 'id' | 'name' | 'about' | 'scale' | 'points' | 'elevation' | 'pit'>;
}

/** Each point's share of the way round the lap of control points (the first at 0). */
export function shares(points: { x: number; y: number }[]): number[] {
  const n = points.length;
  const cum = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  const total = cum[n - 1] + Math.hypot(points[0].x - points[n - 1].x, points[0].y - points[n - 1].y);
  return cum.map((c) => (total ? c / total : 0));
}

/** Height (px) at a share of the lap along an elevation profile, eased between its points (as the game does). */
export function heightAt(profile: [number, number][], share: number): number {
  for (let i = 1; i < profile.length; i++) {
    const [s0, h0] = profile[i - 1];
    const [s1, h1] = profile[i];
    if (share <= s1) {
      const t = (share - s0) / Math.max(1e-9, s1 - s0);
      return h0 + (h1 - h0) * (1 - Math.cos(t * Math.PI)) * 0.5;
    }
  }
  return profile[0][1];
}

/** A draft of `layout`, each control point at the height the layout's elevation profile gives it. */
export function draftFrom(layout: CircuitLayout): Draft {
  const at = shares(layout.points);
  const { id, name, about, scale, points, elevation, pit, ...extras } = layout;
  return {
    id, name, about, scale,
    points: points.map((p, i) => ({ x: p.x, y: p.y, h: Math.round(heightAt(elevation, at[i]) * 10) / 10 })),
    pit: { ...pit },
    extras: JSON.parse(JSON.stringify(extras)),
  };
}

/** The layout a draft makes: its elevation profile from the points' heights, by their share of the lap. */
export function layoutFrom(draft: Draft): CircuitLayout {
  const at = shares(draft.points);
  const elevation: [number, number][] = draft.points.map((p, i) => [round(at[i], 4), p.h]);
  elevation.push([1, draft.points[0]?.h ?? 0]);
  return {
    id: draft.id, name: draft.name, about: draft.about, scale: draft.scale,
    points: draft.points.map((p) => ({ x: p.x, y: p.y })),
    elevation, pit: { ...draft.pit },
    ...JSON.parse(JSON.stringify(draft.extras)),
  };
}

const round = (v: number, places = 0) => Math.round(v * 10 ** places) / 10 ** places;

/** A name for the layout's constant in layouts.ts: its id in capitals. */
export const constName = (id: string) => id.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').toUpperCase() || 'NEW_CIRCUIT';

/** The layout as TypeScript, in the style of layouts.ts, to paste in there (and add to LAYOUTS). */
export function layoutToTs(layout: CircuitLayout): string {
  const q = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  const pts = layout.points.map((p) => `[${round(p.x)}, ${round(p.y)}]`);
  const rows: string[] = [];
  for (let i = 0; i < pts.length; i += 6) rows.push(`    ${pts.slice(i, i + 6).join(', ')},`);
  const { id, name, about, scale, elevation, pit, points: _points, ...extras } = layout;
  const extra = Object.entries(extras)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `  ${k}: ${JSON.stringify(v)},`);
  return [
    `export const ${constName(id)}: CircuitLayout = {`,
    `  id: ${q(id)},`,
    `  name: ${q(name)},`,
    `  about: ${q(about)},`,
    `  points: ([`,
    ...rows,
    `  ] as [number, number][]).map(([x, y]) => ({ x, y })),`,
    `  scale: ${scale},`,
    `  elevation: [`,
    ...elevation.map(([s, h]) => `    [${s}, ${round(h, 1)}],`),
    `  ],`,
    `  pit: { from: ${round(pit.from)}, to: ${round(pit.to)}, side: ${pit.side} },`,
    ...extra,
    `};`,
  ].join('\n');
}

/** Build the circuit a layout makes, as the game does. */
export function circuitOf(layout: CircuitLayout): Circuit {
  const f1 = carClass('f1');
  return buildCircuit(layout, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });
}

export interface Check {
  /** what's checked, its value, and whether it passes */
  label: string;
  value: string;
  ok: boolean;
}

/** px of track either side of the start line that's straight (|curvature| under 1/700), behind it and ahead of it. */
export function mainStraight(circuit: Circuit): { from: number; to: number } {
  const t = circuit.track;
  const n = t.samples.length;
  const straight = (i: number) => Math.abs(t.samples[((i % n) + n) % n].curve) < 1 / 700;
  let a = 0;
  while (straight(a - 1) && a > -n) a--;
  let b = 0;
  while (straight(b + 1) && b < n) b++;
  return { from: a * t.spacing, to: b * t.spacing };
}

/** The checks a layout has to pass to race well in the game. */
export function check(layout: CircuitLayout, circuit: Circuit): Check[] {
  const t = circuit.track;
  const n = t.samples.length;
  const straight = mainStraight(circuit);
  const straightLen = straight.to - straight.from;
  const tightest = Math.max(...t.samples.map((p) => Math.abs(p.curve)));
  const radius = tightest ? 1 / tightest : Infinity;
  // two stretches of track (more than a bend's worth apart along the lap) closer than both run-offs
  let closest = Infinity;
  const step = 4;
  for (let i = 0; i < n; i += step) {
    for (let j = i + step; j < n; j += step) {
      const along = Math.min(j - i, n - (j - i)) * t.spacing;
      if (along < 700) continue;
      // (the two stretches that cross on a bridge)
      if (atCrossing(t, i, j)) continue;
      const d = Math.hypot(t.samples[i].x - t.samples[j].x, t.samples[i].y - t.samples[j].y);
      closest = Math.min(closest, d);
    }
  }
  // (both tracks' widths and a strip of run-off between; the full run-off both sides is better, not needed)
  const apart = 2 * HALF_WIDTH + 64;
  const pitLen = layout.pit.to - layout.pit.from;
  const pitOnStraight = layout.pit.from >= straight.from && layout.pit.to <= straight.to;
  let grade = 0;
  for (const p of t.samples) {
    const g = groundAt(circuit.grid, p.x, p.y);
    grade = Math.max(grade, Math.abs(g.gx * Math.sin(p.dir) - g.gy * Math.cos(p.dir)));
  }
  // a bridge: both stretches at the same height where they cross (the deck's lift does the rest)
  const bridgeCheck: Check[] = [];
  if (layout.bridge) {
    const at = (px: number) => heightAt(layout.elevation, (((px / t.length) % 1) + 1) % 1);
    const gap = Math.abs(at(layout.bridge.over) - at(layout.bridge.under));
    bridgeCheck.push({ label: 'bridge', value: `the two stretches ${gap.toFixed(1)} px apart in height where they cross (under 2: give their points the same height there)`, ok: gap < 2 });
  }
  return [
    ...bridgeCheck,
    { label: 'lap', value: `${Math.round(t.length)} px`, ok: t.length > 3000 },
    { label: 'main straight', value: `${Math.round(straightLen)} px (${Math.round(straight.from)} to ${Math.round(straight.to)}; ${PIT_STRAIGHT_MIN} needed)`, ok: straightLen >= PIT_STRAIGHT_MIN },
    { label: 'pit lane', value: `${Math.round(pitLen)} px (${PIT_LANE_MIN} needed)${pitOnStraight ? ', on the straight' : ', off the straight'}`, ok: pitLen >= PIT_LANE_MIN && pitOnStraight },
    { label: 'tightest bend', value: `radius ${Number.isFinite(radius) ? Math.round(radius) : '∞'} px (${HALF_WIDTH - 4} at least: the kerbs and edge lines never cross)`, ok: radius >= HALF_WIDTH - 4 },
    { label: 'stretches apart', value: `${Number.isFinite(closest) ? Math.round(closest) : '∞'} px (${apart} at least)`, ok: closest >= apart },
    { label: 'steepest grade', value: `${grade.toFixed(3)} (under 0.2)`, ok: grade < 0.2 },
  ];
}

/** An AI car's lap of the circuit on the real physics: its time (s), or none if it didn't get round in 2 minutes, and the damage it took. */
export function aiLap(circuit: Circuit): { time?: number; damage: number } {
  const f1 = carClass('f1');
  const start = circuit.slots[0];
  const car = newCar(f1, start.x, start.y, start.heading);
  const { track, grid } = circuit;
  let p = newProgress(track.samples.length - 3);
  for (let t = 0; t < 120 && p.lap < 1; t += 1 / 60) {
    stepCar(car, aiInput(car, track, p.idx, { lane: 0, pace: 1 }), RACE_HANDLING, 1 / 60, grid);
    p = stepProgress(p, track, car, t, 3, 1 / 60);
  }
  return { time: p.lapTimes[0], damage: f1.health - car.health };
}

/** A fresh layout to start from: a rounded rectangle, clockwise, its main straight long enough for the pits. */
export function blankDraft(): Draft {
  const pts: DraftPoint[] = [];
  const w = 1400;
  const hgt = 700;
  const r = 260;
  // the main straight along the top, heading east, the line a little way along it
  const corners = [
    { cx: w - r, cy: r, a0: -Math.PI / 2 },
    { cx: w - r, cy: hgt - r, a0: 0 },
    { cx: r, cy: hgt - r, a0: Math.PI / 2 },
    { cx: r, cy: r, a0: Math.PI },
  ];
  pts.push({ x: 600, y: 0, h: 10 }, { x: 900, y: 0, h: 10 });
  for (const c of corners) {
    for (let k = 0; k <= 3; k++) {
      const a = c.a0 + (k / 3) * (Math.PI / 2);
      pts.push({ x: Math.round(c.cx + Math.cos(a) * r), y: Math.round(c.cy + Math.sin(a) * r), h: 10 });
    }
  }
  pts.push({ x: 380, y: 0, h: 10 });
  // (no doubled points where the corners meet the straights)
  const clean = pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) > 20);
  return {
    id: 'new-circuit', name: 'New Circuit', about: 'clockwise · a blank to shape',
    scale: 1.4, points: clean, pit: { from: -380, to: 680, side: -1 }, extras: {},
  };
}

/** Where the lap crosses itself (for a bridge): px along the lap of the two stretches that cross, the first the one met first; none if it doesn't. */
export function findCrossing(circuit: Circuit): { a: number; b: number } | undefined {
  const t = circuit.track;
  const s = t.samples;
  const n = s.length;
  /** whether segment p→q crosses segment r→u */
  const cross = (p: { x: number; y: number }, q: { x: number; y: number }, r: { x: number; y: number }, u: { x: number; y: number }) => {
    const d = (q.x - p.x) * (u.y - r.y) - (q.y - p.y) * (u.x - r.x);
    if (Math.abs(d) < 1e-9) return false;
    const ta = ((r.x - p.x) * (u.y - r.y) - (r.y - p.y) * (u.x - r.x)) / d;
    const tb = ((r.x - p.x) * (q.y - p.y) - (r.y - p.y) * (q.x - p.x)) / d;
    return ta >= 0 && ta <= 1 && tb >= 0 && tb <= 1;
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 20; j < n; j++) {
      if (n - (j - i) < 20) continue;
      if (cross(s[i], s[(i + 1) % n], s[j], s[(j + 1) % n])) return { a: i * t.spacing, b: j * t.spacing };
    }
  }
  return undefined;
}

/** The middle of the draft's control points (layout units), and how far they reach from it. */
export function draftCentre(draft: Draft): { x: number; y: number; r: number } {
  const xs = draft.points.map((p) => p.x);
  const ys = draft.points.map((p) => p.y);
  const x = (Math.min(...xs) + Math.max(...xs)) / 2;
  const y = (Math.min(...ys) + Math.max(...ys)) / 2;
  return { x, y, r: Math.max(Math.max(...xs) - x, Math.max(...ys) - y) };
}

/** What a circuit stands in: parkland (grass), a forest, the desert (palms and camels), or a street circuit's town. */
export type Setting = 'park' | 'forest' | 'desert' | 'street';

export const settingOf = (draft: Draft): Setting => (draft.extras.street ? 'street' : draft.extras.forest ? 'forest' : draft.extras.desert ? 'desert' : 'park');

/** Put the draft in `setting` (a street circuit keeps its town's settings if it had them; else gets new ones: run-off, no sea yet). */
export function setSetting(draft: Draft, setting: Setting): void {
  const street = draft.extras.street;
  delete draft.extras.forest;
  delete draft.extras.desert;
  delete draft.extras.street;
  if (setting === 'forest') draft.extras.forest = true;
  if (setting === 'desert') draft.extras.desert = true;
  if (setting === 'street') draft.extras.street = street ?? { runoff: 28, sea: [] };
}

/** A square of `size` (layout units) round (x, y): a new sea's or lake's outline, to drag into shape. */
export const square = (x: number, y: number, size: number) =>
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => ({ x: Math.round(x + (u * size) / 2), y: Math.round(y + (v * size) / 2) }));
