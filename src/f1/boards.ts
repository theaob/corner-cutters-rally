// The online boards beyond the Daily Challenge's: each circuit's Time Trial
// board (everyone's best lap there, in each weather, by their initials:
// supabase/schema.sql's lap_times), and the Daily Challenge's leading run as a
// ghost to chase. A new lap record of yours is kept on the device until it's
// sent (with your initials, once you have them; the next time there's a
// connection if there isn't one). Engine-free but for the calls.

import { rpc } from '../engine/backend';
import { save, saved } from '../engine/save';
import { parseGhost, type Ghost } from './timeTrial';

/** The weathers a lap is boarded in (a Quick Race's changeable has none: Time Trials are dry, damp or wet). */
export const BOARD_WEATHERS = ['dry', 'damp', 'wet'] as const;
export type BoardWeather = (typeof BOARD_WEATHERS)[number];
export const isBoardWeather = (w: string): w is BoardWeather => (BOARD_WEATHERS as readonly string[]).includes(w);

/** A lap waiting to go on a board. */
export interface PendingLap {
  circuit: string;
  weather: BoardWeather;
  time: number;
}

/** The board's key for a circuit in a weather. */
const keyOf = (circuit: string, weather: string) => `${circuit}:${weather}`;

/** The laps not sent yet. */
export function pendingLaps(): PendingLap[] {
  const v = saved('boards', 'pending');
  if (!v || typeof v !== 'object') return [];
  return Object.values(v as Record<string, unknown>).filter((l): l is PendingLap => {
    const p = l as PendingLap;
    return !!p && typeof p.circuit === 'string' && typeof p.weather === 'string' && isBoardWeather(p.weather) && typeof p.time === 'number' && p.time > 5;
  });
}

/** A new lap record of yours on `circuit` in `weather`: to send (the quicker, if one's waiting there already). */
export function queueLap(lap: PendingLap): void {
  if (!isBoardWeather(lap.weather)) return;
  const all = Object.fromEntries(pendingLaps().map((l) => [keyOf(l.circuit, l.weather), l]));
  const key = keyOf(lap.circuit, lap.weather);
  if (all[key] && all[key].time <= lap.time) return;
  all[key] = { circuit: lap.circuit, weather: lap.weather, time: Math.round(lap.time * 1000) / 1000 };
  save('boards', 'pending', all);
}

/** Send the laps waiting (by `player`, as `name`, from build `version`): how many went. Those that didn't stay. */
export async function sendLaps(player: string, name: string, version?: string): Promise<number> {
  const laps = pendingLaps();
  let sent = 0;
  const left: Record<string, PendingLap> = {};
  for (const l of laps) {
    const ok = (await rpc('submit_lap', { p_circuit: l.circuit, p_weather: l.weather, p_player: player, p_name: name, p_time: l.time, p_version: version ?? null })) !== undefined;
    if (ok) sent++;
    else left[keyOf(l.circuit, l.weather)] = l;
  }
  if (laps.length) save('boards', 'pending', Object.keys(left).length ? left : undefined);
  return sent;
}

/** One place on a lap board. */
export interface LapEntry {
  place: number;
  name: string;
  time: number;
  you?: boolean;
}
/** A circuit's board in a weather: how many have a lap there, its top, and your place (if you have one). */
export interface LapBoard {
  entries: number;
  top: LapEntry[];
  you?: LapEntry;
}

/** `circuit`'s board in `weather` (the top `top`, and `player`'s place); undefined offline. */
export const fetchLapBoard = (circuit: string, weather: BoardWeather, player: string, top = 3): Promise<LapBoard | undefined> =>
  rpc<LapBoard>('lap_board', { p_circuit: circuit, p_weather: weather, p_player: player, p_top: top });

// ---------------------------------------------------------------- the Daily Challenge's ghost

/** Frames a second a Daily Challenge run is sent with (half the Time Trial's: a run is minutes long). */
export const DAILY_GHOST_HZ = 10;
/** The longest run sent as a ghost (s): past that, the run goes on the board without one. */
export const DAILY_GHOST_MAX_S = 600;

/**
 * A run's ghost, recorded at `hz`, made small to send: every `hz / DAILY_GHOST_HZ`th frame, places to the px and
 * headings to a hundredth of a radian. Undefined if it's too long to send, or too short to be one (under a second).
 */
export function packGhost(g: Ghost, hz: number): Ghost | undefined {
  // (under a second: nothing to chase)
  if (!(g.time >= 1) || g.time > DAILY_GHOST_MAX_S) return undefined;
  const every = Math.max(1, Math.round(hz / DAILY_GHOST_HZ));
  const frames: number[] = [];
  for (let k = 0; k * 4 < g.frames.length; k += every) {
    const f = g.frames.slice(k * 4, k * 4 + 4);
    frames.push(Math.round(f[0]), Math.round(f[1]), Math.round(f[2] * 100) / 100, f[3]);
  }
  if (frames.length < 8) return undefined;
  return { time: Math.round(g.time * 100) / 100, splits: [], frames, hz: hz / every };
}

/** The run you chase in the Daily Challenge: whose, how far they got, and their ghost. */
export interface DailyRival {
  name: string;
  score: number;
  time: number;
  ghost: Ghost;
}

/** `day`'s leading run with a ghost; undefined if there's none yet (or offline). */
export async function fetchDailyGhost(day: string): Promise<DailyRival | undefined> {
  const r = await rpc<{ name?: unknown; score?: unknown; time?: unknown; ghost?: unknown } | null>('daily_ghost', { p_day: day });
  if (!r || typeof r.name !== 'string' || typeof r.score !== 'number' || typeof r.time !== 'number') return undefined;
  const ghost = parseGhost(r.ghost);
  return ghost ? { name: r.name, score: r.score, time: r.time, ghost } : undefined;
}
