import type { ParamSpec } from '../engine/tuning';

// Kept separate from race.ts so the page can mount the TUNE panel without
// pulling three.js into the main bundle.
// Defaults locked from on-phone tuning: a full grid of 10 at 94% AI pace.
export const F1_TUNING = {
  // (the race's laps are the menu's LAPS row now, src/f1/laps.ts: an old saved value here is no longer read)
  opponents: { label: 'AI opponents', value: 9, min: 0, max: 9, step: 1 },
  // the difficulty (menu) sets the AI's pace; this nudges it (a new key: the old absolute pace doesn't carry over)
  aiPaceAdjust: { label: 'AI pace adjust (× the difficulty’s)', value: 1, min: 0.8, max: 1.15, step: 0.01 },
  zoom: { label: 'Camera zoom (×)', value: 0.8, min: 0.5, max: 1.5, step: 0.05 },
  lead: { label: 'Camera look-ahead (px)', value: 90, min: 0, max: 160, step: 5 },
} satisfies ParamSpec;
