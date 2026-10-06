// What each deck button does just now ('' for nothing), from the stage's state:
// A the stage's own action (on to the results, on to the rally's screen; the
// controls lap's SKIP or MENU), B drift while you're driving, START restart,
// SELECT pause while driving (A still pauses on the keys and a gamepad), else
// exit. The stage's loop reads its input by the same labels. Engine-free.

import type { DeckButton } from '../../engine/deck';

export interface DeckState {
  /** the pause screen's settings are up */
  settings: boolean;
  /** the stage's results are up */
  resultsUp: boolean;
  /** the controls lap, and whether it's done */
  tutorial: boolean;
  learnt: boolean;
  /** your stage is over (finished, or out) */
  done: boolean;
  paused: boolean;
}

export function deckLabels(s: DeckState): Record<DeckButton, string> {
  // (the settings: nothing on the deck, their own DONE closes them; A, B and START still do on the keys and a gamepad)
  if (s.settings) return { a: '', b: '', start: '', select: '' };
  let a = '';
  if (s.tutorial) a = s.learnt ? 'MENU' : 'SKIP';
  else if (s.done) a = s.resultsUp ? 'NEXT' : 'SKIP';
  // (paused: no A on the deck, the pause screen's own RESUME does it; A, Esc and P still resume on the keys and a gamepad)
  else a = s.paused ? '' : 'PAUSE';
  const driving = !s.paused && !s.done;
  // (while driving the small button pauses, in EXIT's place: you leave from the pause screen, by its own EXIT, asked
  // once more; so paused, the deck has neither EXIT nor RESTART, the pause screen has both)
  const racing = a === 'PAUSE';
  // (the lesson learnt: MENU, and nothing else, on the deck)
  const lessonDone = s.tutorial && s.learnt;
  return {
    a: racing ? '' : a,
    b: driving && !lessonDone ? 'DRIFT' : '',
    // (a stage once finished counts: no running it again)
    start: s.paused || (s.done && !s.tutorial) || lessonDone ? '' : 'RESTART',
    select: racing ? 'PAUSE' : s.paused ? '' : 'EXIT',
  };
}
