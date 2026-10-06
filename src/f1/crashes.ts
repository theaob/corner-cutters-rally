// Crash reporting: an error nothing caught (or a promise refused with nobody
// waiting on it) goes to the play stats as an 'error' event, with where it
// was thrown and on which screen, so the dashboard can show what players hit
// on real devices. Each one once a launch, and at most a few a launch; none
// from a browser extension's own code; nothing at all when STATS is off in the
// settings (metrics.ts). Read on the dashboard's ERRORS, behind its code.

import { track } from './metrics';

/** the most sent a launch */
export const CRASHES_MAX = 10;
/** characters kept of each part */
const MESSAGE_MAX = 200;
const WHERE_MAX = 120;
const STACK_MAX = 800;

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

/** Send crashes as they happen; `screen()`: where the player is (the menu, or the race's circuit and mode). */
export function watchCrashes(screen: () => { name: string; circuit?: string; mode?: string }, target: Window = window): void {
  const sent = new Set<string>();
  const send = (crash: Crash | undefined) => {
    if (!crash) return;
    const key = `${crash.message}|${crash.where}`;
    if (sent.has(key) || sent.size >= CRASHES_MAX) return;
    sent.add(key);
    const at = screen();
    track('error', { circuit: at.circuit, mode: at.mode, data: { ...crash, screen: at.name } });
  };
  target.addEventListener('error', (e) => send(crashOf('error', e.error ?? e.message, e.filename, e.lineno, e.colno)));
  target.addEventListener('unhandledrejection', (e) => send(crashOf('rejection', e.reason)));
}
