// The languages the game has besides English, by name only: each one's words (a file of its own here) are fetched
// when it's the chosen language, so the game doesn't download seven dictionaries to show one (src/engine/i18n.ts).
// A new language: its file, a line here, and a line in index.ts (which the tests read every dictionary from).
import type { LanguageSource } from '../../engine/i18n';

export const LANGUAGE_SOURCES: LanguageSource[] = [
  { code: 'es', name: 'Español', load: () => import('./es').then((m) => m.es) },
  { code: 'fr', name: 'Français', load: () => import('./fr').then((m) => m.fr) },
  { code: 'de', name: 'Deutsch', load: () => import('./de').then((m) => m.de) },
  { code: 'pt', name: 'Português (BR)', load: () => import('./pt').then((m) => m.pt) },
  { code: 'it', name: 'Italiano', load: () => import('./it').then((m) => m.it) },
  { code: 'tr', name: 'Türkçe', load: () => import('./tr').then((m) => m.tr) },
  { code: 'ja', name: '日本語', load: () => import('./ja').then((m) => m.ja) },
];
