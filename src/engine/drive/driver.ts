// The driver: what you ask for (on a touch screen, the keys or a gamepad: whichever you used last) turned into what
// the car does, one fixed step at a time. The steering goes through the wheel (steering.ts: its rate and its curve)
// with the assist's hand on it (assist.ts); the gas, the brakes, and held on the brake once
// stopped, reverse. In TOP-DOWN there's no handbrake to reach for: braking with the wheel turned hard slides the car
// (SLIDE), the way DRIFT does. With CONTROL on POINT (point.ts) you point the way to go instead of turning the wheel,
// and the car slows for the road ahead on its own.

import type { Car, DriveInput } from '../driving';
import { assisted, type RoadAhead } from './assist';
import { IDLE, active, type Intent } from './intent';
import type { DriveSettings } from './settings';
import { turnWheel, tyreTurn } from './steering';
import { POINT, driftFor, pulledAim, turnBetween, wayOf } from './point';

export type Source = 'touch' | 'keys' | 'pad';

/** px/s: slower than this going forwards, the brake held (off the gas) backs the car up */
export const REVERSE_BELOW = 12;
/** the brake counts as on past this much of its travel (a trigger) */
const BRAKE_ON = 0.25;
/** radians: the car turned further than this from the road (spun, or the wrong way) and the assist lets go */
const ASSIST_GIVES_UP = 1.6;
/** TOP-DOWN's slide: braking with the wheel turned at least `wheel` of the way, going at least `from` of top speed */
export const SLIDE = { wheel: 0.6, from: 0.3 };

/** The car's speed straight ahead (px/s; less than 0 going backwards). */
export const forwardSpeed = (car: Car) => car.vx * Math.sin(car.heading) - car.vy * Math.cos(car.heading);

export class Driver {
  private wheel = 0;
  private now: Intent = IDLE;
  private last: Source | undefined;
  private slid = false;
  /** POINT: the drift now (0…1, eased) */
  private drift = 0;

  constructor(
    private readonly read: { touch?: () => Intent; keys: () => Intent; pad: () => Intent | undefined },
    private readonly settings: () => DriveSettings,
  ) {}

  /** Once a frame: what each source asks for. The one in use keeps driving while it asks for anything; once it lets go,
   * the next one used takes over. */
  sample(): void {
    const got: [Source, Intent | undefined][] = [['touch', this.read.touch?.()], ['keys', this.read.keys()], ['pad', this.read.pad()]];
    const using = got.find(([s, i]) => s === this.last && active(i));
    if (!using) {
      const other = got.find(([, i]) => active(i));
      if (other) this.last = other[0];
    }
    this.now = got.find(([s]) => s === this.last)?.[1] ?? IDLE;
  }

  /** The source used last (none yet: undefined). */
  source(): Source | undefined {
    return this.last;
  }

  /** What you're asking for now, with GAS on AUTO: the gas on unless you brake. */
  intent(): Intent {
    const i = this.now;
    if (this.settings().gas !== 'auto') return i;
    return { ...i, throttle: i.brake > BRAKE_ON ? 0 : 1 };
  }

  /** Whether the latest step slid the car (TOP-DOWN: braking with the wheel turned hard; POINT: a drift). */
  sliding(): boolean {
    return this.slid;
  }

  /** The wheel's position (−1…1), for drawing it. */
  wheelPos(): number {
    return this.wheel;
  }

  /** Straight ahead again (a restart). */
  reset(): void {
    this.wheel = 0;
    this.drift = 0;
  }

  /** One fixed step (`dt` s) for your car: the wheel turned, and the car's input. `road`: for the assist. */
  step(car: Car, dt: number, road?: RoadAhead): DriveInput {
    const s = this.settings();
    const i = this.intent();
    const forward = forwardSpeed(car);
    if (s.style === 'topdown' && s.control === 'point') return this.pointStep(car, i, forward, road, s, dt);
    // (the assist only going forwards, and only with the road roughly ahead)
    const near = road && forward > 20 && Math.abs(Math.atan2(Math.sin(road.dir - car.heading), Math.cos(road.dir - car.heading))) < ASSIST_GIVES_UP;
    this.wheel = turnWheel(this.wheel, assisted(i.steer, car.heading, near ? road : undefined, s.assist), dt, s.feel);
    const pressed = i.brake > BRAKE_ON;
    // (TOP-DOWN: the brake with the wheel turned hard is the handbrake, at speed)
    this.slid = s.style === 'topdown' && pressed && Math.abs(this.wheel) >= SLIDE.wheel && forward >= car.cls.topSpeed * SLIDE.from;
    const handbrake = i.handbrake || this.slid;
    const braking = pressed && !this.slid;
    const turn = tyreTurn(this.wheel, Math.abs(forward) / car.cls.topSpeed, handbrake, s.feel);
    if (pressed && i.throttle < 0.1 && forward < REVERSE_BELOW) return { wheel: { turn, gas: 0, reverse: true }, handbrake };
    return { wheel: { turn, gas: pressed ? 0 : i.throttle, reverse: false }, brake: braking, handbrake };
  }

  /** CONTROL: POINT. The car steers for where you point (the road pulling your aim), or holds its course; the gas is
   * on up to what the road ahead allows, the brakes on over it. Pointed hard (the thumb out at the ring's edge) well off
   * where the car's nose is, at speed, it drifts: the tail steps out and the nose comes round quick, all from the one
   * thumb. The brake (keys, a pad) slows it more. */
  private pointStep(car: Car, i: Intent, forward: number, road: RoadAhead | undefined, s: DriveSettings, dt: number): DriveInput {
    const near = road && forward > 20 && Math.abs(turnBetween(car.heading, road.dir)) < ASSIST_GIVES_UP;
    const pointing = !!i.point && (i.point.x !== 0 || i.point.y !== 0);
    const aim = pointing ? pulledAim(wayOf(i.point!.x, i.point!.y), near ? road : undefined, s.assist) : car.heading;
    const off = turnBetween(car.heading, aim);
    // (for drawing: how hard it's turning)
    this.wheel = Math.max(-1, Math.min(1, off / POINT.driftFull));
    const pressed = i.brake > BRAKE_ON || i.handbrake;
    if (pressed && forward < REVERSE_BELOW && !pointing) {
      this.drift = 0;
      this.slid = false;
      return { wheel: { turn: 0, gas: 0, reverse: true }, handbrake: false };
    }
    // the drift: how far off the nose you point, how hard you push, how fast you're going; eased in and out
    const want = pointing ? driftFor(Math.abs(off), Math.hypot(i.point!.x, i.point!.y), forward / car.cls.topSpeed) : 0;
    const rate = want > this.drift ? POINT.driftIn : POINT.driftOut;
    this.drift += Math.max(-rate * dt, Math.min(rate * dt, want - this.drift));
    this.slid = this.drift > POINT.slidingAt;
    const safe = road?.safe ?? Infinity;
    const braking = pressed || forward > safe + POINT.brakeOver;
    return { steer: { x: Math.sin(aim), y: -Math.cos(aim) }, limit: safe, brake: braking, handbrake: false, drift: this.drift };
  }
}
