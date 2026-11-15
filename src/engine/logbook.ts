// The logbook: what's happened lately in the game, kept on the device, to say what led up to an error or a REPORT
// (they carry it: crashes.ts, report.ts). Short notes, with the seconds since launch: screens opened, the race's
// phases, buttons pressed, the app hidden and shown, the console's warnings and errors, the graphics' context lost,
// freezes. And the device the game's on (its model, Android and WebView versions, graphics chip, memory), which an
// error tied to some phones needs. Nothing is sent from here: only with a report or an error, as the STATS setting
// allows those.

/** How many notes are kept (the oldest let go), and the most characters of each. */
export const LOGBOOK = { keep: 60, length: 80 };

export interface Note {
  /** s since launch */
  t: number;
  what: string;
}

const notes: Note[] = [];
const start = typeof performance !== 'undefined' ? performance.now() : 0;
const since = () => Math.round(((typeof performance !== 'undefined' ? performance.now() : 0) - start) / 100) / 10;

/** Note `what`, now. */
export function note(what: string): void {
  notes.push({ t: since(), what: what.replace(/\s+/g, ' ').slice(0, LOGBOOK.length) });
  if (notes.length > LOGBOOK.keep) notes.splice(0, notes.length - LOGBOOK.keep);
}

/** The notes kept, oldest first (the last `n` of them). */
export function recent(n = LOGBOOK.keep): Note[] {
  return notes.slice(-n);
}

/** Forget them all (tests). */
export function clearNotes(): void {
  notes.length = 0;
}

/** The notes as lines (`12.3 race lights`), for a report or an error. */
export const lines = (list: Note[] = recent()): string[] => list.map((n) => `${n.t.toFixed(1)} ${n.what}`);

/**
 * `data` with as many of the latest `crumbs` (as lines) under `crumbs` as fit in `max` characters of JSON, the
 * oldest let go first (an error's row has room for 2,000 bytes).
 */
export function withCrumbs<T extends object>(data: T, crumbs: string[], max: number): T & { crumbs: string[] } {
  const out = { ...data, crumbs: [...crumbs] };
  while (out.crumbs.length && JSON.stringify(out).length > max) out.crumbs.shift();
  return out;
}

// ---------------------------------------------------------------- the device

/** What the device is, as far as the page can tell. */
export interface Device {
  /** the phone's model (Android: from the browser's own report of itself), its Android version, the WebView's (Chrome's) major version */
  model?: string;
  android?: string;
  webview?: string;
  /** the graphics chip, as WebGL names it */
  gpu?: string;
  /** GB of memory (rounded, as the browser gives it) and cores */
  mem?: number;
  cores?: number;
  /** the screen: css px and the pixel ratio (390x844@3) */
  screen: string;
  /** the picture's quality level, as the race last set it */
  quality?: string;
}

/** The model, Android version and Chrome version in a user agent string. */
export function fromUserAgent(ua: string): Pick<Device, 'model' | 'android' | 'webview'> {
  const android = /Android (\d+(?:\.\d+)?)/.exec(ua)?.[1];
  const model = /Android [^;)]*; ([^;)]+?)(?: Build\/[^;)]*)?[;)]/.exec(ua)?.[1]?.trim();
  const webview = /Chrome\/(\d+)/.exec(ua)?.[1];
  // (a browser that hides the model says "K")
  return { android, model: model && model !== 'K' ? model : undefined, webview };
}

let gpu: string | undefined;
let quality: string | undefined;
/** a model the browser told us on asking (more than its user agent says, where it hides it) */
let askedModel: string | undefined;

/** The race's picture quality level, as it changes. */
export const setQuality = (level: string): void => {
  if (level !== quality) note(`quality ${level}`);
  quality = level;
};

/** The graphics chip's name, from a WebGL context the game has (once is enough). */
export function setGpu(gl: WebGLRenderingContext | WebGL2RenderingContext | null | undefined): void {
  if (gpu || !gl) return;
  try {
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    gpu = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER)).slice(0, 60);
  } catch {
    // (not to be had: left out)
  }
}

/** Ask the browser for the phone's model, where it hides it from its user agent (it answers later, if at all). */
export function askModel(): void {
  const data = (navigator as Navigator & { userAgentData?: { getHighEntropyValues(h: string[]): Promise<{ model?: string }> } }).userAgentData;
  data?.getHighEntropyValues(['model']).then((v) => (askedModel = v.model || undefined), () => {});
}

/** The device, now. */
export function device(): Device {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { deviceMemory?: number }) : undefined;
  const fromUa = fromUserAgent(ua);
  const w = typeof window !== 'undefined' ? window : undefined;
  return {
    ...fromUa,
    model: askedModel ?? fromUa.model,
    gpu,
    mem: nav?.deviceMemory,
    cores: nav?.hardwareConcurrency,
    screen: w ? `${w.innerWidth}x${w.innerHeight}@${Math.round((w.devicePixelRatio || 1) * 100) / 100}` : '',
    quality,
  };
}

// ---------------------------------------------------------------- watching

/** s: a gap between frames this long, with the page in sight all along, is a freeze */
export const FREEZE = 3;

/** until when (ms, performance.now) a long frame is expected: a screen just opened, building its picture */
let busyUntil = 0;

/** A long frame is expected for the next `seconds` (a screen opening: its scene built, its shaders made ready). */
export function expectBusy(seconds: number): void {
  busyUntil = Math.max(busyUntil, (typeof performance !== 'undefined' ? performance.now() : 0) + seconds * 1000);
}

/** the page went out of sight since the last frame (no frames come while it's away: the gap on its return is no freeze) */
let lostSight = false;
/** counts the page's goings and comings (watchFrames has its own look at them) */
let sightEpoch = 0;

/** The page going out of sight or coming back (told by the host: no frame runs while it's away to see it). */
export function sightChanged(): void {
  lostSight = true;
  sightEpoch++;
}

/**
 * Watch for freezes: a frame more than FREEZE s after the last, the page in sight all the while (a page put away
 * isn't drawn, and that's no freeze), told to `onFreeze` with its length (s). `ignored()`: the page out of sight, or a
 * time a long frame is expected (a screen being built behind the curtain); checked every frame, and a gap that
 * starts in such a time doesn't count.
 */
export function watchFreezes(onFreeze: (seconds: number) => void, ignored: () => boolean): void {
  let last: number | undefined;
  let away = false;
  const frame = (now: number) => {
    if (ignored() || now < busyUntil || lostSight) away = true;
    else {
      if (last !== undefined && !away && (now - last) / 1000 > FREEZE) {
        note(`freeze ${((now - last) / 1000).toFixed(1)} s`);
        onFreeze((now - last) / 1000);
      }
      away = false;
    }
    last = now;
    lostSight = false;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- slow frames

/** What a stretch of frames was like. */
export interface FrameStats {
  /** frames per second over the stretch, the worst frame (ms), and the 95th percentile frame (ms) */
  fps: number;
  worst: number;
  p95: number;
  /** frames over 50 ms (a visible stutter) and over 100 ms (a hitch) */
  janks: number;
  hitches: number;
  /** the stretch's length (s) */
  seconds: number;
}

/** s of frames judged together, and the frames needed in them to judge at all */
export const FRAME_WINDOW = { seconds: 5, min: 20 };
/** what makes a stretch worth reporting: a sustained low rate, or hitches (a frame this late, still short of a freeze) */
export const SLOW = { fps: 40, hitchMs: 100, hitches: 3, worstMs: 500 };

/** The stats of `deltas` (ms between frames), or nothing when there are too few to judge. */
export function frameStats(deltas: number[]): FrameStats | undefined {
  if (deltas.length < FRAME_WINDOW.min) return undefined;
  const sorted = [...deltas].sort((a, b) => a - b);
  const total = deltas.reduce((a, b) => a + b, 0);
  return {
    fps: Math.round((deltas.length / total) * 10000) / 10,
    worst: Math.round(sorted[sorted.length - 1]),
    p95: Math.round(sorted[Math.floor(sorted.length * 0.95)]),
    janks: deltas.filter((d) => d > 50).length,
    hitches: deltas.filter((d) => d > SLOW.hitchMs).length,
    seconds: Math.round(total / 100) / 10,
  };
}

/** Whether a stretch is slow enough to report. */
export const isSlow = (s: FrameStats): boolean => s.fps < SLOW.fps || s.hitches >= SLOW.hitches || s.worst >= SLOW.worstMs;

/** the latest stretch judged (any of them, slow or not), for a report or an error to carry */
let lastStats: FrameStats | undefined;
export const latestFrames = (): FrameStats | undefined => lastStats;

/** The JS heap in use (MB), where the browser tells (Chrome and Android's WebView do). */
export function heapMb(): number | undefined {
  const used = (typeof performance !== 'undefined' ? (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize : undefined);
  return used ? Math.round(used / 1048576) : undefined;
}

/** Long tasks (the page's script busy for 200 ms or more) seen since the last stretch was judged. */
let longTasks = 0;
export function watchLongTasks(): void {
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.duration < 200) continue;
        longTasks++;
        note(`long task ${Math.round(e.duration)} ms`);
      }
    }).observe({ entryTypes: ['longtask'] });
  } catch {
    // (a browser without them: left out)
  }
}

/**
 * Watch the frames' pace: every FRAME_WINDOW.seconds of frames in sight is judged (rate, worst, 95th percentile,
 * stutters), noted in the logbook when slow, and told to `onSlow` with the long tasks seen in it and the heap. A
 * stretch with the page away, a screen being built, or a freeze (watchFreezes has it) is left out.
 */
export function watchFrames(onSlow: (stats: FrameStats, extra: { longTasks: number; heap?: number }) => void, ignored: () => boolean): void {
  let last: number | undefined;
  let deltas: number[] = [];
  let began = 0;
  let epoch = sightEpoch;
  const frame = (now: number) => {
    const moved = epoch !== sightEpoch;
    epoch = sightEpoch;
    if (ignored() || now < busyUntil || moved || last === undefined || (now - last) / 1000 > FREEZE) {
      deltas = [];
      longTasks = 0;
      began = now;
    } else {
      deltas.push(now - last);
      if ((now - began) / 1000 >= FRAME_WINDOW.seconds) {
        const stats = frameStats(deltas);
        if (stats) {
          lastStats = stats;
          if (isSlow(stats)) {
            note(`slow ${stats.fps} fps, worst ${stats.worst} ms`);
            onSlow(stats, { longTasks, heap: heapMb() });
          }
        }
        deltas = [];
        longTasks = 0;
        began = now;
      }
    }
    last = now;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/** Keep the console's warnings and errors in the logbook too (what the game and three.js say when something's off). */
export function noteConsole(target: Console = console): void {
  for (const level of ['warn', 'error'] as const) {
    const was = target[level].bind(target);
    target[level] = (...args: unknown[]) => {
      try {
        note(`${level} ${args.map((a) => (a instanceof Error ? a.message : typeof a === 'string' ? a : (() => { try { return JSON.stringify(a); } catch { return String(a); } })())).join(' ')}`);
      } catch {
        // (never in the way of the console itself)
      }
      was(...args);
    };
  }
}
