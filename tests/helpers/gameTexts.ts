// The game's texts that go through t(): found in the source (t('…') and the like) and in the tables the screens read
// them from. Used by the translation tests, so a new string without its translations fails, and says which.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ACHIEVEMENTS } from '../../src/f1/achievements';
import { COMPOUNDS } from '../../src/f1/tyres';
import { DIFFICULTIES } from '../../src/f1/difficulty';
import { CHANGEABLE, WEATHERS } from '../../src/f1/weather';
import { LAYOUTS } from '../../src/f1/layouts';
import { MISSIONS } from '../../src/f1/missions';
import { REWARDS } from '../../src/f1/streak';
import { MEDAL_NAME } from '../../src/f1/medals';
import { MODES } from '../../src/f1/circuitSelect';
import { CAR_STYLES } from '../../src/f1/carStyle';
import { LABEL_ICON } from '../../src/f1/race/readout';
import { prompt } from '../../src/f1/onboarding';
import { SEASON_LENGTHS } from '../../src/f1/laps';
import { RADIO_LINES } from '../../src/f1/radio';

/** Texts that stay as they are in a language: names, codes and things that read the same. */
export const SAME = new Set(['OK', 'NORMAL', 'AUTO', 'ABC', 'YOU', 'CORNER CUTTERS']);

const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (f === 'lang' || f === 'designer' || f === 'stats') return [];
    return statSync(p).isDirectory() ? sources(p) : p.endsWith('.ts') ? [p] : [];
  });

/** `src` without its comments (an apostrophe in a comment would pair up with the next quote and hide the texts between). */
export const stripComments = (src: string): string =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => {
      for (let i = line.indexOf('//'); i >= 0; i = line.indexOf('//', i + 1)) {
        const before = line.slice(0, i).replace(/\\./g, '');
        // (a // outside any quote starts a comment; one inside a string, a URL, doesn't)
        if (['\'', '"', '`'].every((q) => before.split(q).length % 2 === 1)) return before;
      }
      return line;
    })
    .join('\n');

/** The string literals in `text` (its quotes or backticks, with no ${} in them). */
const literals = (text: string): string[] =>
  [...text.matchAll(/'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"|`((?:\\.|[^`\\$])*)`/g)].map((m) => (m[1] ?? m[2] ?? m[3]).replace(/\\(['"`])/g, '$1'));

/** The first argument of each `name(` call in `src`: up to its first comma or closing bracket outside quotes. */
function firstArgs(src: string, names: string[]): string[] {
  const out: string[] = [];
  const call = new RegExp(`(?<![\\w.$])(?:${names.join('|')})\\(`, 'g');
  for (let m; (m = call.exec(src)); ) {
    let depth = 0;
    let i = m.index + m[0].length;
    const from = i;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === "'" || c === '"' || c === '`') {
        for (i++; i < src.length && src[i] !== c; i++) if (src[i] === '\\') i++;
      } else if ('([{'.includes(c)) depth++;
      else if (')]}'.includes(c)) {
        if (depth === 0) break;
        depth--;
      } else if (c === ',' && depth === 0) break;
    }
    out.push(src.slice(from, i));
  }
  return out;
}

const translatable = (s: string) => /[A-Za-z]{2}/.test(s.replace(/\{\w+\}/g, ''));


/** Every text the game says through t(), by what it is. */
export function gameTexts(): string[] {
  const calls = new Map<string, string>();
  for (const file of sources('src')) {
    const src = stripComments(readFileSync(file, 'utf8'));
    if (!/engine\/i18n'|\.\/i18n'/.test(src)) continue;
    const alias = /\bt as (\w+)/.exec(src)?.[1];
    for (const arg of firstArgs(src, ['t', ...(alias ? [alias] : []), 'announce', 'announceNext', 'optionRow', 'menuButton', 'hintToast']))
      for (const s of literals(arg.replace(/[=!]==\s*(?:'[^']*'|"[^"]*")/g, ''))) if (translatable(s) && !arg.includes('${')) calls.set(s, file);
  }

  const tables: string[] = [
    ...ACHIEVEMENTS.flatMap((a) => [a.name, a.about]),
    ...Object.values(COMPOUNDS).map((c) => c.name),
    ...DIFFICULTIES.flatMap((d) => [d.name, d.about]),
    ...[...WEATHERS, CHANGEABLE].flatMap((w) => [w.name, w.about]),
    ...LAYOUTS.map((l) => l.about),
    ...MISSIONS.filter((m) => !m.circuit).map((m) => m.text),
    ...REWARDS.map((r) => r.name),
    ...Object.values(MEDAL_NAME),
    ...MODES.flatMap((m) => [m.name, m.about]),
    ...CAR_STYLES.map((c) => c.name),
    ...SEASON_LENGTHS.map((l) => l.name),
    ...Object.values(RADIO_LINES).flat(),
    ...literals(stripComments(readFileSync('src/f1/radio.ts', 'utf8'))).filter((s) => /^(P\{place\}|PODIUM|YES|CHEQUERED)/.test(s)),
    // (said through a constant, or looked up by a variable: the hint under the circuit, the tower's and the position's words)
    'SWIPE TO CHANGE · TAP THE CIRCUIT TO RACE', 'CIRCUIT', 'QUALI', 'PIT', 'BLUE',
    'SHOWERS', 'DRYING', 'LIGHT RAIN', ...Object.keys(LABEL_ICON), 'WRECKED', 'WORN', 'FOR', 'MISSION', 'STREAK', 'REWARD', 'ACHIEVEMENT',
    ...literals(stripComments(readFileSync('src/f1/race/deckLabels.ts', 'utf8'))).filter((s) => /^[A-Z]+$/.test(s)),
  ];
  const prompts = (['go', 'faster', 'bend', 'drift', 'limits', 'lap', 'done'] as const).flatMap((step) =>
    (['touch', 'keys', 'pad'] as const).flatMap((d) => [prompt(step, d, false), prompt(step, d, true)]));

  return [...new Set([...calls.keys(), ...tables, ...prompts])].filter((s) => translatable(s) && !SAME.has(s));
}
