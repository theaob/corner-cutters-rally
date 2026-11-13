// The banner over a stage once it's GO: the most urgent message just now
// (your finish or out, the wrong way, GO!, an announcement); and the controls
// lap's prompt, in a slot of its own under it (race/hud.ts). Engine-free.

import { COLOR } from '../theme';
import { t } from '../../engine/i18n';

export interface BannerState {
  /** your car's wrecked, or out */
  out: boolean;
  /** your stage is over, and where you finished on it (undefined: you didn't) */
  done: boolean;
  finishedPlace?: number;
  /** a finish without a hit (and no time added): a clean stage */
  clean?: boolean;
  resultsUp: boolean;
  /** s you've been going the wrong way */
  wrongWay: number;
  /** stage time (s) */
  clock: number;
  /** an announcement up till `until` */
  notice: { text: string; color: string; until: number };
  /** the controls lap's prompt, and whether it's the last */
  learn?: { text: string; last: boolean };
}

/** The banner's text and colour. At the finish, an announcement first (a stage best), then the finish itself. */
export function bannerMessage(s: BannerState): [string, string] {
  const finished = s.done && s.finishedPlace !== undefined && !s.resultsUp;
  return s.out ? [t('OUT OF THE STAGE'), COLOR.red]
    : finished && s.clock < s.notice.until ? [s.notice.text, s.notice.color]
    : finished && s.clean ? [t('CLEAN STAGE · P{place}', { place: s.finishedPlace! }), COLOR.teal]
    : finished ? [t('FINISHED · P{place}', { place: s.finishedPlace! }), s.finishedPlace! <= 3 ? COLOR.gold : COLOR.white]
    : s.done ? ['', '']
    : s.wrongWay > 1 ? [t('WRONG WAY'), COLOR.red]
    : s.clock < 1.2 && !s.learn ? [t('GO!'), COLOR.teal]
    : s.clock < s.notice.until ? [s.notice.text, s.notice.color]
    : ['', ''];
}

/** The controls lap's prompt in its own slot (none once you're out of the stage), and its colour: the last in gold. */
export function lessonMessage(s: Pick<BannerState, 'out' | 'learn'>): [string, string] {
  return !s.learn || s.out ? ['', ''] : [t(s.learn.text), s.learn.last ? COLOR.gold : COLOR.white];
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
