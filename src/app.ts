import { type StandaloneView } from './engine/view';
import { applyLanguage, markSettingsResume, onLanguageChange, settingsResumePending, t } from './engine/i18n';
import { Controls, bindGamepad, bindKeyboard, guardInput } from './engine/controls';
import type { Services } from './engine/services';
import { Hud, bindDeck, releaseDeck } from './engine/deck';
import { showInputLog } from './engine/inputLog';
import { isTouchScreen, measureFit, type ScreenFit } from './engine/layout';
import { lockLandscape } from './engine/orientation';
import { save, saved } from './engine/save';
import { playMusic } from './engine/music';
import { THEME_MUSIC } from './f1/music';
import { unlockAudio } from './engine/audio';
import { startClock, track } from './f1/metrics';
import { layoutById, type CircuitLayout } from './f1/layouts';
import { SHAKEDOWN } from './f1/stages';
import { curtainDown, curtainFirstUp, curtainIsDown, curtainUp } from './f1/screens/curtain';
import { YOUTUBE, firstFrameReady, gameHidden, gameReady, onHidden } from './engine/host';
import { askModel, device, expectBusy, lines, note, noteConsole, sightChanged, watchFrames, watchFreezes, watchLongTasks } from './engine/logbook';
import { showStill } from './f1/screens/backdropStill';
import { showSplash } from './f1/screens/splash';
import { applyMotion, applyText, motionReduced, onMotionChange } from './f1/access';
import { applyTheme } from './f1/theme';
import { reportProblem, watchCrashes } from './f1/crashes';
import { hintToast } from './f1/screens/celebrate';
import { listenForBack, pressBack } from './engine/backButton';
import { newSeed } from './engine/rng';
import { SEASON, currentSeason, loadSeasons, retireRound, roundClass, saveSeason } from './f1/season';
import { loadCareer, payCareer, yourCar } from './f1/career';
import { carById } from './f1/cars';
import { NORMAL, difficultyById } from './f1/difficulty';
import { DRY, weatherById } from './f1/weather';
import { openReport, reportOpen } from './f1/report';
import type { HomePage, RallyAction } from './f1/screens/rally';
import { clearRally, loadRally, loadStageBests, newRally, nextStage, rallyEvent, rallyOver, saveRally, type RallySlot } from './f1/rally';
import { SCHEMES, crewById, schemeById } from './f1/crews';
import { showSettings } from './f1/menu';

const screen = document.getElementById('screen')!;
const deck = document.getElementById('deck')!;


// (the save and the chosen language's words are ready by now: f1/boot.ts)
// (LANGUAGE in the settings: the screens are built once, so a change builds the open one again, the settings still
// open; on a stage the new language shows from the next screen)
applyLanguage();
onLanguageChange(() => {
  if (racingOn || !MENU_SCREENS.has(menuName)) return;
  if (menuName === 'settings') markSettingsResume();
  void route();
});
// (TEXT: LARGE in the settings, from the start)
applyText();
// (MOTION in the settings, over the device's own ask for less motion)
applyMotion();
globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change', () => applyMotion());
// (the interface's colours, from the one theme file, as the stylesheet's variables)
applyTheme();

// The layout: always landscape, the wide screen with the deck laid over it as a HUD and its two halves the controls
// while you drive (html.desktop.split: game.css). The Android app is held in landscape (its manifest, and locked: orientation.ts); on the web a
// phone held upright gets a note to turn it (html.upright).
document.documentElement.classList.add('desktop', 'split');
void lockLandscape();
screen.append(deck);
const turnNote = Object.assign(document.createElement('div'), { className: 'turn-note' });
document.body.append(turnNote);
const upright = () => {
  turnNote.textContent = t('TURN YOUR PHONE SIDEWAYS');
  document.documentElement.classList.toggle('upright', isTouchScreen() && window.innerHeight > window.innerWidth);
};
upright();
window.addEventListener('resize', upright);

const controls = new Controls();
bindKeyboard(controls);
bindGamepad(controls);
unlockAudio();
// (the play stats: the game launched, and the time in it from now)
track('launch');
startClock();
// the phone's back button (in the Android app): each screen's own back, and on the home screen a second press to leave
void listenForBack(() => hintToast('PRESS BACK AGAIN TO EXIT'));
// (with ?debug, a press of it by hand: __back())
if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { __log: () => ({ device: device(), notes: lines() }), __back: () => pressBack(performance.now() / 1000, () => hintToast('PRESS BACK AGAIN TO EXIT'), () => console.log('exit')) });
bindDeck(deck, controls);
guardInput(controls, () => releaseDeck(deck));
const services: Services = { controls, hud: new Hud(deck) };
// ?inputlog lists the input events the page receives, for debugging controls on a device
if (new URLSearchParams(window.location.search).has('inputlog')) showInputLog(document.getElementById('app')!, controls);

/** Size the screen element: the window's height, and its width up to the widest (engine/layout.ts). */
function sizeScreen(): ScreenFit {
  const fit = measureFit();
  screen.style.width = `${fit.width * fit.scale}px`;
  screen.style.height = `${fit.height * fit.scale}px`;
  return fit;
}

/** What a window resize does: re-fit the screen and tell the running view. */
let onResize: () => void = () => sizeScreen();
window.addEventListener('resize', () => onResize());

/**
 * ?mode: with ?circuit, the stage's: a round of the season's ('rally'), free play's ('free') or the controls lap; without,
 * which of home's screens ('season' or 'free': a kind of play's page; none: home itself).
 */
type Mode = 'rally' | 'free' | 'tutorial' | 'season' | 'garage';
/** The kind of play a stage's ?mode is. */
const slotFor = (mode: string | null): RallySlot => (mode === 'free' ? 'free' : 'season');
/** The stage ?mode for a kind of play. */
const stageMode = (slot: RallySlot): Mode => (slot === 'free' ? 'free' : 'rally');
/** This page's address with ?circuit set to `id` (or removed: null) and ?mode to `mode` (or removed); other flags (?tune, ?debug…) stay. */
function withStage(id: string | null, mode?: Mode): string {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set('circuit', id);
  else url.searchParams.delete('circuit');
  if (mode) url.searchParams.set('mode', mode);
  else url.searchParams.delete('mode');
  return url.href;
}

/** A choice saved last time, by id (null for none): your car's paint, and the difficulty. */
const choice = (name: string): string | null => {
  const v = saved('choices', name);
  return typeof v === 'string' ? v : null;
};
const savedScheme = () => schemeById(choice('scheme')) ?? SCHEMES[0];
const savedDifficulty = () => difficultyById(choice('difficulty')) ?? NORMAL;

/** The screen showing now (home, the settings or a stage): closed before the next one opens. */
let current: { close(): void } | undefined;
/** Counts screen changes: a screen that finishes opening after a newer change is closed at once. */
let routeId = 0;
/** The TUNE button (camera and the like), mounted with the first stage; values are kept on the device. */

/** A new player: never done (or skipped) the controls lap, and nothing played yet (no rally, no stage run). */
const needsControlsLap = () => saved('progress', 'onboarded') !== true && !loadRally('season') && !loadRally('free') && !Object.keys(loadStageBests()).length;

/**
 * Show the screen the address asks for: ?circuit=<id>&mode=rally the rally's next stage there, ?mode=tutorial the
 * controls lap; otherwise home (the rally's screen), or for a new player the controls lap first. Moving between them
 * changes the address (so the browser's back button works) without loading the page again: the screen before is
 * closed and the next one opened in its place.
 */
async function route(): Promise<void> {
  const id = ++routeId;
  note(`screen ${window.location.search.replace(/^\?/, '') || 'home'}`);
  // (a screen opening takes a moment: no freeze reported for it)
  expectBusy(5);
  const params0 = new URLSearchParams(window.location.search);
  const going = layoutById(params0.get('circuit'));
  // the curtain down over the screen going (going to a stage, with its loading card), then the screen closed behind it
  await curtainDown(going ? { layout: going, line: stageLine(params0.get('mode')) } : undefined);
  if (id !== routeId) return;
  // (the screen going failing to close never keeps the next from opening: the curtain would stay down, the page black)
  try {
    current?.close();
  } catch (e) {
    reportLater(e);
  }
  current = undefined;
  racingOn = undefined;
  // (nothing held on one screen carries over to the next)
  controls.clearAll();
  releaseDeck(deck);
  const params = new URLSearchParams(window.location.search);
  const stage = layoutById(params.get('circuit'));
  const mode = params.get('mode');
  // a new player: the controls lap first, on the shakedown
  if (!stage && needsControlsLap()) {
    history.replaceState(null, '', withStage(SHAKEDOWN, 'tutorial'));
    return route();
  }
  try {
    if (stage && mode === 'tutorial') await showStage(id, stage, 'tutorial');
    else if (stage && (mode === 'rally' || mode === 'free')) await showStage(id, stage, mode);
    else await showHome(id, !stage && (mode === 'season' || mode === 'free' || mode === 'garage') ? mode : 'home');
  } catch (e) {
    // (a screen that failed to open: the curtain lifted all the same, on whatever got up, rather than black for good;
    // a stage that failed, back home)
    reportLater(e);
    if (id !== routeId) return;
    curtainUp();
    // (the controls lap failing counts as seen: home, not the lap again)
    if (mode === 'tutorial') save('progress', 'onboarded', true);
    if (stage) navigate(withStage(null));
  }
}

/** An error caught to keep the game going, still reported (as nothing caught it: the crash reports, crashes.ts). */
function reportLater(e: unknown): void {
  setTimeout(() => {
    throw e;
  });
}

/** The line under a stage's name on its loading card: the rally and the stage, or the controls lap. */
function stageLine(mode: string | null): string {
  if (mode === 'tutorial') return `${t('SHAKEDOWN')} · ${t('CONTROLS LAP')}`;
  const r = mode === 'rally' || mode === 'free' ? loadRally(slotFor(mode)) : undefined;
  if (r && !rallyOver(r)) return `${t(rallyEvent(r).name)} · ${t('SS{n} OF {total}', { n: nextStage(r) + 1, total: rallyEvent(r).stages.length })}`;
  return t('RALLY');
}

/** which screen is up, for a report made from it (the dashboard says where it came from) */
let menuName = 'rally';
/** the screens a language change builds again (menuName's values) */
const MENU_SCREENS = new Set(['rally', 'settings']);
/** the stage on now (its id and mode), if one is */
let racingOn: { circuit: string; mode: string } | undefined;
// (an error nothing caught: to the play stats, with the screen it happened on; src/f1/crashes.ts)
watchCrashes(() => (racingOn ? { name: 'race', ...racingOn } : { name: menuName }));
// the logbook (engine/logbook.ts): what led up to an error or a REPORT, which carry it; the console's warnings and
// errors in it, the app put away and brought back, the phone's model asked for; and freezes (a frame over 3 s late,
// the app in sight all along) reported as errors, a few lengths apart
noteConsole();
askModel();
// (the game starting up: its first screens built)
expectBusy(5);
onHidden((hidden) => {
  note(hidden ? 'app hidden' : 'app shown');
  // (the gap the app was away for isn't a freeze: no frames run while it's out of sight)
  sightChanged();
});
// (not while the curtain's down: a stage being built behind it takes a moment on a slow phone, and that's no freeze)
watchFreezes((seconds) => reportProblem(`Freeze: ${seconds < 5 ? '3-5' : seconds < 10 ? '5-10' : 'over 10'} s without a frame`), () => gameHidden() || curtainIsDown());
// slow stretches too, short of a freeze: a rate under 40 fps held for 5 s, or hitches (frames over 100 ms), reported with
// the stretch's numbers, the long tasks in it, the heap, and the screen and picture quality (the logbook's notes and the
// device come along); long tasks (200 ms or more of script) in the logbook
watchLongTasks();
watchFrames((stats, extra) => {
  const where = racingOn ? 'race' : 'menu';
  const what = stats.fps < 40 ? `${stats.fps < 15 ? 'under 15' : stats.fps < 25 ? '15-25' : stats.fps < 30 ? '25-30' : '30-40'} fps` : `hitches up to ${stats.worst < 200 ? '100-200' : stats.worst < 500 ? '200-500' : 'over 500'} ms`;
  reportProblem(`Slow ${where}: ${what}`, { perf: { ...stats, ...extra } });
}, () => gameHidden() || curtainIsDown());
// REPORT on the home screen and the settings (the stage has its own, on the pause screen): a little button in the
// column's top right corner, shown while they're up; the screen as it is, to draw on and say what's wrong (src/f1/report.ts)
const menuReport = document.createElement('button');
menuReport.className = 'menu-report';
menuReport.type = 'button';
menuReport.setAttribute('aria-label', t('Report a problem with this screen'));
menuReport.innerHTML = `<span aria-hidden="true">⚑</span> ${t('REPORT')}`;
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
 * The stage's code fetched in the background once home is settled (the browser idle), so the first stage starts
 * sooner: the backdrop already brings the 3D, but not the stage's view.
 */
let raceFetched = false;
function fetchRaceSoon(): void {
  if (raceFetched) return;
  raceFetched = true;
  const fetchIt = () => void import('./f1/race').catch(() => (raceFetched = false));
  if ('requestIdleCallback' in window) window.requestIdleCallback(fetchIt, { timeout: 4000 });
  else setTimeout(fetchIt, 1500);
}

/** The screen fills the column (home and the settings: all touch, no deck). */
function menuScreen(): void {
  document.documentElement.classList.add('menu');
  const fillScreen = () => {
    screen.style.width = '100%';
    screen.style.height = '100%';
  };
  fillScreen();
  onResize = fillScreen;
}

/** The shakedown: the road behind home, and the controls lap's. */
const shakedown = (): CircuitLayout => layoutById(SHAKEDOWN)!;

/**
 * Rally cars on the shakedown behind home and the settings: a still of them up at once, so the screen never opens on
 * black, the live ones (loaded then) fading in over it; gone when `signal` aborts. Gives back a stop for the live
 * ones (once a stage is picked: its view needs the GPU). MOTION changed: less motion takes them away for the still,
 * full brings them back.
 */
function carsBehind(signal: AbortSignal): () => void {
  let still = showStill(screen);
  let stop = () => {};
  // (the splash's cars are handed on rather than stopped: home carries them on)
  let park = (s: () => void) => s();
  const unwatch = onMotionChange(() => {
    if (signal.aborted) return;
    stop();
    stop = () => {};
    still.remove();
    still = showStill(screen);
    if (!motionReduced()) start();
  });
  signal.addEventListener('abort', () => {
    unwatch();
    park(stop);
    still.remove();
  });
  const start = () => {
    void import('./f1/screens/menuBackdrop').then((m) => {
      park = m.parkBackdrop;
      if (!signal.aborted) stop = m.startBackdrop(screen, shakedown(), still);
    });
  };
  start();
  return () => stop();
}

/**
 * Home: the rally's screen (the rallies to pick from, or the one under way and its next stage), rally cars on the
 * shakedown behind it; and from it the settings.
 */
/**
 * The time the season's calendar goes by: now, or with ?debug, `?seasonday=<n>` days after the first round opens (to
 * see a round opening without waiting for it).
 */
function seasonNow(): number {
  const q = new URLSearchParams(location.search);
  const day = Number(q.get('seasonday'));
  return q.has('debug') && q.has('seasonday') && Number.isFinite(day) ? SEASON.start + day * 24 * 60 * 60 * 1000 : Date.now();
}

async function showHome(id: number, page: HomePage): Promise<void> {
  menuScreen();
  fetchRaceSoon();
  menuName = 'rally';
  playMusic(THEME_MUSIC);
  const closed = new AbortController();
  current = { close: () => closed.abort() };
  const { showRally } = await import('./f1/screens/rally');
  if (id !== routeId) return;
  const seasonRally = loadRally('season');
  const freeRally = loadRally('free');
  const slot: RallySlot | undefined = page === 'season' || page === 'free' ? page : undefined;
  const rally = page === 'season' ? seasonRally : page === 'free' ? freeRally : undefined;
  // (anything the championships owe your career paid: a round driven before career points were kept, say)
  payCareer(...Object.values(loadSeasons()));
  const career = loadCareer().points;
  // the championship shown: the class of the round under way, or else of your car (each class runs its own)
  const season = currentSeason(newSeed(), seasonRally ? roundClass(seasonRally) : yourCar(career).cls);
  // (a language change built home again with the settings open: they open again, at LANGUAGE, home not under them)
  const showing: Promise<RallyAction> = settingsResumePending()
    ? Promise.resolve('settings' as const)
    : page === 'garage'
      ? (await import('./f1/screens/garage')).showGarage(screen, services, career, closed.signal)
      : showRally(screen, services, { page, seasonRally, freeRally, scheme: savedScheme(), view: { season, now: seasonNow() }, career }, closed.signal);
  if (id !== routeId) return;
  curtainUp();
  // rally cars on the shakedown behind it (loaded once it's up; not behind the garage, whose car turns on a stand of its own)
  const stopBackdrop = page === 'garage' ? () => {} : carsBehind(closed.signal);
  const action = await showing;
  if (id !== routeId) return stopBackdrop();
  // (a stage needs the GPU: the cars behind stop; the settings carry them on)
  if (action !== 'settings') stopBackdrop();
  if (action === 'stage' && rally && slot && !rallyOver(rally)) navigate(withStage(rallyEvent(rally).stages[nextStage(rally)].layout, stageMode(slot)));
  else if (action === 'back') navigate(withStage(null));
  else if (action === 'car') void route();
  else if (action === 'abandon') {
    if (slot) clearRally(slot);
    void route();
  } else if (action === 'retire') {
    // (a season's round retired from: 0 points, and over for the season)
    if (rally && retireRound(season, rally)) {
      saveSeason(season);
      payCareer(season);
    }
    clearRally('season');
    void route();
  } else if (action === 'new-season') {
    // (a new championship for this class: the other classes' carry on)
    if (!seasonRally || roundClass(seasonRally) === season.cls) clearRally('season');
    saveSeason(undefined, season.cls);
    void route();
  } else if (action === 'settings') {
    menuName = 'settings';
    const difficulty = await showSettings(screen, services, savedDifficulty(), closed.signal);
    if (id !== routeId) return;
    save('choices', 'difficulty', difficulty.id);
    void route();
  } else if (typeof action === 'object' && 'open' in action) navigate(withStage(null, action.open));
  else if (typeof action === 'object') {
    // a new rally, in the paint picked (kept for the next), at the difficulty in the settings
    save('choices', 'scheme', action.scheme.id);
    // (a round of the season, against the season's crews; free play's, against a field of its own)
    saveRally(newRally({ event: action.start, seed: newSeed(), scheme: action.scheme, car: yourCar().id, difficulty: savedDifficulty().id, ...(page === 'season' ? { season: { id: season.id, cls: season.cls, rivals: season.rivals } } : {}) }));
    void route();
  }
}

async function showStage(id: number, stage: CircuitLayout, mode: 'rally' | 'free' | 'tutorial'): Promise<void> {
  racingOn = { circuit: stage.id, mode };
  // a rally's stage: the next of the rally under way in its kind of play (any other: back to that kind of play's page)
  const slot = mode === 'tutorial' ? undefined : slotFor(mode);
  const rally = slot ? loadRally(slot) : undefined;
  const next = rally && !rallyOver(rally) ? rallyEvent(rally).stages[nextStage(rally)] : undefined;
  if (slot && (!rally || !next || next.layout !== stage.id)) {
    history.replaceState(null, '', withStage(null, slot));
    return route();
  }
  document.documentElement.classList.remove('menu');
  let stageOn: typeof import('./f1/race').stageOn;
  try {
    ({ stageOn } = await import('./f1/race'));
  } catch {
    // (the stage's code couldn't be fetched: offline on a first stage, or the build replaced under the page: back
    // home, the curtain up, rather than a loading card for good)
    if (id !== routeId) return;
    curtainUp();
    hintToast("COULDN'T LOAD THE STAGE");
    navigate(withStage(null));
    return;
  }
  if (id !== routeId) return;
  // (the screen measured now: a turn of the phone while the stage's code loaded is in the measure)
  const fit = sizeScreen();
  // (out of a rally's stage: back to its kind of play's page)
  const home = () => navigate(withStage(null, slot));
  const quit = mode === 'tutorial'
    ? () => {
        // (done or skipped: either way, not shown on its own again)
        save('progress', 'onboarded', true);
        home();
      }
    : home;
  const yours = rally ? rally.crews[rally.you] : undefined;
  const view: StandaloneView = await stageOn(stage, quit, rally && next
    ? {
        scheme: schemeById(yours?.scheme ?? crewById(yours?.crew)?.scheme) ?? savedScheme(), car: carById(yours?.car) ?? yourCar(), difficulty: difficultyById(rally.difficulty) ?? NORMAL,
        weather: weatherById(next.weather) ?? DRY, mode: 'rally', rally: { rally, stage: nextStage(rally), onDone: home },
      }
    : { scheme: savedScheme(), difficulty: NORMAL, weather: DRY, mode: 'tutorial' })({ host: screen, services, fit });
  if (id !== routeId) {
    view.dispose();
    return;
  }
  current = { close: () => view.dispose() };
  onResize = () => view.resize(sizeScreen());
  curtainUp();
}

void opening();

/**
 * The game opening: the title splash first, unless the address goes straight to a stage (a link); then the screen
 * the address asks for (home, or a new player's controls lap).
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
  if (!params.has('circuit') && !params.has('mode') && !settingsResumePending()) {
    menuScreen();
    document.documentElement.classList.add('splash-up');
    // (the theme from the start: it sounds with the first tap)
    playMusic(THEME_MUSIC);
    const splash = showSplash(screen, shakedown(), controls);
    // (the stage's code meanwhile: a new player's controls lap is next)
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
