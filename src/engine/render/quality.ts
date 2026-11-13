// Quality levels for the HD-2D renderer, and the governor that steps down
// when a phone can't keep up. It never steps back up on its own, so the
// picture doesn't flicker between levels, with one exception: if stepping all
// the way down didn't make the frames any quicker, the slowness wasn't the
// picture's fault (the browser is holding the page to 30 fps: Low Power Mode,
// or Safari throttling a game embedded in another site's page), so it goes
// back to where it started and stops trying.
//
// Every step is a hitch (a picture of another size, its targets made again), so where it settles is kept on the
// device (`keptQuality`, race.ts) and the next race starts there, warmed up behind the loading card, rather than
// stepping down again mid-race. It's forgotten after a few days, and with a new version of the game, so a phone
// that was only hot once, or on battery saver, gets full quality back.

export interface QualityLevel {
  name: string;
  /** render resolution in multiples of game pixels */
  res: number;
  bloom: boolean;
  blur: boolean;
  /** the sun's shadow map (px square); 0: no shadows at all */
  shadowMap: number;
}

export const QUALITY_LEVELS: QualityLevel[] = [
  { name: 'high', res: 2, bloom: true, blur: true, shadowMap: 2048 },
  { name: 'medium', res: 2, bloom: false, blur: true, shadowMap: 1024 },
  { name: 'low', res: 1, bloom: false, blur: false, shadowMap: 1024 },
  // (a phone too slow even for that: a coarser shadow map. Not none: the shadows turned off or back on make every
  // material's shader again, mid-race, a hitch of several hundred ms on a phone, then more as each part of the circuit
  // comes into sight)
  { name: 'minimum', res: 1, bloom: false, blur: false, shadowMap: 512 },
];

export interface GovernorParams {
  /** frame time (ms) above which we consider the phone too slow (20 ms ≈ 50 fps) */
  slowMs: number;
  /** seconds of sustained slowness before stepping down */
  patience: number;
  /** seconds to ignore after start or a level change (shader compiles, loading) */
  warmup: number;
  /** seconds after the warmup that a step down is given to show it helped */
  judge: number;
  /** how much quicker (a share of the frame time) a step down must make the frames to count as helping */
  gain: number;
}

export const DEFAULT_GOVERNOR: GovernorParams = { slowMs: 20, patience: 1.5, warmup: 1.0, judge: 1.0, gain: 0.15 };

export class QualityGovernor {
  level = 0;
  /** gave up: stepping down didn't help, so the level stays put */
  locked = false;
  private avgMs = 16.7;
  private slowFor = 0;
  private sinceChange = 0;
  /** where it was, and how slow, when it started stepping down; cleared once a step helps */
  private probe?: { level: number; ms: number };

  /** `start`: where a race before settled (`keptQuality`), if it's still to be trusted. */
  constructor(private readonly p: GovernorParams = DEFAULT_GOVERNOR, start?: { level: number; locked: boolean }) {
    if (!start) return;
    this.level = start.level;
    this.locked = start.locked;
  }

  private change(level: number): void {
    this.level = level;
    this.slowFor = 0;
    this.sinceChange = 0;
    this.avgMs = 16.7;
  }

  /** Feed one frame's duration (seconds); returns the level to use. */
  sample(dt: number): number {
    if (this.locked) return this.level;
    this.sinceChange += dt;
    if (this.sinceChange < this.p.warmup) return this.level;
    this.avgMs += (dt * 1000 - this.avgMs) * 0.1;
    // a step down that made the frames quicker: keep it (and step further if still too slow)
    if (this.probe && this.level !== this.probe.level && this.sinceChange >= this.p.warmup + this.p.judge && this.avgMs <= this.probe.ms * (1 - this.p.gain)) {
      this.probe = undefined;
    }
    this.slowFor = this.avgMs > this.p.slowMs ? this.slowFor + dt : 0;
    if (this.slowFor < this.p.patience) return this.level;
    if (this.level < QUALITY_LEVELS.length - 1) {
      this.probe ??= { level: this.level, ms: this.avgMs };
      this.change(this.level + 1);
    } else if (this.probe) {
      // all the way down and no quicker: the picture wasn't the problem
      this.change(this.probe.level);
      this.probe = undefined;
      this.locked = true;
    }
    return this.level;
  }
}

/** Where the governor settled on this device: its level, whether it gave up, when (ms since 1970) and in which version of the game. */
export interface KeptQuality {
  level: number;
  locked: boolean;
  at: number;
  version: string;
}

/** days a kept level is trusted */
export const KEEP_QUALITY_DAYS = 3;

/**
 * The level (and whether it's locked) to start a race at, from `kept` as stored (anything: a save can be damaged, or
 * from another version): nothing (full quality, and the governor watching) when there's none, it's from another
 * version of the game, or it's older than KEEP_QUALITY_DAYS.
 */
export function keptQuality(kept: unknown, now: number, version: string): { level: number; locked: boolean } | undefined {
  if (!kept || typeof kept !== 'object') return undefined;
  const k = kept as Partial<KeptQuality>;
  if (k.version !== version || typeof k.at !== 'number' || now - k.at > KEEP_QUALITY_DAYS * 86400000 || now < k.at) return undefined;
  if (typeof k.level !== 'number' || !Number.isInteger(k.level) || k.level < 0 || k.level >= QUALITY_LEVELS.length) return undefined;
  return { level: k.level, locked: k.locked === true };
}
