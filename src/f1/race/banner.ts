// The banner over the race once the lights are out: the most urgent message
// just now (the replay, your finish or DNF, a pit stop, BOX BOX, the wrong
// way, GO!, an announcement, the controls lap's prompt, the safety car, a Time
// Attack's clock). Engine-free.

export interface BannerState {
  /** a replay is on, and the blink of its dot */
  replay: boolean;
  blink: boolean;
  /** the champagne ceremony is on (its names are on its plates) */
  ceremony: boolean;
  resultsUp: boolean;
  /** your car's wrecked, or out */
  out: boolean;
  championship: boolean;
  /** your race is over, and where you finished (undefined: you didn't) */
  done: boolean;
  finishedPlace?: number;
  /** your pit stop: stopped (s left), or in the lane (on the limiter or not) */
  pit?: { stopped: boolean; left: number; limiter: boolean };
  /** the pit wall calls you in, and the pits' side */
  boxBox: boolean;
  pitSide: string;
  /** s you've been going the wrong way */
  wrongWay: number;
  /** race time (s), and the session */
  clock: number;
  session: string;
  /** an announcement up till `until` */
  notice: { text: string; color: string; until: number };
  /** the controls lap's prompt, and whether it's the last */
  learn?: { text: string; last: boolean };
  /** you haven't crossed the line yet (on your own: the timing starts there) */
  beforeLine: boolean;
  safetyCar: boolean;
  vsc: boolean;
  /** a Time Attack's seconds left */
  attackLeft?: number;
}

/** The banner's text and colour. */
export function bannerMessage(s: BannerState): [string, string] {
  return s.replay ? [`${s.blink ? '●' : '○'} REPLAY`, '#d8323c']
    : s.ceremony && !s.resultsUp ? ['', '']
    : s.out ? [s.championship ? 'DNF' : 'DNF · RESTART to go again', '#d8323c']
    : s.done && s.finishedPlace !== undefined && !s.resultsUp ? [`FINISHED · P${s.finishedPlace}`, s.finishedPlace <= 3 ? '#f2c14e' : '#f4f4f8']
    : s.done ? ['', '']
    : s.pit?.stopped ? [`PIT STOP ${Math.max(0, s.pit.left).toFixed(1)}`, '#f2c14e']
    : s.pit ? [s.pit.limiter ? 'PIT LIMITER' : 'PIT LANE', '#f2c14e']
    : s.boxBox ? [`BOX, BOX · PITS ${s.pitSide}`, '#f2c14e']
    : s.wrongWay > 1 ? ['WRONG WAY', '#d8323c']
    : s.clock < 1.2 && s.session === 'race' ? ['GO!', '#5fe0d0']
    : s.clock < s.notice.until ? [s.notice.text, s.notice.color]
    : s.learn ? [s.learn.text, s.learn.last ? '#f2c14e' : '#f4f4f8']
    : s.session !== 'race' && s.session !== 'tutorial' && s.beforeLine ? ['TIMING STARTS AT THE LINE', '#9d9ab8']
    : s.safetyCar ? ['SAFETY CAR', '#f2c14e']
    : s.vsc ? ['VIRTUAL SAFETY CAR', '#f2c14e']
    // (a Time Attack's clock, red in its last seconds)
    : s.attackLeft !== undefined ? [`${s.attackLeft.toFixed(1)} S`, s.attackLeft < 5 ? '#d8323c' : '#f4f4f8']
    : ['', ''];
}

/**
 * `text` on two lines: at its ' · ' (the one nearest the middle), a phrase a
 * line and the dot gone; without one, at the space that leaves the longer
 * line shortest (where a browser can't balance the lines itself). One word: as it is.
 */
export function evenLines(text: string): string {
  const words = text.split(' ');
  if (words.length < 2) return text;
  const dots = words.flatMap((w, k) => (w === '·' && k > 0 && k < words.length - 1 ? [k] : []));
  if (dots.length) {
    const k = dots.reduce((a, b) => (Math.abs(b - words.length / 2) < Math.abs(a - words.length / 2) ? b : a));
    return `${words.slice(0, k).join(' ')}\n${words.slice(k + 1).join(' ')}`;
  }
  let at = 1;
  let longest = Infinity;
  for (let k = 1; k < words.length; k++) {
    const most = Math.max(words.slice(0, k).join(' ').length, words.slice(k).join(' ').length);
    if (most < longest) [at, longest] = [k, most];
  }
  return `${words.slice(0, at).join(' ')}\n${words.slice(at).join(' ')}`;
}
