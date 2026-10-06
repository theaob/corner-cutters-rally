// Quality levels for the HD-2D renderer, and the governor that steps down
// when a phone can't keep up. It never steps back up on its own, so the
// picture doesn't flicker between levels, with one exception: if stepping all
// the way down didn't make the frames any quicker, the slowness wasn't the
// picture's fault (the browser is holding the page to 30 fps: Low Power Mode,
// or Safari throttling a game embedded in another site's page), so it goes
// back to where it started and stops trying.

export interface QualityLevel {
  name: string;
  /** render resolution in multiples of game pixels */
  res: number;
  bloom: boolean;
  blur: boolean;
  shadowMap: number;
}

export const QUALITY_LEVELS: QualityLevel[] = [
  { name: 'high', res: 2, bloom: true, blur: true, shadowMap: 2048 },
  { name: 'medium', res: 2, bloom: false, blur: true, shadowMap: 1024 },
  { name: 'low', res: 1, bloom: false, blur: false, shadowMap: 1024 },
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

  constructor(private readonly p: GovernorParams = DEFAULT_GOVERNOR) {}

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
