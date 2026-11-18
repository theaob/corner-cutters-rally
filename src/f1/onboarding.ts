// The controls lap: on first launch, a run down the shakedown on your own
// before the menu, with a prompt at a time for the controls on the device
// you're using (the touch stick, keys, or a gamepad): go, full speed, slowing
// for a bend, drifting (on the keys or a gamepad, and on a touch screen on dirt, where the deck has a DRIFT button),
// the co-driver's calls, and on to the finish. Each prompt moves on once you've done it (or, for the ones that wait
// for a bend, once you've been through one). The controls are Corner Cutters': the touch stick points the way to go,
// the keys and a gamepad steer the car. Engine-free.

/** The device you're driving with. */
export type Device = 'touch' | 'keys' | 'pad';

export type Step = 'go' | 'faster' | 'bend' | 'drift' | 'notes' | 'lap' | 'done';
export const STEPS: Step[] = ['go', 'faster', 'bend', 'drift', 'notes', 'lap', 'done'];

/** Whether `device` drives by pointing the way to go (the touch stick), rather than steering the car (keys, a gamepad). */
export const pointsOn = (device: Device): boolean => device === 'touch';

/** What the prompt says for `step` on `device` (`split`: driving by the screen's halves, SPLIT; a gamepad keeps its own). */
export function prompt(step: Step, device: Device, split = false): string {
  const points = pointsOn(device);
  if (split && device !== 'pad') {
    const touch = device === 'touch';
    if (step === 'go') return touch ? 'HOLD THE LEFT OR RIGHT HALF TO STEER · THE GAS IS ALWAYS ON' : 'LEFT AND RIGHT TO STEER · THE GAS IS ALWAYS ON';
    if (step === 'faster') return 'LET GO ON THE STRAIGHTS FOR FULL SPEED';
    if (step === 'bend') return touch ? 'HOLD BOTH HALVES TO BRAKE · KEEP HOLDING TO REVERSE' : 'HOLD LEFT AND RIGHT TO BRAKE · KEEP HOLDING TO REVERSE';
  }
  switch (step) {
    case 'go':
      if (points) return 'PUSH THE STICK THE WAY YOU WANT TO GO';
      return device === 'keys' ? 'UP TO GO · LEFT AND RIGHT TO STEER' : 'RIGHT TRIGGER TO GO · STICK TO STEER';
    case 'faster':
      return points ? 'PUSH IT ALL THE WAY OUT FOR FULL SPEED' : 'KEEP IT HELD FOR FULL SPEED';
    case 'bend':
      if (points) return 'EASE THE STICK IN BEFORE A BEND TO SLOW';
      return device === 'keys' ? 'DOWN TO BRAKE BEFORE A BEND' : 'LEFT TRIGGER TO BRAKE BEFORE A BEND';
    case 'drift':
      return device === 'keys' ? 'HOLD X IN A BEND TO DRIFT ROUND IT' : device === 'touch' ? 'HOLD DRIFT IN A BEND TO SLIDE ROUND IT' : 'HOLD A IN A BEND TO DRIFT ROUND IT';
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
}

export const newOnboarding = (): Onboarding => ({ step: 'go', from: 0 });

/** What's happened so far: your speed (and top speed), the bends you've been through, whether you're drifting, whether you're past the finish. */
export interface Facts {
  speed: number;
  top: number;
  bends: number;
  drifting: boolean;
  /** whether you can drift (on a touch screen only on dirt: the deck's DRIFT button); the drift prompt is skipped if not */
  canDrift?: boolean;
  lapDone: boolean;
}

/** Move the prompt on if its step is done; true if it moved. */
export function advance(o: Onboarding, f: Facts): boolean {
  const through = f.bends - o.from;
  const done =
    o.step === 'go' ? f.speed > 100
    : o.step === 'faster' ? f.speed > f.top * 0.8
    : o.step === 'bend' ? through >= 1
    // (a drift, or two bends without one: it's there when you want it)
    : o.step === 'drift' ? f.canDrift === false || (f.drifting && f.speed > 80) || through >= 2
    : o.step === 'notes' ? through >= 1
    : o.step === 'lap' ? f.lapDone
    : false;
  if (!done) return false;
  o.step = STEPS[STEPS.indexOf(o.step) + 1] ?? 'done';
  o.from = f.bends;
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
