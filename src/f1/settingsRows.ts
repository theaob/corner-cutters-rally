// The settings rows shared by the menu's SETTINGS screen and the pause screen:
// the screen's shape (SCREEN: HANDHELD or WIDE, where the device can switch), the text's size (TEXT) and the
// colours (COLOURS: COLOUR-SAFE for colour blindness; access.ts), the thumbstick's side (STICK, as in Corner Cutters), vibration, screen shake, the grid walk
// before a race, and the sound and music volumes, each changed with left/right (or a tap or swipe) and remembered
// as it changes, and PRIVACY and TERMS, opened with a tap; as in Corner Cutters, LANGUAGE, NAME (your three letters on
// the timing screens), GRAPHICS (the picture's quality, or a battery saver), MOTION (less movement), BACK UP and RESTORE
// (the save as a code, to move to another device) and PLAYER ID. Difficulty is the menu's alone (not changed mid-race).
// They're laid out as Corner Cutters lays out its settings: a list of pages, CONTROLS, GAME, SOUND and ACCESSIBILITY
// (settingsPages), each page its rows and BACK. There's one way to drive and one view, so neither is a setting.

import { setVibration, vibrate, vibrationOn } from '../engine/haptics';
import { VOLUMES, setSoundVolume, soundVolume } from '../engine/audio';
import { musicVolume, setMusicVolume } from '../engine/music';
import { menuButton, optionRow } from './menu';
import { menuPick, menuTick } from './sounds';
import { YOUTUBE } from '../engine/host';
import { PRIVACY_URL, TERMS_URL } from './legal';
import { setShake, shakeOn } from './shake';
import { CAMERA_SETTINGS, cameraSetting, setCameraSetting } from './style';
import { DRIVE_SCHEMES, driveScheme, setDriveScheme, setStickSide, stickSide, type StickSide } from '../engine/deck';
import { INITIALS, initials, playerId, setInitials, setStats, statsOn } from './profile';
import { online } from '../engine/backend';
import { isTouchScreen, type LayoutMode } from '../engine/layout';
import { colourSafe, largeText, MOTION_SETTINGS, motionSetting, setColourSafe, setLargeText, setMotionSetting, type MotionSetting } from './access';
import { availableLanguages, chooseLanguage, language, t, backLabel } from '../engine/i18n';
import { GRAPHICS_SETTINGS, graphicsSetting, setGraphicsSetting, type GraphicsSetting } from './graphics';
import { exportSaveDoc, replaceSave } from '../engine/save';
import { decodeSave, encodeSave } from '../engine/saveCode';
import { Share } from '@capacitor/share';

/** The page's layout, as the page (src/app.ts) switches it: the one now, whether this device can switch, and a switch. */
export interface LayoutSwitch {
  now(): LayoutMode;
  can(): boolean;
  set(mode: LayoutMode): void;
}
let layoutSwitch: LayoutSwitch | undefined;
/** The page hands over its layout switch, for the SCREEN row. */
export function useLayoutSwitch(s: LayoutSwitch): void {
  layoutSwitch = s;
}

/** The nearest volume step to `v`. */
const nearest = (v: number) => VOLUMES.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
const volumeName = (v: number) => ['OFF', 'LOW', 'MEDIUM', 'HIGH'][VOLUMES.indexOf(v as (typeof VOLUMES)[number])];

/** A row of the settings: an option row, or a row that does something when picked (PRIVACY, TERMS: actionRow). */
export type SettingsRow = Omit<ReturnType<typeof optionRow<unknown>>, 'el'> & {
  el: HTMLElement;
  /** its page (settingsPages) */
  section?: SettingsSection;
  /** shown just now; shown if unsaid */
  shown?: () => boolean;
  /** A or START on the row (a link, a copy): what it does besides stepping */
  activate?: () => void;
};

/** The settings' pages, as in Corner Cutters: CONTROLS (how you drive), GAME (how it plays), SOUND and ACCESSIBILITY. */
export const SETTINGS_SECTIONS = ['controls', 'game', 'sound', 'access'] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];
export const SECTION_NAME: Record<SettingsSection, string> = { controls: 'CONTROLS', game: 'GAME', sound: 'SOUND', access: 'ACCESSIBILITY' };

/** Each row's page, by its label. */
export const ROW_SECTION: Record<string, SettingsSection> = {
  DRIVING: 'controls', STICK: 'controls', VIBRATION: 'controls',
  CAMERA: 'game',
  DIFFICULTY: 'game', LANGUAGE: 'game', NAME: 'game', GRAPHICS: 'game', SCREEN: 'game', STATS: 'game', 'BACK UP': 'game', RESTORE: 'game',
  PRIVACY: 'game', TERMS: 'game', 'PLAYER ID': 'game',
  SOUND: 'sound', MUSIC: 'sound',
  TEXT: 'access', COLOURS: 'access', MOTION: 'access', 'SCREEN SHAKE': 'access',
};

/** Put the row on its page (by its label: ROW_SECTION). */
export function sectioned<T extends { el: HTMLElement }>(row: T, label: string): T & { section?: SettingsSection } {
  return Object.assign(row, { section: ROW_SECTION[label] });
}

/** A row that does something when it's picked (a tap, or A): `label` on the left, `value` on the right, `about` under it. Nothing to step. */
export function actionRow(label: string, value: () => string, about: () => string, run: () => void): SettingsRow {
  const el = document.createElement('button');
  el.className = 'option-row';
  const render = () => {
    el.innerHTML = '';
    const name = Object.assign(document.createElement('b'), { textContent: t(label) });
    const right = document.createElement('div');
    right.className = 'value';
    const line = document.createElement('div');
    line.className = 'line';
    line.append(Object.assign(document.createElement('strong'), { textContent: value() }));
    right.append(line, Object.assign(document.createElement('span'), { textContent: about() }));
    el.append(name, right);
  };
  // (on the press's release, not 'click': in a cross-origin frame on a phone a tap's click can go astray)
  let armed = false;
  el.addEventListener('pointerdown', () => (armed = true));
  el.addEventListener('pointerleave', () => (armed = false));
  el.addEventListener('pointerup', () => {
    if (armed) {
      run();
      render();
    }
    armed = false;
  });
  render();
  return { el, step: () => {}, value: () => undefined, refresh: render, activate: () => (run(), render()) };
}

/** Copy `text` (or, where the page may not, hand it to the phone's share sheet): true if it went anywhere. */
async function copyOrShare(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      await Share.share({ text });
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * RESTORE: paste a code from BACK UP on another device. A whole, unchanged code asks to be tapped again (it replaces
 * what's on this device, which is kept aside first); then the page reloads with it.
 */
function restoreRow(): SettingsRow {
  const el = document.createElement('div');
  el.className = 'option-row';
  const label = Object.assign(document.createElement('b'), { textContent: t('RESTORE') });
  const right = document.createElement('div');
  right.className = 'value';
  const field = document.createElement('input');
  Object.assign(field, { type: 'text', autocomplete: 'off', spellcheck: false, placeholder: t('PASTE A CODE') });
  field.setAttribute('aria-label', t('PASTE A CODE'));
  Object.assign(field.style, { width: '9em', font: 'inherit' });
  const about = document.createElement('span');
  const idle = () => t('progress from a BACK UP on another device');
  about.textContent = idle();
  let ready: ReturnType<typeof decodeSave>;
  let armed = false;
  const check = () => {
    ready = decodeSave(field.value);
    armed = false;
    about.textContent = !field.value.trim() ? idle() : ready ? t('a good code: tap here to replace this device’s progress') : t('not a whole code: copy it again');
  };
  field.addEventListener('input', check);
  const run = () => {
    if (!ready) return;
    if (!armed) {
      armed = true;
      about.textContent = t('tap again: this replaces the progress on this device');
      return;
    }
    about.textContent = replaceSave(ready) ? (location.reload(), t('restored')) : t('this code is from a newer game: update it first');
    armed = false;
  };
  el.addEventListener('pointerup', (e) => {
    if (e.target !== field) run();
  });
  right.append(field, about);
  el.append(label, right);
  return { el, step: () => {}, value: () => undefined, refresh: check, activate: run };
}

/** NAME: your three letters on the timing screens (YOU until set), typed (the phone's keyboard comes up), as on an arcade board. */
function nameRow(): SettingsRow {
  const el = document.createElement('div');
  el.className = 'option-row';
  const label = Object.assign(document.createElement('b'), { textContent: t('NAME') });
  const right = document.createElement('div');
  right.className = 'value';
  const field = document.createElement('input');
  Object.assign(field, { type: 'text', maxLength: 3, autocomplete: 'off', spellcheck: false, value: initials() ?? '', placeholder: 'YOU' });
  field.setAttribute('autocapitalize', 'characters');
  field.setAttribute('enterkeyhint', 'done');
  field.setAttribute('aria-label', t('Your three letters'));
  Object.assign(field.style, { width: '4.5em', textAlign: 'center', font: 'inherit', textTransform: 'uppercase' });
  const about = Object.assign(document.createElement('span'), { textContent: t('three letters or digits, for the timing screens') });
  field.addEventListener('input', () => {
    const clean = field.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
    if (clean !== field.value) field.value = clean;
    if (INITIALS.test(clean)) setInitials(clean);
  });
  right.append(field, about);
  el.append(label, right);
  return { el, step: () => {}, value: () => initials(), refresh: () => { field.value = initials() ?? ''; } };
}

/** Open a page outside the game (a new tab on the web; the phone's own browser in the app). */
function openPage(url: string): void {
  window.open(url, '_blank', 'noopener');
}

/** The rows, read from the save as they are now. */
export function settingsRows(): SettingsRow[] {
  // STICK: which side the thumbstick sits on (Corner Cutters' row: the deck's A and B go to the other; a touch screen's only)
  const deck = document.getElementById('deck');
  const sides: StickSide[] = ['left', 'right'];
  const stickRow = optionRow('STICK', sides, stickSide(), (side) => ({ name: side.toUpperCase(), about: side === 'left' ? 'thumbstick left · A and B right' : 'thumbstick right · A and B left' }), (side) => {
    if (deck) setStickSide(deck, side);
  });
  // (the thumbstick's side matters to STICK only)
  Object.assign(stickRow, { shown: () => driveScheme() === 'stick' });
  // DRIVING: SPLIT (the experiment: landscape, the screen's halves steer, both brake and then reverse) or STICK (the
  // thumbstick, in portrait); the page turns and lays itself out for it as it changes (src/app.ts)
  const drivingRow = optionRow('DRIVING', DRIVE_SCHEMES, driveScheme(), (d) => ({ name: d === 'split' ? 'SPLIT' : 'STICK', about: d === 'split' ? 'landscape · hold a half to steer, both to brake' : 'portrait · the floating thumbstick' }), setDriveScheme);
  // CAMERA: how close the camera sits over the car (style.ts)
  const CAMERA_ABOUT = { far: { name: 'FAR', about: 'the most road ahead' }, medium: { name: 'MEDIUM', about: 'a little closer to the car' }, close: { name: 'CLOSE', about: 'the car big, less road ahead' } };
  const cameraRow = optionRow('CAMERA', CAMERA_SETTINGS, cameraSetting(), (c) => CAMERA_ABOUT[c], setCameraSetting);
  const vibrationRow = optionRow('VIBRATION', [true, false], vibrationOn(), (on) => ({ name: on ? 'ON' : 'OFF', about: on ? 'crashes, grass, kerbs' : 'no buzzing' }), (on) => {
    setVibration(on);
    vibrate(40);
  });
  const soundRow = optionRow('SOUND', [...VOLUMES], nearest(soundVolume()), (v) => ({ name: volumeName(v), about: v ? 'engines, tyres, crashes, lights' : 'silence' }), setSoundVolume);
  const musicRow = optionRow('MUSIC', [...VOLUMES], nearest(musicVolume()), (v) => ({ name: volumeName(v), about: v ? 'menu and race tracks' : 'silence' }), setMusicVolume);
  const shakeRow = optionRow('SCREEN SHAKE', [true, false], shakeOn(), (on) => ({ name: on ? 'ON' : 'OFF', about: on ? 'crashes, kerbs and grass shake the camera' : 'the camera stays still' }), setShake);
  const statsRow = optionRow('STATS', [true, false], statsOn(), (on) => ({ name: on ? 'SHARE' : 'OFF', about: on ? 'anonymous play counts, to improve the game' : 'nothing sent' }), setStats);
  // SCREEN: the handheld (a phone's shape, the deck under it) or the wide screen (the whole window, the deck over it as
  // a HUD); only on a device with a mouse or trackpad (or already wide), where it was the deck's WIDE button
  const layouts: LayoutMode[] = ['handheld', 'desktop'];
  const screenRow = layoutSwitch && layoutSwitch.now() !== 'landscape' && (layoutSwitch.can() || layoutSwitch.now() === 'desktop')
    ? optionRow('SCREEN', layouts, layoutSwitch.now(), (m) => ({ name: m === 'desktop' ? 'WIDE' : 'HANDHELD', about: m === 'desktop' ? 'the whole window · V switches' : "a phone's shape · V switches" }), (m) => layoutSwitch?.set(m))
    : undefined;
  const textRow = optionRow('TEXT', [false, true], largeText(), (on) => ({ name: on ? 'LARGE' : 'NORMAL', about: on ? 'menus and messages a size up' : 'the standard size' }), setLargeText);
  const coloursRow = optionRow('COLOURS', [false, true], colourSafe(), (on) => ({ name: on ? 'COLOUR-SAFE' : 'STANDARD', about: on ? 'splits in blue, white, orange, and in words' : 'splits in purple, green, amber' }), setColourSafe);
  // MOTION: follow the phone's reduce-motion setting, or less or all of it whatever the phone says (access.ts)
  const MOTION_ABOUT: Record<MotionSetting, { name: string; about: string }> = {
    auto: { name: 'PHONE', about: "follows your phone's reduce-motion setting" },
    reduced: { name: 'REDUCED', about: 'less movement, whatever the phone says' },
    full: { name: 'FULL', about: 'all the movement, whatever the phone says' },
  };
  const motionRow = optionRow('MOTION', MOTION_SETTINGS, motionSetting(), (m) => MOTION_ABOUT[m], setMotionSetting);
  // GRAPHICS: the picture's quality: AUTO steps down by itself on a phone that can't keep up; the others hold one level, SAVER at 30 frames a second
  const GRAPHICS_ABOUT: Record<GraphicsSetting, { name: string; about: string }> = {
    auto: { name: 'AUTO', about: 'steps down by itself if the phone struggles' },
    high: { name: 'HIGH', about: 'the best picture, however the phone copes' },
    low: { name: 'LOW', about: 'a plainer picture, smoother on an older phone' },
    saver: { name: 'BATTERY SAVER', about: 'a plainer picture at 30 frames a second, for a hot or low phone' },
  };
  const graphicsRow = optionRow('GRAPHICS', GRAPHICS_SETTINGS, graphicsSetting(), (g) => GRAPHICS_ABOUT[g], setGraphicsSetting);
  // PRIVACY and TERMS: the pages, one tap away (legal.ts; not on YouTube); PLAYER ID: the number to quote when asking for
  // a report to be removed (tap: copied)
  const privacyRow = actionRow('PRIVACY', () => t('OPEN'), () => t('what the game keeps, and what it sends'), () => openPage(PRIVACY_URL));
  const termsRow = actionRow('TERMS', () => t('OPEN'), () => t('the rules of playing'), () => openPage(TERMS_URL));
  let copied = false;
  const idRow = actionRow('PLAYER ID', () => playerId().slice(0, 8).toUpperCase(), () => (copied ? t('copied: quote it to have your data removed') : t('tap to copy it: quote it to have your data removed')), () => {
    copied = true;
    void navigator.clipboard?.writeText(playerId()).catch(() => (copied = false));
  });
  // BACK UP and RESTORE: the whole save as a code to copy to another device (a new phone, the app and the web)
  let backedUp: boolean | undefined;
  const backupRow = actionRow('BACK UP', () => t('COPY'), () => (backedUp === undefined ? t('your progress as a code, to RESTORE on another device') : backedUp ? t('copied: keep it private, it holds your progress') : t('couldn’t copy it')), () => {
    void copyOrShare(encodeSave(exportSaveDoc())).then((ok) => {
      backedUp = ok;
      backupRow.refresh();
    });
  });
  // LANGUAGE: only once the game has another language besides English (a change builds the open screen again)
  const languages = availableLanguages();
  const languageRow = languages.length > 1
    ? optionRow('LANGUAGE', languages.map((l) => l.code), language().code, (c) => ({ name: languages.find((l) => l.code === c)!.name.toUpperCase(), about: 'the language of the menus' }), (c) => void chooseLanguage(c))
    : undefined;
  // (each with its label, for its page; STATS only where the build has a backend to send them to)
  const rows: [SettingsRow, string][] = ([
    [drivingRow, 'DRIVING'],
    [isTouchScreen() && stickRow, 'STICK'],
    [vibrationRow, 'VIBRATION'],
    [languageRow, 'LANGUAGE'], [nameRow(), 'NAME'], [graphicsRow, 'GRAPHICS'], [cameraRow, 'CAMERA'], [screenRow, 'SCREEN'], [online() && statsRow, 'STATS'],
    [backupRow, 'BACK UP'], [restoreRow(), 'RESTORE'], [!YOUTUBE && privacyRow, 'PRIVACY'], [!YOUTUBE && termsRow, 'TERMS'], [!YOUTUBE && idRow, 'PLAYER ID'],
    [soundRow, 'SOUND'], [musicRow, 'MUSIC'],
    [textRow, 'TEXT'], [coloursRow, 'COLOURS'], [motionRow, 'MOTION'], [shakeRow, 'SCREEN SHAKE'],
  ] as [SettingsRow | false | undefined, string][]).filter((r): r is [SettingsRow, string] => !!r[0]);
  return rows.map(([r, label]) => sectioned(r, label));
}

/** The places up/down moves between on a page: the rows shown, then BACK (`rows.length`). */
export function pagePlaces(rows: { shown?: () => boolean }[]): number[] {
  return [...rows.flatMap((r, k) => (r.shown?.() ?? true ? [k] : [])), rows.length];
}

/**
 * The settings as pages, as in Corner Cutters: a list (CONTROLS, GAME, SOUND, ACCESSIBILITY, then BACK and the
 * version), and a page of rows under each (and BACK). One for the menu's screen and one for the pause screen's; they
 * share how it is moved (up/down, left/right, A, B) and drawn. `onDone` is called when the list is left.
 */
export function settingsPages(rows: SettingsRow[], onDone: () => void) {
  let page: SettingsSection | undefined;
  let focus = 0;
  const sections = SETTINGS_SECTIONS.filter((s) => rows.some((r) => r.section === s));
  const onPage = (s: SettingsSection) => rows.filter((r) => r.section === s);
  const title = document.createElement('h2');
  const open = (s: SettingsSection) => {
    menuPick();
    page = s;
    focus = 0;
    render();
  };
  const back = () => {
    if (page) {
      menuPick();
      focus = sections.indexOf(page);
      page = undefined;
      render();
    } else onDone();
  };
  const links = sections.map((s) => menuButton(SECTION_NAME[s], () => open(s)));
  const end = menuButton(backLabel(), back);
  end.classList.add('settings-done');
  const version = versionLine();
  const els: HTMLElement[] = [title, ...links, ...rows.map((r) => r.el), end, version];
  /** where up/down goes: the list's links, or the page's rows shown (by their place in onPage), then BACK */
  const places = () => (page ? pagePlaces(onPage(page)) : [...links.keys(), links.length]);
  const render = () => {
    title.textContent = t(page ? SECTION_NAME[page] : 'SETTINGS');
    links.forEach((b, k) => {
      b.style.display = page ? 'none' : '';
      b.classList.toggle('focused', !page && focus === k);
    });
    const mine = page ? onPage(page) : [];
    for (const r of rows) {
      const k = mine.indexOf(r);
      r.el.style.display = k >= 0 && (r.shown?.() ?? true) ? '' : 'none';
      r.el.classList.toggle('focused', k >= 0 && focus === k);
    }
    const count = page ? mine.length : links.length;
    end.classList.toggle('focused', focus === count);
    version.style.display = page ? 'none' : '';
  };
  // a tap on a row focuses it, and a change shows or hides any rows it governs
  for (const r of rows) {
    r.el.addEventListener('pointerdown', () => {
      if (!page) return;
      focus = onPage(page).indexOf(r);
      render();
    });
    r.el.addEventListener('pointerup', () => render());
  }
  render();
  return {
    els,
    /** back to the list, as the page was first opened */
    reset() {
      page = undefined;
      focus = 0;
      render();
    },
    /** straight to a page with a row focused (the settings built again after a change of language) */
    restore(section: SettingsSection, row: number) {
      if (!sections.includes(section)) return;
      page = section;
      focus = row;
      render();
    },
    /** up (-1) or down (1), past the rows hidden just now */
    move(d: 1 | -1) {
      const p = places();
      const at = Math.max(0, p.indexOf(focus));
      focus = p[(at + d + p.length) % p.length];
      menuTick();
      render();
    },
    /** left (-1) or right (1) on a row */
    step(d: number) {
      if (!page) return;
      onPage(page)[focus]?.step(d);
      render();
    },
    /** A or START: opens a page from the list, follows a link row, or goes back from BACK */
    pick() {
      if (!page && focus < links.length) open(sections[focus]);
      else if (page && onPage(page)[focus]) onPage(page)[focus].activate?.();
      else back();
    },
    /** B or the phone's back button: up a level, and out of the settings from the list */
    back,
    /** the page open (undefined: the list) */
    open: () => page,
  };
}

/** The build's version (package and commit: vite.config.ts) as the settings say it: VERSION 0.0.1 · BUILD 2790585. */
export function versionText(version: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'): string {
  const [release, build] = version.split('+');
  return `${t('VERSION')} ${release.toUpperCase()}${build ? ` · ${t('BUILD')} ${build.toUpperCase()}` : ''}`;
}

/** The version line under the settings, centred and quiet. */
export function versionLine(): HTMLElement {
  const p = document.createElement('p');
  p.className = 'version-line';
  p.textContent = versionText();
  return p;
}
