// What has to be ready before the game's own code runs (src/main.ts): its save, and the words of the chosen
// language. The menus read their text as they are built, so the dictionary is fetched first; only that one is.

import { loadLanguages } from '../engine/i18n';
import { useSave } from '../engine/save';
import { useStore } from '../engine/storage';
import { LANGUAGE_SOURCES } from './lang/sources';
import { CC_SAVE } from './save';

export async function prepareGame(): Promise<void> {
  // this game's saves (each game has its own prefix: itch.io games share one origin's storage), in its save format
  useStore('cc:');
  useSave(CC_SAVE);
  await loadLanguages(LANGUAGE_SOURCES);
}
