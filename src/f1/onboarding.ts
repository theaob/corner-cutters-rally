// The controls lap: on first launch, a run down the shakedown on your own
// before the menu, with a prompt at a time for the controls on the device
// you're using (the screen's halves, keys, or a gamepad): steer left, steer
// right, brake to a stop, reverse, the co-driver's calls, and on to the finish.
// Each prompt moves on once you've done it (the calls once you've been through a
// bend), so nobody leaves it without having braked and reversed. The gas is
// always on: there's one way to drive, the screen's halves in landscape (left
// steers left, right steers right, both brake and then reverse); the keys and a
// gamepad drive the same way. Engine-free.

/** The device you're driving with. */
export type Device = 'touch' | 'keys' | 'pad';

export type Step = 'left' | 'right' | 'brake' | 'reverse' | 'notes' | 'lap' | 'done';
export const STEPS: Step[] = ['left', 'right', 'brake', 'reverse', 'notes', 'lap', 'done'];

/** What you're holding: nothing, a half, or both. */
export type Holding = 'none' | 'left' | 'right' | 'both';

/** The screen's halves a step lights up on a touch screen (the halves to hold), if any. */
export function teaches(step: Step): Holding {
  if (step === 'left' || step === 'right') return step;
  return step === 'brake' || step === 'reverse' ? 'both' : 'none';
}

/** What the prompt says for `step` on `device`. */
export function prompt(step: Step, device: Device): string {
  const touch = device === 'touch';
  switch (step) {
    case 'left':
      if (touch) return 'HOLD THE LEFT HALF TO STEER LEFT · THE GAS IS ALWAYS ON';
      return device === 'keys' ? 'HOLD LEFT TO STEER LEFT · THE GAS IS ALWAYS ON' : 'PUSH THE STICK LEFT TO STEER · THE GAS IS ALWAYS ON';
    case 'right':
      if (touch) return 'NOW HOLD THE RIGHT HALF TO STEER RIGHT';
      return device === 'keys' ? 'NOW HOLD RIGHT TO STEER RIGHT' : 'NOW PUSH THE STICK RIGHT';
    case 'brake':
      if (touch) return 'HOLD BOTH HALVES TO BRAKE · STOP THE CAR';
      return device === 'keys' ? 'HOLD DOWN TO BRAKE · STOP THE CAR' : 'HOLD THE LEFT TRIGGER TO BRAKE · STOP THE CAR';
    case 'reverse':
      return 'KEEP HOLDING TO REVERSE · LET GO TO DRIVE ON';
    case 'notes':
      return 'THE CO-DRIVER CALLS EACH BEND: 6 IS FAST, 1 IS SLOW · MIND THE TREES';
    case 'lap':
      return 'ON TO THE FLYING FINISH';
    case 'done':
      return device === 'keys' ? "YOU'RE READY! Z FOR THE MENU" : "YOU'RE READY! A FOR THE MENU";
  }
}

export interface Onboarding {
  step: Step;
  /** bends passed when the step began (the steps that wait for a bend count from there) */
  from: number;
  /** seconds the step's thing has been done for, so far */
  held: number;
}

export const newOnboarding = (): Onboarding => ({ step: 'left', from: 0, held: 0 });

/** How long a step's hold takes (s): steering each way, and reversing. */
export const HOLD_FOR = { steer: 0.6, reverse: 1 };
/** Slower than this (the speed's units: km/h on the readout) the car has stopped. */
export const STOPPED = 4;

/** What's happened so far, this step of `dt` seconds: your speed, what you hold, whether the car is reversing, the bends you've been through, whether you're past the finish. */
export interface Facts {
  speed: number;
  holding: Holding;
  reversing: boolean;
  bends: number;
  lapDone: boolean;
  dt: number;
}

/** Move the prompt on if its step is done; true if it moved. */
export function advance(o: Onboarding, f: Facts): boolean {
  const through = f.bends - o.from;
  // (the steps done by holding a while: the time adds up while it's held, and starts again when it's let go)
  const keep = (doing: boolean, need: number) => {
    o.held = doing ? o.held + f.dt : 0;
    return o.held >= need;
  };
  const done =
    o.step === 'left' ? keep(f.holding === 'left', HOLD_FOR.steer)
    : o.step === 'right' ? keep(f.holding === 'right', HOLD_FOR.steer)
    // (stopped with both held: the next moment it reverses)
    : o.step === 'brake' ? f.holding === 'both' && (f.speed < STOPPED || f.reversing)
    : o.step === 'reverse' ? keep(f.reversing && f.speed > 2, HOLD_FOR.reverse)
    : o.step === 'notes' ? through >= 1
    : o.step === 'lap' ? f.lapDone
    : false;
  if (!done) return false;
  o.step = STEPS[STEPS.indexOf(o.step) + 1] ?? 'done';
  o.from = f.bends;
  o.held = 0;
  return true;
}

/**
 * How many of the bends (their apexes, as samples) a car passed going from
 * sample `from` to `to` (forwards, less than half the road's `n` samples on).
 */
export function apexesPassed(apexes: number[], from: number, to: number, n: number): number {
  const ahead = (((to - from) % n) + n) % n;
  if (ahead === 0 || ahead > n / 2) return 0;
  return apexes.filter((a) => {
    const d = (((a - from) % n) + n) % n;
    return d > 0 && d <= ahead;
  }).length;
}
