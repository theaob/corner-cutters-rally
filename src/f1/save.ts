// Corner Cutters Rally's save format (engine/save.ts keeps it): its version, and
// how an older save is brought up to date. Sections:
//   settings  sound (0…1), vibration (on/off), stickSide ('left'/'right': right unless set), layout ('handheld'/'desktop'),
//             largeText and colourSafe (on/off: off unless set; access.ts)
//   choices   the difficulty (by id), and your car's paint scheme (crews.ts)
//   progress  onboarded: the controls lap done or skipped
//   rally     current: the rally under way (or just over); best: your best finish in each rally; stages: your best time on each stage (rally.ts)
// Each value is checked where it's read, so a missing or odd one falls back to its default.
//
// To change the format: bump `version`, and add a migration from the old
// version to the new one to `migrations` (tested in tests/save.test.ts).

import type { SaveFormat } from '../engine/save';

/** The separate keys of before the save format (version 0); 'controls' was an old one no longer read. */
const LEGACY = ['layout', 'circuit', 'team', 'difficulty', 'weather', 'records', 'vibration', 'stick-side', 'sound', 'controls'];

/** Only the values that are there (JSON keeps no undefined). */
const some = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null));

export const CC_SAVE: SaveFormat = {
  version: 2,
  legacyKeys: LEGACY,
  migrations: [
    // 0 → 1: the separate keys into one save
    (_, legacy) => {
      const sound = legacy('sound');
      const vibration = legacy('vibration');
      return {
        settings: some({
          sound: sound !== null && Number.isFinite(Number(sound)) ? Number(sound) : undefined,
          vibration: vibration === null ? undefined : vibration !== 'off',
          stickSide: legacy('stick-side'),
          layout: legacy('layout'),
        }),
        choices: some({ circuit: legacy('circuit'), team: legacy('team'), difficulty: legacy('difficulty'), weather: legacy('weather') }),
      };
    },
    // 1 → 2: the thumbstick's default moved to the right (the HUD Lab layout); the old default, 'left', was saved
    // whether or not the player picked it, so it's dropped (a picked 'right' stays)
    (data) => {
      const settings = { ...((data.settings as Record<string, unknown> | undefined) ?? {}) };
      if (settings.stickSide === 'left') delete settings.stickSide;
      return { ...data, settings };
    },
  ],
};
