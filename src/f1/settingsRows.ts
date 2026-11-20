// The settings rows shared by the menu's SETTINGS screen and the pause screen:
// the text's size (TEXT) and the colours (COLOURS: COLOUR-SAFE for colour blindness; access.ts), vibration, screen shake, the grid walk
// before a race, and the sound and music volumes, each changed with left/right (or a tap or swipe) and remembered
// as it changes, and PRIVACY and TERMS, opened with a tap; as in Corner Cutters, LANGUAGE, NAME (your three letters on
// the timing screens), GRAPHICS (the picture's quality, or a battery saver), MOTION (less movement) and
// PLAYER ID. Difficulty is the menu's alone (not changed mid-race).
// They're laid out as Corner Cutters lays out its settings: a list of pages, CONTROLS, GAME, SOUND and ACCESSIBILITY
// (settingsPages), each page its rows and BACK. There's one way to drive (the screen's halves, in landscape) and one
// view (one camera distance: style.ts CAMERA_NEAR), so neither is a setting.

import { setVibration, vibrate, vibrationOn } from '../engine/haptics';
import { VOLUMES, setSoundVolume, soundVolume } from '../engine/audio';
import { musicVolume, setMusicVolume } from '../engine/music';
import { menuButton, optionRow } from './menu';
import { menuPick, menuTick } from './sounds';
import { YOUTUBE } from '../engine/host';
import { PRIVACY_URL, TERMS_URL } from './legal';
import { setShake, shakeOn } from './shake';
import { NAME, NAME_MAX, cleanName, playerId, playerName, setPlayerName, setStats, statsOn } from './profile';
import { online } from '../engine/backend';
import { colourSafe, largeText, MOTION_SETTINGS, motionSetting, setColourSafe, setLargeText, setMotionSetting, type MotionSetting } from './access';
import { availableLanguages, chooseLanguage, language, t, backLabel } from '../engine/i18n';
import { GRAPHICS_SETTINGS, graphicsSetting, setGraphicsSetting, type GraphicsSetting } from './graphics';

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
  DRIVING: 'controls', VIBRATION: 'controls',
  DIFFICULTY: 'game', LANGUAGE: 'game', NAME: 'game', GRAPHICS: 'game', STATS: 'game',
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

/** NAME: your name on the timing screens, up to a full surname (YOU until set), typed (the phone's keyboard comes up). */
function nameRow(): SettingsRow {
  const el = document.createElement('div');
  el.className = 'option-row';
  const label = Object.assign(document.createElement('b'), { textContent: t('NAME') });
  const right = document.createElement('div');
  right.className = 'value';
  const field = document.createElement('input');
  Object.assign(field, { type: 'text', maxLength: NAME_MAX, autocomplete: 'off', spellcheck: false, value: playerName() ?? '', placeholder: 'YOU' });
  field.setAttribute('autocapitalize', 'characters');
  field.setAttribute('enterkeyhint', 'done');
  field.setAttribute('aria-label', t('Your name'));
  Object.assign(field.style, { width: '9em', textAlign: 'center', font: 'inherit', textTransform: 'uppercase' });
  const about = Object.assign(document.createElement('span'), { textContent: t('your name for the timing screens, up to 12 letters') });
  field.addEventListener('input', () => {
    const clean = cleanName(field.value);
    if (clean !== field.value) field.value = clean;
    const name = clean.replace(/[ '-]+$/, '');
    if (NAME.test(name)) setPlayerName(name);
  });
  right.append(field, about);
  el.append(label, right);
  return { el, step: () => {}, value: () => playerName(), refresh: () => { field.value = playerName() ?? ''; } };
}

/** Open a page outside the game (a new tab on the web; the phone's own browser in the app). */
function openPage(url: string): void {
  window.open(url, '_blank', 'noopener');
}

/** The rows, read from the save as they are now. */
export function settingsRows(): SettingsRow[] {
  // DRIVING: not a choice (there's one way to drive), how it goes, said where a player looks for it
  const drivingRow = actionRow('DRIVING', () => t('SCREEN HALVES'), () => t('left steers left, right steers right · both brake, then reverse'), () => {});
  const vibrationRow = optionRow('VIBRATION', [true, false], vibrationOn(), (on) => ({ name: on ? 'ON' : 'OFF', about: on ? 'crashes, grass, kerbs' : 'no buzzing' }), (on) => {
    setVibration(on);
    vibrate(40);
  });
  const soundRow = optionRow('SOUND', [...VOLUMES], nearest(soundVolume()), (v) => ({ name: volumeName(v), about: v ? 'engines, tyres, crashes, lights' : 'silence' }), setSoundVolume);
  const musicRow = optionRow('MUSIC', [...VOLUMES], nearest(musicVolume()), (v) => ({ name: volumeName(v), about: v ? 'menu and race tracks' : 'silence' }), setMusicVolume);
  const shakeRow = optionRow('SCREEN SHAKE', [true, false], shakeOn(), (on) => ({ name: on ? 'ON' : 'OFF', about: on ? 'crashes, kerbs and grass shake the camera' : 'the camera stays still' }), setShake);
  const statsRow = optionRow('STATS', [true, false], statsOn(), (on) => ({ name: on ? 'SHARE' : 'OFF', about: on ? 'anonymous play counts, to improve the game' : 'nothing sent' }), setStats);
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
  // LANGUAGE: only once the game has another language besides English (a change builds the open screen again)
  const languages = availableLanguages();
  const languageRow = languages.length > 1
    ? optionRow('LANGUAGE', languages.map((l) => l.code), language().code, (c) => ({ name: languages.find((l) => l.code === c)!.name.toUpperCase(), about: 'the language of the menus' }), (c) => void chooseLanguage(c))
    : undefined;
  // (each with its label, for its page; STATS only where the build has a backend to send them to)
  const rows: [SettingsRow, string][] = ([
    [drivingRow, 'DRIVING'], [vibrationRow, 'VIBRATION'],
    [languageRow, 'LANGUAGE'], [nameRow(), 'NAME'], [graphicsRow, 'GRAPHICS'], [online() && statsRow, 'STATS'],
    [!YOUTUBE && privacyRow, 'PRIVACY'], [!YOUTUBE && termsRow, 'TERMS'], [!YOUTUBE && idRow, 'PLAYER ID'],
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
