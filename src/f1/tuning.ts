import type { ParamSpec } from '../engine/tuning';

// Kept separate from race.ts so the page can mount the TUNE panel without
// pulling three.js into the main bundle. The camera's, locked from on-phone tuning.
export const F1_TUNING = {
  zoom: { label: 'Camera zoom (×)', value: 0.8, min: 0.5, max: 1.5, step: 0.05 },
  lead: { label: 'Camera look-ahead (px)', value: 90, min: 0, max: 160, step: 5 },
} satisfies ParamSpec;
