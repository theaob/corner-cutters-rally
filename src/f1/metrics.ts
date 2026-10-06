// The anonymous play stats (supabase/README.md): the game launched, a race
// started and finished (its mode and circuit), the km you've driven and the time on each circuit, a result
// shared, an error nothing caught (crashes.ts). Queued and sent every so often (and as the page closes), by a random
// id the device made for itself; nothing at all when STATS is off in the
// settings, or the build has no backend.

import { Capacitor } from '@capacitor/core';
import { insert, online } from '../engine/backend';
import { playerId, statsOn } from './profile';
import { gameHidden, onHidden } from '../engine/host';

export type EventKind = 'launch' | 'race_start' | 'race_finish' | 'drive' | 'share' | 'daily_submit' | 'session' | 'error';

/** m of the real world in a px of track (Silver Heath's 8,800 px lap is the 5.9 km circuit it's traced from). */
export const METRES_PER_PX = 0.67;

/** s between sends */
const EVERY = 20;

export interface Event {
  player: string;
  kind: EventKind;
  platform: 'web' | 'android';
  version: string;
  circuit?: string;
  mode?: string;
  km?: number;
  /** s in the app (a 'session' event: since the last one, while the page was showing) */
  seconds?: number;
  data?: Record<string, unknown>;
}

const queue: Event[] = [];
let timer: ReturnType<typeof setInterval> | undefined;

/** The build's version (package version and commit). */
const version = (): string => (typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev').slice(0, 40);

/**
 * The columns each kind of batch sends: the time in the game and the errors apart (a project whose schema is older
 * refuses them, and only them).
 */
const COLUMNS = ['player', 'kind', 'platform', 'version', 'circuit', 'mode', 'km', 'data'] as const;
const SESSION_COLUMNS = ['player', 'kind', 'platform', 'version', 'seconds', 'data'] as const;

/** Which batch an event goes in: the events, the time in the game, the errors. */
const groupOf = (e: Event) => (e.kind === 'session' ? 1 : e.kind === 'error' ? 2 : 0);
/** The queued events in their batches (as groupOf has them), the empty ones left out. */
const grouped = (events: Event[]): Event[][] => [0, 1, 2].map((g) => events.filter((e) => groupOf(e) === g)).filter((b) => b.length);

/**
 * The queued events as the batches to send: the events, then the time in the game, then the errors, each row with the
 * same keys (the database takes a batch only so; what an event hasn't, null). No time on them: the database stamps them
 * as they arrive.
 */
export function batchesOf(events: Event[]): Record<string, unknown>[][] {
  const rows = (list: Event[], cols: readonly string[]) => list.map((e) => Object.fromEntries(cols.map((c) => [c, (e as unknown as Record<string, unknown>)[c] ?? null])));
  return grouped(events).map((list) => rows(list, list[0].kind === 'session' ? SESSION_COLUMNS : COLUMNS));
}

/** Send what's queued (`closing`: the page is going, so with keepalive). */
export function flush(closing = false): void {
  if (!queue.length) return;
  const events = queue.splice(0);
  const kinds = grouped(events);
  batchesOf(events).forEach((batch, k) => {
    void insert('events', batch, closing).then((sent) => {
      // (offline: kept for the next try, unless the page is going; refused: dropped, as it would be every time)
      if (sent === 'offline' && !closing && queue.length < 200) queue.unshift(...kinds[k]);
    });
  });
}

/** Note `kind` (with what it was about). */
export function track(kind: EventKind, about: { circuit?: string; mode?: string; km?: number; seconds?: number; data?: Record<string, unknown> } = {}): void {
  if (!online() || !statsOn()) return;
  queue.push({
    player: playerId(), kind, platform: Capacitor.isNativePlatform() ? 'android' : 'web', version: version(),
    ...about, ...(about.km !== undefined ? { km: Math.round(about.km * 1000) / 1000 } : {}),
  });
  if (!timer) {
    timer = setInterval(() => flush(), EVERY * 1000);
    // (as the page is hidden or closed: the time in the app since the last time, then what's queued, goes now)
    const away = () => {
      noteTime();
      flush(true);
    };
    onHidden((hidden) => (hidden ? away() : (shownAt = performance.now())));
    window.addEventListener('pagehide', away);
  }
}

/** this launch of the game (its time in the app is summed by it), and when the page was last shown (ms) */
const launch = Math.random().toString(36).slice(2, 12);
let shownAt: number | undefined;

/** Start timing the time in the app (from the launch, while the page is showing). */
export function startClock(): void {
  shownAt = gameHidden() ? undefined : performance.now();
}

/** The time in the app since it was last shown, as a 'session' event of this launch (a second at least). */
function noteTime(): void {
  if (shownAt === undefined) return;
  const seconds = (performance.now() - shownAt) / 1000;
  shownAt = undefined;
  if (seconds >= 1) track('session', { seconds: Math.round(Math.min(seconds, 86400)), data: { launch } });
}

/** The km in `px` of driving. */
export const kmOf = (px: number) => (px * METRES_PER_PX) / 1000;
