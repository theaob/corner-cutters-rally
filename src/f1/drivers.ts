// The drivers' racing styles: each named driver races a little their own way.
// A style shifts two things: aggression (bolder passes and harder defending: it
// adds to the racecraft the difficulty gives) and consistency (fewer mistakes:
// a lock-up into a bend or a run wide through one). These are a game's
// characters, for variety on track; change them freely here.

export type StyleId = 'charger' | 'metronome' | 'veteran' | 'defender' | 'rookie';

export interface Style {
  id: StyleId;
  name: string;
  /** added to the difficulty's racecraft (0…1 after) */
  aggression: number;
  /** −1…1: more consistent makes fewer mistakes (× 1 − 0.6 × consistency) */
  consistency: number;
}

export const STYLES: Record<StyleId, Style> = {
  charger: { id: 'charger', name: 'CHARGER', aggression: 0.2, consistency: -0.3 },
  metronome: { id: 'metronome', name: 'METRONOME', aggression: -0.1, consistency: 0.6 },
  veteran: { id: 'veteran', name: 'VETERAN', aggression: 0.1, consistency: 0.4 },
  defender: { id: 'defender', name: 'DEFENDER', aggression: 0.15, consistency: 0.1 },
  rookie: { id: 'rookie', name: 'ROOKIE', aggression: 0.05, consistency: -0.5 },
};

/** Each driver's style, by their three-letter code (teams.ts). */
export const DRIVER_STYLES: Record<string, StyleId> = {
  VER: 'charger', HAD: 'rookie',
  HAM: 'veteran', LEC: 'charger',
  RUS: 'metronome', ANT: 'rookie',
  NOR: 'metronome', PIA: 'metronome',
  ALO: 'veteran', STR: 'defender',
  GAS: 'charger', COL: 'rookie',
  ALB: 'defender', SAI: 'metronome',
  LAW: 'charger', LIN: 'rookie',
  HUL: 'veteran', BOR: 'rookie',
  OCO: 'defender', BEA: 'rookie',
  BOT: 'veteran', PER: 'defender',
};

/** A driver's style (a metronome for one without). */
export const styleOf = (code: string): Style => STYLES[DRIVER_STYLES[code] ?? 'metronome'];

/** Each driver's race number, by their three-letter code: the one they race with. */
export const DRIVER_NUMBERS: Record<string, number> = {
  VER: 3, HAD: 6,
  HAM: 44, LEC: 16,
  RUS: 63, ANT: 12,
  NOR: 4, PIA: 81,
  ALO: 14, STR: 18,
  GAS: 10, COL: 43,
  ALB: 23, SAI: 55,
  LAW: 30, LIN: 41,
  HUL: 27, BOR: 5,
  OCO: 31, BEA: 87,
  BOT: 77, PER: 11,
};

/** A driver's race number (undefined for one without). */
export const numberOf = (code: string): number | undefined => DRIVER_NUMBERS[code];
