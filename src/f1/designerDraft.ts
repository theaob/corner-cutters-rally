// A circuit straight from the track designer (designer.html), to drive: its
// DRIVE IT button keeps the layout in the browser and opens the game at
// ?circuit=designer-draft. The game races it like any circuit, under an id of
// its own (so its laps never land in a real circuit's records), and its quit
// goes back to the designer.

import type { CircuitLayout } from './layouts';
import { hostStore } from '../engine/host';

/** The id a designer draft races under, and the browser key the designer leaves it at. */
export const DESIGNER_DRAFT_ID = 'designer-draft';
export const DESIGNER_DRIVE_KEY = 'cc:designer:drive';

/** The layout in `raw` (as the designer stored it), if it is one: under the draft's own id, its name marked as a draft. */
export function parseDraft(raw: string | null): CircuitLayout | undefined {
  if (!raw) return undefined;
  try {
    const l = JSON.parse(raw) as Partial<CircuitLayout>;
    const point = (p: unknown) => !!p && typeof (p as { x: unknown }).x === 'number' && typeof (p as { y: unknown }).y === 'number';
    if (!Array.isArray(l.points) || l.points.length < 4 || !l.points.every(point)) return undefined;
    if (!Array.isArray(l.elevation) || l.elevation.length < 2 || typeof l.scale !== 'number' || !l.pit || typeof l.pit.from !== 'number' || typeof l.pit.to !== 'number') return undefined;
    return { ...(l as CircuitLayout), id: DESIGNER_DRAFT_ID, name: `${l.name ?? 'Draft'} (draft)`, about: l.about ?? 'from the track designer' };
  } catch {
    return undefined;
  }
}

/** The draft the designer left to drive, if any. */
export function designerDraft(): CircuitLayout | undefined {
  try {
    return parseDraft(hostStore()?.getItem(DESIGNER_DRIVE_KEY) ?? null);
  } catch {
    return undefined;
  }
}
