// What each deck button does just now ('' for nothing), from the race's state:
// A the session's own action (skip, on to what's next), B drift while you're
// driving (on the keys or a gamepad: the touch deck has no drift button), START
// restart, SELECT pause while racing (A still pauses on the keys and a
// gamepad), else exit. The race's loop reads its input by the same labels.
// Engine-free.

import type { DeckButton } from '../../engine/deck';

export interface DeckState {
  /** the pause screen's settings are up */
  settings: boolean;
  /** the results (or qualifying's times) are up */
  resultsUp: boolean;
  /** a Championship round, over */
  roundOver: boolean;
  /** qualifying's over (its times are up) */
  qualifyingOver: boolean;
  /** a Time Attack's over (its result is up) */
  attackOver: boolean;
  session: 'qualifying' | 'race' | 'timetrial' | 'timeattack' | 'tutorial';
  /** the controls lap is done */
  learnt: boolean;
  /** the grid pan or a replay is on */
  watching: boolean;
  /** your race is over (finished, or out) */
  done: boolean;
  paused: boolean;
}

export function deckLabels(s: DeckState): Record<DeckButton, string> {
  // (the settings: nothing on the deck, their own DONE closes them; A, B and START still do on the keys and a gamepad)
  if (s.settings) return { a: '', b: '', start: '', select: '' };
  let a = '';
  if (s.roundOver && s.resultsUp) a = 'NEXT';
  else if (s.qualifyingOver) a = 'RACE';
  else if (s.attackOver) a = 'AGAIN';
  else if (s.session === 'qualifying') a = 'SKIP';
  else if (s.session === 'tutorial') a = s.learnt ? 'MENU' : 'SKIP';
  else if (s.watching) a = 'SKIP';
  // (paused: no A on the deck, the pause screen's own RESUME does it; A, Esc and P still resume on the keys and a gamepad)
  else if (!s.done) a = s.paused ? '' : 'PAUSE';
  else if (!s.resultsUp) a = 'SKIP';
  const driving = !s.paused && !s.done && !s.watching && !s.qualifyingOver && !s.attackOver;
  // (while racing the small button pauses, in EXIT's place: you leave from the pause screen, by its own EXIT, asked
  // once more; so paused, the deck has neither EXIT nor RESTART, the pause screen has both, and the top's left as
  // it's right)
  const racing = a === 'PAUSE';
  // (the lesson learnt: MENU, and nothing else, on the deck)
  const lessonDone = s.session === 'tutorial' && s.learnt;
  return { a: racing ? '' : a, b: driving && !lessonDone ? 'DRIFT' : '', start: s.paused || s.roundOver || s.qualifyingOver || s.attackOver ? '' : 'RESTART', select: racing ? 'PAUSE' : s.paused ? '' : 'EXIT' };
}
