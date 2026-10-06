// Each circuit's fingerprint: a hash of everything in its layout that changes how
// it drives (its shape, its hills, its pit lane, its tyre wear, its walls, its
// banking; not its name, its blurb or its scenery). The hash each circuit had when
// you last played is kept in the save's 'circuits' section; when a circuit has
// changed since (an update reshaped it, or a draft from the track designer was
// edited), your records and Time Trial ghosts there, in every weather, are
// forgotten: they were set on another track. A circuit open only thanks to such
// a record (from before unlocks) stays open.

import { save, saved, savedSection } from '../engine/save';
import type { CircuitLayout } from './layouts';
import { loadRecords, saveRecords } from './records';
import { openCircuits, savedUnlocks, unlockCircuit } from './unlocks';

/** Bump to forget every circuit's records at once: when the circuit builder changes how every lap drives. */
const BUILD = 1;

/** The circuit's fingerprint: 8 hex digits (FNV-1a over what in its layout changes how it drives). */
export function circuitHash(layout: CircuitLayout): string {
  const { points, scale, elevation, pit, tyreWear, street, banking } = layout;
  const text = JSON.stringify([BUILD, points.map((p) => [p.x, p.y]), scale, elevation, [pit.from, pit.to, pit.side], tyreWear ?? 1, street ?? null, banking ?? null]);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Whether a record or ghost id ('silver-heath', 'silver-heath:wet') is on circuit `id`. */
const on = (recordId: string, id: string) => recordId === id || recordId.startsWith(`${id}:`);

/**
 * Forget the records and ghosts on each of `layouts` that has changed since its hash was saved, and save its hash
 * now. The ids of the circuits forgotten. (A circuit with no hash saved yet keeps what it has: there's no knowing.)
 * `all` is every circuit in the game, for which are open.
 */
export function forgetChangedCircuits(layouts: CircuitLayout[], all: CircuitLayout[] = layouts): string[] {
  const forgot: string[] = [];
  for (const layout of layouts) {
    const hash = circuitHash(layout);
    const was = saved('circuits', layout.id);
    if (was === hash) continue;
    if (typeof was === 'string') {
      const records = loadRecords();
      // (open only thanks to a record there: keep it open)
      const ids = all.map((l) => l.id);
      if (openCircuits(ids, savedUnlocks(), Object.keys(records.circuits)).has(layout.id) && !openCircuits(ids, savedUnlocks(), []).has(layout.id)) unlockCircuit(layout.id);
      const stale = Object.keys(records.circuits).filter((r) => on(r, layout.id));
      for (const r of stale) delete records.circuits[r];
      if (stale.length) saveRecords(records);
      for (const g of Object.keys(savedSection('ghosts'))) if (on(g, layout.id)) save('ghosts', g, undefined);
      forgot.push(layout.id);
    }
    save('circuits', layout.id, hash);
  }
  return forgot;
}
