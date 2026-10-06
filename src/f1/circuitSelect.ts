// The menu shown before a race. First the modes: QUICK RACE, CHAMPIONSHIP, TIME
// ATTACK and TIME TRIAL, a big button each, SETTINGS, and TROPHIES (the
// cabinet: the Championships you've won, and your medals on each circuit). A Championship goes
// straight to its own screen (a season races every circuit); the others go on
// to the circuit: one card at a time (its outline, name, a line about it and
// your record there, dots for where it is in the list), a compact row for each
// of the mode's options (team and weather; a Quick Race's qualifying and laps
// too), the big button that races, and BACK to the modes. On a phone it's all
// touch (the deck is hidden): tap a mode; swipe the card or a row (or tap its
// sides) to change it, tap the card's middle or the race button to race. On a
// keyboard, up/down moves, left/right changes the circuit or a row, Enter picks
// or races, and B goes back.

import { challengeOn, dayOf } from './daily';
import type { Button } from '../engine/controls';
import { onBack } from '../engine/backButton';
import { holdTouches } from '../engine/deck';
import { menuPick, menuTick } from './sounds';
import type { Services } from '../engine/services';
import type { CircuitLayout } from './layouts';
import { numberOf } from './drivers';
import { TEAMS, type Seat, type Team } from './teams';
import { logoSvg } from './logos';
import { formatTime, loadRecords } from './records';
import { DIFFICULTIES, NORMAL, type Difficulty } from './difficulty';
import { DRY, RACE_WEATHERS, WEATHERS, type Weather } from './weather';
import { LAP_CHOICES, RACE_LAPS, lapsAbout } from './laps';
import { ownsChampionship } from './purchase';
import { distance } from './timeAttack';
import { settingsRows as settingsRowsNow, versionLine } from './settingsRows';
import { worldBoard } from './screens/worldBoard';
import { MEDAL_COLOR, MEDAL_NAME, loadTrophies, type Medal } from './medals';
import { medalBadge, trophy } from './screens/celebrate';
import { ACHIEVEMENTS, medalAchievements, unlock, unlockedAchievements } from './achievements';
import { TRACK_MODEL, drawModel, fitModel, trackModel } from './trackModel';
import { openReport, reportOpen } from './report';
import { YOUTUBE, gameHidden } from '../engine/host';
import { COMPOUNDS, type DryCompound } from './tyres';

/** The circuit as a line in 3D, w×h px, its hills and dips drawn up and down, turning slowly (still, for a device asking for reduced motion); it stops once taken off the page. */
function outline(layout: CircuitLayout, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.className = 'track-model';
  c.width = w * 2; // drawn at 2× for crisp lines
  c.height = h * 2;
  Object.assign(c.style, { width: `${w}px`, height: `${h}px` });
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  const m = trackModel(layout);
  const view = fitModel(m, c.width, c.height);
  const still = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const yawAt = (now: number) => (still ? -0.35 : -0.35 + ((now / 1000) * 2 * Math.PI) / TRACK_MODEL.turn);
  drawModel(ctx, m, view, c.width, c.height, yawAt(performance.now()));
  if (still) return c;
  let last = 0;
  let waited = 0;
  const frame = (now: number) => {
    // (it isn't on the page until the card is put together: wait a moment for it, and stop once it's gone)
    if (!c.isConnected && (last || ++waited > 60)) return;
    requestAnimationFrame(frame);
    if (!c.isConnected || gameHidden() || now - last < 1000 / 30) return;
    last = now;
    drawModel(ctx, m, view, c.width, c.height, yawAt(now));
  };
  requestAnimationFrame(frame);
  return c;
}

/** Whether the game is running inside another page's frame. */
function framed(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true; // (a cross-origin top can refuse even the comparison)
  }
}

/** A button that opens this page in a tab of its own (the same saves: it's the same site). */
function ownTabButton(): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'own-tab';
  b.textContent = 'SLOW HERE? PLAY IN ITS OWN TAB ↗';
  // on the press's release, not 'click' (in a cross-origin frame on a phone a tap's click can go astray)
  let armed = false;
  b.addEventListener('pointerdown', () => (armed = true));
  b.addEventListener('pointerleave', () => (armed = false));
  b.addEventListener('pointerup', () => {
    if (!armed) return;
    armed = false;
    const tab = window.open(window.location.href, '_blank');
    if (tab) tab.opener = null;
    else b.textContent = 'THE PAGE BLOCKED A NEW TAB';
  });
  return b;
}

/** What the menu comes back with. */
/** What to play: a race weekend, a Championship season, a Time Attack (beat the clock), or a Time Trial (flying laps against your ghost). */
export type GameMode = 'daily' | 'race' | 'championship' | 'timeattack' | 'timetrial';
export const MODES: { id: GameMode; name: string; about: string }[] = [
  { id: 'daily', name: 'DAILY CHALLENGE', about: 'one Time Attack a day, the same for everyone: get on the board' },
  { id: 'race', name: 'QUICK RACE', about: 'a race against the field, your circuit, your laps' },
  { id: 'championship', name: 'CHAMPIONSHIP', about: 'a season: a round on every circuit, points and standings' },
  { id: 'timeattack', name: 'TIME ATTACK', about: 'beat the clock: each sector you pass adds time' },
  { id: 'timetrial', name: 'TIME TRIAL', about: 'flying laps against your ghost' },
];

/** The option rows a mode has on its circuit screen (a Championship has none: it has its own screen); on dirt, no TYRES (off-road tyres, the only ones). */
export const rowsOf = (mode: GameMode, layout?: CircuitLayout): ('team' | 'car' | 'weather' | 'qualifying' | 'laps' | 'tyres')[] =>
  mode === 'race'
    ? ['team', 'car', 'weather', 'qualifying', 'laps', ...(layout?.dirt ? [] : ['tyres' as const])]
    : mode === 'championship' || mode === 'daily' ? [] : ['team', 'car', 'weather'];

/** The dry tyres you start a race on: the pit wall's strategy's (AUTO), or the SOFTs or the HARDs. */
export type TyrePick = 'auto' | DryCompound;
export const TYRE_PICKS: TyrePick[] = ['auto', 'slick', 'hard'];

export interface MenuChoice {
  mode: GameMode;
  layout: CircuitLayout;
  /** a Quick Race's start tyres (in the dry) */
  tyres: TyrePick;
  team: Team;
  /** which of the team's two cars you drive */
  seat: Seat;
  difficulty: Difficulty;
  weather: Weather;
  /** a qualifying lap before the race, to set your place on the grid */
  qualifying: boolean;
  /** a Quick Race's laps (a Championship round is always RACE_LAPS) */
  laps: number;
  /** RESUME RACE picked: back to the race kept on the device (raceSave.ts), the rest of the choice as it was */
  resume?: true;
}

/** px a finger must travel sideways for a swipe; less than TAP_SLOP counts as a tap */
const SWIPE = 28;
const TAP_SLOP = 12;

const HINT = 'SWIPE TO CHANGE · TAP THE CIRCUIT TO RACE';
const MODES_HINT = 'PICK A MODE';

/**
 * What a gesture on the circuit card does: a swipe left is the next circuit and
 * a swipe right the one before; a tap on its left or right edge (its ◀ ▶)
 * steps back or on, and a tap in the middle races it; a short wobble does nothing.
 */
export function cardGesture(dx: number, at: number): -1 | 0 | 1 | 'race' {
  if (Math.abs(dx) >= SWIPE) return dx < 0 ? 1 : -1;
  if (Math.abs(dx) >= TAP_SLOP) return 0;
  if (at < 0.2) return -1;
  if (at > 0.8) return 1;
  return 'race';
}

/**
 * What a gesture on an option row does: a swipe left is the next value and a
 * swipe right the previous (like a carousel); a tap on the row's left third
 * (its ◀) steps back, anywhere else forward; a short wobble does nothing.
 * `dx` is how far the finger moved sideways (px), `at` where it lifted across the row (0…1).
 */
export function rowGesture(dx: number, at: number): -1 | 0 | 1 {
  if (Math.abs(dx) >= SWIPE) return dx < 0 ? 1 : -1;
  if (Math.abs(dx) < TAP_SLOP) return at < 1 / 3 ? -1 : 1;
  return 0;
}

/**
 * A wrapped line of text's box narrowed to its longest line (a box wraps at its widest, leaving its lines short
 * of it either side): what's beside it then sits right beside the text. One line: left as it is.
 */
function hugLines(el: HTMLElement): void {
  el.style.width = '';
  const range = document.createRange();
  range.selectNodeContents(el);
  const lines = [...range.getClientRects()];
  if (new Set(lines.map((r) => Math.round(r.top))).size < 2) return;
  el.style.width = `${Math.ceil(Math.max(...lines.map((r) => r.width)))}px`;
}

/**
 * A row of options under the circuits: its label and the current value (with a
 * line about it and, for a team, its colours), switched with left/right or a tap.
 */
export function optionRow<T>(
  label: string, values: T[], start: T, show: (v: T) => { name: string; about: string; colors?: string[]; icon?: Element }, onChange?: (v: T) => void,
) {
  const el = document.createElement('button');
  el.className = 'option-row';
  let i = Math.max(0, values.indexOf(start));
  let fitName = () => {};
  const render = () => {
    const v = show(values[i]);
    el.innerHTML = '';
    // one line: the label on the left; on the right the value (with its colours) and a line about it
    const name = document.createElement('b');
    name.textContent = label;
    const right = document.createElement('div');
    right.className = 'value';
    // (its arrows either side; a name too long for the row wraps between them)
    const top = document.createElement('strong');
    const arrow = (a: string) => Object.assign(document.createElement('em'), { textContent: a });
    const text = Object.assign(document.createElement('em'), { className: 'name', textContent: v.name });
    top.append(arrow('◀'), text, arrow('▶'));
    fitName = () => hugLines(text);
    const line = document.createElement('div');
    line.className = 'line';
    if (v.colors || v.icon) {
      const chips = document.createElement('div');
      chips.className = 'chips';
      if (v.icon) chips.append(v.icon);
      for (const c of v.colors ?? []) {
        const chip = document.createElement('i');
        chip.style.background = c;
        chips.append(chip);
      }
      line.append(chips);
    }
    line.append(top);
    const about = document.createElement('span');
    about.textContent = v.about;
    right.append(line, about);
    el.append(name, right);
  };
  const step = (by: number) => {
    i = (i + by + values.length) % values.length;
    render();
    fitName();
    menuTick();
    onChange?.(values[i]);
  };
  // swipe it, or tap its sides (the row keeps the finger's events: touch captures to it)
  let startX: number | undefined;
  el.addEventListener('pointerdown', (e) => (startX = e.clientX));
  el.addEventListener('pointercancel', () => (startX = undefined));
  el.addEventListener('pointerup', (e) => {
    if (startX === undefined) return;
    const r = el.getBoundingClientRect();
    const by = rowGesture(e.clientX - startX, (e.clientX - r.left) / Math.max(1, r.width));
    startX = undefined;
    if (by) step(by);
  });
  render();
  // (as it's laid out, and again whenever the row's size changes: a wrapped name's box hugging its lines)
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => fitName()).observe(el);
  // (refresh: draw it again, when what it shows depends on another row)
  return { el, step, value: () => values[i], refresh: render };
}

/**
 * The CAR row, under TEAM: which of the team's two cars you drive (`team()`, the team picked): you take that
 * driver's seat and number, and their teammate races the other.
 */
export function carRow(team: () => Team, start: Seat) {
  const named = (code: string) => {
    const n = numberOf(code);
    return n === undefined ? code : `#${n} ${code}`;
  };
  return optionRow<Seat>('CAR', [0, 1], start, (s) => ({ name: named(team().drivers[s]), about: `teammate ${named(team().drivers[s === 0 ? 1 : 0])}` }));
}

/** A menu button, picked on the press's release (not 'click': in a cross-origin frame on a phone a tap's click can go astray). */
export function menuButton(text: string, onPick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'menu-button';
  b.textContent = text;
  let armed = false;
  b.addEventListener('pointerdown', () => (armed = true));
  b.addEventListener('pointerleave', () => (armed = false));
  b.addEventListener('pointerup', () => {
    if (armed) onPick();
    armed = false;
  });
  return b;
}

/**
 * Show the menu in `host` until a circuit is picked: `initial` highlighted
 * first, and your team `team` as last chosen.
 */
export function chooseCircuit(
  host: HTMLElement,
  services: Services,
  layouts: CircuitLayout[],
  initial?: CircuitLayout,
  team: Team = TEAMS[0],
  difficulty: Difficulty = NORMAL,
  weather: Weather = DRY,
  qualifying = false,
  mode: GameMode = 'race',
  /** a Quick Race's laps, as last chosen */
  laps: number = RACE_LAPS,
  /** which of the team's cars you drive, as last chosen */
  seat: Seat = 0,
  /** the circuits open for a Quick Race, a Time Attack or a Time Trial (the rest are reached in a Championship) */
  open: ReadonlySet<string> = new Set(layouts.map((l) => l.id)),
  /** closes the menu without a choice (the player went elsewhere: the browser's back or forward button) */
  closed?: AbortSignal,
  /** a Quick Race's start tyres, as last chosen */
  tyres: TyrePick = 'auto',
  /** a race kept on the device to come back to (raceSave.ts): RESUME RACE above the modes, its circuit and your lap under it */
  kept?: { about: string },
): Promise<MenuChoice> {
  const { controls, hud } = services;
  const menu = document.createElement('div');
  menu.className = 'circuit-menu';
  const title = document.createElement('h1');
  title.textContent = 'CORNER CUTTERS';
  const hint = document.createElement('p');
  hint.textContent = MODES_HINT;
  menu.append(title, hint);

  /** the circuit A or START races (the last one moved to) */
  let selected = Math.max(0, layouts.indexOf(initial!));
  // (a circuit that's locked isn't highlighted first)
  if (!open.has(layouts[selected].id)) selected = Math.max(0, layouts.findIndex((l) => open.has(l.id)));
  /** the mode picked (or, on the modes screen, last picked) */
  let current = MODES.find((m) => m.id === mode) ?? MODES[0];
  /**
   * where up/down is: on the modes screen a mode, then SETTINGS, then TROPHIES (none highlighted until up/down is
   * pressed: −1); on the circuit screen the circuit (0), then the mode's
   * rows, then the race button, then BACK; in the settings, a row, then DONE
   */
  let focus = -1;
  /** the modes, a mode's circuit screen, the settings, or the trophy cabinet */
  let view: 'modes' | 'circuit' | 'settings' | 'trophies' = 'modes';
  let finish: (l: CircuitLayout) => void = () => {};

  // (the CAR row names the team's drivers: drawn again when the team changes)
  const teamRow = optionRow('TEAM', TEAMS, team, (t) => ({ name: t.name.toUpperCase(), about: t.code, colors: [t.body, t.trim, ...(t.accent ? [t.accent] : [])], icon: logoSvg(t.id, 20) }), () => carChoice.refresh());
  const carChoice = carRow(() => teamRow.value(), seat);
  // (a Quick Race's weather may be changeable; against the clock it's the same all session)
  const raceWeatherRow = optionRow('WEATHER', RACE_WEATHERS, weather, (w) => ({ name: w.name, about: w.about }));
  const clockWeatherRow = optionRow('WEATHER', WEATHERS, weather, (w) => ({ name: w.name, about: w.about }), () => showWorld());
  const weatherRow = () => (current.id === 'race' ? raceWeatherRow : clockWeatherRow);
  const qualifyingRow = optionRow('QUALIFYING', [false, true], qualifying, (on) => ({ name: on ? 'ON' : 'OFF', about: on ? 'one flying lap sets your grid slot' : 'start mid-grid' }));
  // (a Quick Race's: a Championship round is always RACE_LAPS, and a Time Trial is laps until you stop)
  const lapsRow = optionRow('LAPS', [...LAP_CHOICES], laps, (n) => ({ name: `${n}`, about: lapsAbout(n) }));
  // (the tyres you start on in the dry: the pit wall's strategy's, or your own pick; strategy.ts)
  const tyresRow = optionRow('TYRES', TYRE_PICKS, tyres, (t) => ({
    name: t === 'auto' ? 'AUTO' : COMPOUNDS[t].name,
    about: t === 'auto' ? "the pit wall's strategy, in the dry" : t === 'slick' ? 'start on softs: quick, but they wear' : 'start on hards: slower, they last',
    colors: t === 'auto' ? undefined : [COMPOUNDS[t].color],
  }));
  const ROWS = { team: () => teamRow, car: () => carChoice, weather: weatherRow, qualifying: () => qualifyingRow, laps: () => lapsRow, tyres: () => tyresRow };
  /** the rows on the circuit screen, for the mode picked */
  let rows = rowsOf(current.id, layouts[selected]).map((k) => ROWS[k]());

  // the settings screen: difficulty, then the rows the pause screen has too (src/f1/settingsRows.ts)
  const difficultyRow = optionRow('DIFFICULTY', DIFFICULTIES, difficulty, (d) => ({ name: d.name, about: d.about }));
  const settingsRows = [difficultyRow, ...settingsRowsNow()];
  const settingsTitle = document.createElement('h2');
  settingsTitle.textContent = 'SETTINGS';
  const openSettings = () => {
    menuPick();
    view = 'settings';
    focus = 0;
    show();
  };
  const closeSettings = () => {
    menuPick();
    view = 'modes';
    focus = -1;
    show();
  };
  const settingsButton = menuButton('SETTINGS', openSettings);
  // the trophy cabinet: the Championships won, then each circuit's medals in a Time Trial and a Time Attack
  const trophies = loadTrophies();
  /** the cabinet's tab up, and a way to switch (set once it's built) */
  let cabinetTab: 'medals' | 'achievements' = 'medals';
  let showTab: (tab: 'medals' | 'achievements') => void = () => {};
  const cabinetTitle = document.createElement('h2');
  cabinetTitle.textContent = 'TROPHIES';
  const cabinet = document.createElement('div');
  cabinet.className = 'cabinet';
  /** the medals won so far, each popping in a beat after the one before when the cabinet opens */
  let popped = 0;
  const medalCell = (m?: Medal) => {
    const cell = document.createElement('span');
    cell.className = 'medal';
    if (m) {
      cell.classList.add('won');
      cell.style.setProperty('--delay', `${0.15 + popped++ * 0.08}s`);
      const name = document.createElement('span');
      name.textContent = MEDAL_NAME[m];
      name.style.color = MEDAL_COLOR[m];
      cell.append(medalBadge(m, 14), name);
    } else cell.textContent = '–';
    return cell;
  };
  {
    const titles = document.createElement('div');
    titles.className = 'titles';
    const titleText = document.createElement('span');
    titleText.textContent = trophies.titles ? `× ${trophies.titles} CHAMPIONSHIP${trophies.titles === 1 ? '' : 'S'} WON` : 'NO CHAMPIONSHIPS WON YET';
    titleText.style.color = 'inherit';
    if (trophies.titles) titles.append(trophy(28));
    titles.append(titleText);
    const head = document.createElement('div');
    head.className = 'cabinet-row head';
    for (const t of ['CIRCUIT', 'TIME TRIAL', 'TIME ATTACK']) {
      const c = document.createElement('span');
      c.textContent = t;
      head.append(c);
    }
    const all = layouts.flatMap((l) => [trophies.medals[l.id]?.trial, trophies.medals[l.id]?.attack]);
    const count = (m: Medal) => all.filter((x) => x === m).length;
    const tally = document.createElement('div');
    tally.className = 'tally';
    for (const m of ['gold', 'silver', 'bronze'] as const) {
      const c = document.createElement('span');
      c.className = 'medal won';
      const n = document.createElement('span');
      n.textContent = `${count(m)}`;
      n.style.color = MEDAL_COLOR[m];
      c.append(medalBadge(m, 20), n);
      tally.append(c);
    }
    // two tabs: the medals on each circuit, and the achievements
    const medalsPanel = document.createElement('div');
    medalsPanel.className = 'cabinet-panel';
    const achievementsPanel = document.createElement('div');
    achievementsPanel.className = 'cabinet-panel achievements';
    const tabs = document.createElement('div');
    tabs.className = 'cabinet-tabs';
    const tabButton = (text: string, tab: 'medals' | 'achievements') => {
      const b = menuButton(text, () => showTab(tab));
      b.classList.add('cabinet-tab');
      return b;
    };
    cabinet.append(titles, tally, tabs, medalsPanel, achievementsPanel);
    medalsPanel.append(head, ...layouts.map((l) => {
      const row = document.createElement('div');
      row.className = 'cabinet-row';
      const name = document.createElement('span');
      name.textContent = l.name.toUpperCase();
      row.classList.toggle('locked', !open.has(l.id));
      row.append(name, medalCell(trophies.medals[l.id]?.trial), medalCell(trophies.medals[l.id]?.attack));
      return row;
    }));
    const how = document.createElement('p');
    how.textContent = 'A LAP OR A RUN AS QUICK AS THE QUICKEST AI ON EASY: BRONZE · NORMAL: SILVER · HARD: GOLD';
    medalsPanel.append(how);
    // the achievements: those unlocked in gold (any already earned by medals and titles from before achievements were
    // kept are filled in quietly), the rest dimmed with what they take
    unlock(medalAchievements(trophies, layouts.map((l) => l.id)));
    const got = new Set(unlockedAchievements());
    const medalsTab = tabButton('MEDALS', 'medals');
    const achievementsTab = tabButton(`ACHIEVEMENTS ${got.size}/${ACHIEVEMENTS.length}`, 'achievements');
    tabs.append(medalsTab, achievementsTab);
    showTab = (tab) => {
      cabinetTab = tab;
      medalsPanel.style.display = tab === 'medals' ? '' : 'none';
      achievementsPanel.style.display = tab === 'achievements' ? '' : 'none';
      medalsTab.classList.toggle('selected', tab === 'medals');
      achievementsTab.classList.toggle('selected', tab === 'achievements');
    };
    showTab('medals');
    achievementsPanel.append(...ACHIEVEMENTS.map((a, k) => {
      const row = document.createElement('div');
      row.className = `achievement${got.has(a.id) ? ' got' : ''}`;
      row.style.setProperty('--delay', `${0.2 + k * 0.03}s`);
      const star = document.createElement('b');
      star.textContent = got.has(a.id) ? '★' : '☆';
      const name = document.createElement('strong');
      name.textContent = a.name;
      const about = document.createElement('span');
      about.textContent = a.about.toUpperCase();
      row.append(star, name, about);
      return row;
    }));
  }
  const openCabinet = () => {
    menuPick();
    view = 'trophies';
    show();
  };
  const closeCabinet = () => {
    menuPick();
    view = 'modes';
    focus = -1;
    show();
  };
  const trophiesButton = menuButton('TROPHIES', openCabinet);
  const cabinetDone = menuButton('DONE', closeCabinet);
  const doneButton = menuButton('DONE', closeSettings);
  // a report: the menu as it is, to draw on and say what's wrong (report.ts)
  const reportButton = menuButton('REPORT', () => void openReport({}, [], () => menuPick()));

  // the circuits: one card at a time, swiped (or its sides tapped) to the next, tapped in the middle to race;
  // dots under it for where it is in the list
  const records = loadRecords();
  const card = document.createElement('button');
  card.className = 'circuit-card';
  const dots = document.createElement('div');
  dots.className = 'dots';
  // a Time Trial's world board: the circuit's best laps from everyone, in the weather picked (screens/worldBoard.ts)
  const world = worldBoard();
  const showWorld = () => {
    if (current.id === 'timetrial') world.show(layouts[selected].id, clockWeatherRow.value().id);
    else world.el.hidden = true;
  };
  const renderCard = () => {
    const layout = layouts[selected];
    const locked = !open.has(layout.id);
    card.innerHTML = '';
    card.classList.toggle('locked', locked);
    const prev = document.createElement('em');
    prev.textContent = '◀';
    const next = document.createElement('em');
    next.textContent = '▶';
    const name = document.createElement('strong');
    name.textContent = layout.name;
    const about = document.createElement('span');
    about.textContent = locked ? (ownsChampionship() ? 'LOCKED · REACH IT IN A CHAMPIONSHIP' : 'LOCKED · COMES WITH THE CHAMPIONSHIP') : layout.about;
    const text = document.createElement('div');
    text.append(name, about);
    // your record here, once you have one: in a Time Attack the furthest you've got, else your fastest lap
    const here = records.circuits[layout.id];
    const best = current.id === 'timeattack' ? (here?.bestAttack ? `BEST ${distance(here.bestAttack)}` : undefined) : here?.bestLap !== undefined ? `LAP RECORD ${formatTime(here.bestLap)}` : undefined;
    if (best) {
      const record = document.createElement('span');
      record.className = 'record';
      record.textContent = best;
      text.append(record);
    }
    // your medal here, in a Time Trial or a Time Attack
    const medal = current.id === 'timetrial' ? trophies.medals[layout.id]?.trial : current.id === 'timeattack' ? trophies.medals[layout.id]?.attack : undefined;
    if (medal) {
      const m = document.createElement('span');
      m.className = 'record';
      m.textContent = `● ${MEDAL_NAME[medal]} MEDAL`;
      m.style.color = MEDAL_COLOR[medal];
      text.append(m);
    }
    card.append(prev, outline(layout, 112, 84), text, next);
    showWorld();
    dots.innerHTML = '';
    layouts.forEach((l, k) => {
      const d = document.createElement('i');
      d.classList.toggle('on', k === selected);
      d.classList.toggle('locked', !open.has(l.id));
      dots.append(d);
    });
  };
  const stepCircuit = (by: number) => {
    selected = (selected + by + layouts.length) % layouts.length;
    // (the rows for the circuit: on dirt, no TYRES)
    if (view === 'circuit') setRows();
    hint.textContent = HINT;
    menuTick();
    renderCard();
  };
  let downX: number | undefined;
  card.addEventListener('pointerdown', (e) => {
    downX = e.clientX;
    focus = 0;
    show();
    try {
      card.releasePointerCapture(e.pointerId); // (touch captures to the card: let pointerup find where the finger lifts)
    } catch {
      // nothing to release
    }
  });
  card.addEventListener('pointercancel', () => (downX = undefined));
  card.addEventListener('pointerleave', (e) => {
    // (a swipe can carry the finger off the card: count it where it left)
    if (downX !== undefined && Math.abs(e.clientX - downX) >= 28) {
      stepCircuit(e.clientX < downX ? 1 : -1);
      downX = undefined;
    }
  });
  card.addEventListener('pointerup', (e) => {
    if (downX === undefined) return;
    const r = card.getBoundingClientRect();
    const by = cardGesture(e.clientX - downX, (e.clientX - r.left) / Math.max(1, r.width));
    downX = undefined;
    if (by === 'race') finish(layouts[selected]);
    else if (by) stepCircuit(by);
  });
  // the big button that races, named for the mode
  const raceButton = menuButton('', () => finish(layouts[selected]));
  raceButton.classList.add('race-button');
  const renderRace = () => (raceButton.textContent = `${current.name} ▶`);
  const options = document.createElement('div');
  options.className = 'options';
  /** the circuit screen's rows: the mode's, for the circuit picked */
  const setRows = () => {
    const want = rowsOf(current.id, layouts[selected]);
    if (want.length === rows.length && options.childElementCount === rows.length) return;
    rows = want.map((k) => ROWS[k]());
    options.replaceChildren(...rows.map((r) => r.el));
  };
  /** a mode picked: a Championship to its screen; the others on to the circuit screen, with the mode's rows */
  const pickMode = (m: (typeof MODES)[number]) => {
    current = m;
    if (m.id === 'championship' || m.id === 'daily') {
      finish(layouts[selected]);
      return;
    }
    menuPick();
    view = 'circuit';
    setRows();
    hint.textContent = HINT;
    focus = 0;
    renderCard();
    renderRace();
    show();
  };
  /** back from the circuit screen to the modes */
  const toModes = () => {
    menuPick();
    view = 'modes';
    hint.textContent = MODES_HINT;
    focus = -1;
    show();
  };
  /** RESUME RACE, the race kept on the device: first of the modes (a place of its own for up/down) */
  let resumePicked = false;
  const resumeButton = kept ? menuButton('', () => {
    resumePicked = true;
    finish(layouts[selected]);
  }) : undefined;
  if (resumeButton) {
    resumeButton.classList.add('mode-button', 'resume-button');
    const name = document.createElement('strong');
    name.textContent = 'RESUME RACE';
    const about = document.createElement('span');
    about.textContent = kept!.about;
    resumeButton.append(name, about);
  }
  /** places on the modes screen before the modes themselves (RESUME RACE) */
  const R = resumeButton ? 1 : 0;
  const modeButtons = MODES.map((m) => {
    const b = menuButton('', () => pickMode(m));
    b.classList.add('mode-button');
    const name = document.createElement('strong');
    name.textContent = m.name;
    const about = document.createElement('span');
    // (the Championship not bought yet, in the Google Play build: what unlocking it brings)
    const locked = m.id === 'championship' && !ownsChampionship();
    // (the Daily Challenge: today's circuit and weather)
    const today = m.id === 'daily' ? challengeOn(dayOf()) : undefined;
    about.textContent = locked ? 'unlock: a season, and every circuit' : today ? `today: ${today.layout.name} · ${today.weather.name.toLowerCase()} · get on the board` : m.about;
    b.append(name, about);
    return b;
  });
  const backButton = menuButton('◀ BACK', toModes);
  const tab = framed() ? ownTabButton() : undefined;
  /** the circuit screen's places for up/down: the circuit, the rows, the race button, BACK */
  const raceAt = () => 1 + rows.length;
  const backAt = () => raceAt() + 1;
  const modesParts: HTMLElement[] = [...(resumeButton ? [resumeButton] : []), ...modeButtons, settingsButton, trophiesButton, ...(tab ? [tab] : [])];
  const cabinetParts: HTMLElement[] = [cabinetTitle, cabinet, cabinetDone];
  const circuitParts: HTMLElement[] = [card, dots, world.el, options, raceButton, backButton];
  // (REPORT under DONE, but not on YouTube: a report goes to the game's own backend)
  const reports = !YOUTUBE;
  const settingsParts: HTMLElement[] = [settingsTitle, ...settingsRows.map((r) => r.el), doneButton, ...(reports ? [reportButton] : []), versionLine()];
  const show = () => {
    hint.style.display = view === 'settings' || view === 'trophies' ? 'none' : '';
    // (the settings on black, for reading: the race behind the menu hidden)
    menu.classList.toggle('settings-view', view === 'settings');
    for (const el of cabinetParts) el.style.display = view === 'trophies' ? '' : 'none';
    for (const el of modesParts) el.style.display = view === 'modes' ? '' : 'none';
    for (const el of circuitParts) el.style.display = view === 'circuit' ? '' : 'none';
    for (const el of settingsParts) el.style.display = view === 'settings' ? '' : 'none';
    resumeButton?.classList.toggle('focused', view === 'modes' && focus === 0);
    modeButtons.forEach((b, k) => b.classList.toggle('focused', view === 'modes' && focus === R + k));
    settingsButton.classList.toggle('focused', view === 'modes' && focus === R + MODES.length);
    trophiesButton.classList.toggle('focused', view === 'modes' && focus === R + MODES.length + 1);
    cabinetDone.classList.toggle('focused', view === 'trophies');
    card.classList.toggle('focused', view === 'circuit' && focus === 0);
    rows.forEach((r, k) => r.el.classList.toggle('focused', view === 'circuit' && focus === 1 + k));
    raceButton.classList.toggle('focused', view === 'circuit' && focus === raceAt());
    backButton.classList.toggle('focused', view === 'circuit' && focus === backAt());
    settingsRows.forEach((r, k) => r.el.classList.toggle('focused', view === 'settings' && focus === k));
    doneButton.classList.toggle('focused', view === 'settings' && focus === settingsRows.length);
    reportButton.classList.toggle('focused', view === 'settings' && focus === settingsRows.length + 1);
    // (the settings: no A on the deck, their own DONE closes them; A still does on the keys and a gamepad)
    hud.setLabel('a', view === 'circuit' ? 'RACE' : view === 'modes' ? 'PICK' : view === 'settings' ? '' : 'DONE');
    hud.setLabel('b', view === 'circuit' ? 'BACK' : '');
  };
  // a tap on a row focuses it too
  [teamRow, carChoice, raceWeatherRow, clockWeatherRow, qualifyingRow, lapsRow].forEach((r) => r.el.addEventListener('pointerdown', () => {
    focus = 1 + rows.indexOf(r);
    show();
  }));
  settingsRows.forEach((r, k) => r.el.addEventListener('pointerdown', () => {
    focus = k;
    show();
  }));
  renderCard();
  renderRace();
  options.append(...rows.map((r) => r.el));
  menu.append(...(resumeButton ? [resumeButton] : []), ...modeButtons, settingsButton, trophiesButton, card, dots, world.el, options, raceButton, backButton, ...settingsParts, ...cabinetParts);
  // embedded in another site's page (itch.io), the browser may hold the game to 30 fps (Safari
  // does, in a frame it doesn't count as played with): offer the game in a tab of its own
  if (tab) menu.append(tab);
  show();
  holdTouches(menu);
  host.append(menu);
  hud.setPosition('');
  hud.setLap('');

  return new Promise((resolve) => {
    const seen = new Map<Button, number>();
    const pressed = (b: Button) => {
      const n = controls.presses(b);
      const edge = n > (seen.get(b) ?? n);
      seen.set(b, n);
      return edge;
    };
    let done = false;
    // the phone's back button: up to the modes from a mode's circuit screen, the settings or the cabinet; on the
    // modes, nowhere to go (the app asks before it leaves)
    const offBack = onBack(() => {
      if (view === 'modes') return false;
      if (view === 'settings') closeSettings();
      else if (view === 'trophies') closeCabinet();
      else toModes();
      return true;
    });
    finish = (layout) => {
      if (done) return;
      // a locked circuit: raced only in a Championship (any circuit picked there goes to its screen)
      if (!resumePicked && !open.has(layout.id) && current.id !== 'championship' && current.id !== 'daily') {
        menuTick();
        hint.textContent = `${layout.name.toUpperCase()}: REACH IT IN A CHAMPIONSHIP TO UNLOCK`;
        return;
      }
      done = true;
      offBack();
      menuPick();
      menu.remove();
      resolve({ mode: current.id, layout, team: teamRow.value(), seat: carChoice.value(), difficulty: difficultyRow.value(), weather: weatherRow().value(), qualifying: qualifyingRow.value(), laps: lapsRow.value(), tyres: tyresRow.value(), ...(resumePicked ? { resume: true as const } : {}) });
    };
    closed?.addEventListener('abort', () => {
      done = true;
      offBack();
      menu.remove();
    });
    const tick = () => {
      if (done) return;
      // poll every button each frame, so a press is never counted late
      const [down, right, up, left, a, start, b] = (['down', 'right', 'up', 'left', 'a', 'start', 'b'] as const).map(pressed);
      const move = (down ? 1 : 0) - (up ? 1 : 0);
      // (a report being made: the deck and keys are its, not the menu's)
      if (reportOpen()) {
        // (nothing)
      } else if (view === 'settings') {
        // the settings: up/down moves, left/right changes a row, A or START (or DONE) goes back; on REPORT, A makes one
        const places = settingsRows.length + (reports ? 2 : 1);
        if (move) {
          focus = (focus + move + places) % places;
          show();
        }
        const row = settingsRows[focus];
        if (row && (left || right)) row.step(right ? 1 : -1);
        if ((a || start) && reports && focus === settingsRows.length + 1) void openReport({}, [], () => menuPick());
        else if (a || start) closeSettings();
      } else if (view === 'trophies') {
        // the cabinet: left/right switches its tab; A, START or B goes back
        if (left || right) {
          menuTick();
          showTab(cabinetTab === 'medals' ? 'achievements' : 'medals');
        }
        if (a || start || b) closeCabinet();
      } else if (view === 'modes') {
        // the modes: up/down moves, A or START picks (or opens SETTINGS or TROPHIES)
        const places = R + MODES.length + 2;
        if (move) {
          // (from none highlighted: down to the first, up to the last)
          focus = focus < 0 ? (move > 0 ? 0 : places - 1) : (focus + move + places) % places;
          show();
        }
        if (focus < 0) {
          // (nothing to pick until something is highlighted)
        } else if ((a || start) && resumeButton && focus === 0) {
          resumePicked = true;
          finish(layouts[selected]);
        } else if ((a || start) && focus === R + MODES.length) openSettings();
        else if ((a || start) && focus === R + MODES.length + 1) openCabinet();
        else if (a || start) pickMode(MODES[focus - R]);
      } else {
        const places = backAt() + 1;
        if (move) {
          focus = (focus + move + places) % places;
          show();
        }
        // left/right: the circuit, or the focused row
        const row = rows[focus - 1];
        if (focus === 0 && (left || right)) stepCircuit(right ? 1 : -1);
        if (row && (left || right)) row.step(right ? 1 : -1);
        if (b || ((a || start) && focus === backAt())) toModes();
        else if (a || start) finish(layouts[selected]);
      }
      if (!done) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
