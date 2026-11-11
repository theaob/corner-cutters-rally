// Accessibility: the device's ask for less motion, and two settings of the
// game's own. TEXT: LARGE makes the menus' text and the race's messages (the
// banner, the co-driver's card, the pause screen) a fifth bigger (index.html: their sizes
// times --ts). COLOURS: COLOUR-SAFE swaps the colours that tell things apart
// by colour alone (a stage's splits: purple, green and amber, which red-green
// colour blindness runs together) for blue, white and orange, and says which
// is which in words too. Remembered.

import { save, saved } from '../engine/save';

/** How a split stands: quickest of all, quicker than the mark, or slower. */
export type SplitMark = 'record' | 'better' | 'worse';

/** The device asks for less motion (prefers-reduced-motion): no screen shake unless turned on, no speed lines. */
export function motionReduced(): boolean {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/** how much bigger LARGE text is */
export const LARGE_TEXT = 1.2;

/** TEXT in the settings: large or not (normal unless set). */
export function largeText(): boolean {
  return saved('settings', 'largeText') === true;
}
export function setLargeText(on: boolean): void {
  save('settings', 'largeText', on);
  applyText();
}
/** Size the page's text as the setting says (on the page's root: html.large-text, --ts). */
export function applyText(root: HTMLElement | undefined = globalThis.document?.documentElement): void {
  if (!root) return;
  const on = largeText();
  root.classList.toggle('large-text', on);
  root.style.setProperty('--ts', on ? String(LARGE_TEXT) : '1');
}

/** COLOURS in the settings: colour-safe or not (standard unless set). */
export function colourSafe(): boolean {
  return saved('settings', 'colourSafe') === true;
}
export function setColourSafe(on: boolean): void {
  save('settings', 'colourSafe', on);
}

/** A split's colour: purple, green, amber; colour-safe, blue, white, orange. */
export function splitColor(mark: SplitMark, safe = colourSafe()): string {
  return (safe ? { record: '#56b4e9', better: '#f4f2fa', worse: '#e69f00' } : { record: '#b36bff', better: '#5fe0d0', worse: '#f2c14e' })[mark];
}
/** What a sector's split says after its time when colour-safe (in words, not colour alone); nothing otherwise. */
export function splitWord(mark: SplitMark, safe = colourSafe()): string {
  return safe ? { record: ' · RECORD', better: ' · BEST', worse: '' }[mark] : '';
}

/** How a bend's grade reads at a glance: tight (a 1, a 2, a hairpin), medium (3 and 4) or fast (5 and 6). */
export type GradeBand = 'tight' | 'medium' | 'fast';
export function gradeBand(grade: number | 'hairpin'): GradeBand {
  return grade === 'hairpin' || grade <= 2 ? 'tight' : grade <= 4 ? 'medium' : 'fast';
}
/**
 * A bend's colour on the co-driver's card (and the roadside boards to come), by its band: red, amber, green; colour-safe,
 * the splits' orange, white and blue (red and green are the pair red-green colour blindness runs together).
 */
export function gradeColor(grade: number | 'hairpin', safe = colourSafe()): string {
  const band = gradeBand(grade);
  return (safe ? { tight: '#e69f00', medium: '#f4f2fa', fast: '#56b4e9' } : { tight: '#ff5a4e', medium: '#f2c14e', fast: '#6ad86a' })[band];
}

/** A split's gap flashed in its colour: ahead green, behind red; colour-safe, blue and orange. */
export function gapColor(ahead: boolean, safe = colourSafe()): string {
  return safe ? (ahead ? '#56b4e9' : '#e69f00') : ahead ? '#6ad86a' : '#ff5a4e';
}
