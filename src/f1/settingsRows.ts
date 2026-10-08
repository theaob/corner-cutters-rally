// The settings rows shared by the menu's SETTINGS screen and the pause screen:
// the screen's shape (SCREEN: HANDHELD or WIDE, where the device can switch), the text's size (TEXT) and the
// colours (COLOURS: COLOUR-SAFE for colour blindness; access.ts), the camera (VIEW), the driving (GAS, STEERING, ASSIST, and on a touch screen SIDES: src/engine/drive/settings.ts), vibration, screen shake, the grid walk
// before a race, and the sound and music volumes, each changed with left/right (or a tap or swipe) and remembered
// as it changes. Difficulty is the menu's alone (not changed mid-race).

import { setVibration, vibrate, vibrationOn } from '../engine/haptics';
import { VOLUMES, setSoundVolume, soundVolume } from '../engine/audio';
import { musicVolume, setMusicVolume } from '../engine/music';
import { optionRow } from './menu';
import { setShake, shakeOn } from './shake';
import { GAS_MODES, STEER_SIDES, driveSettings, setDriveSetting } from '../engine/drive/settings';
import { STEER_FEELS } from '../engine/drive/steering';
import { ASSIST_LEVELS } from '../engine/drive/assist';
import { VIEWS, VIEW_ABOUT, setView, viewSetting } from './view';
import { setStats, statsOn } from './profile';
import { online } from '../engine/backend';
import { isTouchScreen, type LayoutMode } from '../engine/layout';
import { colourSafe, largeText, setColourSafe, setLargeText } from './access';

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

export type SettingsRow = ReturnType<typeof optionRow<unknown>>;

/** The rows, read from the save as they are now. */
export function settingsRows(): SettingsRow[] {
  const viewRow = optionRow('VIEW', VIEWS, viewSetting(), (v) => ({ name: v.toUpperCase(), about: VIEW_ABOUT[v] }), setView);
  // the driving (src/engine/drive/)
  const ds = driveSettings();
  const gasRow = optionRow('GAS', GAS_MODES, ds.gas, (g) => ({ name: g.toUpperCase(), about: g === 'auto' ? 'always on: you steer and brake' : 'yours: hold the gas pedal' }), (g) => setDriveSetting('gas', g));
  const steeringRow = optionRow('STEERING', STEER_FEELS, ds.feel, (f) => ({
    name: f.toUpperCase(),
    about: f === 'gentle' ? 'slower and softer, for fine lines' : f === 'quick' ? 'sharper, for the hairpins' : 'the wheel as set up',
  }), (f) => setDriveSetting('feel', f));
  const assistRow = optionRow('ASSIST', ASSIST_LEVELS, ds.assist, (a) => ({
    name: a.toUpperCase(),
    about: a === 'off' ? 'all your own steering' : a === 'strong' ? 'a firm hand keeps you on the road' : 'a light hand toward the road',
  }), (a) => setDriveSetting('assist', a));
  const sidesRow = optionRow('SIDES', STEER_SIDES, ds.side, (side) => ({ name: side === 'left' ? 'STEER LEFT' : 'STEER RIGHT', about: side === 'left' ? 'left thumb steers · pedals right' : 'right thumb steers · pedals left' }), (side) => setDriveSetting('side', side));
  const touchScreen = isTouchScreen();
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
  const screenRow = layoutSwitch && (layoutSwitch.can() || layoutSwitch.now() === 'desktop')
    ? optionRow('SCREEN', layouts, layoutSwitch.now(), (m) => ({ name: m === 'desktop' ? 'WIDE' : 'HANDHELD', about: m === 'desktop' ? 'the whole window · V switches' : "a phone's shape · V switches" }), (m) => layoutSwitch?.set(m))
    : undefined;
  const textRow = optionRow('TEXT', [false, true], largeText(), (on) => ({ name: on ? 'LARGE' : 'NORMAL', about: on ? 'menus and messages a size up' : 'the standard size' }), setLargeText);
  const coloursRow = optionRow('COLOURS', [false, true], colourSafe(), (on) => ({ name: on ? 'COLOUR-SAFE' : 'STANDARD', about: on ? 'splits in blue, white, orange, and in words' : 'splits in purple, green, amber' }), setColourSafe);
  // (STATS only where the build has a backend to send them to)
  return [...(screenRow ? [screenRow] : []), textRow, coloursRow, viewRow, gasRow, steeringRow, assistRow, ...(touchScreen ? [sidesRow] : []), vibrationRow, shakeRow, soundRow, musicRow, ...(online() ? [statsRow] : [])] as SettingsRow[];
}

/** The build's version (package and commit: vite.config.ts) as the settings say it: VERSION 0.0.1 · BUILD 2790585. */
export function versionText(version: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'): string {
  const [release, build] = version.split('+');
  return `VERSION ${release.toUpperCase()}${build ? ` · BUILD ${build.toUpperCase()}` : ''}`;
}

/** The version line under the settings, centred and quiet. */
export function versionLine(): HTMLElement {
  const p = document.createElement('p');
  p.className = 'version-line';
  p.textContent = versionText();
  return p;
}
