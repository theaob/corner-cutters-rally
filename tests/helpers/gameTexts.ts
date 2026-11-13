// The game's texts that go through t(): found in the source (t('…') and the like) and in the tables the screens read
// them from. Used by the translation tests, so a new string without its translations fails, and says which.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { COMPOUNDS } from '../../src/f1/tyres';
import { DIFFICULTIES } from '../../src/f1/difficulty';
import { RACE_WEATHERS } from '../../src/f1/weather';
import { SCHEMES } from '../../src/f1/crews';
import { LABEL_ICON } from '../../src/f1/race/readout';
import { prompt, STEPS, type Device } from '../../src/f1/onboarding';
import { ASSIST_LEVELS } from '../../src/engine/drive/assist';
import { STEER_FEELS } from '../../src/engine/drive/steering';
import { GAS_MODES, type Control, type DriveStyle, type GasMode } from '../../src/engine/drive/settings';
import { VIEWS } from '../../src/f1/view';
import { RALLIES } from '../../src/f1/rally';
import { STAGE_SPECS } from '../../src/f1/stages';

/** Texts that stay as they are in a language: names, codes and things that read the same. */
export const SAME = new Set(['OK', 'NORMAL', 'AUTO', 'ABC', 'YOU', 'CORNER CUTTERS', 'CORNER CUTTERS RALLY']);

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

/** The texts in the `name:` and `about:` fields of `src`'s objects (up to the field's comma or closing bracket). */
function fields(src: string): string[] {
  return firstArgs(src.replace(/\b(name|about):\s*/g, '$1('), ['name', 'about'])
    .flatMap((arg) => literals(arg.replace(/[=!]==\s*(?:'[^']*'|"[^"]*")/g, '')))
    .filter((s) => /^[A-Z][A-Z -]+$|\s/.test(s));
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
    ...Object.values(COMPOUNDS).map((c) => c.name),
    ...DIFFICULTIES.flatMap((d) => [d.name, d.about]),
    ...RACE_WEATHERS.flatMap((w) => [w.name, w.about]),
    ...SCHEMES.map((s) => s.name),
    ...Object.keys(LABEL_ICON),
    ...literals(stripComments(readFileSync('src/f1/race/deckLabels.ts', 'utf8'))).filter((s) => /^[A-Z]+$/.test(s)),
    ...RALLIES.flatMap((e) => [e.name, e.surface, e.about]),
    ...STAGE_SPECS.map((l) => l.about),
    ...[...VIEWS, ...GAS_MODES, ...STEER_FEELS, ...ASSIST_LEVELS].map((v) => v.toUpperCase()),
    // (a setting's choices, named and told about in the row's own callback: optionRow translates them)
    ...['src/f1/settingsRows.ts', 'src/f1/view.ts', 'src/f1/screens/rally.ts'].flatMap((f) => fields(stripComments(readFileSync(f, 'utf8')))),
    // (said through a variable: the stage notes on the results, the road's state)
    'WENT OFF', 'WORN', 'WRECKED', 'SPIN', 'PUNCTURE', 'ROLLED', 'DNF', 'PENALTY', 'DRY', 'DAMP', 'WET',
  ];
  const prompts = STEPS.flatMap((step) =>
    (['touch', 'keys', 'pad'] as Device[]).flatMap((d) =>
      (['manual', 'auto'] as GasMode[]).flatMap((g) =>
        (['sim', 'topdown'] as DriveStyle[]).flatMap((st) => (['wheel', 'point'] as Control[]).map((c) => prompt(step, d, g, st, c))))));

  return [...new Set([...calls.keys(), ...tables, ...prompts])].filter((s) => translatable(s) && !SAME.has(s));
}
