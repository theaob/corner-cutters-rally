// The driver: what you ask for (on a touch screen, the keys or a gamepad: whichever you used last) turned into what
// the car does, one fixed step at a time. The steering goes through the wheel (steering.ts: its rate and its curve)
// with the assist's hand on it (assist.ts); the gas, the brakes, and held on the brake once
// stopped, reverse.

import type { Car, DriveInput } from '../driving';
import { assisted, type RoadAhead } from './assist';
import { IDLE, active, type Intent } from './intent';
import type { DriveSettings } from './settings';
import { turnWheel, tyreTurn } from './steering';

export type Source = 'touch' | 'keys' | 'pad';

/** px/s: slower than this going forwards, the brake held (off the gas) backs the car up */
export const REVERSE_BELOW = 12;
/** the brake counts as on past this much of its travel (a trigger) */
const BRAKE_ON = 0.25;
/** radians: the car turned further than this from the road (spun, or the wrong way) and the assist lets go */
const ASSIST_GIVES_UP = 1.6;

/** The car's speed straight ahead (px/s; less than 0 going backwards). */
export const forwardSpeed = (car: Car) => car.vx * Math.sin(car.heading) - car.vy * Math.cos(car.heading);

export class Driver {
  private wheel = 0;
  private now: Intent = IDLE;
  private last: Source | undefined;

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

  /** The wheel's position (−1…1), for drawing it. */
  wheelPos(): number {
    return this.wheel;
  }

  /** Straight ahead again (a restart). */
  reset(): void {
    this.wheel = 0;
  }

  /** One fixed step (`dt` s) for your car: the wheel turned, and the car's input. `road`: for the assist. */
  step(car: Car, dt: number, road?: RoadAhead): DriveInput {
    const s = this.settings();
    const i = this.intent();
    const forward = forwardSpeed(car);
    // (the assist only going forwards, and only with the road roughly ahead)
    const near = road && forward > 20 && Math.abs(Math.atan2(Math.sin(road.dir - car.heading), Math.cos(road.dir - car.heading))) < ASSIST_GIVES_UP;
    this.wheel = turnWheel(this.wheel, assisted(i.steer, car.heading, near ? road : undefined, s.assist), dt, s.feel);
    const turn = tyreTurn(this.wheel, Math.abs(forward) / car.cls.topSpeed, i.handbrake, s.feel);
    const braking = i.brake > BRAKE_ON;
    if (braking && i.throttle < 0.1 && forward < REVERSE_BELOW) return { wheel: { turn, gas: 0, reverse: true }, handbrake: i.handbrake };
    return { wheel: { turn, gas: braking ? 0 : i.throttle, reverse: false }, brake: braking, handbrake: i.handbrake };
  }
}
