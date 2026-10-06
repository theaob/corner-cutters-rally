// What your car's vibration does each frame: a bump for a crash (bigger for a
// harder hit, long for a wreck) or a hard landing, a rumble while you're on the
// grass or gravel, and a light patter over the kerbs. Engine-free and
// unit-tested; race.ts feeds it your car's frame and vibrates for what it returns.

export const RUMBLE = {
  /** ms for a wreck */
  wreck: 260,
  /** ms for a crash: a base and more per point of health lost, up to a most */
  hit: 30,
  hitPerHealth: 6,
  hitMost: 160,
  /** health lost in a frame below which it isn't felt */
  hitFloor: 0.5,
  /** downward px/s of a landing above which it thumps, and for how long */
  landing: 120,
  landingMs: 25,
  /** px/s under which the ground doesn't rumble */
  minSpeed: 40,
  /** grass and gravel: a bump going on, then pulses every `roughEvery` s, longer at speed */
  roughIn: 30,
  roughEvery: 0.12,
  roughMs: 10,
  roughMsAtTop: 14,
  /** kerbs: short pulses every `kerbEvery` s */
  kerbEvery: 0.09,
  kerbMs: 6,
};

export interface RumbleState {
  /** seconds to the next rough-ground and kerb pulses */
  roughIn: number;
  kerbIn: number;
  /** on rough ground last frame */
  wasRough: boolean;
}

export const newRumble = (): RumbleState => ({ roughIn: 0, kerbIn: 0, wasRough: false });

export interface RumbleFrame {
  dt: number;
  /** px/s, and the car's top speed */
  speed: number;
  topSpeed: number;
  /** health lost this frame (walls, contact, landings) */
  healthLost: number;
  wreckedNow: boolean;
  /** downward px/s on the frame it landed (0 otherwise) */
  landed: number;
  onRough: boolean;
  onKerb: boolean;
}

/** Milliseconds to vibrate this frame (0 = none): the strongest of what happened. */
export function rumble(s: RumbleState, f: RumbleFrame): number {
  let ms = 0;
  if (f.wreckedNow) ms = RUMBLE.wreck;
  else if (f.healthLost > RUMBLE.hitFloor) ms = Math.min(RUMBLE.hitMost, RUMBLE.hit + f.healthLost * RUMBLE.hitPerHealth);
  if (f.landed > RUMBLE.landing) ms = Math.max(ms, RUMBLE.landingMs);

  const moving = f.speed > RUMBLE.minSpeed;
  s.roughIn -= f.dt;
  s.kerbIn -= f.dt;
  if (f.onRough && moving) {
    if (!s.wasRough) {
      ms = Math.max(ms, RUMBLE.roughIn);
      s.roughIn = RUMBLE.roughEvery;
    } else if (s.roughIn <= 0) {
      ms = Math.max(ms, RUMBLE.roughMs + (RUMBLE.roughMsAtTop - RUMBLE.roughMs) * Math.min(1, f.speed / f.topSpeed));
      s.roughIn = RUMBLE.roughEvery;
    }
  } else if (f.onKerb && moving && s.kerbIn <= 0) {
    ms = Math.max(ms, RUMBLE.kerbMs);
    s.kerbIn = RUMBLE.kerbEvery;
  }
  s.wasRough = f.onRough && moving;
  return ms;
}
