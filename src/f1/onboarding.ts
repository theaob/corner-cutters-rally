// The controls lap: on first launch, a run down the shakedown on your own
// before the menu, with a prompt at a time for the controls on the device
// you're using (the touch deck as TOUCH sets it, keys, or a gamepad): go, full speed, slowing
// for a bend, drifting (where there's a drift), the co-driver's calls, and on to the finish. Each
// prompt moves on once you've done it (or, for the ones that wait for a bend,
// once you've been through one). Engine-free.

import type { How } from './driveStyle';

/** The device you're driving with. */
export type Device = 'touch' | 'keys' | 'pad';

export type Step = 'go' | 'faster' | 'bend' | 'drift' | 'notes' | 'lap' | 'done';
export const STEPS: Step[] = ['go', 'faster', 'bend', 'drift', 'notes', 'lap', 'done'];

/**
 * What the prompt says for `step` on `device`, driven `how`: on a touch screen TOUCH's scheme, on the keys or a gamepad
 * STEER or POINT (driveStyle.ts).
 */
export function prompt(step: Step, device: Device, how: How = device === 'touch' ? 'pedals' : 'steer'): string {
  // (the gas always on: ARCADE, TAP and TILT)
  const auto = how === 'arcade' || how === 'tap' || how === 'tilt';
  switch (step) {
    case 'go':
      if (how === 'point') return device === 'keys' ? 'POINT THE ARROWS THE WAY YOU WANT TO GO' : 'PUSH THE STICK THE WAY YOU WANT TO GO';
      if (device === 'touch') {
        if (how === 'stick') return 'STICK UP TO GO · ACROSS TO STEER';
        if (how === 'tap') return 'THE GAS IS ON · HOLD LEFT OR RIGHT TO STEER';
        if (how === 'tilt') return 'THE GAS IS ON · TILT THE PHONE TO STEER';
        return auto ? 'THE GAS IS ON · SLIDE TO STEER' : 'GAS TO GO · SLIDE TO STEER';
      }
      return device === 'keys' ? 'UP TO GO · LEFT AND RIGHT TO STEER' : 'RIGHT TRIGGER TO GO · STICK TO STEER';
    case 'faster':
      if (how === 'tap') return 'HOLD A SIDE LONGER TO TURN HARDER';
      if (auto) return 'THE GAS STAYS ON: JUST STEER';
      if (how === 'point') return device === 'keys' ? 'KEEP THE ARROWS HELD FOR FULL SPEED' : 'PUSH IT ALL THE WAY OUT FOR FULL SPEED';
      if (how === 'stick') return 'PUSH IT ALL THE WAY UP FOR FULL SPEED';
      return device === 'touch' ? 'KEEP GAS HELD FOR FULL SPEED' : 'KEEP IT HELD FOR FULL SPEED';
    case 'bend':
      if (how === 'point') return device === 'keys' ? 'LET GO OF THE ARROWS BEFORE A BEND TO SLOW' : 'EASE THE STICK IN BEFORE A BEND TO SLOW';
      if (how === 'tap') return 'HOLD BOTH SIDES TO BRAKE BEFORE A BEND';
      if (how === 'stick') return 'PULL THE STICK DOWN TO BRAKE BEFORE A BEND';
      return device === 'touch' ? 'BRAKE BEFORE A BEND' : device === 'keys' ? 'DOWN TO BRAKE BEFORE A BEND' : 'LEFT TRIGGER TO BRAKE BEFORE A BEND';
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
  /** whether you can drift (the touch deck has DRIFT on dirt, and not with TAP); the drift prompt is skipped if not */
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
  o.step = STEPS[STEPS.indexOf(o.step) + 1];
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
