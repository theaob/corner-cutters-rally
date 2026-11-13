// Crash reporting: an error nothing caught (or a promise refused with nobody
// waiting on it) goes to the play stats as an 'error' event, with where it
// was thrown and on which screen, so the dashboard can show what players hit
// on real devices. Each one once a launch, and at most a few a launch; none
// from a browser extension's own code; nothing at all when STATS is off in the
// settings (metrics.ts). Read on the dashboard's ERRORS, behind its code.

import { device, lines, note, recent, withCrumbs, type Device } from '../engine/logbook';
import { track } from './metrics';

/** the most sent a launch */
export const CRASHES_MAX = 10;
/** characters kept of each part */
const MESSAGE_MAX = 200;
const WHERE_MAX = 120;
const STACK_MAX = 600;
/** notes of the logbook that go with a problem's stack */
const TRAIL = 6;

export interface Crash {
  /** 'error' (thrown) or 'rejection' (a promise refused) */
  kind: 'error' | 'rejection';
  message: string;
  /** file:line:col, the page's address left out */
  where: string;
  stack: string;
}

/** A path without the page's own address (and its query), so the same place reads the same on every host. */
export function shortPath(url: string, origin = globalThis.location?.origin ?? ''): string {
  let path = url;
  if (origin && path.startsWith(origin)) path = path.slice(origin.length);
  return path.replace(/\?[^:)\s]*/g, '');
}

/** What's sent for a thrown `error` (or a refusal's reason), or nothing for noise not ours to fix. */
export function crashOf(kind: Crash['kind'], reason: unknown, file = '', line = 0, col = 0): Crash | undefined {
  const err = reason instanceof Error ? reason : undefined;
  const message = (err ? `${err.name}: ${err.message}` : typeof reason === 'string' ? reason : (() => {
    try {
      return JSON.stringify(reason) ?? String(reason);
    } catch {
      return String(reason);
    }
  })()).slice(0, MESSAGE_MAX);
  // (a cross-origin script's error says nothing but this; an extension's code; the browser's own resize warning)
  if (/^Script error\.?$/.test(message) || /ResizeObserver loop/.test(message)) return undefined;
  if (/^(chrome|moz|safari)-extension:/.test(file) || /(chrome|moz|safari)-extension:\/\//.test(err?.stack ?? '')) return undefined;
  const stack = shortPath(err?.stack ?? '').split('\n').slice(0, 8).join('\n').slice(0, STACK_MAX);
  const firstFrame = /\(?((?:https?:\/\/|\/)[^\s)]+:\d+:\d+)\)?/.exec(err?.stack ?? '')?.[1];
  const where = shortPath(file ? `${file}:${line}:${col}` : firstFrame ?? '').slice(0, WHERE_MAX);
  return { kind, message, where, stack };
}

/** characters of JSON an error's details may take (the database's column holds 2,000 bytes, stored a little bigger than the text: room kept) */
export const CRASH_DATA_MAX = 1600;

/**
 * An error's details as sent: the crash, the screen, the device (logbook.ts), and as many of the latest notes of
 * what led up to it as fit in CRASH_DATA_MAX.
 */
export function crashData(crash: Crash, screen: string, dev: Device, crumbs: string[], extra: Record<string, unknown> = {}): Record<string, unknown> {
  // (the device without what it doesn't know)
  const known = Object.fromEntries(Object.entries(dev).filter(([, v]) => v !== undefined && v !== ''));
  return withCrumbs({ ...crash, screen, ...extra, device: known }, crumbs, CRASH_DATA_MAX);
}

/** where the player is on the track, as a short line (set by the race while it runs; see setRaceSpot) */
let raceSpot: (() => string | undefined) | undefined;

/** The race says where the player is on the track (lap, sector, place) for a problem reported mid-race; undefined: no race. */
export function setRaceSpot(spot: (() => string | undefined) | undefined): void {
  raceSpot = spot;
}

/** what sends a problem (set by watchCrashes) */
let sendProblem: ((crash: Crash, extra?: Record<string, unknown>) => void) | undefined;

/** Report a problem that throws nothing (a freeze, the graphics' context lost) as an error, with `message`. */
export function reportProblem(message: string, extra?: Record<string, unknown>): void {
  sendProblem?.({ kind: 'error', message: message.slice(0, MESSAGE_MAX), where: '', stack: '' }, extra);
}

/** Send crashes as they happen; `screen()`: where the player is (the menu, or the race's circuit and mode). */
export function watchCrashes(screen: () => { name: string; circuit?: string; mode?: string }, target: Window = window): void {
  const sent = new Set<string>();
  const send = (crash: Crash | undefined, extra?: Record<string, unknown>) => {
    if (!crash) return;
    note(`error ${crash.message}`);
    const key = `${crash.message}|${crash.where}`;
    if (sent.has(key) || sent.size >= CRASHES_MAX) return;
    sent.add(key);
    const at = screen();
    // a problem that throws nothing (a freeze, a slow stretch) has no file and line: it says the circuit and mode as its
    // where, and, as its stack, the lap, sector and place on the track and the last few notes of the logbook (the app
    // hidden or shown, a pause, a lesson: what the dashboard can't otherwise show of what led up to it)
    if (!crash.where && !crash.stack) {
      let spot: string | undefined;
      try {
        spot = raceSpot?.();
      } catch {
        // (the race mid-change: no spot)
      }
      const trail = lines(recent(TRAIL)).join('\n');
      crash = { ...crash, where: at.circuit ? `${at.circuit} · ${at.mode ?? 'race'}`.slice(0, WHERE_MAX) : at.name, stack: [spot, trail].filter(Boolean).join('\n').slice(-STACK_MAX) };
    }
    track('error', { circuit: at.circuit, mode: at.mode, data: crashData(crash, at.name, device(), lines(), extra) });
  };
  sendProblem = send;
  target.addEventListener('error', (e) => send(crashOf('error', e.error ?? e.message, e.filename, e.lineno, e.colno)));
  target.addEventListener('unhandledrejection', (e) => send(crashOf('rejection', e.reason)));
}
