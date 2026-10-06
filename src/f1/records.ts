// Your records, kept on the device between races: the best race lap on each
// circuit, the best qualifying lap there (kept apart: a flying lap on your own
// isn't a race lap), and the best race time on each circuit for each number of
// laps (penalties included). Engine-free and unit-tested; the race saves a lap as
// soon as it's done, so a record isn't lost by quitting mid-race. They're the
// save's 'records' section (engine/save.ts).

import { save, savedSection } from '../engine/save';

export interface CircuitRecords {
  /** seconds: your fastest lap here in a race */
  bestLap?: number;
  /** seconds: your fastest qualifying lap here (a deleted lap doesn't count) */
  bestQualifying?: number;
  /** seconds: your fastest finish here, by the race's number of laps */
  bestRace: Record<number, number>;
  /** Time Attack: the most checkpoints you've passed here before the clock ran out */
  bestAttack?: number;
}

export interface Records {
  circuits: Record<string, CircuitRecords>;
}

/** A time as m:ss.hh ('–' for none). */
export const formatTime = (s?: number) => (s === undefined ? '–' : `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`);

export const emptyRecords = (): Records => ({ circuits: {} });

const time = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined);

/** Records from saved JSON (as they were kept before the save format), keeping whatever is valid (a corrupt save gives none). */
export function parseRecords(saved: string | null): Records {
  if (!saved) return emptyRecords();
  try {
    return recordsFrom(JSON.parse(saved));
  } catch {
    return emptyRecords(); // corrupt: start afresh
  }
}

/** Records from a saved object ({ circuits }), keeping whatever is valid and dropping the rest. */
export function recordsFrom(raw: unknown): Records {
  const out = emptyRecords();
  try {
    const circuits = (raw as { circuits?: unknown } | null)?.circuits;
    if (!circuits || typeof circuits !== 'object') return out;
    for (const [id, c] of Object.entries(circuits as Record<string, { bestLap?: unknown; bestQualifying?: unknown; bestRace?: Record<string, unknown> }>)) {
      if (!c || typeof c !== 'object') continue;
      const bestRace: Record<number, number> = {};
      for (const [laps, t] of Object.entries(c.bestRace ?? {})) {
        const n = Number(laps);
        const v = time(t);
        if (Number.isInteger(n) && n > 0 && v !== undefined) bestRace[n] = v;
      }
      out.circuits[id] = { bestLap: time(c.bestLap), bestRace };
      const q = time(c.bestQualifying);
      if (q !== undefined) out.circuits[id].bestQualifying = q;
      const a = (c as { bestAttack?: unknown }).bestAttack;
      if (typeof a === 'number' && Number.isInteger(a) && a > 0) out.circuits[id].bestAttack = a;
    }
  } catch {
    // not records: none
  }
  return out;
}

const circuit = (r: Records, id: string): CircuitRecords => (r.circuits[id] ??= { bestRace: {} });

/** Note a lap on circuit `id`; true if it's a new best (the first lap there counts). */
export function recordLap(r: Records, id: string, seconds: number): boolean {
  const c = circuit(r, id);
  if (c.bestLap !== undefined && c.bestLap <= seconds) return false;
  c.bestLap = seconds;
  return true;
}

/** Note a qualifying lap on circuit `id`; true if it's a new best qualifying lap there (the race's laps are kept apart). */
export function recordQualifying(r: Records, id: string, seconds: number): boolean {
  const c = circuit(r, id);
  if (c.bestQualifying !== undefined && c.bestQualifying <= seconds) return false;
  c.bestQualifying = seconds;
  return true;
}

/** Note a finish of `laps` laps on circuit `id`; true if it's a new best for that length of race. */
export function recordRace(r: Records, id: string, laps: number, seconds: number): boolean {
  const c = circuit(r, id);
  const best = c.bestRace[laps];
  if (best !== undefined && best <= seconds) return false;
  c.bestRace[laps] = seconds;
  return true;
}

/** Note a Time Attack run on circuit `id` that passed `checkpoints`; true if it's a new best there (none passed never is). */
export function recordAttack(r: Records, id: string, checkpoints: number): boolean {
  if (checkpoints <= 0) return false;
  const c = circuit(r, id);
  if (c.bestAttack !== undefined && c.bestAttack >= checkpoints) return false;
  c.bestAttack = checkpoints;
  return true;
}

/** The records saved on this device. */
export const loadRecords = (): Records => recordsFrom(savedSection('records'));

/** Keep `r` on this device (in memory, if storage is blocked or full). */
export const saveRecords = (r: Records): void => save('records', 'circuits', r.circuits);
