// Driving on a gamepad (the standard layout): the left stick steers, the right trigger is the gas, the left trigger
// the brake, A or RB the handbrake. The stick has a dead zone round the middle and a gentle curve past it, for fine
// corrections at speed.

import type { Intent } from './intent';

export const PAD = { dead: 0.12, curve: 1.5, trigger: 0.05 };

type PadState = { buttons: readonly { pressed: boolean; value: number }[]; axes: readonly number[] };

/** What a gamepad asks for. */
export function padIntent(pad: PadState): Intent {
  const x = pad.axes[0] ?? 0;
  const out = Math.max(0, Math.min(1, (Math.abs(x) - PAD.dead) / (1 - PAD.dead)));
  const trigger = (i: number) => {
    const v = pad.buttons[i]?.value ?? 0;
    return v < PAD.trigger ? 0 : v;
  };
  return {
    steer: Math.sign(x) * out ** PAD.curve,
    throttle: trigger(7),
    brake: trigger(6),
    handbrake: !!(pad.buttons[0]?.pressed || pad.buttons[5]?.pressed),
  };
}

/** The first connected gamepad's driving, if there is one. */
export function readPad(nav: Navigator = navigator): Intent | undefined {
  if (!nav.getGamepads) return undefined;
  const pad = [...nav.getGamepads()].find((p) => p && p.connected);
  return pad ? padIntent(pad) : undefined;
}

