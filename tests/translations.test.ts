// Every text the game says through t() has a translation in every language the game has: the texts are found in
// the source (see helpers/gameTexts.ts). A new string without its translations fails here, and says which.

import { describe, expect, it } from 'vitest';
import { LANGUAGES } from '../src/f1/lang';
import { gameTexts } from './helpers/gameTexts';

describe.each(LANGUAGES.map((l) => [l.code, l] as const))('%s', (_code, language) => {
  it('has a translation for every text the game says', () => {
    expect(gameTexts().filter((s) => !(s in language.words)).sort()).toEqual([]);
  });
});
