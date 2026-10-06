// The circuit as a line in 3D, for the menu: its centreline at the heights the
// lap climbs and falls to, seen from above at an angle and turning slowly, the
// heights drawn taller than they are so a hill reads at a glance. Drawn on a
// plain 2D canvas (no WebGL), each bit of the line coloured by how high it is
// (low cool, high warm), with a faint shadow of it on the ground and posts down
// to it, nearer parts over farther ones.

import { BRIDGE } from './bridge';
import { elevationAt } from './circuit';
import type { CircuitLayout } from './layouts';
import { smoothLoop } from './racing';

export const TRACK_MODEL = {
  /** px between the line's points (at the layout's scale) */
  spacing: 24,
  /** how much taller the heights are drawn than they are (the same for every circuit, so a flat one looks flat) */
  rise: 8,
  /** the view's angle down from the horizontal (deg) */
  pitch: 34,
  /** s for a whole turn round */
  turn: 24,
  /** a post down to the ground every this many points */
  postEvery: 6,
  /** px kept clear round the edge of the drawing */
  pad: 6,
  /** the colours for the lowest and highest points of a lap */
  low: [86, 190, 255] as const,
  high: [255, 176, 64] as const,
};

/** A point of the line: on the ground (x, y, px) and how high (px, as it is). */
export interface ModelPt {
  x: number;
  y: number;
  h: number;
}

export interface TrackModel {
  /** the centreline, from the start line, in racing order */
  pts: ModelPt[];
  /** its middle on the ground, and how far its furthest point is from there */
  cx: number;
  cy: number;
  radius: number;
  /** its lowest and highest points (px) */
  hMin: number;
  hMax: number;
}

/** `layout`'s centreline, at the heights its elevation profile gives along the lap. */
export function trackModel(layout: CircuitLayout): TrackModel {
  const control = layout.points.map((p) => ({ x: p.x * layout.scale, y: p.y * layout.scale }));
  const line = smoothLoop(control, TRACK_MODEL.spacing);
  const n = line.length;
  // (on a bridge, the stretch over it lifted as the cars are: up its ramp, over, and down)
  const bridge = layout.bridge;
  const lift = (i: number) => {
    if (!bridge) return 0;
    const len = n * TRACK_MODEL.spacing;
    let d = Math.abs(i * TRACK_MODEL.spacing - bridge.over);
    d = Math.min(d, len - d);
    const t = d <= BRIDGE.flat ? 1 : 1 - (d - BRIDGE.flat) / BRIDGE.ramp;
    return t <= 0 ? 0 : bridge.height * t * t * (3 - 2 * t);
  };
  const pts = line.map((p, i) => ({ x: p.x, y: p.y, h: elevationAt(layout.elevation, i / n) + lift(i) }));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const radius = Math.max(...pts.map((p) => Math.hypot(p.x - cx, p.y - cy)));
  const hs = pts.map((p) => p.h);
  return { pts, cx, cy, radius, hMin: Math.min(...hs), hMax: Math.max(...hs) };
}

/** Where the model is drawn: px per px, and the screen point under its middle at its lowest height. */
export interface ModelView {
  k: number;
  ox: number;
  oy: number;
}

/** A view fitting `m` into w×h px however far round it has turned (so it never changes size as it turns). */
export function fitModel(m: TrackModel, w: number, h: number): ModelView {
  const pitch = (TRACK_MODEL.pitch * Math.PI) / 180;
  const relief = (m.hMax - m.hMin) * TRACK_MODEL.rise * Math.cos(pitch);
  const across = 2 * m.radius;
  const tall = 2 * m.radius * Math.sin(pitch) + relief;
  const k = Math.min((w - 2 * TRACK_MODEL.pad) / across, (h - 2 * TRACK_MODEL.pad) / tall);
  // (the ground's middle a little low, so the hills' extra height above it fits)
  return { k, ox: w / 2, oy: h / 2 + (relief * k) / 2 };
}

/** A point projected: on the screen, and how near (bigger nearer). */
export interface Projected {
  x: number;
  y: number;
  depth: number;
}

/** `p` (at height `h`, px as it is) seen from `yaw` round (rad). */
export function project(m: TrackModel, view: ModelView, p: { x: number; y: number }, h: number, yaw: number): Projected {
  const pitch = (TRACK_MODEL.pitch * Math.PI) / 180;
  const dx = p.x - m.cx;
  const dy = p.y - m.cy;
  const u = dx * Math.cos(yaw) - dy * Math.sin(yaw);
  const v = dx * Math.sin(yaw) + dy * Math.cos(yaw);
  return {
    x: view.ox + u * view.k,
    y: view.oy + (v * Math.sin(pitch) - (h - m.hMin) * TRACK_MODEL.rise * Math.cos(pitch)) * view.k,
    depth: v,
  };
}

/** The colour (rgb) for height `h`: the lap's lowest cool, its highest warm. */
export function heightColor(m: TrackModel, h: number): [number, number, number] {
  const t = m.hMax > m.hMin ? (h - m.hMin) / (m.hMax - m.hMin) : 0.5;
  const { low, high } = TRACK_MODEL;
  return [0, 1, 2].map((c) => Math.round(low[c] + (high[c] - low[c]) * t)) as [number, number, number];
}

/** Draw `m` on `ctx` (w×h px), turned `yaw` round. */
export function drawModel(ctx: CanvasRenderingContext2D, m: TrackModel, view: ModelView, w: number, h: number, yaw: number) {
  ctx.clearRect(0, 0, w, h);
  const { pts } = m;
  const n = pts.length;
  const top = pts.map((p) => project(m, view, p, p.h, yaw));
  const ground = pts.map((p) => project(m, view, p, m.hMin, yaw));
  const s = view.k * TRACK_MODEL.spacing; // (a point's spacing on the screen, for the line's width)
  ctx.lineJoin = ctx.lineCap = 'round';
  // the shadow on the ground
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.lineWidth = Math.max(4, s * 1.2);
  ctx.beginPath();
  ground.forEach((g, i) => (i ? ctx.lineTo(g.x, g.y) : ctx.moveTo(g.x, g.y)));
  ctx.closePath();
  ctx.stroke();
  // posts down to it, and the line itself, nearer over farther
  const bits: { depth: number; draw: () => void }[] = [];
  for (let i = 0; i < n; i += TRACK_MODEL.postEvery) {
    const [a, b] = [top[i], ground[i]];
    if (a.y >= b.y - 1) continue;
    bits.push({
      depth: a.depth - 1,
      draw: () => {
        ctx.strokeStyle = 'rgba(244, 242, 250, 0.3)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      },
    });
  }
  for (let i = 0; i < n; i++) {
    const [a, b] = [top[i], top[(i + 1) % n]];
    const [r, g, bl] = heightColor(m, (pts[i].h + pts[(i + 1) % n].h) / 2);
    bits.push({
      depth: (a.depth + b.depth) / 2,
      draw: () => {
        ctx.strokeStyle = `rgb(${r}, ${g}, ${bl})`;
        ctx.lineWidth = Math.max(5, s * 1.6);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      },
    });
  }
  bits.sort((p, q) => p.depth - q.depth);
  for (const b of bits) b.draw();
  // the start line
  const [a, b] = [top[0], top[1]];
  const along = Math.atan2(b.y - a.y, b.x - a.x);
  const half = Math.max(5, s * 2.2);
  ctx.strokeStyle = '#f4f2fa';
  ctx.lineWidth = Math.max(2, s * 0.8);
  ctx.beginPath();
  ctx.moveTo(a.x - Math.sin(along) * half, a.y + Math.cos(along) * half);
  ctx.lineTo(a.x + Math.sin(along) * half, a.y - Math.cos(along) * half);
  ctx.stroke();
}
