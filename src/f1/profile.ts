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

/** The longest name the timing screens take: room for a full surname (the rivals' longest, LINDQVIST, is 9). */
export const NAME_MAX = 12;
/**
 * A driver's name: 1 to NAME_MAX letters (any alphabet, so ÖZTÜRK or ŞAHİN) or digits,
 * with single spaces, hyphens and apostrophes inside (VAN DIJK, O'NEILL), in capitals (12: NAME_MAX).
 * The three-letter initials saved before still pass.
 */
export const NAME = /^(?=.{1,12}$)(?!.*\p{Ll})[\p{L}\p{N}]+(?:[ '-][\p{L}\p{N}]+)*$/u;

/** What you typed, as a name: capitals, only the letters, digits and marks a name takes, one space at most between words, cut to NAME_MAX (a trailing space kept, for the next word). */
export function cleanName(typed: string): string {
  return typed.toUpperCase().replace(/[^\p{L}\p{N} '-]/gu, '').replace(/^[ '-]+/, '').replace(/([ '-])[ '-]+/g, '$1').slice(0, NAME_MAX);
}

/** Your name for the timing screens (undefined: not picked yet). */
export function playerName(): string | undefined {
  const n = saved('profile', 'name');
  return typeof n === 'string' && NAME.test(n) ? n : undefined;
}
export function setPlayerName(name: string): void {
  if (NAME.test(name)) save('profile', 'name', name);
}

/** What you're called in a race: your name, or YOU until you pick one. */
export const driverName = (): string => playerName() ?? 'YOU';

/** STATS in the settings: the anonymous play stats sent (on unless turned off). */
export const statsOn = (): boolean => saved('settings', 'stats') !== false;
export const setStats = (on: boolean): void => save('settings', 'stats', on);
