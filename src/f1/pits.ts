// The pit lane and pit stops. The lane runs beside the main straight, behind
// a pit wall: a car that leaves the track at the pit entry is committed, and
// from there it drives itself: down the lane on the speed limiter, into its
// team's box, stopped while the crew fits new tyres and repairs its damage, and
// back out onto the track at the exit. Engine-free, so a stop runs in a test as in the game.

import { speedOf, type Car, type DriveInput } from '../engine/driving';
import { lateralOffset, type Pt, type Track } from './racing';
import { stopNow, wearPerLap, type TyreSet } from './tyres';

export const PIT = {
  /** px from the track's centreline out to the lane's centre */
  offset: 130,
  /** px along the track the lane takes to move out from the track, and back in (the entry and exit roads) */
  taper: 360,
  /** px from the centreline where the lane starts and ends, on the track (toward its edge, off the racing line) */
  joinAt: 32,
  /** px/s: the pit lane speed limit (an F1 car's top speed is 320), between the speed-limit lines across the lane */
  limit: 120,
  /** px/s: the most a car does on the entry road, before the first speed-limit line (up the exit road, past the second, it's back up to speed) */
  road: 160,
  /** px from the track's centreline within which a car on the entry road is still on the track (past its edge): it doesn't brake there, in the way of the cars racing behind */
  onTrack: 54,
  /** px across the lane (+ = away from the track) of the fast lane, and of the boxes beside it */
  fastLane: -20,
  boxLane: 24,
  /** boxes along the lane, one per team, and the px between them */
  boxes: 5,
  boxSpacing: 60,
  /** seconds a stop takes with nothing to repair (new tyres on, jacks down) */
  stop: 1.2,
  /** seconds to repair a car from no health to full; a stop repairs its share of that */
  repair: 3,
  /** px off the track edge on the pit side, inside the pit zone, that commits a car to the pit lane */
  commit: 52,
  /** px/s² a car brakes at into its box */
  decel: 300,
  /** after the race: seconds a car sits in its box before the crew pushes it back into the garage, and seconds the push takes */
  garageWait: 0.6,
  garagePush: 2.2,
  /** px along from the garage's middle where a team's first and second car home end up, side by side */
  garageSlots: [10, -10] as const,
  /** where the champagne ceremony is set (podium3d.ts): px past the start line (P1, P2, P3's places), and px out from the centreline on the pit side */
  podium: [170, 115, 60] as const,
  podiumAcross: 30,
};

/** Where a circuit's pit lane is: px along the lap from the start line (negative = before it), and which side. */
export interface PitSpec {
  from: number;
  to: number;
  /** −1 = left of the track, in the direction of the race; 1 = right */
  side: -1 | 1;
}

export interface PitLanePoint extends Pt {
  /** px along the lane from its start */
  s: number;
  /** direction of travel, radians (as the track's) */
  dir: number;
  /** the track sample beside it */
  idx: number;
  /** px out from the track's centreline */
  off: number;
}

export interface PitLane {
  side: -1 | 1;
  /** the lane's centreline, entry to exit, one point per track sample */
  points: PitLanePoint[];
  /** px along the lane */
  length: number;
  /** track samples where it leaves the track and rejoins it */
  entry: number;
  exit: number;
  /** track samples between which the lane is fully out, behind the pit wall */
  wallFrom: number;
  wallTo: number;
  /** px along the lane of each box */
  boxes: number[];
  /** px along the lane of the speed-limit lines (where the pit wall starts and ends): the limit holds between them */
  limitFrom: number;
  limitTo: number;
  /** after the race: the top three's parking spots on the main straight (P1 furthest on), as a track sample and px to the right of it */
  podium: { idx: number; lane: number }[];
}

/** track samples either side each point of the lane is averaged over, to smooth the entry and exit roads */
const SMOOTH = 10;

/** px of the lane, fully out, that the boxes take (with room either side) */
const BOX_RUN = (PIT.boxes - 1) * PIT.boxSpacing + 80;

/**
 * The shortest a pit lane can be (px along the track): the entry road, the boxes' run between the
 * speed-limit lines, and the exit road. A circuit's main straight is at least PIT_STRAIGHT_MIN, so the
 * whole lane lies on it with a little to spare at either end, its roads never bending round a corner.
 */
export const PIT_LANE_MIN = 2 * PIT.taper + BOX_RUN;
export const PIT_STRAIGHT_MIN = PIT_LANE_MIN + 80;

const ease = (t: number) => (1 - Math.cos(Math.max(0, Math.min(1, t)) * Math.PI)) * 0.5;
const wrap = (i: number, n: number) => ((i % n) + n) % n;

/** The pit lane for `spec` beside `track`. */
export function buildPitLane(track: Track, spec: PitSpec): PitLane {
  const n = track.samples.length;
  const entry = wrap(Math.round(spec.from / track.spacing), n);
  const count = Math.round((spec.to - spec.from) / track.spacing) + 1;
  const along = (count - 1) * track.spacing;
  // (the entry and exit roads their full length; a layout gives the lane at least PIT_LANE_MIN, tested)
  const taper = Math.min(PIT.taper, (along - BOX_RUN) / 2);
  const raw = Array.from({ length: count }, (_, k) => {
    const idx = wrap(entry + k, n);
    const p = track.samples[idx];
    const d = k * track.spacing;
    const off = PIT.joinAt + (PIT.offset - PIT.joinAt) * Math.min(ease(d / taper), ease((along - d) / taper));
    const o = off * spec.side;
    return { x: p.x + Math.cos(p.dir) * o, y: p.y + Math.sin(p.dir) * o, idx, off };
  });
  // the entry and exit roads smoothed, so they don't copy every wiggle of the track beside them (a chicane before
  // the straight): each point the average of its neighbours, fewer of them toward the ends (which stay on the track)
  const tapered = Math.round(taper / track.spacing);
  const smooth = raw.map((p, k) => {
    // (none along the boxes, between the speed-limit lines)
    const w = Math.min(SMOOTH, k, count - 1 - k, Math.max(0, tapered - k, k - (count - 1 - tapered)));
    let x = 0;
    let y = 0;
    for (let j = k - w; j <= k + w; j++) {
      x += raw[j].x;
      y += raw[j].y;
    }
    x /= 2 * w + 1;
    y /= 2 * w + 1;
    // (how far out it is now, from its track sample)
    const t = track.samples[p.idx];
    const off = ((x - t.x) * Math.cos(t.dir) + (y - t.y) * Math.sin(t.dir)) * spec.side;
    return { x, y, idx: p.idx, off };
  });
  let s = 0;
  const points = smooth.map((p, k) => {
    if (k) s += Math.hypot(p.x - smooth[k - 1].x, p.y - smooth[k - 1].y);
    const a = smooth[Math.max(0, k - 1)];
    const b = smooth[Math.min(count - 1, k + 1)];
    return { ...p, s, dir: Math.atan2(b.x - a.x, -(b.y - a.y)) };
  });
  const wallFrom = wrap(entry + tapered, n);
  const wallTo = wrap(entry + count - 1 - tapered, n);
  // the boxes: centred along the fully-out part, closer together if it's short
  const s0 = points[tapered].s + 30;
  const s1 = points[count - 1 - tapered].s - 30;
  const gap = Math.min(PIT.boxSpacing, (s1 - s0) / Math.max(1, PIT.boxes - 1));
  const mid = (s0 + s1) / 2;
  const boxes = Array.from({ length: PIT.boxes }, (_, b) => mid + (b - (PIT.boxes - 1) / 2) * gap);
  // the ceremony's places: on the pit side of the main straight, just past the line (the podium stands across from them)
  const podium = PIT.podium.map((d) => ({ idx: wrap(Math.round(d / track.spacing), n), lane: PIT.podiumAcross * spec.side }));
  return { side: spec.side, points, length: s, entry, exit: wrap(entry + count - 1, n), wallFrom, wallTo, boxes, limitFrom: points[tapered].s, limitTo: points[count - 1 - tapered].s, podium };
}

/** Whether lane position `s` (px along the lane) is between the speed-limit lines. */
export const inLimitZone = (pit: PitLane, s: number) => s >= pit.limitFrom && s <= pit.limitTo;

/** Whether track sample `idx` is between `from` and `to` (inclusive), going the way of the race. */
export function between(idx: number, from: number, to: number, n: number): boolean {
  return wrap(idx - from, n) <= wrap(to - from, n);
}

/** Index of the lane point nearest (x, y): near `hint` when given, else along the whole lane. */
export function nearestLanePoint(pit: PitLane, x: number, y: number, hint?: number): number {
  let best = hint ?? 0;
  let bestD = Infinity;
  const from = hint === undefined ? 0 : Math.max(0, hint - 12);
  const to = hint === undefined ? pit.points.length - 1 : Math.min(pit.points.length - 1, hint + 12);
  for (let k = from; k <= to; k++) {
    const p = pit.points[k];
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bestD) [best, bestD] = [k, d];
  }
  return best;
}

/** A car's way through the pit lane. */
export interface PitStop {
  /** 'in': down the lane to its box; 'stopped': being repaired; 'out': on to the exit; after the race, 'garage': pushed back into (and then in) the garage */
  phase: 'in' | 'stopped' | 'out' | 'garage';
  /** the lane point it's nearest */
  at: number;
  /** the box it stops at (an index into the lane's boxes) */
  box: number;
  /** seconds of the stop left */
  left: number;
  /** seconds the stop takes in all */
  time: number;
  /** after the race: the car's way home, to its box and back into its garage (no stop, no repairs), to end up this many px along from the garage's middle */
  home?: number;
  /** pushed into the garage: where it stopped in the box, and seconds of the push done */
  push?: { x: number; y: number; heading: number; done: number };
}

/** Seconds a stop takes for `car`: the fixed part, and the repair its damage needs. */
export const stopTime = (car: Car) => PIT.stop + PIT.repair * (1 - car.health / car.cls.health);

/** Whether `car`, on the track near sample `idx`, has turned into the pit entry (and so is committed to the lane). */
export function entersPit(pit: PitLane, track: Track, car: Car, idx: number): boolean {
  if (car.wrecked || !between(idx, pit.entry, pit.wallTo, track.samples.length)) return false;
  return lateralOffset(track, idx, car.x, car.y) * pit.side > PIT.commit;
}

/** A pit stop starting at the entry, heading for `box`; with `home`, the car's way back to its garage after the race (to end up `home` px along from its middle). */
export function newPitStop(pit: PitLane, car: Car, box: number, home?: number): PitStop {
  return { phase: 'in', at: nearestLanePoint(pit, car.x, car.y), box: Math.max(0, Math.min(pit.boxes.length - 1, box)), left: 0, time: 0, home };
}

/** px across the lane (+ = away from the track) of the middle of the garages behind it (just past its outer edge) */
export const GARAGE_ACROSS = 74;

/**
 * Where a car that's home after the race is, `done` s into the crew's push back
 * into its garage: it rolls backwards from its box, turning to face out, and
 * ends up inside, nose to the door. Moves the car there, stopped.
 */
export function pushIntoGarage(pit: PitLane, stop: PitStop, car: Car): void {
  const push = stop.push!;
  const q = pit.points.find((p) => p.s >= pit.boxes[stop.box]) ?? pit.points[pit.points.length - 1];
  const across = GARAGE_ACROSS * pit.side;
  const along = stop.home ?? 0;
  const to = {
    x: q.x + Math.cos(q.dir) * across + Math.sin(q.dir) * along,
    y: q.y + Math.sin(q.dir) * across - Math.cos(q.dir) * along,
    heading: q.dir - (pit.side * Math.PI) / 2,
  };
  const t = ease(push.done / PIT.garagePush);
  // the turn first, then the roll back
  const turn = ease(Math.min(1, (push.done / PIT.garagePush) * 1.6));
  const d = Math.atan2(Math.sin(to.heading - push.heading), Math.cos(to.heading - push.heading));
  car.x = push.x + (to.x - push.x) * t;
  car.y = push.y + (to.y - push.y) * t;
  car.heading = push.heading + d * turn;
  car.vx = car.vy = 0;
}

/**
 * A would-be race engineer: whether a car at the pit entry should stop now,
 * weighing the time its worn tyres and damage will cost over the laps left
 * against the stop (see tyres.ts), stopping now, later or not at all.
 * `lapTime` is a lap on new tyres.
 */
export function wantsPit(car: Car, tyres: TyreSet, lapsLeft: number, lapTime: number, damageSlow: number, trackLength: number): boolean {
  if (car.wrecked) return false;
  return stopNow({
    lapsLeft, lapTime, wear: tyres.wear, perLap: wearPerLap(tyres, trackLength),
    damage: 1 - car.health / car.cls.health, damageSlow, stopTime: stopTime(car),
  });
}

/** px across from the lane's centre past which a car isn't in the lane (it's on the track beside it) */
const LANE_REACH = 50;

/** px across the lane (+ = away from the track) a car in `stop` aims for at lane position `s`: on the entry and exit roads, the middle of the road (which meets the track at its edge); between the speed-limit lines, the fast lane or its box. */
function laneTarget(pit: PitLane, stop: PitStop, s: number): number {
  const box = pit.boxes[stop.box];
  if (s < pit.limitFrom - 40 || s > pit.limitTo + 40) return 0;
  if (stop.phase === 'out' && s > box + 60) return PIT.fastLane;
  if (stop.phase === 'stopped') return PIT.boxLane;
  // swing over into the box line over a few car lengths, all the way over a car length before the box (so one
  // waiting there behind its teammate is clear of the fast lane), and back out after
  const t = stop.phase === 'in' ? 1 - (box - s - 40) / 80 : 1 - (s - box) / 60;
  return PIT.fastLane + (PIT.boxLane - PIT.fastLane) * ease(t);
}

/**
 * Drive `car` through the pit lane: to its box on the limiter, stopped there,
 * then out to the exit, keeping behind a car ahead in the same line. Moves the
 * stop on (the box, the repair, the way out); returns the input for this step
 * and whether the car has reached the exit.
 */
export function pitStep(pit: PitLane, stop: PitStop, car: Car, others: Car[], dt: number): { input: DriveInput; done: boolean; stopped: boolean; repaired?: boolean } {
  stop.at = nearestLanePoint(pit, car.x, car.y, stop.at);
  const here = pit.points[stop.at];
  const v = speedOf(car);
  const box = pit.boxes[stop.box];
  let stopped = false;
  let repaired = false;
  if (stop.home !== undefined && stop.phase === 'in' && here.s >= box - 6 && v < 8) {
    // home after the race: a moment in the box, then the crew push it back into the garage
    stop.phase = 'stopped';
    stop.time = stop.left = PIT.garageWait;
  }
  if (stop.home !== undefined && stop.phase === 'stopped') {
    stop.left -= dt;
    if (stop.left <= 0) {
      stop.phase = 'garage';
      stop.push = { x: car.x, y: car.y, heading: car.heading, done: 0 };
    }
    return { input: { handbrake: true, brake: true }, done: false, stopped, repaired };
  }
  if (stop.phase === 'garage') {
    stop.push!.done = Math.min(PIT.garagePush, stop.push!.done + dt);
    pushIntoGarage(pit, stop, car);
    return { input: { handbrake: true, brake: true }, done: false, stopped, repaired };
  }
  if (stop.phase === 'in' && here.s >= box - 6 && v < 8) {
    stop.phase = 'stopped';
    stop.time = stop.left = stopTime(car);
    stopped = true;
    // the fire's out, and the repair starts
    car.burn = undefined;
  }
  if (stop.phase === 'stopped') {
    const rate = car.cls.health / PIT.repair;
    car.health = Math.min(car.cls.health, car.health + rate * dt);
    stop.left -= dt;
    if (stop.left > 0) return { input: { handbrake: true, brake: true }, done: false, stopped, repaired };
    car.health = car.cls.health;
    stop.phase = 'out';
    // (the crew done: the car whole again, the parts torn off it fitted back)
    repaired = true;
  }
  if (stop.at >= pit.points.length - 1 || (stop.phase === 'out' && here.s >= pit.length - 4)) return { input: { handbrake: false }, done: true, stopped, repaired };

  // aim a little ahead along the lane, in this car's line across it
  const ahead = pit.points[Math.min(pit.points.length - 1, stop.at + Math.max(2, Math.round((20 + v * 0.25) / 8)))];
  const across = laneTarget(pit, stop, ahead.s) * pit.side;
  const tx = ahead.x + Math.cos(ahead.dir) * across;
  const ty = ahead.y + Math.sin(ahead.dir) * across;
  // the limit between the speed-limit lines; on the entry road, slowing to reach the first line at it; up the exit road, back up to speed
  const zone = inLimitZone(pit, here.s);
  let want = zone ? PIT.limit : here.s < pit.limitFrom ? Math.min(PIT.road, Math.sqrt(PIT.limit ** 2 + 2 * PIT.decel * (pit.limitFrom - here.s))) : car.cls.topSpeed;
  if (stop.phase === 'in') want = Math.min(want, Math.sqrt(2 * PIT.decel * Math.max(0, box - here.s)) + 4);
  // (still on the track at the start of the entry road: no braking yet)
  if (stop.phase === 'in' && here.s < pit.limitFrom && here.off < PIT.onTrack) want = Math.max(want, v);
  // a car ahead in the same line: keep behind it (a car stopped in a box further down isn't in the way). Ahead by
  // how far along the lane each is (not by heading: on a bend two cars side by side would each see the other ahead)
  const mine = laneTarget(pit, stop, here.s);
  for (const o of others) {
    const k = nearestLanePoint(pit, o.x, o.y, stop.at);
    const q = pit.points[k];
    const along = q.s - here.s;
    // (as far ahead as it takes to stop from this speed)
    if (along <= 0 || along > 60 + (v * v) / (2 * PIT.decel)) continue;
    const theirs = ((o.x - q.x) * Math.cos(q.dir) + (o.y - q.y) * Math.sin(q.dir)) * pit.side;
    // (one off the lane altogether, out on the track, isn't in it; one swinging into or out of a box, part way
    // across, is in the way too; one stopped in a box isn't)
    if (Math.abs(theirs) > LANE_REACH || Math.abs(theirs - mine) > 26) continue;
    // keep a gap: no faster than it can slow to their speed over the room left; too close, a little slower than
    // them (stopped, if they are: a queue at a box), not a stop dead behind a car that's moving
    want = Math.min(want, along < 34 ? speedOf(o) * 0.7 : Math.sqrt(speedOf(o) ** 2 + 2 * PIT.decel * (along - 34)));
  }
  const dx = tx - car.x;
  const dy = ty - car.y;
  const d = Math.hypot(dx, dy) || 1;
  const mag = Math.max(0.05, Math.min(1, want / car.cls.topSpeed));
  return { input: { steer: { x: (dx / d) * mag, y: (dy / d) * mag }, handbrake: false, brake: v > want + 6 || want === 0, limit: zone ? PIT.limit : here.s < pit.limitFrom ? PIT.road : undefined }, done: false, stopped, repaired };
}
