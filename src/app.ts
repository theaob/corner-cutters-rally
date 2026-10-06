import { type StandaloneView } from './engine/view';
import { mountTuning } from './engine/tuning';
import { Controls, bindGamepad, bindKeyboard, guardInput } from './engine/controls';
import type { Services } from './engine/services';
import { Hud, bindDeck, releaseDeck, setStickSide, stickSide } from './engine/deck';
import { showInputLog } from './engine/inputLog';
import { canSwitchLayout, measureFit, startLayout, type LayoutMode, type ScreenFit } from './engine/layout';
import { useStore } from './engine/storage';
import { save, saved, useSave } from './engine/save';
import { CC_SAVE } from './f1/save';
import { playMusic } from './engine/music';
import { THEME_MUSIC } from './f1/music';
import { unlockAudio } from './engine/audio';
import { startClock, track } from './f1/metrics';
import { challengeOn, dayOf } from './f1/daily';
import { showDaily } from './f1/screens/daily';
import { F1_TUNING } from './f1/tuning';
import { CHAMPIONSHIP_LAYOUTS, FREE_LAYOUTS, LAYOUTS, layoutById, type CircuitLayout } from './f1/layouts';
import { DESIGNER_DRAFT_ID, designerDraft } from './f1/designerDraft';
import { dropKeptRace, keptLap, keptRace, type KeptRace } from './f1/raceSave';
import { RACE_LAPS, lapsFrom, seasonLength } from './f1/laps';
import { curtainDown, curtainFirstUp, curtainUp } from './f1/screens/curtain';
import { YOUTUBE, firstFrameReady, gameReady } from './engine/host';
import { showStill } from './f1/screens/backdropStill';
import { showSplash } from './f1/screens/splash';
import { useLayoutSwitch } from './f1/settingsRows';
import { applyText } from './f1/access';
import { watchCrashes } from './f1/crashes';
import { forgetChangedCircuits } from './f1/circuitHash';
import { chooseCircuit, TYRE_PICKS, type GameMode, type TyrePick } from './f1/circuitSelect';
import type { DryCompound } from './f1/tyres';
import { showChampionship } from './f1/screens/championship';
import { loadSeason, newSeason, recordRound, roundSeed, saveSeason, seasonOver, standings, teamOf } from './f1/championship';
import { awardTitle } from './f1/medals';
import { unlock } from './f1/achievements';
import { achievementToast, hintToast } from './f1/screens/celebrate';
import { listenForBack, pressBack } from './engine/backButton';
import { newSeed } from './engine/rng';
import { openCircuits, savedUnlocks, unlockCircuit } from './f1/unlocks';
import { PAYWALL, circuitsOpen, openShop, ownsChampionship } from './f1/purchase';
import { loadRecords } from './f1/records';
import type { RaceOptions } from './f1/race';
import { TEAMS, teamById, type Seat } from './f1/teams';
import { NORMAL, difficultyById } from './f1/difficulty';
import { DRY, WEATHERS, weatherById } from './f1/weather';
import { roundForecast } from './f1/forecast';
import { openReport, reportOpen } from './f1/report';

const screen = document.getElementById('screen')!;
const deck = document.getElementById('deck')!;

const app = document.getElementById('app')!;

// this game's saves (each game has its own prefix: itch.io games share one origin's storage), in its save format
useStore('cc:');
useSave(CC_SAVE);
// (TEXT: LARGE in the settings, from the start)
applyText();
// (records and ghosts on a circuit an update has reshaped were set on another track: forgotten)
forgetChangedCircuits(LAYOUTS);

// The layout: every device starts in the handheld one. The player can switch
// to the desktop layout (a wide screen with the deck laid over it as a HUD)
// with SCREEN in the settings (on a device with a mouse or trackpad) or the V
// key, and back; the choice is kept on the device.
const savedLayout = () => {
  const v = saved('settings', 'layout');
  return typeof v === 'string' ? v : null;
};
let layout: LayoutMode = startLayout(window.location.search, savedLayout());
function applyLayout(): void {
  const desktop = layout === 'desktop';
  document.documentElement.classList.toggle('desktop', desktop);
  // the deck sits over the screen as a HUD on desktop, under it on a phone
  if (desktop) screen.append(deck);
  else app.append(deck);
}
applyLayout();

const controls = new Controls();
bindKeyboard(controls);
bindGamepad(controls);
unlockAudio();
// (the play stats: the game launched, and the time in it from now)
track('launch');
startClock();
// the phone's back button (in the Android app): each screen's own back, and on the menu's first screen a second press
// to leave
void listenForBack(() => hintToast('PRESS BACK AGAIN TO EXIT'));
// (with ?debug, a press of it by hand: __back())
if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { __back: () => pressBack(performance.now() / 1000, () => hintToast('PRESS BACK AGAIN TO EXIT'), () => console.log('exit')) });
bindDeck(deck, controls);
setStickSide(deck, stickSide());
guardInput(controls, () => releaseDeck(deck));
const services: Services = { controls, hud: new Hud(deck) };
// ?inputlog lists the input events the page receives, for debugging controls on a device
if (new URLSearchParams(window.location.search).has('inputlog')) showInputLog(document.getElementById('app')!, controls);

/** Size the screen element: full column width and a height to suit the phone, or the window on a desktop. */
function sizeScreen(): ScreenFit {
  const fit = measureFit(layout);
  screen.style.width = `${fit.width * fit.scale}px`;
  screen.style.height = `${fit.height * fit.scale}px`;
  // (on a phone the deck floats over the screen's lower part: what it covers, for the race's panels to keep clear of)
  const controls = deck.querySelector<HTMLElement>('.controls');
  const cover = fit.desktop || !controls ? 0 : deck.offsetHeight - controls.offsetTop;
  screen.style.setProperty('--deck-cover', `${cover}px`);
  return fit;
}

/** What a window resize (or a layout switch) does: re-fit the screen and tell the running view. */
let onResize: () => void = () => sizeScreen();
window.addEventListener('resize', () => onResize());

/** The player switches layout: no reload, the game carries on in the new shape. */
function switchLayout(): void {
  layout = layout === 'desktop' ? 'handheld' : 'desktop';
  save('settings', 'layout', layout);
  controls.clearAll();
  releaseDeck(deck);
  applyLayout();
  onResize();
}
// (SCREEN in the settings)
useLayoutSwitch({ now: () => layout, can: () => canSwitchLayout(), set: (mode) => mode !== layout && switchLayout() });
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyV' && !e.repeat && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) switchLayout();
});

/** This page's address with ?circuit set to `id` (or removed: null) and ?mode to a mode other than a race (or removed); other flags (?tune, ?debug…) stay. */
function withCircuit(id: string | null, mode: GameMode | 'tutorial' = 'race'): string {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set('circuit', id);
  else url.searchParams.delete('circuit');
  if (mode !== 'race') url.searchParams.set('mode', mode);
  else url.searchParams.delete('mode');
  return url.href;
}

/** A menu choice saved last time, by id (null for none): the last circuit raced (highlighted first in the menu), and the team, difficulty, weather and qualifying chosen there. */
const choice = (name: string): string | null => {
  const v = saved('choices', name);
  return typeof v === 'string' ? v : null;
};
const savedTeam = () => teamById(choice('team')) ?? TEAMS[0];
const savedSeat = (): Seat => (choice('seat') === '1' ? 1 : 0);
const savedDifficulty = () => difficultyById(choice('difficulty')) ?? NORMAL;
const savedWeather = () => weatherById(choice('weather')) ?? DRY;
const clockWeather = () => WEATHERS.find((w) => w.id === savedWeather().id) ?? DRY;
const savedQualifying = () => choice('qualifying') === 'on';
const savedSeasonLaps = () => seasonLength(Number(choice('season-laps'))).laps;
const savedLaps = () => lapsFrom(choice('laps'));
const savedTyres = (): TyrePick => TYRE_PICKS.find((t) => t === choice('tyres')) ?? 'auto';
/** A Quick Race's start tyres in the dry: undefined for the pit wall's pick (AUTO). */
const startTyres = (): DryCompound | undefined => {
  const t = savedTyres();
  return t === 'auto' ? undefined : t;
};
const asMode = (v: string | null): GameMode => (v === 'timetrial' || v === 'timeattack' || v === 'championship' || v === 'daily' ? v : 'race');
const savedMode = (): GameMode => asMode(choice('mode'));

/** RESUME RACE picked on the menu: the kept race (raceSave.ts) the next race screen picks up */
let resumeNext: KeptRace | undefined;
/**
 * The race kept on the device, if it can still be come back to: its circuit's still there, and a Championship round's
 * still the season's next (a season moved on or started afresh since: it's thrown away).
 */
function keptToOffer(): KeptRace | undefined {
  const k = keptRace();
  if (!k) return undefined;
  const season = k.mode === 'championship' ? loadSeason() : undefined;
  const stale = !layoutById(k.circuit) || (k.mode === 'championship' && (!season || seasonOver(season) || season.round !== k.round || season.rounds[season.round] !== k.circuit));
  if (stale) {
    dropKeptRace();
    return undefined;
  }
  return k;
}

/** The screen showing now (the menu or a race): closed before the next one opens. */
let current: { close(): void } | undefined;
/** Counts screen changes: a screen that finishes opening after a newer change is closed at once. */
let routeId = 0;
/** The TUNE button (laps, grid, AI pace, camera), in every build, mounted with the first race; values are kept on the device. */
let tuning: ReturnType<typeof mountTuning<typeof F1_TUNING>> | undefined;

/**
 * Show the screen the address asks for: ?circuit=<id> races there (?mode=timetrial: a Time Trial there;
 * ?mode=championship: the season's round there), ?mode=championship alone the Championship screen; otherwise
 * the circuit menu. Moving between them changes the address (so the browser's
 * back button works) without loading the page again: the screen before is
 * closed and the next one opened in its place.
 */
async function route(): Promise<void> {
  const id = ++routeId;
  // the curtain down over the screen going (going to a race, with its loading card), then the screen closed behind it
  const params0 = new URLSearchParams(window.location.search);
  const going = params0.get('circuit') === DESIGNER_DRAFT_ID ? designerDraft() : layoutById(params0.get('circuit'));
  await curtainDown(going ? { layout: going, line: raceLine(params0.get('mode')) } : undefined);
  if (id !== routeId) return;
  current?.close();
  current = undefined;
  racingOn = undefined;
  // (nothing held on one screen carries over to the next)
  controls.clearAll();
  releaseDeck(deck);
  const params = new URLSearchParams(window.location.search);
  // (a circuit straight from the track designer: ?circuit=designer-draft)
  const layout = params.get('circuit') === DESIGNER_DRAFT_ID ? designerDraft() : layoutById(params.get('circuit'));
  // (and a draft edited in the designer since it was last driven)
  if (layout?.id === DESIGNER_DRAFT_ID) forgetChangedCircuits([layout], LAYOUTS);
  const mode = asMode(params.get('mode'));
  // a new player: the controls lap first, on the first circuit
  if (!layout && mode !== 'championship' && needsControlsLap()) {
    history.replaceState(null, '', withCircuit(LAYOUTS[0].id, 'tutorial'));
    return route();
  }
  if (params.get('mode') === 'tutorial' && layout) await showRace(id, layout, 'tutorial');
  else if (mode === 'championship' && !layout) await showSeason(id);
  else if (mode === 'daily' && !layout) await showDailyScreen(id);
  else if (!layout) await showMenu(id);
  else await showRace(id, layout, mode);
}

/** The line under a race's name on its loading card: the mode (a Championship's round) and the weather. */
function raceLine(mode: string | null): string {
  if (mode === 'tutorial') return 'CONTROLS LAP';
  if (mode === 'daily') return `DAILY CHALLENGE · ${challengeOn(dayOf()).weather.name}`;
  const season = mode === 'championship' ? loadSeason() : undefined;
  const what = season ? `CHAMPIONSHIP · ROUND ${season.round + 1} OF ${season.rounds.length}` : mode === 'timetrial' ? 'TIME TRIAL' : mode === 'timeattack' ? 'TIME ATTACK' : 'QUICK RACE';
  if (season) return `${what} · FORECAST: ${roundForecast(roundSeed(season, season.round), 1).name}`;
  // (against the clock, the weather's the same all session: a Quick Race's changeable is dry there)
  const weather = mode === 'timetrial' || mode === 'timeattack' ? clockWeather() : savedWeather();
  return `${what} · ${weather.name}`;
}

/** which menu screen is up, for a report made from it (the dashboard says where it came from) */
let menuName = 'menu';
/** the race on now (its circuit and mode), if one is */
let racingOn: { circuit: string; mode: string } | undefined;
// (an error nothing caught: to the play stats, with the screen it happened on; src/f1/crashes.ts)
watchCrashes(() => (racingOn ? { name: 'race', ...racingOn } : { name: menuName }));
// REPORT on every menu screen (the race has its own, on the pause screen): a little button in the column's top
// right corner, shown while a menu's up; the screen as it is, to draw on and say what's wrong (src/f1/report.ts)
const menuReport = document.createElement('button');
menuReport.className = 'menu-report';
menuReport.type = 'button';
menuReport.setAttribute('aria-label', 'Report a problem with this screen');
menuReport.innerHTML = '<span aria-hidden="true">⚑</span> REPORT';
// (on the press's release: in a cross-origin frame on a phone a tap's click can go astray)
{
  let armed = false;
  menuReport.addEventListener('pointerdown', () => (armed = true));
  menuReport.addEventListener('pointerleave', () => (armed = false));
  menuReport.addEventListener('pointerup', () => {
    if (armed && !reportOpen()) void openReport({ mode: menuName }, [menuReport]);
    armed = false;
  });
}
// (not on YouTube: a report goes to the game's own backend)
if (!YOUTUBE) document.getElementById('app')?.append(menuReport);

/** Go to `url` (this page with other flags) and show its screen. */
function navigate(url: string): void {
  history.pushState(null, '', url);
  void route();
}
window.addEventListener('popstate', () => void route());

/**
 * The race's code fetched in the background once the menu's settled (the browser idle), so the first race starts
 * sooner: the menu's backdrop already brings the 3D, but not the race view (and nothing 3D where there's no backdrop).
 */
let raceFetched = false;
function fetchRaceSoon(): void {
  if (raceFetched) return;
  raceFetched = true;
  const fetchIt = () => void import('./f1/race').catch(() => (raceFetched = false));
  if ('requestIdleCallback' in window) window.requestIdleCallback(fetchIt, { timeout: 4000 });
  else setTimeout(fetchIt, 1500);
}

async function showMenu(id: number): Promise<void> {
  // the menu: all touch, no deck; the screen fills the column
  menuScreen();
  fetchRaceSoon();
  menuName = 'menu';
  // the landing screen's anthem (it starts with the first tap: browsers allow no sound before one)
  playMusic(THEME_MUSIC);
  const closed = new AbortController();
  // a race going on behind the menu (loaded once it's up), on the circuit last picked
  let stopBackdrop = () => {};
  closed.signal.addEventListener('abort', () => stopBackdrop());
  current = { close: () => closed.abort() };
  const kept = keptToOffer();
  const picking = chooseCircuit(screen, services, LAYOUTS, layoutById(choice('circuit')), savedTeam(), savedDifficulty(), savedWeather(), savedQualifying(), savedMode(), savedLaps(), savedSeat(), openNow(), closed.signal, savedTyres(), kept && { about: `${kept.name} · ${keptLap(kept)}${kept.mode === 'championship' ? ` · round ${(kept.round ?? 0) + 1}` : ''}`.toLowerCase() });
  curtainUp();
  const backdropOn = backdropCircuit();
  // (a still of it up at once, so the menu never opens on black; the live race fades in over it)
  const still = showStill(screen);
  closed.signal.addEventListener('abort', () => still.remove());
  void import('./f1/screens/menuBackdrop').then(({ startBackdrop }) => {
    if (!closed.signal.aborted) stopBackdrop = startBackdrop(screen, backdropOn, still);
  });
  const picked = await picking;
  stopBackdrop();
  if (id !== routeId) return;
  // RESUME RACE: back to the kept race (its own set-up, not the menu's)
  if (picked.resume && kept) {
    resumeNext = kept;
    navigate(withCircuit(kept.circuit, kept.mode));
    return;
  }
  save('choices', 'circuit', picked.layout.id);
  save('choices', 'team', picked.team.id);
  save('choices', 'seat', String(picked.seat));
  save('choices', 'difficulty', picked.difficulty.id);
  save('choices', 'weather', picked.weather.id);
  save('choices', 'qualifying', picked.qualifying ? 'on' : 'off');
  save('choices', 'laps', String(picked.laps));
  save('choices', 'tyres', picked.tyres);
  save('choices', 'mode', picked.mode);
  // (a Championship picks its own circuits, and the Daily Challenge has the day's: to their screens)
  navigate(withCircuit(picked.mode === 'championship' || picked.mode === 'daily' ? null : picked.layout.id, picked.mode));
}

/** The circuit the menu's backdrop races on: the one last picked, if it's open, else the first. */
const backdropCircuit = (): CircuitLayout => {
  const last = layoutById(choice('circuit'));
  return last && openNow().has(last.id) ? last : LAYOUTS[0];
};

/** The screen fills the column (the menus: all touch, no deck). */
function menuScreen(): void {
  document.documentElement.classList.add('menu');
  const fillScreen = () => {
    screen.style.width = '100%';
    screen.style.height = '100%';
  };
  fillScreen();
  onResize = fillScreen;
}

/** The circuits open for a Quick Race, a Time Attack or a Time Trial now (in the Google Play build, without the Championship bought: the first only). */
const freeIds = FREE_LAYOUTS.map((l) => l.id);
const openNow = () => circuitsOpen(ownsChampionship(), LAYOUTS[0].id, openCircuits(LAYOUTS.map((l) => l.id), savedUnlocks(), Object.keys(loadRecords().circuits), freeIds), freeIds);
/** A new player: never done (or skipped) the controls lap, and nothing played yet (no records, no season, nothing unlocked). */
const needsControlsLap = () => saved('progress', 'onboarded') !== true && !Object.keys(loadRecords().circuits).length && !loadSeason() && !savedUnlocks().length;
/** A circuit the Championship just unlocked (said on its screen once). */
let justUnlocked: string | undefined;
/** The Championship was just won (celebrated on its screen once). */
let justWon = false;

/** The Championship screen: the season so far and the way on (the next round, a new season, or back to the menu). */
async function showSeason(id: number): Promise<void> {
  menuScreen();
  menuName = 'championship';
  playMusic(THEME_MUSIC);
  const closed = new AbortController();
  current = { close: () => closed.abort() };
  // (the Google Play build, the Championship not bought yet: its shop first)
  if (!ownsChampionship()) {
    const { showShop } = await import('./f1/screens/shop');
    menuName = 'shop';
    curtainUp();
    const got = await showShop(screen, services, openShop(), closed.signal);
    if (id !== routeId) return;
    if (got === 'back') return navigate(withCircuit(null));
    menuName = 'championship';
  }
  const season = loadSeason();
  const showing = showChampionship(screen, services, season, justUnlocked, { team: savedTeam(), seat: savedSeat(), qualifying: savedQualifying(), laps: savedSeasonLaps() }, closed.signal, justWon, (on) => save('choices', 'qualifying', on ? 'on' : 'off'));
  justWon = false;
  curtainUp();
  const action = await showing;
  justUnlocked = undefined;
  if (id !== routeId) return;
  if (action === 'race' && season) navigate(withCircuit(season.rounds[season.round], 'championship'));
  else if (typeof action === 'object') {
    // a new season with the team and qualifying picked for it (kept as the choices), and the difficulty from
    // the settings: a round on every circuit
    const { team, seat, qualifying, laps } = action.new;
    save('choices', 'team', team.id);
    save('choices', 'seat', String(seat));
    save('choices', 'qualifying', qualifying ? 'on' : 'off');
    save('choices', 'season-laps', String(laps));
    saveSeason(newSeason({ seed: newSeed(), team, seat, difficulty: savedDifficulty().id, qualifying, rounds: CHAMPIONSHIP_LAYOUTS.map((l) => l.id), total: 10, laps }));
    void route();
  } else navigate(withCircuit(null));
}

/** The Daily Challenge's screen: today's challenge, its board, and PLAY. */
async function showDailyScreen(id: number): Promise<void> {
  menuScreen();
  menuName = 'daily';
  playMusic(THEME_MUSIC);
  const closed = new AbortController();
  current = { close: () => closed.abort() };
  const today = challengeOn(dayOf());
  const showing = showDaily(screen, services, today, closed.signal);
  curtainUp();
  const action = await showing;
  if (id !== routeId) return;
  navigate(action === 'play' ? withCircuit(today.layout.id, 'daily') : withCircuit(null));
}

async function showRace(id: number, layout: CircuitLayout, mode: GameMode | 'tutorial'): Promise<void> {
  racingOn = { circuit: layout.id, mode };
  // the Daily Challenge: today's circuit only (another, or yesterday's left open: to today's screen)
  const today = mode === 'daily' ? challengeOn(dayOf()) : undefined;
  if (today && today.layout.id !== layout.id) {
    history.replaceState(null, '', withCircuit(null, 'daily'));
    return route();
  }
  // (a draft from the designer: a quick race or a time trial, never a Championship round)
  // a Championship round: the season's next round (any other circuit: back to its screen)
  if (layout.id === DESIGNER_DRAFT_ID && mode === 'championship') mode = 'race';
  const season = mode === 'championship' ? loadSeason() : undefined;
  // (a round of a Championship not bought, or a circuit not open: to the Championship's screen, its shop first)
  if (mode === 'championship' && (!ownsChampionship() || !season || seasonOver(season) || season.rounds[season.round] !== layout.id)) {
    history.replaceState(null, '', withCircuit(null, 'championship'));
    return route();
  }
  document.documentElement.classList.remove('menu');
  const fit = sizeScreen();
  tuning ??= mountTuning(screen, 'f1', F1_TUNING);
  const { raceOn } = await import('./f1/race');
  if (id !== routeId) return;
  const toSeason = () => navigate(withCircuit(null, 'championship'));
  const quit = season
    ? toSeason
    : today
      ? () => navigate(withCircuit(null, 'daily'))
    : layout.id === DESIGNER_DRAFT_ID
      ? () => {
          // (a draft from the track designer: back to it)
          // (designer.html served, index.html as built beside the game: vite.designer.config.ts)
          window.location.href = `./${import.meta.env.VITE_DESIGNER_PAGE ?? 'designer.html'}`;
        }
    : mode === 'tutorial'
      ? () => {
          // (done or skipped: either way, not shown on its own again)
          save('progress', 'onboarded', true);
          navigate(withCircuit(null));
        }
      : () => navigate(withCircuit(null));
  let options: RaceOptions = season
    ? {
        team: teamOf(season.drivers[season.you]), difficulty: difficultyById(season.difficulty) ?? NORMAL, qualifying: season.qualifying, laps: season.laps ?? RACE_LAPS,
        championship: {
          season,
          onDone: (finish, out) => {
            recordRound(season, finish, out);
            saveSeason(season);
            // the season won: into the trophy cabinet
            if (seasonOver(season) && standings(season)[0]?.driver === season.you) {
              awardTitle();
              justWon = true;
              for (const a of unlock(['champion'])) achievementToast(a);
            }
            // reaching the next round's circuit unlocks it for a Quick Race and a Time Trial
            const next = season.rounds[season.round];
            if (next && !openNow().has(next)) {
              unlockCircuit(next);
              justUnlocked = next;
            }
            toSeason();
          },
        },
      }
    : mode === 'tutorial'
      ? { team: savedTeam(), seat: savedSeat(), difficulty: NORMAL, weather: DRY, mode: 'tutorial' }
    : today
      ? { team: savedTeam(), seat: savedSeat(), difficulty: NORMAL, weather: today.weather, mode: 'timeattack', daily: { day: today.day } }
      : { team: savedTeam(), seat: savedSeat(), difficulty: savedDifficulty(), weather: mode === 'timetrial' || mode === 'timeattack' ? clockWeather() : savedWeather(), qualifying: savedQualifying(), laps: savedLaps(), startTyres: mode === 'timetrial' || mode === 'timeattack' ? undefined : startTyres(), mode: mode === 'timetrial' || mode === 'timeattack' ? mode : 'race' };
  // RESUME RACE: the kept race picked up (a Quick Race with the set-up it was started with; a Championship round as the season has it)
  const resume = resumeNext && resumeNext.circuit === layout.id && (resumeNext.mode === 'championship') === !!season ? resumeNext : undefined;
  resumeNext = undefined;
  if (resume && !season) {
    const k = resume.setup;
    options = {
      team: teamById(k.team) ?? savedTeam(), seat: k.seat === 1 ? 1 : 0, difficulty: difficultyById(k.difficulty) ?? NORMAL, weather: weatherById(k.weather) ?? DRY,
      qualifying: resume.grid !== undefined, laps: k.laps, startTyres: k.startTyres, mode: 'race',
    };
  }
  if (resume) options = { ...options, resume };
  const view: StandaloneView = await raceOn(layout, quit, options)({ host: screen, services, tuning, fit });
  if (id !== routeId) {
    view.dispose();
    return;
  }
  current = { close: () => view.dispose() };
  onResize = () => view.resize(sizeScreen());
  curtainUp();
}

// (the Google Play build: the store up from the start, so a Championship bought on another install comes back)
if (PAYWALL) openShop();
void opening();

/**
 * The game opening: the title splash first, unless the address goes straight to a race or a mode (a link, the
 * track designer); then the screen the address asks for (the menu, or a new player's controls lap).
 */
async function opening(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  // YouTube Playables: its own loading screen in place of the splash; told the first frame's drawn, and that the game
  // can be played once its first screen is up (engine/host.ts)
  if (YOUTUBE) {
    requestAnimationFrame(() => firstFrameReady());
    void curtainFirstUp().then(() => gameReady());
    void route();
    return;
  }
  if (!params.has('circuit') && !params.has('mode')) {
    menuScreen();
    document.documentElement.classList.add('splash-up');
    // (the theme from the start: it sounds with the first tap)
    playMusic(THEME_MUSIC);
    const splash = showSplash(screen, backdropCircuit(), controls);
    // (the race's code meanwhile: a new player's controls lap is next)
    fetchRaceSoon();
    current = { close: () => {
      splash.close();
      document.documentElement.classList.remove('splash-up');
    } };
    curtainUp();
    await splash.started;
  }
  void route();
}
