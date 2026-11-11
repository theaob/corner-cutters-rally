// STYLE in the settings (src/engine/drive/settings.ts), as the stage plays it. TOP-DOWN is the rally made for one thumb
// on a phone: the CLASSIC view (high, north up) pulled back and looking ahead of the car the way it's going, the gas
// always on, a car a little slower than SIM's that keeps most of its speed off the road, and a roadside that knocks you
// back rather than wrecking the car. SIM is the stage as it was: the VIEW and GAS you pick,
// the full-speed car and the hard trees.

import { REFERENCE, carClass, type CarClass, type HandlingParams } from '../engine/driving';
import type { DriveStyle } from '../engine/drive/settings';
import { HD2D_VIEW } from '../engine/look';
import { lineCornerSpeed, type Track } from './racing';

export const TOP_DOWN = {
  /** the car's top speed against SIM's (the rivals' times come from a run in the same car, so they scale with it) */
  speed: 0.8,
  /** s from a standstill to top speed at the reference (SIM's: REFERENCE.zeroToTop) */
  zeroToTop: 1.4,
  /** the share of top speed and grip kept off the road (SIM's car: 0.25) */
  offRoad: 0.75,
  /** the crash damage against the difficulty's, and px/s of impact that do none at all */
  crashDamage: 0.35,
  crashThreshold: 110,
  /** the camera (CLASSIC's, north up): its zoom, and px it looks ahead of the car the way it's going at top speed, with
   * the road running up the screen (SIGHT: other ways it pulls back and looks further) */
  zoom: 0.55,
  lead: 120,
};

/**
 * How much road TOP-DOWN's camera shows ahead of the car, whichever way the road runs on the screen. North up, a
 * portrait screen is narrow across and tall: the road running up it shows plenty, across it (or down it, towards the
 * thumbs) far less. So the camera pulls back and looks further ahead the way the car's going, until the road shows
 * `seconds` ahead at top speed, keeping the car `behind` of the screen's span from the edge it's coming from.
 */
export const SIGHT = {
  /** s of road ahead at top speed, any way it runs */
  seconds: 1.8,
  /** the least share of the screen (along the way the car's going) kept behind it */
  behind: 0.2,
  /** the furthest the camera pulls back (TOP_DOWN.zoom is the nearest) */
  furthest: 0.3,
  /** game px at the top of a phone's screen under its top bar, and the share at the bottom under the thumbs */
  top: 20,
  thumbs: 0.25,
  /** s the camera takes to settle on a new way (a gentle ease: no pumping through a slide or a quick wiggle) */
  ease: 0.9,
};

/** The screen the stage is drawn on, in game px: a phone's has its deck over the bottom, a desktop's none. */
export interface SightScreen {
  width: number;
  height: number;
  desktop: boolean;
}

const { pitch: PITCH_DEG, fov: FOV_DEG } = HD2D_VIEW;
const SIN = Math.sin((PITCH_DEG * Math.PI) / 180);
const COS = Math.cos((PITCH_DEG * Math.PI) / 180);
/** game px from the lens to the screen (the camera's focal length) on a screen `height` tall */
const focal = (height: number) => height / 2 / Math.tan(((FOV_DEG / 2) * Math.PI) / 180);

/** Where a point of the ground (x, y px from the camera's aim; y south) is on `screen` at `zoom`: game px from its
 * middle (y down), through the lens of the CLASSIC view (race.ts: the camera above, `HD2D_VIEW.pitch` down, north up). */
export function onScreen(x: number, y: number, screen: SightScreen, zoom: number): { x: number; y: number } {
  // (further north is further from the lens, so smaller)
  const w = 1 - (y * zoom * COS) / focal(screen.height);
  return { x: (zoom * x) / w, y: (zoom * y * SIN) / w };
}

/** The part of the screen clear of the top bar and the thumbs (game px from its middle, y down), less `margin` all round. */
function clearOf(screen: SightScreen, margin = { x: 0, y: 0 }) {
  const top = screen.desktop ? 0 : SIGHT.top;
  const bottom = screen.desktop ? 0 : SIGHT.thumbs * screen.height;
  return { left: -screen.width / 2 + margin.x, right: screen.width / 2 - margin.x, top: -screen.height / 2 + top + margin.y, bottom: screen.height / 2 - bottom - margin.y };
}
type Clear = ReturnType<typeof clearOf>;
const inside = (q: { x: number; y: number }, c: Clear) => q.x >= c.left && q.x <= c.right && q.y >= c.top && q.y <= c.bottom;

/** The most of `from`…`to` for which `ok` holds, `ok` holding up to a point and not past it. */
function most(from: number, to: number, ok: (v: number) => boolean): number {
  if (ok(to)) return to;
  if (!ok(from)) return from;
  let lo = from;
  let hi = to;
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    if (ok(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** px of road the camera shows ahead of a car going (ux, uy) (a unit) at top speed, aimed `lead` px ahead of it at `zoom` */
function ahead(ux: number, uy: number, screen: SightScreen, zoom: number, lead: number): number {
  const c = clearOf(screen);
  return most(0, 4000, (t) => inside(onScreen(ux * (t - lead), uy * (t - lead), screen, zoom), c));
}

/**
 * TOP-DOWN's camera for a car going (dx, dy) on the map (y south) on `screen`: its zoom, and px it looks ahead at top
 * speed (`topSpeed` px/s). The road ahead shows SIGHT.seconds of it at top speed where the screen allows (as near as
 * that can be, TOP_DOWN's own zoom at the nearest), with the car SIGHT.behind of the clear screen from its edges.
 */
export function topDownFraming(dx: number, dy: number, screen: SightScreen, topSpeed: number): { zoom: number; lead: number } {
  const len = Math.hypot(dx, dy);
  const ux = len > 0 ? dx / len : 0;
  const uy = len > 0 ? dy / len : -1;
  const c0 = clearOf(screen);
  const keep = clearOf(screen, { x: SIGHT.behind * (c0.right - c0.left), y: SIGHT.behind * (c0.bottom - c0.top) });
  /** the furthest ahead the camera can aim at `zoom` with the car still kept in from the edges */
  const furthest = (zoom: number) => most(0, 2000, (lead) => inside(onScreen(-ux * lead, -uy * lead, screen, zoom), keep));
  const need = SIGHT.seconds * topSpeed;
  const zoom = most(SIGHT.furthest, TOP_DOWN.zoom, (z) => ahead(ux, uy, screen, z, furthest(z)) >= need);
  const room = furthest(zoom);
  // as far ahead as shows `need` (TOP_DOWN's lead at least), and no further than keeps the car in
  const want = Math.max(TOP_DOWN.lead, most(0, room, (l) => ahead(ux, uy, screen, zoom, l) < need));
  return { zoom, lead: Math.min(room, want) };
}

/** px of road the camera shows ahead of a car going (dx, dy) at top speed, aimed `lead` px ahead of it at `zoom`. */
export function sightAhead(dx: number, dy: number, screen: SightScreen, zoom: number, lead: number): number {
  const len = Math.hypot(dx, dy) || 1;
  return ahead(dx / len, dy / len, screen, zoom, lead);
}

/** The player's car (and the reference run's) in `style`. */
export function rallyCar(style: DriveStyle): CarClass {
  if (style === 'sim') return carClass('f1');
  return { ...carClass('f1', { ...REFERENCE, topSpeed: REFERENCE.topSpeed * TOP_DOWN.speed, zeroToTop: TOP_DOWN.zeroToTop }), offRoad: TOP_DOWN.offRoad };
}

/** The stage's driving rules in `style`: TOP-DOWN's roadside forgives, and doesn't roll the car. */
export function styleHandling(h: HandlingParams, style: DriveStyle): HandlingParams {
  if (style === 'sim') return h;
  return { ...h, crashDamage: h.crashDamage * TOP_DOWN.crashDamage, crashThreshold: TOP_DOWN.crashThreshold, noRolls: true };
}

/** The key a stage's best time is kept under: TOP-DOWN's times are their own (a slower car). */
export const bestKey = (stageId: string, style: DriveStyle) => (style === 'sim' ? stageId : `${stageId}@topdown`);

/**
 * CONTROL: POINT's own speed: the car slows for the road ahead without being asked. Each bend is taken at `share` of
 * what the car can turn through along the road's middle (not the racing line, which is wider and quicker: you're
 * near the middle, the road pulling you there), braked for at `brake` of the car's full braking, looking `reach` px
 * ahead (more than the hardest stop from top speed needs).
 */
export const AUTO_SPEED = { share: 0.92, brake: 0.75, reach: 700, smooth: 2 };

/** px/s the car can be going at each of `track`'s samples and still take the road ahead (CONTROL: POINT), its tyres
 * gripping `grip` as well as new (worn, or on the wrong surface: less, and slower round the bends). */
export function autoSpeed(track: Track, cls: CarClass, h: HandlingParams): (idx: number, grip?: number) => number {
  const n = track.samples.length;
  const corner = lineCornerSpeed(cls, h, AUTO_SPEED.share);
  const at = (k: number) => track.samples[track.open ? Math.max(0, Math.min(n - 1, k)) : ((k % n) + n) % n];
  // (each sample's bend: the tightest of its neighbours', so a kink in the road's curve doesn't slip through)
  const own = track.samples.map((_, k) => {
    let c = 0;
    for (let j = -AUTO_SPEED.smooth; j <= AUTO_SPEED.smooth; j++) c = Math.max(c, Math.abs(at(k + j).curve));
    return corner(c);
  });
  const decel = (cls.topSpeed / cls.brakeTime) * AUTO_SPEED.brake;
  const steps = Math.ceil(AUTO_SPEED.reach / track.spacing);
  return (idx, grip = 1) => {
    let safe = cls.topSpeed;
    for (let k = 0; k <= steps; k++) {
      const j = idx + k;
      if (track.open && j >= n) break;
      const v = own[((j % n) + n) % n] * Math.min(1, grip);
      if (v >= safe) continue;
      safe = Math.min(safe, Math.sqrt(v * v + 2 * decel * k * track.spacing));
    }
    return safe;
  };
}
