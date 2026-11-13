// GRAPHICS in the settings: how the picture is drawn. AUTO (the default) lets the quality governor step down on a
// phone that can't keep up (engine/render/quality.ts); HIGH and LOW hold one level whatever the frame rate; SAVER is
// LOW and draws 30 frames a second, for a phone running hot or a battery running low. Remembered.

import { save, saved } from '../engine/save';
import { QUALITY_LEVELS } from '../engine/render/quality';

export type GraphicsSetting = 'auto' | 'high' | 'low' | 'saver';
export const GRAPHICS_SETTINGS: GraphicsSetting[] = ['auto', 'high', 'low', 'saver'];

let chosen: GraphicsSetting | undefined;
export function graphicsSetting(): GraphicsSetting {
  if (chosen) return chosen;
  const v = saved('settings', 'graphics');
  return (chosen = GRAPHICS_SETTINGS.includes(v as GraphicsSetting) ? (v as GraphicsSetting) : 'auto');
}
export function setGraphicsSetting(g: GraphicsSetting): void {
  chosen = g;
  save('settings', 'graphics', g);
}

/** The quality level a setting holds (an index of QUALITY_LEVELS), or undefined under AUTO: the governor decides. */
export function heldLevel(g: GraphicsSetting): number | undefined {
  if (g === 'high') return QUALITY_LEVELS.findIndex((l) => l.name === 'high');
  if (g === 'low' || g === 'saver') return QUALITY_LEVELS.findIndex((l) => l.name === 'low');
  return undefined;
}

/** Frames a second the setting draws at most (the screen's own rate when 0). */
export const frameCap = (g: GraphicsSetting): number => (g === 'saver' ? 30 : 0);

/**
 * Whether a frame arriving `sinceDrawn` ms after the last drawn one should be skipped to hold `cap` frames a second.
 * A little short of the interval counts as on time: a 60 Hz screen's frames come every 16.7 ms, never exactly 33.3.
 */
export function skipFrame(cap: number, sinceDrawn: number): boolean {
  return cap > 0 && sinceDrawn < 1000 / cap - 4;
}
