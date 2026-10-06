// The settings rows shared by the menu's SETTINGS screen and the pause screen:
// the screen's shape (SCREEN: HANDHELD or WIDE, where the device can switch), the text's size (TEXT) and the
// colours (COLOURS: COLOUR-SAFE for colour blindness; access.ts), which side the thumbstick sits on, how the controls drive (DRIVING), vibration, screen shake, the grid walk
// before a race, and the sound and music volumes, each changed with left/right (or a tap or swipe) and remembered
// as it changes. Difficulty is the menu's alone (not changed mid-race).

import { setStickSide, stickSide, type StickSide } from '../engine/deck';
import { setVibration, vibrate, vibrationOn } from '../engine/haptics';
import { VOLUMES, setSoundVolume, soundVolume } from '../engine/audio';
import { musicVolume, setMusicVolume } from '../engine/music';
import { optionRow } from './circuitSelect';
import { setShake, shakeOn } from './shake';
import { gridWalkOn, setGridWalk } from './gridPan';
import { DRIVE_STYLES, driveStyle, setDriveStyle } from './driveStyle';
import { setStats, statsOn } from './profile';
import { online } from '../engine/backend';
import type { LayoutMode } from '../engine/layout';
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
  const deck = document.getElementById('deck');
  const sides: StickSide[] = ['left', 'right'];
  const stickRow = optionRow('STICK', sides, stickSide(), (side) => ({ name: side.toUpperCase(), about: side === 'left' ? 'thumbstick left · A and B right' : 'thumbstick right · A and B left' }), (side) => {
    if (deck) setStickSide(deck, side);
  });
  const drivingRow = optionRow('DRIVING', DRIVE_STYLES, driveStyle(), (s) => ({
    name: s.toUpperCase(),
    about: s === 'auto' ? 'touch points the way · keys and pads steer' : s === 'point' ? 'the car goes where you point' : 'touch: a slider, gas and brake · keys and pads steer',
  }), setDriveStyle);
  const vibrationRow = optionRow('VIBRATION', [true, false], vibrationOn(), (on) => ({ name: on ? 'ON' : 'OFF', about: on ? 'crashes, grass, kerbs' : 'no buzzing' }), (on) => {
    setVibration(on);
    vibrate(40);
  });
  const soundRow = optionRow('SOUND', [...VOLUMES], nearest(soundVolume()), (v) => ({ name: volumeName(v), about: v ? 'engines, tyres, crashes, lights' : 'silence' }), setSoundVolume);
  const musicRow = optionRow('MUSIC', [...VOLUMES], nearest(musicVolume()), (v) => ({ name: volumeName(v), about: v ? 'menu and race tracks' : 'silence' }), setMusicVolume);
  const shakeRow = optionRow('SCREEN SHAKE', [true, false], shakeOn(), (on) => ({ name: on ? 'ON' : 'OFF', about: on ? 'crashes, kerbs and grass shake the camera' : 'the camera stays still' }), setShake);
  const gridWalkRow = optionRow('GRID WALK', [true, false], gridWalkOn(), (on) => ({ name: on ? 'ON' : 'SKIP', about: on ? 'the camera down the grid before the lights' : 'straight to the start lights' }), setGridWalk);
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
  return [...(screenRow ? [screenRow] : []), textRow, coloursRow, stickRow, drivingRow, vibrationRow, shakeRow, gridWalkRow, soundRow, musicRow, ...(online() ? [statsRow] : [])] as SettingsRow[];
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
