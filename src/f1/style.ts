// The stage as it plays: the rally made for a phone, in the one view (CLASSIC: high, north up) pulled back and
// looking ahead of the car the way it's going, a car quick off the line that keeps most of its speed off the road,
// and a roadside that knocks you back rather than wrecking the car. The driving is Corner Cutters' (racing.ts:
// playerInput and wheelInput; race.ts picks one for the device you drive with).

import { REFERENCE, carClass, type CarClass, type HandlingParams } from '../engine/driving';
import { HD2D_VIEW } from '../engine/look';

export const TOP_DOWN = {
  /** the car's top speed against the reference car's (the rivals' times come from a run in the same car, so they scale with it) */
  speed: 1,
  /** s from a standstill to top speed at the reference (the reference car's: REFERENCE.zeroToTop) */
  zeroToTop: 1.1,
  /** the share of top speed and grip kept off the road (the reference car's: 0.25) */
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
  seconds: 1.6,
  /** the least share of the screen (along the way the car's going) kept behind it */
  behind: 0.2,
  /** the furthest the camera pulls back (TOP_DOWN.zoom is the nearest) */
  furthest: 0.3,
  /** s the camera takes to settle on a new way (a gentle ease: no pumping through a slide or a quick wiggle) */
  ease: 0.9,
};

/**
 * How much closer the camera sits than SIGHT's framing would put it (×): the car bigger and less road ahead. The
 * framing alone shows SIGHT.seconds of road at top speed; across a landscape screen that sat too far from the car, so
 * the camera is fixed at what was its MEDIUM setting (about 1.2 s of road at top speed the short way, nearer 2 s across).
 */
export const CAMERA_NEAR = 1.35;

/** The screen the stage is drawn on, in game px (the deck over it is a HUD round its edges). */
export interface SightScreen {
  width: number;
  height: number;
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

/** The screen (game px from its middle, y down), less `margin` all round. */
function clearOf(screen: SightScreen, margin = { x: 0, y: 0 }) {
  return { left: -screen.width / 2 + margin.x, right: screen.width / 2 - margin.x, top: -screen.height / 2 + margin.y, bottom: screen.height / 2 - margin.y };
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

/** The player's car (and the reference run's). */
export function rallyCar(): CarClass {
  return { ...carClass('f1', { ...REFERENCE, topSpeed: REFERENCE.topSpeed * TOP_DOWN.speed, zeroToTop: TOP_DOWN.zeroToTop }), offRoad: TOP_DOWN.offRoad };
}

/** The stage's driving rules: the roadside forgives, and doesn't roll the car. */
export function styleHandling(h: HandlingParams): HandlingParams {
  return { ...h, crashDamage: h.crashDamage * TOP_DOWN.crashDamage, crashThreshold: TOP_DOWN.crashThreshold, noRolls: true };
}

/** The key a stage's best time is kept under (as it was saved when TOP-DOWN was one of two styles, so those times stay). */
export const bestKey = (stageId: string) => `${stageId}@topdown`;
