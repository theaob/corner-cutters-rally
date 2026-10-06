// F1 racing rules: a closed track as a smooth centreline,
// the speed each part of it can be taken at, lap and sector timing, race
// standings, and AI drivers that follow the racing line. Engine-free and
// unit-tested; the circuit layout and rendering live in circuit.ts and race.ts.

import type { Levels } from './bridge';
import { DEFAULT_HANDLING, angleDiff, speedOf, type Car, type CarClass, type DriveInput, type HandlingParams } from '../engine/driving';

/**
 * Race handling: the driving rules with lighter crash damage, so a nudge
 * doesn't end a race, but damage that costs pace: a car on its last legs has
 * lost 30% of its top speed. The tyre limit and slide scrub (lateralGrip,
 * slideScrub) are off: that version made the race too hard, so races play
 * like the first prototype, where an F1 car takes most bends flat out.
 */
export const RACE_HANDLING: HandlingParams = { ...DEFAULT_HANDLING, allowReverse: true, crashDamage: 0.2, damageSlow: 0.3 };

/**
 * The racing line's corner speed for a car: the fastest it can follow a bend of
 * curvature k: its turn rate (speed ≤ turn rate ÷ k) and, if the tyres have a
 * limit, what they hold (speed² × k ≤ lateral grip), with a safety margin.
 */
export function lineCornerSpeed(cls: CarClass, p: HandlingParams = RACE_HANDLING, margin = 0.9): (absCurve: number) => number {
  return (k) => {
    const c = Math.max(k, 1e-6);
    const byTurn = (margin * cls.turnRate) / c;
    const byTyres = Number.isFinite(p.lateralGrip) ? Math.sqrt((margin * p.lateralGrip * cls.grip) / c) : Infinity;
    return Math.min(cls.topSpeed, byTurn, byTyres);
  };
}

/** How hard the racing line brakes: a share of the car's full braking. */
export const lineDecel = (cls: CarClass, share = 0.7) => (cls.topSpeed / cls.brakeTime) * share;

export interface Pt {
  x: number;
  y: number;
}

export interface TrackSample extends Pt {
  /** px from the start/finish line along the centreline */
  s: number;
  /** direction of travel, radians: 0 = north (up the screen), clockwise positive */
  dir: number;
  /** signed curvature (1/px): positive turns right (clockwise), negative left */
  curve: number;
  /** px/s the racing line can be taken at here, braking for what's ahead included */
  speed: number;
}

export interface Track {
  samples: TrackSample[];
  /** px between samples */
  spacing: number;
  /** px round the loop */
  length: number;
  /** how hard the circuit is on tyres (1 unless given): a slow street circuit wears them less */
  tyreWear?: number;
  /** a bridge, where the track crosses itself (bridge.ts) */
  levels?: Levels;
  /** on dirt: every car on off-road tyres (tyres.ts) */
  dirt?: boolean;
}

/** A closed Catmull-Rom spline through `points`, resampled every `spacing` px. The first point is the start line. */
export function smoothLoop(points: Pt[], spacing: number): Pt[] {
  const n = points.length;
  const dense: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    for (let k = 0; k < 24; k++) {
      const t = k / 24;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      dense.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) });
    }
  }
  // walk the dense curve, dropping a point every `spacing` px
  const out: Pt[] = [dense[0]];
  let carry = 0;
  for (let i = 0; i < dense.length; i++) {
    const a = dense[i];
    const b = dense[(i + 1) % dense.length];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    let at = spacing - carry;
    while (at <= seg) {
      const t = at / seg;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      at += spacing;
    }
    carry = seg - (at - spacing);
  }
  // the last point may sit on top of the first
  const last = out[out.length - 1];
  if (Math.hypot(last.x - out[0].x, last.y - out[0].y) < spacing * 0.5) out.pop();
  return out;
}

const headingOf = (dx: number, dy: number) => Math.atan2(dx, -dy);

/**
 * Build a track from control points. `cornerSpeed(|curvature|)` is how fast a
 * bend can be taken; `decel` (px/s²) is how hard the line brakes into it.
 */
export function buildTrack(control: Pt[], spacing: number, cornerSpeed: (absCurve: number) => number, decel: number): Track {
  const pts = smoothLoop(control, spacing);
  const n = pts.length;
  const at = (i: number) => pts[((i % n) + n) % n];
  const dirs = pts.map((_, i) => headingOf(at(i + 1).x - at(i - 1).x, at(i + 1).y - at(i - 1).y));
  const raw = dirs.map((_, i) => angleDiff(dirs[(i + 1) % n], dirs[(i - 1 + n) % n]) / (2 * spacing));
  // smooth the curvature a little so single wobbles don't read as corners
  const curve = raw.map((_, i) => {
    let sum = 0;
    for (let k = -3; k <= 3; k++) sum += raw[(((i + k) % n) + n) % n];
    return sum / 7;
  });
  const speed = curve.map((k) => cornerSpeed(Math.abs(k)));
  // braking: nothing can be faster than what still lets it slow for the bend ahead (twice round the loop)
  for (let pass = 0; pass < 2; pass++) {
    for (let i = n - 1; i >= 0; i--) {
      const next = speed[(i + 1) % n];
      speed[i] = Math.min(speed[i], Math.sqrt(next * next + 2 * decel * spacing));
    }
  }
  const samples = pts.map((p, i) => ({ x: p.x, y: p.y, s: i * spacing, dir: dirs[i], curve: curve[i], speed: speed[i] }));
  return { samples, spacing, length: n * spacing };
}

/**
 * Index of the sample nearest (x, y): a local search from `hint` when given, else the whole track. Lost (far off the
 * track near `hint`), a local search falls back to the whole track, unless `stay`: then the nearest near `hint` all
 * the same (a racer's progress, which mustn't jump across the infield to another stretch).
 */
export function nearestSample(track: Track, x: number, y: number, hint?: number, stay = false): number {
  const n = track.samples.length;
  const d2 = (i: number) => {
    const p = track.samples[((i % n) + n) % n];
    return (p.x - x) ** 2 + (p.y - y) ** 2;
  };
  let best = 0;
  let bestD = Infinity;
  if (hint !== undefined) {
    for (let k = -40; k <= 40; k++) {
      const d = d2(hint + k);
      if (d < bestD) [best, bestD] = [(((hint + k) % n) + n) % n, d];
    }
    // lost (reset, or cut across the infield): fall back to a full search (unless it must stay)
    if (bestD < 200 * 200 || stay) return best;
  }
  for (let i = 0; i < n; i++) {
    const d = d2(i);
    if (d < bestD) [best, bestD] = [i, d];
  }
  return best;
}

export const SECTORS = 3;

/** The samples where each sector after the first starts (the first starts at the line): where a lap's split is taken. */
export const sectorStarts = (track: Track): number[] => Array.from({ length: SECTORS - 1 }, (_, k) => (k + 1) * Math.floor(track.samples.length / SECTORS));

export interface RaceProgress {
  /** completed laps */
  lap: number;
  /** nearest track sample */
  idx: number;
  /** sectors passed this lap, in order (a lap counts only with all of them) */
  sector: number;
  /** race time when this lap started; undefined before the first crossing */
  lapStart?: number;
  lapTimes: number[];
  /** race time at the chequered flag */
  finished?: number;
  /** seconds spent facing the wrong way (for the warning) */
  wrongWay: number;
  /** seconds added to the finish time (overtaking under the safety car) */
  penalty: number;
  /** out of the race (wrecked, and cleared off the track): classified last, as DNF */
  retired?: boolean;
}

export const newProgress = (idx: number): RaceProgress => ({ lap: 0, idx, sector: 0, lapTimes: [], wrongWay: 0, penalty: 0 });

/**
 * Update a racer's progress. Cars start just behind the line: the first
 * crossing starts lap 1's clock; later crossings complete a lap when every
 * sector was passed in order.
 */
export function stepProgress(p: RaceProgress, track: Track, car: Car, raceTime: number, laps: number, dt: number): RaceProgress {
  const n = track.samples.length;
  // (only ever near where it was: a car that cuts across the infield to another stretch, as Suzuka's figure of eight
  // allows, gains nothing; it's still where it left the track till it comes back round to it. Moved anywhere else, a
  // car's progress is set there with it.)
  const idx = nearestSample(track, car.x, car.y, p.idx, true);
  // after the flag only the position keeps updating (for the cool-down lap)
  if (p.finished !== undefined) return { ...p, idx };
  const next: RaceProgress = { ...p, idx };
  const per = Math.floor(n / SECTORS);
  // passing a sector boundary in the right order
  const boundary = (next.sector + 1) * per;
  if (next.sector < SECTORS - 1 && idx >= boundary && idx < boundary + per && p.idx < boundary) next.sector++;
  // crossing the line: index wraps from the end of the loop to the start
  const crossed = p.idx > n - 60 && idx < 60;
  if (crossed) {
    if (next.lapStart === undefined) {
      next.lapStart = raceTime;
    } else if (next.sector === SECTORS - 1) {
      next.lapTimes = [...p.lapTimes, raceTime - next.lapStart];
      next.lap = p.lap + 1;
      next.lapStart = raceTime;
      if (next.lap >= laps) next.finished = raceTime;
    }
    next.sector = 0;
  }
  // wrong way: heading against the track direction while moving
  const along = angleDiff(car.heading, track.samples[idx].dir);
  next.wrongWay = Math.abs(along) > Math.PI * 0.6 && speedOf(car) > 20 ? p.wrongWay + dt : 0;
  return next;
}

/** Race order: finishers by time (penalties added), then by laps done, then by distance round the current lap; retired cars last. */
export function standings(racers: RaceProgress[], track: Track): number[] {
  const n = track.samples.length;
  // on the grid (before the first crossing) a car is behind the line: idx − n
  const score = (p: RaceProgress) => (p.lapStart === undefined ? p.idx - n : p.lap * n + p.idx);
  return racers
    .map((_, i) => i)
    .sort((a, b) => {
      const pa = racers[a];
      const pb = racers[b];
      // retired cars go to the back, the one that got furthest first
      if (pa.retired || pb.retired) {
        if (!pa.retired) return -1;
        if (!pb.retired) return 1;
        return score(pb) - score(pa);
      }
      if (pa.finished !== undefined || pb.finished !== undefined) {
        if (pa.finished === undefined) return 1;
        if (pb.finished === undefined) return -1;
        return pa.finished + pa.penalty - (pb.finished + pb.penalty);
      }
      return score(pb) - score(pa);
    });
}

export interface AiDriver {
  /** px to the right of the centreline this driver aims for */
  lane: number;
  /** share of the line's speed it drives at (skill) */
  pace: number;
  /** 0…1: its racecraft, how boldly it passes and how hard it defends (0.6 unless given) */
  craft?: number;
  /** what it's doing about the cars round it (kept from step to step): passing a car on a side, or covering a side from one */
  move?: { kind: 'pass' | 'defend'; side: -1 | 1; car: Car };
  /** its chance of a mistake going into each bend, and the dice for it (seeded: a race plays again the same); none without */
  mistakes?: number;
  rng?: () => number;
  /** the mistake it's making in this bend, if any: braked too late (carrying too much speed in), or running wide */
  slip?: 'late' | 'wide';
  /** through a mistake: the slowest the line has been so far, and the sample where it passed that (then out of the bend) */
  slipMin?: number;
  slipApex?: number;
  /** it was on a straight last step (for spotting a bend's start) */
  wasStraight?: boolean;
  /** s after lights out before it gets going (its reaction off the line); none: away at once */
  reaction?: number;
  /** its chance, close behind another car into a braking bend, of misjudging it (a dive far too late, into the car ahead): none without */
  incidents?: number;
  /** the dive it's making: at the car ahead, from where on the lap (a sample), a bend's length at most */
  lunge?: { car: Car; from: number };
}

/** The lateral offset (px, + = right of the centreline) of point (x, y) near sample i. */
export function lateralOffset(track: Track, i: number, x: number, y: number): number {
  const p = track.samples[i];
  return (x - p.x) * Math.cos(p.dir) + (y - p.y) * Math.sin(p.dir);
}

/** The pad as the player holds it: the stick (screen space, length 0…1) and the A and B buttons. */
export interface Pad {
  stick: { x: number; y: number };
  a: boolean;
  b: boolean;
}

/** The driving input for the player from the touch thumbstick: it points where to go, and how far it's pushed is the throttle; B drifts. */
export function playerInput(pad: Pad): DriveInput {
  const { stick, b } = pad;
  return { steer: stick.x || stick.y ? stick : undefined, handbrake: b };
}

/** Keys and gamepads drive the car itself: steering (−1 left … 1 right), gas and brake (0…1), and drift. */
export interface WheelPad {
  turn: number;
  gas: number;
  brake: number;
  drift: boolean;
}

/** How hard the wheel turns at full lock (a share of the car's turn rate): a steering key is always at full lock. */
export const WHEEL_LOCK = 0.8;
/** px/s: slower than this (forwards), the brake reverses instead */
const REVERSE_BELOW = 10;

/** The wheel from the arrow keys (or WASD): up gas, down brake, left and right steer. */
export const keysWheel = (keys: { up: boolean; down: boolean; left: boolean; right: boolean }, drift: boolean): WheelPad => ({
  turn: (keys.right ? 1 : 0) - (keys.left ? 1 : 0), gas: keys.up ? 1 : 0, brake: keys.down ? 1 : 0, drift,
});

/** The wheel from the touch thumbstick (screen space, y down): across steers, up is the gas, down the brake. */
export const stickWheel = (stick: { x: number; y: number }, drift: boolean): WheelPad => ({
  turn: stick.x, gas: Math.max(0, -stick.y), brake: Math.max(0, stick.y), drift,
});

/**
 * The driving input for keys, a gamepad or the stick steering: the wheel turns the car (a gentle
 * curve on an analogue stick, for fine corrections), the gas pulls, the brake
 * brakes, and held once stopped (off the gas) it reverses.
 */
export function wheelInput(w: WheelPad, car: Car): DriveInput {
  const turn = Math.sign(w.turn) * Math.min(1, Math.abs(w.turn)) ** 1.5 * WHEEL_LOCK;
  const forward = car.vx * Math.sin(car.heading) - car.vy * Math.cos(car.heading);
  const braking = w.brake > 0.2;
  if (braking && w.gas < 0.1 && forward < REVERSE_BELOW) return { wheel: { turn, gas: 0, reverse: true }, handbrake: w.drift };
  return { wheel: { turn, gas: w.gas, reverse: false }, handbrake: w.drift, brake: braking };
}

/** Race control's orders for a driver: a speed limit, and whether it may overtake. */
export interface Orders {
  /** px/s: never faster than this (the safety car's limiter) */
  limit?: number;
  /** stay in line behind the car ahead instead of moving over to pass */
  noOvertaking?: boolean;
  /** blue flags: the car lapping this one, close behind, to be let through */
  blue?: Car;
  /** the cars shown blue flags for this one (moving over to let it by): it goes by them, not queueing behind */
  lapping?: Car[];
  /** a car it never dives at (the player's: incidents are between AI cars) */
  spare?: Car;
}

/** px of straight a tow needs ahead to be used (room to brake from the extra speed), on top of 1.1 s at the car's speed */
const TOW_ROOM = 120;

/** The AI's racecraft: how it passes and defends (px across the track, + = right of the centreline). */
export const RACECRAFT = {
  /** furthest off the centreline it drives (the track is 44 either side), and on the inside of a tight bend (|curvature| above `tightBend`: the kerbed ones) */
  laneLimit: 28,
  insideLimit: 14,
  tightBend: 1 / 260,
  /** px across a pass takes it from the car it's passing */
  passGap: 23,
  /** px of straight a pass needs ahead to be finished before the braking, on top of seconds at the car's speed */
  passRoom: 160,
  passTime: 1.6,
  /** px/s quicker than the car ahead it must be (at no racecraft; the boldest need `boldMargin`) */
  margin: 10,
  boldMargin: 3,
  /** px across a defending car moves to cover the inside of the next bend: none below `defendFrom` racecraft, `cover` at full */
  cover: 20,
  defendFrom: 0.45,
  /** px behind within which a quicker car is defended against */
  defendRange: 100,
  /** px a car alongside is left: a car's width and some */
  room: 22,
  /** a misjudgement: from within this many px behind a car into a braking bend, the dive lasts at most `lungeFor` px of
   * track, braking only to `lungeBrake` of its speed */
  lungeFrom: 90,
  lungeFor: 260,
  lungeBrake: 1,
  /** blue flags: px off the centreline a car being lapped moves over to (away from the car lapping it), and its pace on
   * the straight while that car is within `blueClose` px behind */
  blueLane: 24,
  blueLift: 0.9,
  blueClose: 90,
  /** a mistake. Braking too late: into the bend at this share of the line's own speed, then past the apex, run wide and
   * gather it up at `recover` of the pace for `recoverFor` px. Running wide: this far out, this slow, through the bend
   * and `recoverFor` px out of it */
  lockUp: 1.05,
  recover: 0.55,
  recoverFor: 170,
  wide: 22,
  wideSlow: 0.78,
};

/** px/s slower than a car alongside and ahead in a bend that a car giving way drops to */
const YIELD = 12;

/** Whether the track runs straight for `px` px from sample `idx`: the line flat out all the way. */
function straightFor(track: Track, idx: number, px: number, top: number): boolean {
  const n = track.samples.length;
  for (let k = 0; k * track.spacing < px; k += 2) if (track.samples[(idx + k) % n].speed < top - 1) return false;
  return true;
}

/** px of straight (the line flat out) ahead of sample `idx`, up to `max`. */
function straightAhead(track: Track, idx: number, top: number, max: number): number {
  const n = track.samples.length;
  let k = 0;
  while (k * track.spacing < max && track.samples[(idx + k) % n].speed >= top - 1) k += 2;
  return k * track.spacing;
}

/** The next bend's curvature (1/px, + = right) within `px` px of sample `idx`: the tightest point of it. */
function nextBend(track: Track, idx: number, px: number): number {
  const n = track.samples.length;
  let best = 0;
  for (let k = 0; k * track.spacing < px; k++) {
    const c = track.samples[(idx + k) % n].curve;
    if (Math.abs(c) > Math.abs(best)) best = c;
  }
  return best;
}

/**
 * Drive the racing line: aim at a point ahead (further at speed), at the
 * driver's lane, and hold the speed the line allows there, braking when over it.
 * `others` are the other cars, and around them the AI races:
 *
 * - quicker than a car ahead on a straight long enough to finish the move, it
 *   pulls out and passes on the side with room, holding its line until clear,
 *   and gives it up (tucking back in behind) if the straight runs out first;
 * - caught on a straight by a quicker car still behind it, it makes one move to
 *   cover the inside of the next bend (never across a car already alongside;
 *   not at all with little racecraft);
 * - a car alongside is left a car's width of room, rather than turned in on;
 *   side by side into a bend, the one a nose behind gives way;
 * - now and then (its `mistakes` chance, into each bend) it gets a bend wrong:
 *   brakes too late and carries too much speed in, or runs wide and slow;
 * - off the line in a bend, it takes the bend at the speed its radius there
 *   allows (tighter on the inside), not the line's;
 * - too close behind a car to get by, it holds that car's speed.
 *
 * A tow in the slipstream (`boost`, × top speed) takes it faster down a
 * straight while there's room to brake from the extra speed.
 */
export function aiInput(car: Car, track: Track, idx: number, ai: AiDriver, others: Car[] = [], orders: Orders = {}, boost = 1): DriveInput {
  const R = RACECRAFT;
  const n = track.samples.length;
  const v = speedOf(car);
  const top = car.cls.topSpeed;
  const craft = ai.craft ?? 0.6;
  const ahead = Math.round((40 + v * 0.3) / track.spacing);
  const t = track.samples[(idx + ahead) % n];
  // the line's speed a little ahead (it already includes braking for what's beyond); on worn tyres
  // the car turns less, so it takes the bends (and the braking into them) that much slower
  const line = track.samples[(idx + 2) % n].speed;
  const straight = line >= top - 1;
  const cornering = straight ? 1 : car.tyreGrip ?? 1;
  const mine = lateralOffset(track, idx, car.x, car.y);
  // room to brake from a tow's extra speed; room to finish a pass before the braking
  const brakeRoom = straight && straightFor(track, idx, TOW_ROOM + v * 1.1, top);
  const passRoom = brakeRoom && straightFor(track, idx, R.passRoom + v * R.passTime, top);
  // flat out on the line (off it in a bend, slower: below)
  let free = line * ai.pace * cornering * (brakeRoom ? boost : 1);
  // which side the next bend turns: its inside, to defend
  const inside: -1 | 1 = nextBend(track, idx, 700) >= 0 ? 1 : -1;

  const here = track.samples[idx];
  const fx = Math.sin(here.dir);
  const fy = -Math.cos(here.dir);
  const seen = others.map((o) => {
    const along = (o.x - car.x) * fx + (o.y - car.y) * fy;
    const theirs = lateralOffset(track, idx, o.x, o.y);
    return { o, along, theirs, across: theirs - mine, speed: speedOf(o) };
  });
  const racing = !orders.noOvertaking;
  const margin = R.margin - (R.margin - R.boldMargin) * craft;
  // the car ahead in our way, if any: the nearest
  const inWay = seen.filter((c) => !c.o.wrecked && c.along > 0 && c.along < 70 + Math.max(0, v - c.speed) * 0.9 && Math.abs(c.across) < 20).sort((a, b) => a.along - b.along)[0];
  // cars alongside: not to be turned in on
  const alongside = seen.filter((c) => !c.o.wrecked && Math.abs(c.along) < 34 && Math.abs(c.across) < 28);

  // the move: keep it while it makes sense, or start one
  let move = ai.move;
  const other = move ? seen.find((c) => c.o === ai.move?.car) : undefined;
  const victim = move?.kind === 'pass' ? other : undefined;
  const attacker = move?.kind === 'defend' ? other : undefined;
  if (move?.kind === 'pass') {
    // done once the car is a length and a half behind; given up if the straight runs out with it still clearly ahead
    if (!racing || !victim || victim.o.wrecked || victim.along < -45 || victim.along > 120 || (!passRoom && victim.along > 20)) move = undefined;
  } else if (move?.kind === 'defend') {
    // held down the straight while the car it's covering from is still behind; into the bend it's done
    if (!racing || !straight || !attacker || attacker.o.wrecked || attacker.along > -10 || attacker.along < -1.5 * R.defendRange) move = undefined;
  }
  // go for a pass only if it can be finished on this straight: the speed it'll have alongside (half the speed it's
  // carrying over the car now, and its own pace's edge) over the straight left before the braking, against the
  // ground to make up (to a length and a half ahead)
  const canPass = (c: (typeof seen)[number]) => {
    const left = straightAhead(track, idx, top, 2400) - (TOW_ROOM + v * 1.1);
    const edge = 0.5 * Math.max(0, v - c.speed) + (line * ai.pace - c.speed);
    return left > 0 && edge >= margin * 0.5 && edge * (left / Math.max(v, 1)) >= 1.3 * (c.along + 45);
  };
  // (from close behind: pulling out from further back just loses the tow)
  if (!move && racing && inWay && inWay.along < 45 + Math.max(0, v - inWay.speed) * 0.6 && passRoom && free > inWay.speed + margin && canPass(inWay)) {
    // pass on the side with room: away from where the car ahead is
    const left = inWay.theirs - R.passGap >= -R.laneLimit;
    const right = inWay.theirs + R.passGap <= R.laneLimit;
    const side: -1 | 1 = left && (!right || inWay.theirs >= 0) ? -1 : 1;
    move = { kind: 'pass', side, car: inWay.o };
  }
  if (!move && racing && straight && craft >= R.defendFrom) {
    // a quicker car closing from behind, still in line with us: cover the inside, unless something's alongside there
    // (only while it's still in line behind: not once it has started to pull out)
    const closing = seen.find((c) => !c.o.wrecked && c.along < -20 && c.along > -R.defendRange && Math.abs(c.across) < 8 && c.speed > v + 3);
    const inTheWay = alongside.some((c) => Math.sign(c.across) === inside);
    if (closing && !inTheWay) move = { kind: 'defend', side: inside, car: closing.o };
  }
  // blue flags: no defending against the car lapping us (nor passing anyone while it's coming through)
  const lapper = orders.blue ? seen.find((c) => c.o === orders.blue) : undefined;
  if (lapper) move = undefined;
  ai.move = move;

  // mistakes: going into a bend (where the braking for it starts), now and then a driver gets it wrong, and pays
  // for it through the bend (never while the pack is still bunched, or under the safety car)
  // (a real braking bend: the line slows well below flat out within the next few car lengths)
  const braking = () => {
    let slowest = top;
    for (let k = 0; k * track.spacing < 300; k += 2) slowest = Math.min(slowest, track.samples[(idx + k) % n].speed);
    return slowest < 0.8 * top;
  };
  // a misjudgement, close behind a car into a braking bend: diving in far too late, at it (it seldom ends well)
  if (ai.wasStraight && !straight && racing && ai.rng && ai.incidents && !ai.lunge && !ai.slip) {
    const target = seen.find((c) => !c.o.wrecked && c.o !== orders.spare && c.along > 8 && c.along < R.lungeFrom && Math.abs(c.across) < 22);
    if (target && braking() && ai.rng() < ai.incidents) ai.lunge = { car: target.o, from: idx };
  }
  const lungeAt = ai.lunge && seen.find((c) => c.o === ai.lunge!.car);
  if (ai.lunge && (!racing || !lungeAt || lungeAt.along < -10 || ((idx - ai.lunge.from + n) % n) * track.spacing > R.lungeFor)) ai.lunge = undefined;
  if (ai.wasStraight && !straight && racing && ai.rng && ai.mistakes && braking() && ai.rng() < ai.mistakes) {
    ai.slip = ai.rng() < 0.5 ? 'late' : 'wide';
    ai.slipMin = Infinity;
    ai.slipApex = undefined;
  }
  // (past the apex once the line's speed rises well above the slowest it was; a mistake is over a way on from there)
  let gathering = false;
  if (ai.slip) {
    if (ai.slipApex === undefined) {
      ai.slipMin = Math.min(ai.slipMin ?? Infinity, line);
      if (line > 1.15 * ai.slipMin) ai.slipApex = idx;
    }
    const past = ai.slipApex === undefined ? -1 : ((idx - ai.slipApex + n) % n) * track.spacing;
    gathering = past >= 0 && past < R.recoverFor;
    if (past >= R.recoverFor || (straight && ai.slipApex === undefined)) ai.slip = undefined;
  }
  if (!racing) ai.slip = undefined;
  ai.wasStraight = straight;

  let lane = ai.lane;
  const passCar = move?.kind === 'pass' ? move.car : undefined;
  const passing = passCar ? seen.find((c) => c.o === passCar) : undefined;
  if (move?.kind === 'pass' && passing) lane = passing.theirs + move.side * R.passGap;
  else if (move?.kind === 'defend') lane = move.side * R.cover * Math.min(1, (craft - R.defendFrom) / (1 - R.defendFrom) + 0.25);
  // diving in: at the car ahead, off the brakes
  if (lungeAt) lane = lungeAt.theirs;
  // blue flags: over to the side away from the car lapping us, a touch off the pace on the straight while it's close
  if (lapper) {
    lane = (lapper.theirs >= mine ? -1 : 1) * R.blueLane;
    if (straight && lapper.along > -R.blueClose) free *= R.blueLift;
  }
  // wrecks are steered round, whatever the orders
  for (const c of seen) if (c.o.wrecked && c.along > 0 && c.along < 40 + v * 0.8 && Math.abs(c.across) < 18) lane = c.across > 0 ? mine - 26 : mine + 26;
  // running wide (or gathering up a lock-up): out toward the edge on the outside of the bend
  if ((ai.slip === 'wide' && (gathering || ai.slipApex === undefined)) || (ai.slip === 'late' && gathering)) lane -= Math.sign(nextBend(track, idx, 60 + v * 0.8) || here.curve || ai.slipMin || 1) * R.wide;
  lane = Math.max(-R.laneLimit, Math.min(R.laneLimit, lane));
  // in or into a tight bend, not far over on its inside: the line it aims along cuts across the inside, and all four
  // wheels past the kerb is a cut (on the streets, a wall)
  const bendAhead = nextBend(track, idx, 60 + v * 0.8);
  if (Math.abs(bendAhead) > R.tightBend && lane * bendAhead > 0) lane = Math.sign(lane) * Math.min(Math.abs(lane), R.insideLimit);
  // moved off its usual line for a bend (passing, defending, giving room): its radius there sets the speed, tighter
  // on the inside (every car cuts the bends a little the same way; this is only for being moved over from that)
  if (!straight) free *= Math.min(1, Math.sqrt(Math.max(0.5, 1 - (lane - ai.lane) * nextBend(track, idx, 60 + v * 0.8))));
  // a lock-up: into the bend too fast (it runs wide, or slides); running wide: off the pace through it
  if (ai.slip === 'late') free = gathering ? free * R.recover : Math.min(top * boost, Math.max(free, line * cornering * R.lockUp));
  else if (ai.slip === 'wide') free *= R.wideSlow;

  // too close to get by (a pack braking into a hairpin): don't drive into its gearbox. Watched across
  // nearly two car widths, so a car merging from the side counts too; pulled out to pass, only while overlapping it
  // (diving in: hardly braking)
  if (lungeAt) free = Math.max(free, v * R.lungeBrake);
  let follow = Infinity;
  const band = move?.kind === 'pass' ? 18 : 26;
  for (const c of seen) {
    // (a car moved over to let us by: only in the way if it's still right in front; the car being dived on, not at all)
    if (orders.lapping?.includes(c.o) && Math.abs(c.across) >= 16) continue;
    if (c.o === ai.lunge?.car) continue;
    const closing = v - c.speed;
    if (!c.o.wrecked && c.along > 0 && c.along < 44 + Math.max(0, closing) * 0.7 && Math.abs(c.across) < band) follow = Math.min(follow, c.speed);
  }
  // side by side into a bend, a nose behind: give way, dropping in behind rather than both fighting for it
  // (not under the safety car, where the order holds; but while the pack settles from the start, yes: the first
  // corner is where cars are most often side by side)
  if (!straight && orders.limit === undefined && !ai.lunge) for (const c of alongside) if (c.along > 4) follow = Math.min(follow, c.speed - YIELD);
  const tx = t.x + Math.cos(t.dir) * lane;
  const ty = t.y + Math.sin(t.dir) * lane;
  const dx = tx - car.x;
  const dy = ty - car.y;
  const d = Math.hypot(dx, dy) || 1;
  const want = Math.min(free, follow, orders.limit ?? Infinity);
  const mag = Math.max(0.05, Math.min(1, want / (top * boost)));
  return { steer: { x: (dx / d) * mag, y: (dy / d) * mag }, handbrake: false, brake: v > want + 12, limit: orders.limit };
}

/**
 * After the flag: pull over to the side and carry on round at an easy pace,
 * without hard braking, so the cars still racing behind don't run into a
 * finisher slowing on the line.
 */
export function coolDownInput(car: Car, track: Track, idx: number, others: Car[] = []): DriveInput {
  return { ...aiInput(car, track, idx, { lane: 30, pace: 0.85 }, others), brake: false };
}

