import { type StandaloneView } from './engine/view';
import { mountTuning } from './engine/tuning';
import { Controls, bindGamepad, bindKeyboard, guardInput } from './engine/controls';
import type { Services } from './engine/services';
import { Hud, bindDeck, releaseDeck } from './engine/deck';
import { showInputLog } from './engine/inputLog';
import { canSwitchLayout, measureFit, startLayout, type LayoutMode, type ScreenFit } from './engine/layout';
import { useStore } from './engine/storage';
import { save, saved, useSave } from './engine/save';
import { CC_SAVE } from './f1/save';
import { playMusic } from './engine/music';
import { THEME_MUSIC } from './f1/music';
import { unlockAudio } from './engine/audio';
import { startClock, track } from './f1/metrics';
import { F1_TUNING } from './f1/tuning';
import { layoutById, type CircuitLayout } from './f1/layouts';
import { SHAKEDOWN } from './f1/stages';
import { curtainDown, curtainFirstUp, curtainUp } from './f1/screens/curtain';
import { YOUTUBE, firstFrameReady, gameReady } from './engine/host';
import { showStill } from './f1/screens/backdropStill';
import { showSplash } from './f1/screens/splash';
import { useLayoutSwitch } from './f1/settingsRows';
import { applyText } from './f1/access';
import { watchCrashes } from './f1/crashes';
import { hintToast } from './f1/screens/celebrate';
import { listenForBack, pressBack } from './engine/backButton';
import { newSeed } from './engine/rng';
import { NORMAL, difficultyById } from './f1/difficulty';
import { DRY, weatherById } from './f1/weather';
import { openReport, reportOpen } from './f1/report';
import { loadRally, loadStageBests, newRally, nextStage, rallyEvent, rallyOver, saveRally } from './f1/rally';
import { SCHEMES, crewById, schemeById } from './f1/crews';
import { showSettings } from './f1/menu';

const screen = document.getElementById('screen')!;
const deck = document.getElementById('deck')!;

const app = document.getElementById('app')!;

// this game's saves (Corner Cutters Rally's own, apart from Corner Cutters'; each game has its own prefix: itch.io
// games share one origin's storage), in its save format
useStore('ccr:');
useSave(CC_SAVE);
// (TEXT: LARGE in the settings, from the start)
applyText();

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
// the phone's back button (in the Android app): each screen's own back, and on the home screen a second press to leave
void listenForBack(() => hintToast('PRESS BACK AGAIN TO EXIT'));
// (with ?debug, a press of it by hand: __back())
if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { __back: () => pressBack(performance.now() / 1000, () => hintToast('PRESS BACK AGAIN TO EXIT'), () => console.log('exit')) });
bindDeck(deck, controls);
guardInput(controls, () => releaseDeck(deck));
const services: Services = { controls, hud: new Hud(deck) };
// ?inputlog lists the input events the page receives, for debugging controls on a device
if (new URLSearchParams(window.location.search).has('inputlog')) showInputLog(document.getElementById('app')!, controls);

/** Size the screen element: full column width and a height to suit the phone, or the window on a desktop. */
function sizeScreen(): ScreenFit {
  const fit = measureFit(layout);
  screen.style.width = `${fit.width * fit.scale}px`;
  screen.style.height = `${fit.height * fit.scale}px`;
  // (on a phone the deck floats over the screen's lower part: what it covers, for the stage's panels to keep clear of)
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

type Mode = 'rally' | 'tutorial';
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
let tuning: ReturnType<typeof mountTuning<typeof F1_TUNING>> | undefined;

/** A new player: never done (or skipped) the controls lap, and nothing played yet (no rally, no stage run). */
const needsControlsLap = () => saved('progress', 'onboarded') !== true && !loadRally() && !Object.keys(loadStageBests()).length;

/**
 * Show the screen the address asks for: ?circuit=<id>&mode=rally the rally's next stage there, ?mode=tutorial the
 * controls lap; otherwise home (the rally's screen), or for a new player the controls lap first. Moving between them
 * changes the address (so the browser's back button works) without loading the page again: the screen before is
 * closed and the next one opened in its place.
 */
async function route(): Promise<void> {
  const id = ++routeId;
  const params0 = new URLSearchParams(window.location.search);
  const going = layoutById(params0.get('circuit'));
  // the curtain down over the screen going (going to a stage, with its loading card), then the screen closed behind it
  await curtainDown(going ? { layout: going, line: stageLine(params0.get('mode')) } : undefined);
  if (id !== routeId) return;
  current?.close();
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
  if (stage && mode === 'tutorial') await showStage(id, stage, 'tutorial');
  else if (stage && mode === 'rally') await showStage(id, stage, 'rally');
  else await showHome(id);
}

/** The line under a stage's name on its loading card: the rally and the stage, or the controls lap. */
function stageLine(mode: string | null): string {
  if (mode === 'tutorial') return 'SHAKEDOWN · CONTROLS LAP';
  const r = loadRally();
  if (r && !rallyOver(r)) return `${rallyEvent(r).name} · SS${nextStage(r) + 1} OF ${rallyEvent(r).stages.length}`;
  return 'RALLY';
}

/** which screen is up, for a report made from it (the dashboard says where it came from) */
let menuName = 'rally';
/** the stage on now (its id and mode), if one is */
let racingOn: { circuit: string; mode: string } | undefined;
// (an error nothing caught: to the play stats, with the screen it happened on; src/f1/crashes.ts)
watchCrashes(() => (racingOn ? { name: 'race', ...racingOn } : { name: menuName }));
// REPORT on the home screen and the settings (the stage has its own, on the pause screen): a little button in the
// column's top right corner, shown while they're up; the screen as it is, to draw on and say what's wrong (src/f1/report.ts)
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
 * Home: the rally's screen (the rallies to pick from, or the one under way and its next stage), rally cars on the
 * shakedown behind it; and from it the settings.
 */
async function showHome(id: number): Promise<void> {
  menuScreen();
  fetchRaceSoon();
  menuName = 'rally';
  playMusic(THEME_MUSIC);
  const closed = new AbortController();
  // rally cars on the shakedown behind it (loaded once it's up)
  let stopBackdrop = () => {};
  closed.signal.addEventListener('abort', () => stopBackdrop());
  current = { close: () => closed.abort() };
  const { showRally } = await import('./f1/screens/rally');
  if (id !== routeId) return;
  const rally = loadRally();
  const showing = showRally(screen, services, rally, savedScheme(), closed.signal);
  curtainUp();
  // (a still of it up at once, so home never opens on black; the live one fades in over it)
  const still = showStill(screen);
  closed.signal.addEventListener('abort', () => still.remove());
  void import('./f1/screens/menuBackdrop').then(({ startBackdrop }) => {
    if (!closed.signal.aborted) stopBackdrop = startBackdrop(screen, shakedown(), still);
  });
  const action = await showing;
  if (id !== routeId) return;
  if (action === 'stage' && rally && !rallyOver(rally)) navigate(withStage(rallyEvent(rally).stages[nextStage(rally)].layout, 'rally'));
  else if (action === 'abandon') {
    saveRally(undefined);
    void route();
  } else if (action === 'settings') {
    menuName = 'settings';
    const difficulty = await showSettings(screen, services, savedDifficulty(), closed.signal);
    if (id !== routeId) return;
    save('choices', 'difficulty', difficulty.id);
    void route();
  } else if (typeof action === 'object') {
    // a new rally, in the paint picked (kept for the next), at the difficulty in the settings
    save('choices', 'scheme', action.scheme.id);
    saveRally(newRally({ event: action.start, seed: newSeed(), scheme: action.scheme, difficulty: savedDifficulty().id }));
    void route();
  }
}

async function showStage(id: number, stage: CircuitLayout, mode: Mode): Promise<void> {
  racingOn = { circuit: stage.id, mode };
  // a rally's stage: the rally's next (any other: back home)
  const rally = mode === 'rally' ? loadRally() : undefined;
  const next = rally && !rallyOver(rally) ? rallyEvent(rally).stages[nextStage(rally)] : undefined;
  if (mode === 'rally' && (!rally || !next || next.layout !== stage.id)) {
    history.replaceState(null, '', withStage(null));
    return route();
  }
  document.documentElement.classList.remove('menu');
  const fit = sizeScreen();
  tuning ??= mountTuning(screen, 'f1', F1_TUNING);
  const { stageOn } = await import('./f1/race');
  if (id !== routeId) return;
  const home = () => navigate(withStage(null));
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
        scheme: schemeById(yours?.scheme ?? crewById(yours?.crew)?.scheme) ?? savedScheme(), difficulty: difficultyById(rally.difficulty) ?? NORMAL,
        weather: weatherById(next.weather) ?? DRY, mode: 'rally', rally: { rally, stage: nextStage(rally), onDone: home },
      }
    : { scheme: savedScheme(), difficulty: NORMAL, weather: DRY, mode: 'tutorial' })({ host: screen, services, tuning, fit });
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
  if (!params.has('circuit') && !params.has('mode')) {
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
