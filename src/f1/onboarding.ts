// The controls lap: on first launch, a lap of the first circuit on your own
// before the menu, with a prompt at a time for the controls on the device
// you're using (the touch stick, keys, or a gamepad): go, full speed, slowing
// for a bend, drifting (on the keys or a gamepad: not on touch), the track limits, and on round to the line. Each
// prompt moves on once you've done it (or, for the ones that wait for a bend,
// once you've been through one). Engine-free.

/** The device you're driving with. */
export type Device = 'touch' | 'keys' | 'pad';

export type Step = 'go' | 'faster' | 'bend' | 'drift' | 'limits' | 'lap' | 'done';
export const STEPS: Step[] = ['go', 'faster', 'bend', 'drift', 'limits', 'lap', 'done'];

/** What the prompt says for `step` on `device`, driving where you point (`points`: the touch stick's way, unless DRIVING
 * in the settings says otherwise) or steering the car. */
export function prompt(step: Step, device: Device, points = device === 'touch'): string {
  switch (step) {
    case 'go':
      if (points) return device === 'keys' ? 'POINT THE ARROWS THE WAY YOU WANT TO GO' : 'PUSH THE STICK THE WAY YOU WANT TO GO';
      return device === 'touch' ? 'GAS TO GO · SLIDE TO STEER' : device === 'keys' ? 'UP TO GO · LEFT AND RIGHT TO STEER' : 'RIGHT TRIGGER TO GO · STICK TO STEER';
    case 'faster':
      return points && device !== 'keys' ? 'PUSH IT ALL THE WAY OUT FOR FULL SPEED' : device === 'touch' ? 'KEEP GAS HELD FOR FULL SPEED' : 'KEEP IT HELD FOR FULL SPEED';
    case 'bend':
      if (points) return device === 'keys' ? 'LET GO OF THE ARROWS BEFORE A BEND TO SLOW' : 'EASE THE STICK IN BEFORE A BEND TO SLOW';
      return device === 'touch' ? 'BRAKE BEFORE A BEND' : device === 'keys' ? 'DOWN TO BRAKE BEFORE A BEND' : 'LEFT TRIGGER TO BRAKE BEFORE A BEND';
    case 'drift':
      return device === 'keys' ? 'HOLD X IN A BEND TO DRIFT ROUND IT' : 'HOLD A IN A BEND TO DRIFT ROUND IT';
    case 'limits':
      return 'KEEP INSIDE THE WHITE LINES: CUTTING A CORNER COSTS TIME';
    case 'lap':
      return 'ON ROUND TO THE LINE: THAT MAKES A LAP';
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

/** What's happened so far: your speed (and top speed), the bends you've been through, whether you're drifting, whether you've done a lap. */
export interface Facts {
  speed: number;
  top: number;
  bends: number;
  drifting: boolean;
  /** whether you can drift (on the keys or a gamepad: there's no drift button on the touch deck); the drift prompt is skipped if not */
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
    : o.step === 'limits' ? through >= 1
    : o.step === 'lap' ? f.lapDone
    : false;
  if (!done) return false;
  o.step = STEPS[STEPS.indexOf(o.step) + 1];
  o.from = f.bends;
  return true;
}

/**
 * How many of the bends (their apexes, as samples) a car passed going from
 * sample `from` to `to` (forwards, round the loop of `n`, less than half a lap).
 */
export function apexesPassed(apexes: number[], from: number, to: number, n: number): number {
  const ahead = (((to - from) % n) + n) % n;
  if (ahead === 0 || ahead > n / 2) return 0;
  return apexes.filter((a) => {
    const d = (((a - from) % n) + n) % n;
    return d > 0 && d <= ahead;
  }).length;
}
