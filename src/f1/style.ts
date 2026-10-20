// STYLE in the settings (src/engine/drive/settings.ts), as the stage plays it. TOP-DOWN is the rally made for one thumb
// on a phone: the CLASSIC view (high, north up) pulled back and looking ahead of the car the way it's going, the gas
// always on, a car a little slower than SIM's that keeps most of its speed off the road, and a roadside that knocks you
// back rather than wrecking the car. SIM is the stage as it was: the VIEW and GAS you pick,
// the full-speed car and the hard trees.

import { REFERENCE, carClass, type CarClass, type HandlingParams } from '../engine/driving';
import type { DriveStyle } from '../engine/drive/settings';

export const TOP_DOWN = {
  /** the car's top speed against SIM's (the rivals' times come from a run in the same car, so they scale with it) */
  speed: 0.8,
  /** s from a standstill to top speed at the reference (SIM's: REFERENCE.zeroToTop) */
  zeroToTop: 1.4,
  /** the share of top speed and grip kept off the road (SIM's car: 0.25) */
  offRoad: 0.75,
  /** the crash damage against the difficulty's, and px/s of impact that do none at all */
  crashDamage: 0.35,
  crashThreshold: 110,
  /** the camera (CLASSIC's, north up): its zoom, and px it looks ahead of the car the way it's going at top speed */
  zoom: 0.55,
  lead: 120,
};

/** The player's car (and the reference run's) in `style`. */
export function rallyCar(style: DriveStyle): CarClass {
  if (style === 'sim') return carClass('f1');
  return { ...carClass('f1', { ...REFERENCE, topSpeed: REFERENCE.topSpeed * TOP_DOWN.speed, zeroToTop: TOP_DOWN.zeroToTop }), offRoad: TOP_DOWN.offRoad };
}

/** The stage's driving rules in `style`: TOP-DOWN's roadside forgives, and doesn't roll the car. */
export function styleHandling(h: HandlingParams, style: DriveStyle): HandlingParams {
  if (style === 'sim') return h;
  return { ...h, crashDamage: h.crashDamage * TOP_DOWN.crashDamage, crashThreshold: TOP_DOWN.crashThreshold, noRolls: true };
}

/** The key a stage's best time is kept under: TOP-DOWN's times are their own (a slower car). */
export const bestKey = (stageId: string, style: DriveStyle) => (style === 'sim' ? stageId : `${stageId}@topdown`);
