// The controls lap: on first launch, a run down the shakedown on your own
// before the menu, with a prompt at a time for the controls on the device
// you're using (the touch screen, keys, or a gamepad): go, full speed, slowing
// for a bend, drifting, the co-driver's calls, and on to the finish. Each
// prompt moves on once you've done it (or, for the ones that wait for a bend,
// once you've been through one). TOP-DOWN's is shorter: the gas is always on and there's no DRIFT (braking with the
// wheel turned hard slides the car), so it's go, a bend, the calls and the finish. With CONTROL on POINT you point the
// way to go and the car slows for the bends itself, and the prompts say so. Engine-free.

import type { Control, DriveStyle, GasMode } from '../engine/drive/settings';

/** The device you're driving with. */
export type Device = 'touch' | 'keys' | 'pad';

export type Step = 'go' | 'faster' | 'bend' | 'drift' | 'notes' | 'lap' | 'done';
export const STEPS: Step[] = ['go', 'faster', 'bend', 'drift', 'notes', 'lap', 'done'];
/** The controls lap's steps in `style` (the last, 'done', isn't one to do). */
export const stepsFor = (style: DriveStyle): Step[] => (style === 'topdown' ? ['go', 'bend', 'notes', 'lap', 'done'] : STEPS);

/** What the prompt says for `step` on `device`, with GAS on MANUAL or AUTO, in `style` with `control`
 * (src/engine/drive/settings.ts). */
export function prompt(step: Step, device: Device, gas: GasMode = 'manual', style: DriveStyle = 'sim', control: Control = 'wheel'): string {
  const auto = gas === 'auto';
  if (style === 'topdown' && control === 'point') {
    if (step === 'go') {
      if (device === 'touch') return 'THE GAS IS ON · DRAG THE WAY YOU WANT TO GO';
      if (device === 'keys') return 'THE GAS IS ON · THE ARROWS POINT THE WAY TO GO';
      return 'THE GAS IS ON · THE LEFT STICK POINTS THE WAY TO GO';
    }
    if (step === 'bend') {
      if (device === 'touch') return 'THE CAR SLOWS FOR BENDS ITSELF · HOLD BRAKE TO SLOW MORE';
      if (device === 'keys') return 'THE CAR SLOWS FOR BENDS ITSELF · SPACE TO SLOW MORE';
      return 'THE CAR SLOWS FOR BENDS ITSELF · LEFT TRIGGER TO SLOW MORE';
    }
  }
  if (style === 'topdown' && step === 'bend') {
    // (no DRIFT: the brake with the wheel turned hard slides the car)
    if (device === 'touch') return 'BRAKE BEFORE A BEND · BRAKE AND STEER HARD TO SLIDE';
    if (device === 'keys') return 'DOWN TO BRAKE · DOWN AND STEER HARD TO SLIDE';
    return 'LEFT TRIGGER TO BRAKE · BRAKE AND STEER HARD TO SLIDE';
  }
  switch (step) {
    case 'go':
      if (device === 'touch') return auto ? 'THE GAS IS ON · DRAG ACROSS TO STEER' : 'HOLD GAS TO GO · DRAG ACROSS TO STEER';
      if (device === 'keys') return auto ? 'THE GAS IS ON · LEFT AND RIGHT TO STEER' : 'UP TO GO · LEFT AND RIGHT TO STEER';
      return auto ? 'THE GAS IS ON · LEFT STICK TO STEER' : 'RIGHT TRIGGER TO GO · LEFT STICK TO STEER';
    case 'faster':
      if (auto) return 'THE GAS STAYS ON: JUST STEER';
      return device === 'touch' ? 'KEEP GAS HELD FOR FULL SPEED' : 'KEEP IT HELD FOR FULL SPEED';
    case 'bend':
      return device === 'touch' ? 'BRAKE BEFORE A BEND' : device === 'keys' ? 'DOWN TO BRAKE BEFORE A BEND' : 'LEFT TRIGGER TO BRAKE BEFORE A BEND';
    case 'drift':
      return device === 'keys' ? 'HOLD SHIFT IN A BEND TO DRIFT ROUND IT' : device === 'touch' ? 'HOLD DRIFT IN A BEND TO SLIDE ROUND IT' : 'HOLD A IN A BEND TO DRIFT ROUND IT';
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
  /** whether you can drift; the drift prompt is skipped if not */
  canDrift?: boolean;
  lapDone: boolean;
}

/** Move the prompt on if its step is done (the steps as `steps` has them); true if it moved. */
export function advance(o: Onboarding, f: Facts, steps: Step[] = STEPS): boolean {
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
  o.step = steps[steps.indexOf(o.step) + 1] ?? 'done';
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
