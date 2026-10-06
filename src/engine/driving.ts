// Driving rules: the car's numbers, loose arcade handling (heading and
// velocity differ while sliding), and the crashes: a car is a rigid body (its
// mass, and a turning inertia from its size), so a hit off its middle spins it,
// it bounces off a tree or a rock along the way it hit (hard on its nose, a
// scrape along it side-on, friction slowing it), and car-on-car hits trade
// spin as well as speed. Hit something side-on hard enough, or slide sideways
// into soft ground fast enough to dig in, and it rolls. Damage comes from how
// hard a hit is straight into what it hit; then fire and wrecks. Engine-free
// and unit-tested.

import { circleBlocked, circleContact, groundAt, isRough, type Grid } from './sim';

export type CarClassId = 'f1';

/**
 * A vehicle's numbers. The engine is a torque and a power: at low speed it
 * pulls with its full torque (force; ÷ mass = acceleration), and once it's
 * moving faster the pull falls off as power ÷ speed. Top speed is where the
 * gearing tops out, and how steep a hill it can climb from a standstill
 * comes from its torque for its mass.
 */
export interface VehicleStats {
  /** px/s: where the gearing tops out */
  topSpeed: number;
  /** pulling force at low speed (mass × px/s²) */
  torque: number;
  /** force × speed the engine can deliver once moving (pull = power ÷ speed, at most the torque) */
  power: number;
  /** seconds from top speed to a stop under braking */
  brakeTime: number;
  /** rad/s at speed */
  turnRate: number;
  /** per second: how fast sideways sliding dies away */
  grip: number;
  health: number;
  mass: number;
  /** body size in px (width across, length nose to tail) */
  width: number;
  length: number;
  /** 0…1: the share of top speed and grip kept on rough ground (1 = built for it) */
  offRoad: number;
}

export interface CarClass extends VehicleStats {
  id: CarClassId;
  name: string;
}

/**
 * Global tuning knobs, as a reference car's numbers: a different reference
 * scales every class by the same ratio (top speed, turn rate, grip, braking), and
 * a quicker 0 → top scales every engine's torque and power up to match.
 */
export interface ReferenceTuning {
  topSpeed: number;
  zeroToTop: number;
  brakeTime: number;
  turnRate: number;
  grip: number;
}

export const REFERENCE: ReferenceTuning = { topSpeed: 180, zeroToTop: 1.2, brakeTime: 0.6, turnRate: 3.0, grip: 6 };

const stats = (
  topSpeed: number, torque: number, power: number, brakeTime: number, turnRate: number, grip: number,
  health: number, mass: number, width: number, length: number, offRoad: number,
): VehicleStats => ({ topSpeed, torque, power, brakeTime, turnRate, grip, health, mass, width, length, offRoad });

/** Each class at the default reference. */
export const CLASS_TABLE: Record<CarClassId, [name: string, stats: VehicleStats]> = {
  //                                top  torque power  brake turn grip  hp  mass  w   l  offRoad
  // race car: the fastest thing on wheels, light, fragile, stuck to the road, hopeless off it
  f1: ['F1 car', stats(320, 161, 37000, 0.35, 3.8, 10, 60, 0.7, 14, 30, 0.25)],
};

export const CAR_CLASS_IDS = Object.keys(CLASS_TABLE) as CarClassId[];

export const STAT_KEYS: (keyof VehicleStats)[] = [
  'topSpeed', 'torque', 'power', 'brakeTime', 'turnRate', 'grip', 'health', 'mass', 'width', 'length', 'offRoad',
];

export type StatOverrides = Partial<Record<CarClassId, Partial<VehicleStats>>>;
let overrides: StatOverrides = {};

/** Saved vehicle edits, applied on top of the class table (see vehicleEdits.ts). */
export function setStatOverrides(o: StatOverrides): void {
  overrides = o;
}

/** The class table's own numbers, ignoring edits. */
export function baseStats(id: CarClassId): VehicleStats {
  return { ...CLASS_TABLE[id][1] };
}

/** A class's numbers with any saved edits applied. */
export function classStats(id: CarClassId): VehicleStats {
  return { ...baseStats(id), ...overrides[id] };
}

export function carClass(id: CarClassId, ref: ReferenceTuning = REFERENCE): CarClass {
  const st = classStats(id);
  const speed = ref.topSpeed / REFERENCE.topSpeed;
  const quick = REFERENCE.zeroToTop / ref.zeroToTop;
  return {
    ...st,
    id,
    name: CLASS_TABLE[id][0],
    topSpeed: st.topSpeed * speed,
    torque: st.torque * quick,
    // more speed needs more power to reach it in the same time
    power: st.power * quick * speed,
    brakeTime: (st.brakeTime * ref.brakeTime) / REFERENCE.brakeTime,
    turnRate: (st.turnRate * ref.turnRate) / REFERENCE.turnRate,
    grip: (st.grip * ref.grip) / REFERENCE.grip,
  };
}

/** Engine pull in px/s² at speed v: all the torque at low speed, then what the power allows. */
export function enginePull(cls: VehicleStats, v: number): number {
  return Math.min(cls.torque, cls.power / Math.max(1, Math.abs(v))) / cls.mass;
}

/** The steepest grade (rise per px) the engine can drive up from a standstill. */
export function maxClimb(cls: VehicleStats, p: HandlingParams): number {
  return cls.torque / cls.mass / (p.gravity * p.slopeGravity);
}

/** Seconds from standstill to 95% of top speed on flat ground, full throttle. */
export function zeroToTop(cls: VehicleStats): number {
  let v = 0;
  let t = 0;
  const dt = 1 / 120;
  while (v < cls.topSpeed * 0.95 && t < 30) {
    v += enginePull(cls, v) * dt;
    t += dt;
  }
  return t;
}

export interface HandlingParams {
  /** grip multiplier while the handbrake is held */
  handbrakeGrip: number;
  /** turn-rate multiplier while the handbrake is held */
  handbrakeTurn: number;
  /** px/s² when coasting */
  drag: number;
  /** impacts slower than this (px/s) do no damage */
  crashThreshold: number;
  /** damage per px/s of impact above the threshold */
  crashDamage: number;
  /** seconds a burning car lasts before it's wrecked */
  burnTime: number;
  /** analogue input may reverse from a crawl; 8-way input always turns around */
  allowReverse: boolean;
  /** px/s², pulls cars down after a jump and along slopes */
  gravity: number;
  /** share of gravity along a slope that speeds a car up or slows it down */
  slopeGravity: number;
  /**
   * Tyre saturation: the most sideways grip (px/s² per unit of class grip) the
   * tyres give. Turn in too fast and the nose comes round but the car slides
   * wide. Infinity = no limit (the default); races use about 25.
   */
  lateralGrip: number;
  /** per second: forward speed a sliding car scrubs off, as a share of its sideways speed (0 = none) */
  slideScrub: number;
  /** share of gravity across a slope that pushes a car sideways (banked turns push inward) */
  bankGravity: number;
  /** landings faster than this (px/s down) do damage */
  landThreshold: number;
  /** share of top speed a car has lost by the time its health runs out (0 = damage never slows it) */
  damageSlow: number;
}

export const DEFAULT_HANDLING: HandlingParams = {
  handbrakeGrip: 0.35,
  handbrakeTurn: 1.5,
  drag: 90,
  crashThreshold: 60,
  crashDamage: 0.5,
  burnTime: 4,
  allowReverse: false,
  gravity: 320,
  slopeGravity: 1,
  bankGravity: 1,
  lateralGrip: Infinity,
  slideScrub: 0,
  landThreshold: 200,
  damageSlow: 0,
};

export const SKID_SPEED = 30;
/** px/s: how much sharper than gravity the ground must fall away before a car leaves it */
const TAKEOFF_MARGIN = 30;
/**
 * The steepest ground a car's climb rate follows when launching (rise per px of
 * travel). Ramps are gentler; the steep side of a ramp taken at an angle is
 * capped to this, so crossing it gives a hop rather than a rocket launch.
 */
const MAX_LAUNCH_GRADE = 0.7;
/** Health fractions for the smoking and burning states. */
export const SMOKE_AT = 0.5;
export const FIRE_AT = 0.2;

export interface Car {
  cls: CarClass;
  x: number;
  y: number;
  /** radians; 0 = north (up the screen), clockwise positive */
  heading: number;
  vx: number;
  vy: number;
  health: number;
  /** seconds left until a burning car is wrecked; undefined when not burning */
  burn?: number;
  wrecked: boolean;
  /** height above the map in px (the ground's height, unless airborne) */
  z: number;
  /** px/s upward */
  vz: number;
  /** off the ground after a ramp or crest: no steering or grip until it lands */
  airborne: boolean;
  /** the tyres' share of their grip and turn (1 = new; worn tyres slide more and turn less); unset = 1 */
  tyreGrip?: number;
  /** the share of its top speed the car can reach (worn tyres can't put the power down); unset = 1 */
  speedScale?: number;
  /** rad/s the body is spinning at, clockwise (from a hit; the tyres soon stop it on the ground); unset = 0 */
  spin?: number;
  /** a roll in progress: radians still to go (signed: + over to the right); and the body's roll so far (0: on its wheels) */
  rolling?: number;
  rolled?: number;
}

/**
 * The crashes (see the top). Off a tree or rock: `bounce` (restitution: how much of the speed straight into it comes
 * back) and `friction` (scraping along it). Spin: dies away at `spinGrip` per second on the ground (the tyres), at
 * `spinAir` in the air. Rolls: a side-on hit at `rollFrom` px/s or more, or sliding sideways at `digFrom` px/s or more
 * on soft ground; a roll is one turn over, or two from a hit `twiceFrom` px/s or harder, at `rollRate` rad/s, each
 * time over the roof doing `roofDamage` and its speed scrubbed at `rollDrag` px/s² meanwhile.
 */
export const IMPACT = {
  bounce: 0.3,
  friction: 0.45,
  carBounce: 0.3,
  carFriction: 0.3,
  spinGrip: 4,
  spinAir: 0.3,
  rollFrom: 200,
  digFrom: 250,
  twiceFrom: 300,
  rollRate: 9,
  roofDamage: 6,
  rollDrag: 260,
};

/** A body's turning inertia: a box its size, of its mass. */
export const inertiaOf = (cls: VehicleStats) => (cls.mass * (cls.width ** 2 + cls.length ** 2)) / 12;

export type CarCondition = 'ok' | 'smoking' | 'burning' | 'wrecked';

export function condition(car: Car): CarCondition {
  if (car.wrecked) return 'wrecked';
  if (car.burn !== undefined) return 'burning';
  if (car.health <= car.cls.health * SMOKE_AT) return 'smoking';
  return 'ok';
}

export function newCar(cls: CarClass, x: number, y: number, heading = 0): Car {
  return { cls, x, y, heading, vx: 0, vy: 0, health: cls.health, wrecked: false, z: 0, vz: 0, airborne: false };
}

export interface DriveInput {
  /**
   * Where the player wants to go, in screen space (y down). Length 0…1 is the
   * throttle (analogue); 8-way input always has length 1. Undefined = no input.
   */
  steer?: { x: number; y: number };
  handbrake: boolean;
  /** full brakes, keeping grip (AI drivers use this; players brake by pulling back) */
  brake?: boolean;
  /** px/s: a speed limiter the car won't pull beyond (e.g. under a safety car) */
  limit?: number;
  /**
   * Drive it like a car instead (in place of `steer`; for keys and gamepads): turn
   * the wheel (−1 full left … 1 full right, relative to the car), press the gas
   * (0…1), or reverse. Braking is `brake`, drifting is `handbrake`, as ever.
   */
  wheel?: { turn: number; gas: number; reverse: boolean };
}

export interface StepEvents {
  /** damage taken this step from hitting something */
  damage: number;
  /** the car is sliding sideways fast enough to leave skid marks */
  skidding: boolean;
  /** true on the step the car became wrecked */
  wreckedNow: boolean;
  /** the car is on rough ground (grass, dirt, fields) */
  onRough: boolean;
  /** in the air this step */
  airborne: boolean;
  /** downward speed (px/s) on the step the car landed; 0 otherwise */
  landed: number;
  /** px/s straight into the hardest thing it hit this step (0: none) */
  impact: number;
  /** px/s it slid along something it touched this step (0: none) */
  scrape: number;
  /** true on the step a roll began */
  rolledNow: boolean;
  /** mid-roll */
  rolling: boolean;
}

export const forwardOf = (h: number) => ({ x: Math.sin(h), y: -Math.cos(h) });
const rightOf = (h: number) => ({ x: Math.cos(h), y: Math.sin(h) });
export const speedOf = (car: Car) => Math.hypot(car.vx, car.vy);

/**
 * A vehicle's body as a row of circles along its length (radius = half its
 * width), so long vehicles hit walls with their nose and tail, not just a
 * circle round the middle. Offsets are along the heading, nose positive.
 */
export function bodyOffsets(cls: CarClass): number[] {
  const r = cls.width / 2;
  const span = Math.max(0, cls.length / 2 - r);
  const n = Math.ceil((span * 2) / r);
  return n === 0 ? [0] : Array.from({ length: n + 1 }, (_, i) => -span + (i * 2 * span) / n);
}

export interface Circle {
  x: number;
  y: number;
  r: number;
}

export function bodyCircles(car: Car, heading = car.heading, x = car.x, y = car.y): Circle[] {
  const f = forwardOf(heading);
  const r = car.cls.width / 2;
  return bodyOffsets(car.cls).map((o) => ({ x: x + f.x * o, y: y + f.y * o, r }));
}

/** Distance from a point to the edge of the vehicle's body (0 or less = touching). */
export function distToBody(car: Car, p: { x: number; y: number }): number {
  return Math.min(...bodyCircles(car).map((c) => Math.hypot(p.x - c.x, p.y - c.y) - c.r));
}

const bodyBlocked = (grid: Grid, car: Car, heading: number) =>
  bodyCircles(car, heading).some((c) => circleBlocked(grid, c.x, c.y, c.r));

/** Push `car` by impulse (jx, jy) at (rx, ry) from its middle: its speed by the impulse over its mass, its spin by the turn it gives over its inertia. */
function push(car: Car, jx: number, jy: number, rx: number, ry: number) {
  car.vx += jx / car.cls.mass;
  car.vy += jy / car.cls.mass;
  car.spin = (car.spin ?? 0) + (rx * jy - ry * jx) / inertiaOf(car.cls);
}

/** The speed of the point (rx, ry) from `car`'s middle: its own, and its spin's. */
const pointVelocity = (car: Car, rx: number, ry: number) => ({ x: car.vx - (car.spin ?? 0) * ry, y: car.vy + (car.spin ?? 0) * rx });

/**
 * Get the body out of any solid tile it's in, and bounce it off: for each contact, an impulse straight out (with
 * IMPACT.bounce) and friction along it (IMPACT.friction), both at the point touched, so a hit off the middle spins
 * it. Gives back the hardest hit (px/s straight in), the fastest scrape along, and the way out of the hardest.
 */
function resolveContacts(car: Car, grid: Grid) {
  const m = car.cls.mass;
  const I = inertiaOf(car.cls);
  let impact = 0;
  let scrape = 0;
  let normal: { x: number; y: number } | undefined;
  for (let pass = 0; pass < 3; pass++) {
    let touched = false;
    for (const c of bodyCircles(car)) {
      const k = circleContact(grid, c.x, c.y, c.r);
      if (!k) continue;
      touched = true;
      car.x += k.nx * k.depth;
      car.y += k.ny * k.depth;
      const rx = k.px - car.x;
      const ry = k.py - car.y;
      const v = pointVelocity(car, rx, ry);
      const vn = v.x * k.nx + v.y * k.ny;
      if (vn >= 0) continue;
      const rn = rx * k.ny - ry * k.nx;
      const j = (-(1 + IMPACT.bounce) * vn) / (1 / m + (rn * rn) / I);
      push(car, j * k.nx, j * k.ny, rx, ry);
      if (-vn > impact) [impact, normal] = [-vn, { x: k.nx, y: k.ny }];
      // friction: along the surface, against the slide, no more than the hit allows
      const tx = v.x - vn * k.nx;
      const ty = v.y - vn * k.ny;
      const vt = Math.hypot(tx, ty);
      if (vt < 1e-6) continue;
      scrape = Math.max(scrape, vt);
      const ux = tx / vt;
      const uy = ty / vt;
      const rt = rx * uy - ry * ux;
      const jt = Math.min(IMPACT.friction * j, vt / (1 / m + (rt * rt) / I));
      push(car, -jt * ux, -jt * uy, rx, ry);
    }
    if (!touched) break;
  }
  return { impact, scrape, normal };
}

export function angleDiff(target: number, current: number): number {
  let d = (target - current) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** Apply damage and move the car through smoking → burning → wrecked. */
export function applyDamage(car: Car, amount: number, p: HandlingParams): boolean {
  if (car.wrecked || amount <= 0) return false;
  car.health = Math.max(0, car.health - amount);
  if (car.health <= 0) {
    car.wrecked = true;
    car.burn = undefined;
    return true;
  }
  if (car.burn === undefined && car.health <= car.cls.health * FIRE_AT) car.burn = p.burnTime;
  return false;
}

/** One driving step. Mutates and returns `car`. `input` is ignored for wrecked cars. */
export function stepCar(car: Car, input: DriveInput, p: HandlingParams, dt: number, grid: Grid): StepEvents {
  const onRough = !car.airborne && isRough(grid, car.x, car.y);
  const events: StepEvents = { damage: 0, skidding: false, wreckedNow: false, onRough, airborne: car.airborne, landed: 0, impact: 0, scrape: 0, rolledNow: false, rolling: !!car.rolling };
  // no time passed (a first frame can report 0, or even a little less): nothing moves
  if (!(dt > 0)) return events;
  const cls = car.cls;
  // rough ground: road vehicles lose top speed and grip; off-road ones keep theirs
  const rough = onRough ? cls.offRoad : 1;
  // a damaged car loses power and downforce: its top speed falls with its health
  const hurt = p.damageSlow * (1 - car.health / cls.health);
  const top = cls.topSpeed * rough * (1 - hurt) * (car.speedScale ?? 1);
  // a speed limiter caps what the stick asks for (it doesn't shrink the scale the stick works on)
  const limit = input.limit ?? Infinity;
  // brakes work as well anywhere
  const brake = cls.topSpeed / cls.brakeTime;
  // rough ground drags a car down to its off-road speed quickly (but not in one frame)
  const drag = onRough ? Math.max(p.drag, brake * 0.5) : p.drag;
  const slope = groundAt(grid, car.x, car.y);
  // mid-roll: nothing the driver does counts, and it slides on its side and roof
  const tumbling = !!car.rolling;
  // a spin (from a hit) turns the body, and not its momentum: what's now sideways is a slide
  if (car.spin) car.heading += car.spin * dt;

  const f = forwardOf(car.heading);
  const r = rightOf(car.heading);
  let fwd = car.vx * f.x + car.vy * f.y;
  let side = car.vx * r.x + car.vy * r.y;
  const toward = (v: number, target: number, rate: number) =>
    v < target ? Math.min(target, v + rate * dt) : Math.max(target, v - rate * dt);

  // in the air: no steering, throttle or grip; momentum carries the car
  const grounded = !car.airborne;
  const driven = !car.wrecked && grounded && !tumbling;
  const steer = driven ? input.steer : undefined;
  const mag = steer ? Math.min(1, Math.hypot(steer.x, steer.y)) : 0;
  const handbrake = driven && input.handbrake;
  const braking = driven && input.brake === true;
  const wheel = driven ? input.wheel : undefined;

  if (!grounded) {
    // keep fwd and side as they are
  } else if (wheel) {
    // like a car: the wheel turns it only while it rolls, and the other way round in reverse
    const rolling = Math.min(1, Math.abs(fwd) / 30);
    const turnScale = Math.min(1, Math.max(0.35, Math.abs(fwd) / (top * 0.3))) * rolling * (fwd < 0 ? -1 : 1);
    const turn = Math.max(-1, Math.min(1, wheel.turn)) * cls.turnRate * (car.tyreGrip ?? 1) * dt * turnScale * (handbrake ? p.handbrakeTurn : 1);
    const next = car.heading + turn;
    if (!bodyBlocked(grid, car, next) || bodyBlocked(grid, car, car.heading)) car.heading = next;
    const nf0 = forwardOf(car.heading);
    const nr0 = rightOf(car.heading);
    fwd = car.vx * nf0.x + car.vy * nf0.y;
    side = car.vx * nr0.x + car.vy * nr0.y;
    const gas = Math.max(0, Math.min(1, wheel.gas));
    if (wheel.reverse) {
      const want = -Math.min(top * 0.35, limit);
      fwd = fwd > want ? Math.max(want, fwd - enginePull(cls, fwd) * dt) : toward(fwd, want, drag);
    } else if (gas > 0) {
      const want = Math.min(top * gas, limit);
      fwd = fwd < want ? Math.min(want, fwd + enginePull(cls, fwd) * dt) : toward(fwd, want, drag);
    } else {
      fwd = toward(fwd, 0, drag);
    }
  } else if (steer && mag > 0) {
    let target = Math.atan2(steer.x, -steer.y);
    let diff = angleDiff(target, car.heading);
    const reversing = p.allowReverse && Math.abs(diff) > (Math.PI * 5) / 6 && fwd < 20;
    if (reversing) {
      // back up: the rear of the car points where the player is pushing
      target += Math.PI;
      diff = angleDiff(target, car.heading);
    }
    const turnScale = Math.min(1, Math.max(0.35, Math.abs(fwd) / (top * 0.3)));
    const turn = cls.turnRate * (car.tyreGrip ?? 1) * dt * turnScale * (handbrake ? p.handbrakeTurn : 1);
    const next = car.heading + Math.max(-turn, Math.min(turn, diff));
    // a long body can't swing its nose or tail into a wall
    if (!bodyBlocked(grid, car, next) || bodyBlocked(grid, car, car.heading)) car.heading = next;
    // The body has turned but momentum hasn't: re-split the velocity against the
    // new heading. The part that's now sideways is the slide.
    const nf0 = forwardOf(car.heading);
    const nr0 = rightOf(car.heading);
    fwd = car.vx * nf0.x + car.vy * nf0.y;
    side = car.vx * nr0.x + car.vy * nr0.y;
    if (reversing) {
      const want = -Math.min(top * 0.35 * mag, limit);
      fwd = fwd > want ? Math.max(want, fwd - enginePull(cls, fwd) * dt) : toward(fwd, want, drag);
    } else if (Math.abs(diff) < Math.PI / 2) {
      // the engine pulls up to the speed the stick asks for; above it, the car eases back
      const want = Math.min(top * mag, limit);
      fwd = fwd < want ? Math.min(want, fwd + enginePull(cls, fwd) * (1 - Math.abs(diff) / Math.PI) * dt) : toward(fwd, want, drag);
    } else {
      // target is behind: brake and swing round
      fwd = toward(fwd, 0, brake);
    }
  } else {
    // (a wreck coasts to a stop, sliding on what's left of it)
    fwd = toward(fwd, 0, car.wrecked ? brake * 0.6 : drag);
  }
  const nf = forwardOf(car.heading);
  const nr = rightOf(car.heading);
  if (grounded) {
    if (handbrake) fwd = toward(fwd, 0, brake * 0.5);
    if (braking) fwd = toward(fwd, 0, brake);
    if (tumbling) fwd = toward(fwd, 0, IMPACT.rollDrag);
    // slopes: gravity along the slope works against (or with) the engine, so how steep a
    // climb a vehicle manages comes from its torque and mass; across the slope (a banked
    // turn) it pushes the car toward the low side, the inside of the bend
    if (slope.gx || slope.gy) {
      const ax = -p.gravity * slope.gx;
      const ay = -p.gravity * slope.gy;
      fwd += (ax * nf.x + ay * nf.y) * p.slopeGravity * dt;
      side += (ax * nr.x + ay * nr.y) * p.bankGravity * dt;
    }
    // a little overspeed is allowed rolling downhill; rolling back off a slope can beat reversing speed
    fwd = Math.max(-cls.topSpeed * 0.6, Math.min(cls.topSpeed * 1.25, fwd));

    const gripShare = (0.5 + 0.5 * rough) * (handbrake ? p.handbrakeGrip : 1) * (car.wrecked ? 1.5 : 1) * (tumbling ? 0.4 : 1);
    const grip = cls.grip * (car.tyreGrip ?? 1) * gripShare;
    // the slide fades as the tyres bite, but they can only push so hard sideways
    const bite = side * (1 - Math.exp(-grip * dt));
    // (no limit stays no limit: Infinity × a zero step would be NaN)
    const most = Number.isFinite(p.lateralGrip) ? p.lateralGrip * grip * dt : Infinity;
    side -= Math.sign(bite) * Math.min(Math.abs(bite), most);
    // a sliding car scrubs off speed
    if (p.slideScrub && fwd > 0) fwd = Math.max(0, fwd - Math.abs(side) * p.slideScrub * dt);
    events.skidding = !car.wrecked && Math.abs(side) > SKID_SPEED;
  }

  car.vx = nf.x * fwd + nr.x * side;
  car.vy = nf.y * fwd + nr.y * side;
  // the spin dies away: on the ground the tyres stop it, in the air (or rolling) hardly anything does
  if (car.spin) {
    car.spin *= Math.exp(-(grounded && !tumbling ? IMPACT.spinGrip : IMPACT.spinAir) * dt);
    if (Math.abs(car.spin) < 0.01) car.spin = 0;
  }

  // moved on (in steps short enough that nothing's passed through), each step out of whatever it ran into, bounced off it
  const steps = Math.max(1, Math.ceil((speedOf(car) * dt) / (cls.width * 0.4)));
  let hit: ReturnType<typeof resolveContacts> = { impact: 0, scrape: 0, normal: undefined };
  for (let k = 0; k < steps; k++) {
    car.x += (car.vx * dt) / steps;
    car.y += (car.vy * dt) / steps;
    const h = resolveContacts(car, grid);
    hit = { ...(h.impact > hit.impact ? h : hit), scrape: Math.max(hit.scrape, h.scrape) };
  }
  events.impact = hit.impact;
  events.scrape = hit.scrape;
  // (the damage: from how hard it hit, straight into it; a scrape along does none)
  let damage = Math.max(0, hit.impact - p.crashThreshold) * p.crashDamage;

  // a roll: hit side-on hard, or sliding sideways into soft ground fast enough to dig in; over the way it was going
  if (!car.rolling && !car.wrecked && !car.airborne) {
    const right = rightOf(car.heading);
    const across = hit.normal ? hit.normal.x * right.x + hit.normal.y * right.y : 0;
    const sideHit = hit.impact * Math.abs(across);
    const sideways = car.vx * right.x + car.vy * right.y;
    const dig = onRough && Math.abs(sideways) >= IMPACT.digFrom;
    if (sideHit >= IMPACT.rollFrom || dig) {
      const way = sideHit >= IMPACT.rollFrom ? -Math.sign(across) : Math.sign(sideways);
      const turns = Math.max(sideHit, Math.abs(sideways)) >= IMPACT.twiceFrom ? 2 : 1;
      car.rolling = way * turns * Math.PI * 2;
      car.rolled = 0;
      events.rolledNow = true;
    }
  }
  if (car.rolling) {
    const turn = Math.sign(car.rolling) * Math.min(Math.abs(car.rolling), IMPACT.rollRate * dt);
    const roofs = (a: number) => Math.floor((Math.abs(a) + Math.PI) / (Math.PI * 2));
    const was = car.rolled ?? 0;
    car.rolled = was + turn;
    car.rolling -= turn;
    // (each time over onto its roof)
    if (roofs(car.rolled) > roofs(was)) damage += IMPACT.roofDamage;
    if (Math.abs(car.rolling) < 1e-9) {
      car.rolling = undefined;
      car.rolled = 0;
    }
  }
  events.rolling = !!car.rolling;

  // height: follow the ground, take off when it falls away faster than gravity pulls, land hard
  const under = groundAt(grid, car.x, car.y);
  const ground = under.h;
  if (car.airborne) {
    car.vz -= p.gravity * dt;
    car.z += car.vz * dt;
    if (car.z <= ground) {
      events.landed = -car.vz;
      damage += Math.max(0, -car.vz - p.landThreshold) * p.crashDamage;
      car.z = ground;
      // (on the ground's own climb rate: landed on a downslope, it doesn't take off again at once)
      car.vz = Math.max(-speedOf(car) * MAX_LAUNCH_GRADE, Math.min(speedOf(car) * MAX_LAUNCH_GRADE, under.gx * car.vx + under.gy * car.vy));
      car.airborne = false;
    }
  } else if (Math.abs(ground - car.z) > 20) {
    // placed or reset somewhere else: snap to the ground
    car.z = ground;
    car.vz = 0;
  } else {
    // climb rate from the slope under the car and its velocity (not from height jumps, so a reset can't launch it)
    const climb = under.gx * car.vx + under.gy * car.vy;
    // take off when the ground's climb rate falls away faster than gravity can follow:
    // a ramp lip, a sharp crest, the edge of a table-top
    if (car.vz - climb > p.gravity * dt + TAKEOFF_MARGIN) {
      car.airborne = true;
      car.z = Math.max(ground, car.z + car.vz * dt - 0.5 * p.gravity * dt * dt);
      car.vz -= p.gravity * dt;
    } else {
      car.vz = Math.min(climb, speedOf(car) * MAX_LAUNCH_GRADE);
      car.z = ground;
    }
  }
  events.airborne = car.airborne;

  if (damage > 0) {
    events.damage = damage;
    events.wreckedNow = applyDamage(car, damage, p);
  }

  if (car.burn !== undefined && !car.wrecked) {
    car.burn -= dt;
    if (car.burn <= 0) {
      car.wrecked = true;
      car.burn = undefined;
      car.health = 0;
      events.wreckedNow = true;
    }
  }
  return events;
}

/**
 * Resolve a hit between two vehicles (their body circles, 1 px fatter): push them apart, then an impulse between
 * them at the point they touch (with IMPACT.carBounce, and friction along it), so they trade spin as well as speed by
 * their masses and inertias: a tap on the rear quarter turns a car round. Damages both by the closing speed.
 * Returns the closing speed (0 when they weren't colliding).
 */
export function collideCars(a: Car, b: Car, p: HandlingParams): number {
  // the deepest-overlapping pair of body circles decides the contact
  let best: { nx: number; ny: number; overlap: number; px: number; py: number } | undefined;
  for (const ca of bodyCircles(a)) {
    for (const cb of bodyCircles(b)) {
      const dx = cb.x - ca.x;
      const dy = cb.y - ca.y;
      const d = Math.hypot(dx, dy);
      const overlap = ca.r + cb.r + 2 - d;
      // (the point they touch: between the two circles' edges)
      const along = (ca.r + (d - cb.r)) / 2;
      if (overlap > 0 && d > 0 && (!best || overlap > best.overlap)) best = { nx: dx / d, ny: dy / d, overlap, px: ca.x + (dx / d) * along, py: ca.y + (dy / d) * along };
    }
  }
  if (!best) return 0;
  const { nx, ny, overlap } = best;
  const ma = a.cls.mass;
  const mb = b.cls.mass;
  // separate, lighter vehicle moves further
  a.x -= nx * overlap * (mb / (ma + mb));
  a.y -= ny * overlap * (mb / (ma + mb));
  b.x += nx * overlap * (ma / (ma + mb));
  b.y += ny * overlap * (ma / (ma + mb));
  const ra = { x: best.px - a.x, y: best.py - a.y };
  const rb = { x: best.px - b.x, y: best.py - b.y };
  const va = pointVelocity(a, ra.x, ra.y);
  const vb = pointVelocity(b, rb.x, rb.y);
  const rel = { x: va.x - vb.x, y: va.y - vb.y };
  const closing = rel.x * nx + rel.y * ny;
  if (closing <= 0) return 0;
  const [Ia, Ib] = [inertiaOf(a.cls), inertiaOf(b.cls)];
  /** how hard it is to change the two points' speed along (ux, uy) */
  const resists = (ux: number, uy: number) => 1 / ma + 1 / mb + (ra.x * uy - ra.y * ux) ** 2 / Ia + (rb.x * uy - rb.y * ux) ** 2 / Ib;
  const j = ((1 + IMPACT.carBounce) * closing) / resists(nx, ny);
  push(a, -j * nx, -j * ny, ra.x, ra.y);
  push(b, j * nx, j * ny, rb.x, rb.y);
  // friction: the two rubbing along each other
  const tx = rel.x - closing * nx;
  const ty = rel.y - closing * ny;
  const vt = Math.hypot(tx, ty);
  if (vt > 1e-6) {
    const [ux, uy] = [tx / vt, ty / vt];
    const jt = Math.min(IMPACT.carFriction * j, vt / resists(ux, uy));
    push(a, -jt * ux, -jt * uy, ra.x, ra.y);
    push(b, jt * ux, jt * uy, rb.x, rb.y);
  }
  const base = Math.max(0, closing - p.crashThreshold) * p.crashDamage;
  applyDamage(a, base * (mb / ma), p);
  applyDamage(b, base * (ma / mb), p);
  return closing;
}

/**
 * How the body sits: pitch (nose up, radians) and roll (right side up) from
 * the slope under it, or from the flight path in the air; mid-roll, turned
 * over by the roll, and `lift` px up off the ground as it goes over onto its
 * side (half its width, its middle up that much higher).
 */
export function bodyTilt(car: Car, grid: Grid): { pitch: number; roll: number; lift: number } {
  const over = car.rolled ?? 0;
  const lift = (Math.abs(Math.sin(over)) * car.cls.width) / 2;
  if (car.airborne) return { pitch: Math.atan2(car.vz, Math.max(40, speedOf(car))) * 0.6, roll: over, lift };
  const g = groundAt(grid, car.x, car.y);
  const f = forwardOf(car.heading);
  const r = rightOf(car.heading);
  return { pitch: Math.atan(g.gx * f.x + g.gy * f.y), roll: Math.atan(g.gx * r.x + g.gy * r.y) + over, lift };
}

/** Fully repaired and stopped, at a position and heading. */
export function resetCar(car: Car, x: number, y: number, heading: number): void {
  Object.assign(car, { x, y, heading, vx: 0, vy: 0, health: car.cls.health, burn: undefined, wrecked: false, z: 0, vz: 0, airborne: false, spin: 0, rolling: undefined, rolled: 0 });
}
