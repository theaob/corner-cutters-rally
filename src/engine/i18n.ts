// Language support: the game's text is written in English, and `t('SETTINGS')` gives that text in the chosen
// language (the English itself is the key, so a string without a translation, or in English, reads as written).
// A language is a dictionary from English text to its translation; `{name}` in the text is filled from `vars`.
// The choice is remembered (settings.language); until one is made it follows the device's language where the
// game has it, else English. Menus are built once, so a change has the open screen built again (the app does that).
// Only the chosen language's words are loaded: the rest are known by name until one of them is chosen.

import { save, saved } from './save';

export interface Language {
  /** BCP 47 base code, e.g. 'es' */
  code: string;
  /** its own name, as its speakers write it (shown in the LANGUAGE row) */
  name: string;
  /** English text to translation */
  words: Record<string, string>;
}

/** A language by name, its words fetched when it's the one chosen (they are most of a language's size). */
export interface LanguageSource {
  code: string;
  name: string;
  load: () => Promise<Language>;
}

export const ENGLISH: Language = { code: 'en', name: 'English', words: {} };

let languages: Language[] = [ENGLISH];
let current: Language = ENGLISH;
/** languages left out of the pick this time, their words not having arrived: the text and its capitals stay English */
const missing = new Set<string>();
/** where each language's words are fetched from (set at boot) */
let known: LanguageSource[] = [];

/** The languages the game has, English first, words and all. */
export function useLanguages(list: Language[]): void {
  languages = [ENGLISH, ...list.filter((l) => l.code !== ENGLISH.code)];
  missing.clear();
  current = pick();
}

/**
 * The languages the game has, English first, with the words of the chosen one only: the others are names in the
 * LANGUAGE row (choosing one fetches it then: chooseLanguage). Called once at boot (src/f1/boot.ts), before
 * any text is read. If the words can't be fetched (offline on the web), the game is in English this time.
 */
export async function loadLanguages(sources: LanguageSource[]): Promise<void> {
  known = sources;
  useLanguages(sources.map(({ code, name }) => ({ code, name, words: {} })));
  const chosen = sources.find((s) => s.code === current.code);
  if (!chosen) return;
  try {
    const full = await chosen.load();
    languages = languages.map((l) => (l.code === full.code ? full : l));
  } catch {
    for (const s of sources) missing.add(s.code);
  }
  current = pick();
}
export const availableLanguages = (): Language[] => languages;

/** The device's languages as base codes, most preferred first. */
function deviceCodes(): string[] {
  const nav = globalThis.navigator;
  const list = nav?.languages?.length ? nav.languages : nav?.language ? [nav.language] : [];
  return list.map((l) => l.toLowerCase().split('-')[0]);
}

/** The saved choice if it's a language we have, else the first of the device's we have, else English. */
function pick(): Language {
  const code = saved('settings', 'language');
  const have = (c: unknown) => languages.find((l) => l.code === c && !missing.has(l.code));
  return have(code) ?? deviceCodes().map(have).find(Boolean) ?? ENGLISH;
}

export const language = (): Language => current;

/** LANGUAGE in the settings: remembered. */
export function setLanguage(code: string): void {
  const l = languages.find((x) => x.code === code);
  if (!l) return;
  save('settings', 'language', l.code);
  current = l;
  globalThis.document?.documentElement.setAttribute('lang', l.code);
  for (const fn of [...listeners]) fn();
}
const listeners = new Set<() => void>();

/**
 * LANGUAGE in the settings: the chosen language's words are fetched if they haven't been (only the one in use is
 * loaded at boot), then it's set and the listeners run, so the open screen is built again in it. If the words can't
 * be fetched (offline on the web) the language stays as it was; the listeners run all the same, to show that.
 */
export async function chooseLanguage(code: string): Promise<boolean> {
  const l = languages.find((x) => x.code === code);
  if (!l) return false;
  let ok = true;
  const source = known.find((s) => s.code === code);
  if (source && !Object.keys(l.words).length) {
    try {
      const full = await source.load();
      languages = languages.map((x) => (x.code === full.code ? full : x));
    } catch {
      ok = false;
    }
  }
  if (ok) setLanguage(code);
  else for (const fn of [...listeners]) fn();
  return ok;
}
/** Run `fn` when the language changes. Gives back a stop. */
export function onLanguageChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

const RESUME = 'cc:language-resume';
/** A language change has the menu built again; this notes that the settings were open, so the new menu opens them again. */
export function markSettingsResume(): void {
  try { globalThis.sessionStorage?.setItem(RESUME, '1'); } catch { /* no storage: back at the menu, as before */ }
}
/** Whether a language change just had the menu built again (left as it is, for the splash to skip). */
export function settingsResumePending(): boolean {
  try { return globalThis.sessionStorage?.getItem(RESUME) === '1'; } catch { return false; }
}
/** True once, if the menu was just built again by a language change: the settings are to open again at LANGUAGE. */
export function takeSettingsResume(): boolean {
  const on = settingsResumePending();
  if (on) try { globalThis.sessionStorage?.removeItem(RESUME); } catch { /* ignore */ }
  return on;
}

/** Mark the page's language (for screen readers and the browser) as chosen. */
export function applyLanguage(): void {
  current = pick();
  globalThis.document?.documentElement.setAttribute('lang', current.code);
}

/** The text in the chosen language; `{name}`s in it filled from `vars`. */
export function t(english: string, vars?: Record<string, string | number>): string {
  const text = current.words[english] ?? english;
  return vars ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : text;
}

/** The back button's label: the arrow is the button's, the word is translated. */
export const backLabel = (): string => `◀ ${t('BACK')}`;

/** Capitals / lower case by the chosen language's rules (Turkish: i ↔ İ, ı ↔ I). */
export const upper = (text: string): string => text.toLocaleUpperCase(current.code);
export const lower = (text: string): string => text.toLocaleLowerCase(current.code);
