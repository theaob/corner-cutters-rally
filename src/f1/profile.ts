// You, to the backend: a random id the device makes for itself the first time
// (nothing personal: it only tells one player's events and board runs from
// another's), your initials for the Daily Challenge's board, and whether the
// play stats are sent (STATS in the settings: on unless turned off).

import { save, saved } from '../engine/save';

/** A random id (a v4 UUID). */
const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Your id (made and kept the first time it's asked for). */
export function playerId(): string {
  const id = saved('profile', 'id');
  if (typeof id === 'string' && UUID.test(id)) return id;
  const made = newId();
  save('profile', 'id', made);
  return made;
}

/** Initials: three letters or digits. */
export const INITIALS = /^[A-Z0-9]{3}$/;

/** Your initials for the board (undefined: not picked yet). */
export function initials(): string | undefined {
  const n = saved('profile', 'name');
  return typeof n === 'string' && INITIALS.test(n) ? n : undefined;
}
export function setInitials(name: string): void {
  if (INITIALS.test(name)) save('profile', 'name', name);
}

/** STATS in the settings: the anonymous play stats sent (on unless turned off). */
export const statsOn = (): boolean => saved('settings', 'stats') !== false;
export const setStats = (on: boolean): void => save('settings', 'stats', on);
