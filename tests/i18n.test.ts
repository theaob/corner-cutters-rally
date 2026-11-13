import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSave, type SaveStore } from '../src/engine/save';
import { CC_SAVE } from '../src/f1/save';
import { LANGUAGES } from '../src/f1/lang';
import { LANGUAGE_SOURCES } from '../src/f1/lang/sources';
import { ENGLISH, applyLanguage, availableLanguages, chooseLanguage, language, loadLanguages, setLanguage, t, upper, useLanguages, type Language, type LanguageSource } from '../src/engine/i18n';

const xx: Language = { code: 'xx', name: 'Xxish', words: { SETTINGS: 'XSET', 'lap {n} of {total}': 'x{total}/{n}' } };

describe('language', () => {
  beforeEach(() => {
    const items = new Map<string, string>();
    const store: SaveStore = { getItem: (k) => items.get(k) ?? null, setItem: (k, v) => void items.set(k, v), removeItem: (k) => void items.delete(k) };
    useSave(CC_SAVE, store);
    vi.stubGlobal('navigator', { languages: ['en-GB'] });
    useLanguages([xx]);
  });

  it('English is first and the default; text reads as written', () => {
    expect(availableLanguages()[0]).toBe(ENGLISH);
    expect(language().code).toBe('en');
    expect(t('SETTINGS')).toBe('SETTINGS');
  });

  it("follows the device's language when the game has it, else English", () => {
    vi.stubGlobal('navigator', { languages: ['fr-FR', 'xx-YY'] });
    useLanguages([xx]);
    expect(language().code).toBe('xx');
    vi.stubGlobal('navigator', { languages: ['fr-FR'] });
    useLanguages([xx]);
    expect(language().code).toBe('en');
  });

  it('a saved choice wins over the device, and is remembered', () => {
    setLanguage('xx');
    expect(t('SETTINGS')).toBe('XSET');
    vi.stubGlobal('navigator', { languages: ['en'] });
    applyLanguage();
    expect(language().code).toBe('xx');
    setLanguage('en');
    applyLanguage();
    expect(t('SETTINGS')).toBe('SETTINGS');
  });

  it('untranslated text falls back to English; {name}s are filled', () => {
    setLanguage('xx');
    expect(t('SHOP')).toBe('SHOP');
    expect(t('lap {n} of {total}', { n: 2, total: 5 })).toBe('x5/2');
    expect(t('{a} stays', {})).toBe('{a} stays');
  });

  it('ignores a language the game does not have', () => {
    setLanguage('zz');
    expect(language().code).toBe('en');
  });
});

describe('only the chosen language is loaded', () => {
  const yy: Language = { code: 'yy', name: 'Yyish', words: { SETTINGS: 'YSET' } };
  let loads: string[];
  const source = (l: Language, fail = false): LanguageSource => ({
    code: l.code,
    name: l.name,
    load: () => (loads.push(l.code), fail ? Promise.reject(new Error('offline')) : Promise.resolve(l)),
  });

  beforeEach(() => {
    const items = new Map<string, string>();
    useSave(CC_SAVE, { getItem: (k) => items.get(k) ?? null, setItem: (k, v) => void items.set(k, v), removeItem: (k) => void items.delete(k) });
    vi.stubGlobal('navigator', { languages: ['en-GB'] });
    loads = [];
  });

  it('English fetches nothing, and every language is still there to choose by name', async () => {
    await loadLanguages([source(xx), source(yy)]);
    expect(loads).toEqual([]);
    expect(availableLanguages().map((l) => l.name)).toEqual(['English', 'Xxish', 'Yyish']);
    expect(t('SETTINGS')).toBe('SETTINGS');
  });

  it("the device's language is fetched, alone", async () => {
    vi.stubGlobal('navigator', { languages: ['yy-ZZ', 'xx'] });
    await loadLanguages([source(xx), source(yy)]);
    expect(loads).toEqual(['yy']);
    expect(language().code).toBe('yy');
    expect(t('SETTINGS')).toBe('YSET');
  });

  it('a choice is remembered, and its words come with the next start (the page reloads)', async () => {
    await loadLanguages([source(xx), source(yy)]);
    setLanguage('xx');
    expect(loads).toEqual([]);
    await loadLanguages([source(xx), source(yy)]);
    expect(loads).toEqual(['xx']);
    expect(t('SETTINGS')).toBe('XSET');
  });

  it('words that fail to arrive leave the game in English, the choice kept for next time', async () => {
    vi.stubGlobal('navigator', { languages: ['tr-TR', 'xx'] });
    const tr: Language = { code: 'tr', name: 'Türkçe', words: {} };
    await loadLanguages([source(tr, true), source(xx)]);
    expect(language().code).toBe('en');
    expect(upper('pit')).toBe('PIT');
    applyLanguage();
    expect(language().code).toBe('en');
    setLanguage('tr');
    await loadLanguages([source(tr), source(xx)]);
    expect(language().code).toBe('tr');
  });

  it("the game's list names every dictionary, each loading its own", async () => {
    expect(LANGUAGE_SOURCES.map(({ code, name }) => ({ code, name }))).toEqual(LANGUAGES.map(({ code, name }) => ({ code, name })));
    for (const [i, s] of LANGUAGE_SOURCES.entries()) expect(await s.load()).toBe(LANGUAGES[i]);
  });
});

describe('choosing a language while the game runs', () => {
  const sources = (fail = false): LanguageSource[] => [
    { code: 'tr', name: 'Türkçe', load: async () => { if (fail) throw new Error('offline'); return { code: 'tr', name: 'Türkçe', words: { PIT: 'BOX' } }; } },
  ];
  it('fetches its words then, sets it and tells the listeners', async () => {
    const { onLanguageChange } = await import('../src/engine/i18n');
    vi.stubGlobal('navigator', { languages: ['en'] });
    await loadLanguages(sources());
    expect(t('PIT')).toBe('PIT');
    let told = 0;
    const stop = onLanguageChange(() => told++);
    expect(await chooseLanguage('tr')).toBe(true);
    expect(language().code).toBe('tr');
    expect(t('PIT')).toBe('BOX');
    expect(told).toBe(1);
    stop();
    setLanguage('en');
  });
  it('stays as it was, and says so, when the words cannot be fetched', async () => {
    const { onLanguageChange } = await import('../src/engine/i18n');
    vi.stubGlobal('navigator', { languages: ['en'] });
    await loadLanguages(sources(true));
    let told = 0;
    const stop = onLanguageChange(() => told++);
    expect(await chooseLanguage('tr')).toBe(false);
    expect(language().code).toBe('en');
    expect(told).toBe(1);
    stop();
  });
});

describe("the game's languages", () => {
  it('keep the {names}, and short labels fit a narrow phone', () => {
    for (const l of LANGUAGES) {
      for (const [en, tr] of Object.entries(l.words)) {
        const names = (x: string) => (x.match(/\{\w+\}/g) ?? []).sort().join();
        expect(names(tr), `${l.code}: ${en}`).toBe(names(en));
        if (en.length <= 14 && en === en.toUpperCase()) expect(tr.length, `${l.code}: ${en} → ${tr}`).toBeLessThanOrEqual(Math.ceil(en.length * 1.5) + 2);
      }
    }
  });
});

describe('a language change keeps the settings open', () => {
  it('notes the settings were open across the reload, once', async () => {
    const mem = new Map<string, string>();
    vi.stubGlobal('sessionStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) });
    const { markSettingsResume, settingsResumePending, takeSettingsResume } = await import('../src/engine/i18n');
    expect(settingsResumePending()).toBe(false);
    markSettingsResume();
    expect(settingsResumePending()).toBe(true);
    expect(takeSettingsResume()).toBe(true);
    expect(takeSettingsResume()).toBe(false);
  });

  it('works without storage', async () => {
    vi.stubGlobal('sessionStorage', { getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('no'); }, removeItem: () => {} });
    const { markSettingsResume, takeSettingsResume } = await import('../src/engine/i18n');
    expect(() => markSettingsResume()).not.toThrow();
    expect(takeSettingsResume()).toBe(false);
  });
});
