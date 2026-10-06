// Vehicle edits: stat changes and paint palettes for the F1 car, saved on this
// device and applied to the game. Exported as JSON, they can be made permanent
// in the class table (engine/driving.ts) and DEFAULT_COLORS below.

import { CAR_CLASS_IDS, STAT_KEYS, setStatOverrides, type CarClassId, type StatOverrides, type VehicleStats } from './driving';
import { storeKey } from './storage';
import { hostStore } from './host';

/** Team colours the grid is painted in; the first is the player's. */
export const DEFAULT_COLORS: Record<CarClassId, string[]> = {
  f1: ['#d8323c', '#3d7fc4', '#1b1b26', '#f08a24', '#5fe0d0', '#f4f4f8'],
};

export interface VehicleEdit extends Partial<VehicleStats> {
  colors?: string[];
}
export type VehicleEdits = Partial<Record<CarClassId, VehicleEdit>>;

const KEY = () => storeKey('vehicles');
const HEX = /^#[0-9a-f]{6}$/i;

/** Keep only known classes, known stats with finite positive numbers, and #rrggbb colours. */
export function parseVehicleEdits(json: string | null): VehicleEdits {
  const out: VehicleEdits = {};
  if (!json) return out;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return out;
  }
  if (!raw || typeof raw !== 'object') return out;
  for (const id of CAR_CLASS_IDS) {
    const r = (raw as Record<string, unknown>)[id];
    if (!r || typeof r !== 'object') continue;
    const edit: VehicleEdit = {};
    for (const k of STAT_KEYS) {
      const v = (r as Record<string, unknown>)[k];
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) edit[k] = v;
    }
    const colors = (r as Record<string, unknown>).colors;
    if (Array.isArray(colors)) {
      const ok = colors.filter((c): c is string => typeof c === 'string' && HEX.test(c)).map((c) => c.toLowerCase());
      if (ok.length) edit.colors = ok;
    }
    if (Object.keys(edit).length) out[id] = edit;
  }
  return out;
}

/** The stat part of the edits, for the driving rules. */
export function statOverrides(edits: VehicleEdits): StatOverrides {
  const out: StatOverrides = {};
  for (const id of CAR_CLASS_IDS) {
    const e = edits[id];
    if (!e) continue;
    const { colors: _colors, ...stats } = e;
    if (Object.keys(stats).length) out[id] = stats;
  }
  return out;
}

export function vehicleColors(id: CarClassId, edits: VehicleEdits): string[] {
  return edits[id]?.colors ?? DEFAULT_COLORS[id];
}

/** Read this device's edits and apply the stats to the driving rules. */
export function loadVehicleEdits(): VehicleEdits {
  let json: string | null = null;
  try {
    json = hostStore()?.getItem(KEY()) ?? null;
  } catch {
    // storage unavailable: no edits
  }
  const edits = parseVehicleEdits(json);
  setStatOverrides(statOverrides(edits));
  return edits;
}

/** Save and apply. */
export function saveVehicleEdits(edits: VehicleEdits): void {
  setStatOverrides(statOverrides(edits));
  try {
    hostStore()?.setItem(KEY(), JSON.stringify(edits));
  } catch {
    // storage unavailable: edits last until the page closes
  }
}
