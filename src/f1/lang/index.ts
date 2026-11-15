// Every language's dictionary at once (one file each, from the English text): for the tests, which check them all.
// The game itself fetches only the chosen one (sources.ts).
import type { Language } from '../../engine/i18n';
import { es } from './es';
import { fr } from './fr';
import { de } from './de';
import { pt } from './pt';
import { it } from './it';
import { tr } from './tr';
import { ja } from './ja';

export const LANGUAGES: Language[] = [es, fr, de, pt, it, tr, ja];
