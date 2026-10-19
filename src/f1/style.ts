// STYLE in the settings (src/engine/drive/settings.ts), as the stage plays it. TOP-DOWN is the rally made for one thumb
// on a phone: a high camera turned with the road, the car low on the screen so the road ahead shows two or three
// seconds before you reach it, the gas always on, a slower car so the bends come at a pace that can be read, and a
// roadside that knocks you back rather than wrecking the car. SIM is the stage as it was: the VIEW and GAS you pick,
// the full-speed car and the hard trees.

import { REFERENCE, carClass, type CarClass, type HandlingParams } from '../engine/driving';
import type { DriveStyle } from '../engine/drive/settings';

export const TOP_DOWN = {
  /** the car's top speed against SIM's (the rivals' times come from a run in the same car, so they scale with it) */
  speed: 0.65,
  /** s from a standstill to top speed at the reference (SIM's: REFERENCE.zeroToTop) */
  zeroToTop: 1.7,
  /** the crash damage against the difficulty's, and px/s of impact that do none at all */
  crashDamage: 0.35,
  crashThreshold: 110,
  /** the camera: its zoom, its pitch (degrees down from level), and px it looks ahead of the car at top speed (half
   * that standing), which puts the car low on the screen */
  zoom: 0.7,
  pitch: 58,
  lead: 180,
};

/** The player's car (and the reference run's) in `style`. */
export function rallyCar(style: DriveStyle): CarClass {
  if (style === 'sim') return carClass('f1');
  return carClass('f1', { ...REFERENCE, topSpeed: REFERENCE.topSpeed * TOP_DOWN.speed, zeroToTop: TOP_DOWN.zeroToTop });
}

/** The stage's driving rules in `style`: TOP-DOWN's roadside forgives, and doesn't roll the car. */
export function styleHandling(h: HandlingParams, style: DriveStyle): HandlingParams {
  if (style === 'sim') return h;
  return { ...h, crashDamage: h.crashDamage * TOP_DOWN.crashDamage, crashThreshold: TOP_DOWN.crashThreshold, noRolls: true };
}

/** The key a stage's best time is kept under: TOP-DOWN's times are their own (a slower car). */
export const bestKey = (stageId: string, style: DriveStyle) => (style === 'sim' ? stageId : `${stageId}@topdown`);
