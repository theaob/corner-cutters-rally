// Circuit unlocks: the first circuit is open from the start; each later one
// opens for Quick Race, Time Attack and Time Trial once a Championship reaches it (you've
// raced the round before it). Anyone who already has a record on a circuit
// (from before unlocks) keeps it open, and a free circuit (layout.free) is open
// from the start. Kept in the save's 'progress' section.

import { save, saved } from '../engine/save';

/** The circuits open (by id): the first of `circuits`, the `free` ones, those `unlocked` so far, and any with a record (ids like 'silver-heath:wet' included). */
export function openCircuits(circuits: string[], unlocked: string[], recordIds: string[], free: string[] = []): Set<string> {
  const open = new Set<string>([...circuits.slice(0, 1), ...free]);
  const known = new Set(circuits);
  for (const id of [...unlocked, ...recordIds.map((r) => r.split(':')[0])]) if (known.has(id)) open.add(id);
  return open;
}

/** The circuits unlocked so far, as saved. */
export function savedUnlocks(): string[] {
  const v = saved('progress', 'unlocked');
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

/** Unlock circuit `id`; true if it wasn't already. */
export function unlockCircuit(id: string): boolean {
  const list = savedUnlocks();
  if (list.includes(id)) return false;
  save('progress', 'unlocked', [...list, id]);
  return true;
}
