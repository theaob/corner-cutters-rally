// A rally stage: you on your own on a long road, against the clock. The
// countdown on the line (5, 4, 3, 2, 1), then GO; the co-driver calling every
// bend; a split at each third against the stage's quickest crew; the flying
// finish, the car braking to the stop past it; then the stage's times and the
// rally's standings (rally.ts). Or the controls lap: a new player on the
// shakedown, a prompt at a time for the controls. A pauses (so does leaving the
// app or tab); START restarts a stage not yet finished; SELECT goes back.

import * as THREE from 'three';
import type { Button } from '../engine/controls';
import { applyDamage, newCar, speedOf, type Car, type DriveInput, type StepEvents } from '../engine/driving';
import { SIM_DT, advance, fixedClock, lerp, lerpAngle, resetClock } from '../engine/fixedStep';
import { groundAt } from '../engine/sim';
import { aiInput, lateralOffset, newProgress, lineCornerSpeed, lineDecel, stageSplits } from './racing';
import { stopAt } from './stageDressing';
import { NORMAL, handlingFor, type Difficulty } from './difficulty';
import { DRY, lookAt as weatherLook, type Weather } from './weather';
import { conditionOf, fixedForecast } from './forecast';
import { COMPOUNDS, fitTyres, tyreFor } from './tyres';
import { advance as nextPrompt, apexesPassed, newOnboarding, prompt, stepsFor, type Device, type Onboarding } from './onboarding';
import { Driver, forwardSpeed } from '../engine/drive/driver';
import { KeyDriving } from '../engine/drive/keys';
import { readPad } from '../engine/drive/pad';
import { driveSettings } from '../engine/drive/settings';
import { TouchDriving } from '../engine/drive/touch';
import { screenToMap } from '../engine/drive/point';
import type { Intent } from '../engine/drive/intent';
import { isView, nextView, setView, viewSetting, type ViewId } from './view';
import { RESCUE, newRescue, stepRescue } from './rescue';
import { SIGHT, autoSpeed, bestKey, rallyCar, styleHandling, topDownFraming } from './style';
import { LIGHTS, newRace, running, stepRace, type Entrant, type Race, type RaceEvent } from './raceControl';
import { createCarMesh, type CarMesh } from '../engine/render/vehicles3d';
import { CarFx, DebrisLayer, makeFireLights, Particles, SkidLayer } from '../engine/render/effects';
import { borrowView, returnView } from '../engine/render/sharedView';
import { disposeDeep } from '../engine/render/dispose';
import { drawWhole } from '../engine/render/warm';
import { HD2D_VIEW } from '../engine/look';
import { DEFAULT_GOVERNOR, QUALITY_LEVELS, QualityGovernor, keptQuality } from '../engine/render/quality';
import { save as saveValue, saved as savedValue } from '../engine/save';
import { frameCap, graphicsSetting, heldLevel, skipFrame } from './graphics';
import { note, setGpu, setQuality } from '../engine/logbook';
import { reportProblem, setRaceSpot } from './crashes';
import { t as tl } from '../engine/i18n';
import { isTouchScreen, type ScreenFit } from '../engine/layout';
import { loadVehicleEdits } from '../engine/vehicleEdits';
import type { MountStandalone } from '../engine/view';
import { defaults } from '../engine/tuning';
import { TILE, buildCircuit } from './circuit';
import { vibrate } from '../engine/haptics';
import { newRumble, rumble } from './rumble';
import { RUSH, newShake, rushOf, shakeOffset, shakeOn, stepShake, timeScale } from './shake';
import { RaceSounds, menuPick, menuTick } from './sounds';
import { onBack } from '../engine/backButton';
import { settingsPages, settingsRows } from './settingsRows';
import { LAUNCH, kickOf, newLaunch, stepLaunch } from './launch';
import { setAudioPaused } from '../engine/audio';
import { musicPlaying, playMusic } from '../engine/music';
import { MENU_MUSIC, RACE_MUSIC } from './music';
import type { CircuitLayout } from './layouts';
import { createCircuitScene } from './circuitScene';
import { createHud } from './race/hud';
import { kmOf, track as noteStat } from './metrics';
import { drawCars, type CarLook } from './race/drawCars';
import { readoutText, topDownReadout, tyreText } from './race/readout';
import { paintRows } from './race/readoutView';
import { bannerMessage, evenLines, lessonMessage } from './race/banner';
import { gapColor, motionReduced, splitColor } from './access';
import { deckLabels as labelsFor } from './race/deckLabels';
import { createFlagOverlay, createRain, createStreaks } from './race/screenFx';
import { F1_TUNING } from './tuning';
import { openReport, reportOpen } from './report';
import { frameWanted } from '../engine/render/capture';
import { YOUTUBE, onHidden } from '../engine/host';
import { aiStage, loadStageBests, rallyEvent, recordBest, recordStage, recordStageBest, referenceStage, saveRally, stageOrder, type Rally } from './rally';
import { newCaller, paceNotes, screenFacing, stepCaller, type Caller } from './paceNotes';
import { createPaceCard, renderStageResults } from './race/rallyView';
import { formatTime as fmt } from './time';
import { SCHEMES, liveryOf, type Scheme } from './crews';
import { COLOR } from './theme';

type F1Tuning = Record<keyof typeof F1_TUNING, number>;
/** s of count (3, 2, 1) after RESUME before the stage goes on */
const RESUME_COUNT = 3;
const deg = THREE.MathUtils.degToRad;
const LOOK = HD2D_VIEW;
/** the TOP view: its zoom, its pitch (degrees down from level), and px it looks ahead of the car at top speed (half
 * that standing), which puts the car low on the screen */
const TOP_VIEW = { zoom: 0.7, pitch: 58, lead: 180 };

/** How a stage is set up. */
export interface StageOptions {
  /** your car's paint */
  scheme?: Scheme;
  difficulty?: Difficulty;
  weather?: Weather;
  /** a rally's stage, or the controls lap for a new player (on the shakedown) */
  mode?: 'rally' | 'tutorial';
  /** a rally's stage: the rally, and the stage (its index); on with `onDone` once its results have been seen */
  rally?: { rally: Rally; stage: number; onDone(): void };
}

/**
 * The stage on `layout` with `options`; `onQuit` runs when the player leaves (EXIT on the deck, SELECT inside), and
 * after the controls lap.
 */
export const stageOn = (layout: CircuitLayout, onQuit: () => void, options: StageOptions = {}): MountStandalone => async ({ host, services, tuning, fit }) => {
  const { scheme = SCHEMES[0], difficulty = NORMAL, weather = DRY, mode = 'rally' } = options;
  const rallyRun = mode === 'rally' ? options.rally : undefined;
  const t = (tuning ?? defaults(F1_TUNING)) as F1Tuning;
  const { controls, hud } = services;
  loadVehicleEdits(); // (any saved stat edits apply to the car)
  // STYLE (style.ts): TOP-DOWN's slower car and forgiving roadside, or SIM's; the stage keeps the one it started in
  const style = driveSettings().style;
  const f1 = rallyCar(style);
  // the difficulty sets how much a crash costs and how quick the rival crews are
  const HANDLING = styleHandling(handlingFor(difficulty), style);
  // the racing line: flat out wherever the car can follow the bend
  const circuit = buildCircuit(layout, { cornerSpeed: lineCornerSpeed(f1, HANDLING), decel: lineDecel(f1) });
  // (on dirt, the touch deck has a DRIFT button too: game.css)
  document.documentElement.classList.toggle('dirt', !!layout.dirt);
  const { track, grid } = circuit;
  const finishAt = track.stage?.finish ?? track.length;
  /** the stop control past the finish (stageDressing.ts), and px/s² the car eases down to it at */
  const stopLine = stopAt(finishAt, track.length);
  const STOP_DECEL = 220;
  const world = createCircuitScene(circuit, weather, layout.name);
  /** the stage's weather: the same all the way */
  const forecast = fixedForecast(weather.id === 'changeable' ? 'dry' : weather.id);
  const sessionWeather = () => conditionOf(forecast.start);
  /** how the road looks now (wetness and rain), last put on the scene, so it's only redone as it changes */
  let shownLook = { wetness: -1, rain: -1 };
  const skids = new SkidLayer((x, y) => groundAt(grid, x, y).h);
  // (a bigger pool in the wet, and on dirt: the car throws up spray, or dust)
  const particles = new Particles(weather.spray || layout.dirt ? 220 : 90);
  // parts torn off in big crashes: the bumper, and wheels off a wreck
  const debris = new DebrisLayer();
  world.scene.add(skids.group, particles.group, debris.group);
  /** a wheel torn off lies on its side */
  const onItsSide = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);

  // ---------------------------------------------------------------- renderer
  const camera = new THREE.PerspectiveCamera(LOOK.fov, fit.width / fit.height, 1, 4000);
  camera.up.set(0, 0, -1);
  // (the game's one renderer, home's backdrop done with it: the shaders the last stage compiled are still there)
  const view = borrowView(world.scene, camera, () => dispose());
  const { renderer, post } = view;
  renderer.info.autoReset = false;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // (for the logbook: the graphics chip; and the context lost, a phone's way of taking the graphics away, reported)
  setGpu(renderer.getContext());
  /** the canvas outlives the stage: what the stage listens for on it stops with the stage */
  const canvasEvents = new AbortController();
  renderer.domElement.addEventListener('webglcontextlost', () => {
    note('webgl context lost');
    reportProblem('WebGL context lost (on a stage)');
  }, { signal: canvasEvents.signal });
  renderer.domElement.addEventListener('webglcontextrestored', () => note('webgl context restored'), { signal: canvasEvents.signal });
  Object.assign(renderer.domElement.style, { width: '100%', height: '100%', display: 'block' });
  host.prepend(renderer.domElement);
  // (the picture's quality where the last stage settled, so this one doesn't step down again mid-stage: quality.ts)
  const gameVersion = (typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev').split('+')[0];
  const governor = new QualityGovernor(DEFAULT_GOVERNOR, keptQuality(savedValue('device', 'quality'), Date.now(), gameVersion));
  /** the level kept last, and whether it was locked (a change from it is kept again) */
  let keptLevel = { level: governor.level, locked: governor.locked };
  /** the level set by hand (__cc.quality): not kept */
  let qualityHeld = false;
  /** GRAPHICS held the level this frame (not AUTO) */
  let wasHeld = false;
  let viewW = fit.width;
  let viewH = fit.height;
  let desktop = fit.desktop;
  let sizeKey = '';
  const applySize = () => {
    const q = QUALITY_LEVELS[governor.level];
    const key = `${viewW}:${viewH}:${q.res}`;
    if (key === sizeKey) return;
    sizeKey = key;
    renderer.setSize(viewW * q.res, viewH * q.res, false);
    post.setSize(viewW * q.res, viewH * q.res);
  };
  /** Lay the readouts out for the wide screen or the phone (set once they're made, below). */
  let placeHud: (desktop: boolean) => void = () => {};
  /** the phone's overlay: its readout without the tyres' share */
  let phoneHud = false;
  const resize = (f: ScreenFit) => {
    placeHud(f.desktop);
    viewW = f.width;
    viewH = f.height;
    desktop = f.desktop;
    camera.aspect = viewW / f.height;
    // (without this the camera keeps its first shape, and a wider screen stretches the picture)
    camera.updateProjectionMatrix();
    applySize();
  };
  resize(fit);

  // ---------------------------------------------------------------- overlays
  const {
    readout, mainLines, tyreLine, cardSlot, banner, lesson, progress, setProgressMarks, setProgress, results, crewCard, weatherTag, pauseScreen,
    pauseTitle, pauseButton, place: layHud,
  } = createHud(scheme, difficulty);
  weatherTag.textContent = tl(weather.name);
  // the rush of speed, the rain, and your chequered flag, drawn over the picture (race/screenFx.ts)
  const streaks = createStreaks();
  /** less motion asked for (MOTION in the settings, or the device): no speed lines; read as it's changed */
  const calm = () => motionReduced();
  /** the rush now (eased toward what the speed says) */
  let rushNow = 0;
  const rain = createRain();
  const flagOverlay = createFlagOverlay();
  // the co-driver's card
  const paceCard = createPaceCard();
  // the banner's message, on even lines if it takes two (race/banner.ts)
  const balances = globalThis.CSS?.supports?.('text-wrap', 'balance') ?? false;
  let bannerShown = { text: '', drawn: '' };
  const showBanner = (text: string) => {
    if ((balances && !text.includes(' · ')) || !text.includes(' ')) {
      if (banner.textContent !== text) banner.textContent = text;
      return;
    }
    if (text === bannerShown.text && banner.textContent === bannerShown.drawn) return;
    banner.textContent = text;
    const range = document.createRange();
    range.selectNodeContents(banner);
    if (range.getClientRects().length > 1) {
      banner.replaceChildren(...evenLines(text).split('\n').map((line) => {
        const row = document.createElement('span');
        row.style.display = 'block';
        row.textContent = line;
        return row;
      }));
    }
    bannerShown = { text, drawn: banner.textContent };
  };
  cardSlot.append(paceCard.el);
  host.append(cardSlot, streaks.el, rain.el, readout, progress, banner, lesson, results, crewCard, pauseScreen, flagOverlay.el);
  placeHud = (desktop) => {
    phoneHud = !desktop;
    layHud(desktop, host, mode === 'tutorial');
  };
  placeHud(fit.desktop);

  // ---------------------------------------------------------------- stage state
  let race!: Race;
  /** your car: its model and effects */
  let looks: CarLook[] = [];
  /** your stage is over (finished, or out) and the results are coming */
  let done = false;
  const you = 0;
  /** TOP-DOWN on a rally's stage: a bar across the top for how far along you are (hud.ts), in place of KM TO GO */
  const progressBar = () => style === 'topdown' && !!rallyRun;
  /** The readout's panel lit up in `color` a moment (a split: ahead or behind). */
  const flashReadout = (color: string) => {
    if (calm() || typeof readout.animate !== 'function') return;
    readout.animate([{ boxShadow: `0 0 0 2px ${color}`, background: `color-mix(in srgb, ${color} 35%, rgba(21,20,31,.75))` }, { boxShadow: '0 0 0 2px transparent' }], { duration: 1600, easing: 'ease-out' });
  };
  /** a message over the stage for a few seconds (a split, a penalty…), shown unless something more urgent is */
  let notice = { text: '', color: '', until: 0 };
  const announce = (text: string, color: string, seconds = 3) => (notice = { text: tl(text), color, until: race.clock + seconds });

  /** the stage is stopped: nothing moves and the clock doesn't run */
  let paused = false;
  /** s left of the countdown after RESUME (RESUME_COUNT at first): the stage is still stopped until it's out */
  let resumeLeft = 0;
  /** frames to leave out of the quality governor after a pause (the first frame back measures the pause) */
  let settle = 0;
  let last = performance.now();
  // the stage's sounds (silent until the first tap or key: browsers require one)
  const sounds = new RaceSounds(0);
  /** the countdown's beeps so far, and whether your flag has been sounded */
  let soundState = { lights: 0, flag: false };
  /** the camera's shake, and the hit-stop of a big hit */
  let shake = newShake();
  /** a hit to your car the debug hook asked for, dealt next frame */
  let pendingHit = 0;
  /** your start off the line (judged once) */
  let launch = newLaunch();
  // the driving (src/engine/drive/): on a touch screen its own layer over the deck, the keys, a gamepad; whichever you used
  // last drives, through the steering wheel and the assist
  const deckHost = document.getElementById('deck');
  const touchDrive = deckHost && isTouchScreen() ? new TouchDriving(deckHost) : undefined;
  const keyDrive = new KeyDriving();
  /** CONTROL: POINT (TOP-DOWN's): the way pointed on the screen turned into the way on the map, through the camera
   * (north up and pitched in TOP-DOWN's own view; turned with the car or the road in another) */
  const onMap = <T extends Intent | undefined>(i: T): T => {
    if (!i?.point) return i;
    const squash = camYaw === undefined ? Math.sin(deg(LOOK.pitch)) : 1;
    return { ...i, point: screenToMap(i.point.x, i.point.y, camYaw ?? 0, squash) };
  };
  const pointing = () => driveSettings().control === 'point';
  const driver = new Driver({ touch: touchDrive && (() => onMap(touchDrive.intent())), keys: () => onMap(keyDrive.intent(pointing())), pad: () => onMap(readPad()) }, driveSettings);
  /** CONTROL: POINT's own speed: how fast the car can go at each point of the road and still take what's ahead */
  const safeAt = autoSpeed(track, f1, HANDLING);
  const setPaused = (on: boolean, count = true) => {
    if (on === paused) return;
    paused = on;
    note(on ? 'paused' : 'resumed');
    // (nothing held carries over a pause)
    if (on) {
      touchDrive?.release();
      keyDrive.release();
    }
    // (back from a pause: three seconds of count first, the stage and its sounds held)
    resumeLeft = !on && count && !done ? RESUME_COUNT : 0;
    if (on || !resumeLeft) setAudioPaused(on);
    pauseScreen.style.display = on ? 'flex' : 'none';
    if (!on) openPauseSettings(false);
    askExit(false);
    if (!on) paceCard.hush();
    if (!on) {
      last = performance.now();
      settle = 2;
    }
  };

  // the simulation steps at a fixed rate (engine/fixedStep.ts); the car is drawn between its last two steps
  const simClock = fixedClock();
  /** the car where it was before the latest step (undefined: draw it where it is, after a restart) */
  let before: { x: number; y: number; z: number; heading: number }[] | undefined;
  const pose = (car: Car, i: number, alpha: number) => {
    const b = before?.[i];
    return b ? { x: lerp(b.x, car.x, alpha), y: lerp(b.y, car.y, alpha), z: lerp(b.z, car.z, alpha), heading: lerpAngle(b.heading, car.heading, alpha) } : car;
  };
  /** the car's driving events over the latest frame's steps (kept through a frame with none, less its one-off hits) */
  let frameEvents: StepEvents[] = [];
  /** the session on the road: a rally's stage, or the controls lap */
  let session: 'rally' | 'tutorial' = mode;
  /** the controls lap: the prompt you're on, the bends you've been through, and where you were last frame */
  let learn: { o: Onboarding; bends: number; lastIdx: number } | undefined;
  /** TOP-DOWN's way back onto the road (rescue.ts) */
  const rescue = newRescue();
  /** the controls lap's steps (TOP-DOWN's are fewer: onboarding.ts) */
  const lapSteps = stepsFor(style);
  /** the controls lap's bends (their middles, as samples) */
  let tutorApexes: number[] = [];
  /**
   * a rally's stage: the co-driver's notes, the reference run (its time and splits: the rivals' are off it), the splits
   * passed, and once it's over its result (when, your time, your place on it)
   */
  let stage: {
    caller: Caller; reference: { time: number; splits: number[] }; leader: number; rivals: (number | undefined)[]; sector: number;
    /** s behind the stage's quickest crew at the last split (less than 0: ahead); none before the first */
    gap?: number;
    /** your car's health on the line, and whether it's been hit since (a clean stage: no hit, no time added) */
    startHealth: number;
    result?: { at: number; time?: number; place: number; shown: boolean; clean?: boolean };
  } | undefined;
  /** the co-driver on the controls lap too */
  let tutorCaller: Caller | undefined;
  /** your best time on this stage, kept on the device */
  let best = loadStageBests()[bestKey(layout.id, style)];

  /** Your car on the road in your paint, your number on the roof. */
  // (your car's fire light, in the scene from the start: a light coming or going makes every shader compile again, a
  // hitch mid-stage; effects.ts)
  const [fireLight] = makeFireLights(world.scene, 1);
  const addLook = (): CarLook => {
    const mesh: CarMesh = createCarMesh('f1', { ...liveryOf(scheme), helmet: 'gold' }, !!layout.dirt);
    world.scene.add(mesh);
    return { mesh, fx: new CarFx(mesh, fireLight) };
  };
  /** px you've driven since the last 'drive' event, and where your car was last frame; and s on the road since then, not paused (for the play stats) */
  let drivenPx = 0;
  let lastAt: { x: number; y: number } | undefined;
  let drivenSecs = 0;
  /** Note the km driven and the time on the road since the last time (play stats: metrics.ts). */
  const noteDriven = () => {
    if (drivenPx > 0 || drivenSecs >= 1) noteStat('drive', { circuit: layout.id, mode: session, km: kmOf(drivenPx), data: { seconds: Math.round(drivenSecs) } });
    drivenPx = 0;
    drivenSecs = 0;
  };
  /** Clear the road and the screen for a new run. */
  const resetSession = () => {
    noteDriven();
    lastAt = undefined;
    shake = newShake();
    launch = newLaunch();
    driver.reset();
    // (a new run from the pause screen: no count back into it)
    setPaused(false, false);
    resetClock(simClock);
    before = undefined;
    frameEvents = [];
    soundState = { lights: 0, flag: false };
    playMusic(RACE_MUSIC);
    for (const l of looks) world.scene.remove(l.mesh);
    done = false;
    notice = { text: '', color: '', until: 0 };
    skids.clear();
    particles.clear();
    debris.clear();
    paceCard.hush();
    results.style.display = 'none';
  };

  /** seconds of the countdown on the line (five, four… one) before GO */
  const COUNTDOWN = 5;
  /** a rally's stage's reference run, worked out once */
  let stageReference: { time: number; splits: number[] } | undefined;
  /** The car on the line, `lightsOut` s of countdown, your car as the last stage (or the service park) left it. */
  const onTheLine = (lightsOut: number, health: number) => {
    looks = [addLook()];
    const slot = circuit.slots[0];
    race = newRace(track, grid, HANDLING, 1, [{ car: newCar(f1, slot.x, slot.y, slot.heading) }], lightsOut, sessionWeather());
    const car = race.entrants[0].car;
    car.z = groundAt(grid, car.x, car.y).h;
    car.health = car.cls.health * Math.max(0.05, Math.min(1, health));
  };
  /**
   * A rally's stage: you on your own on the line, the countdown, then the road against the clock with the co-driver
   * calling the notes.
   */
  const startStage = () => {
    if (!rallyRun) return;
    session = 'rally';
    learn = undefined;
    resetSession();
    noteStat('race_start', { circuit: layout.id, mode: 'rally', data: { scheme: scheme.id } });
    onTheLine(COUNTDOWN - LIGHTS, rallyRun.rally.health);
    // (the same all through the stage's restarts)
    const slot = circuit.slots[0];
    const reference = (stageReference ??= referenceStage(track, grid, HANDLING, sessionWeather(), slot, f1));
    const rivals = aiStage(rallyRun.rally, rallyRun.stage, reference.time, difficulty).times;
    const leader = Math.min(...rivals.filter((x): x is number => x !== undefined));
    stage = {
      caller: newCaller(paceNotes(track, (layout.jumps ?? []).map((j) => j.at))), reference, leader, rivals, sector: 0, startHealth: race.entrants[you].car.health,
    };
    // (TOP-DOWN: how far along the stage, a bar across the top with the splits on it, in place of KM TO GO)
    if (progressBar()) setProgressMarks(stageSplits(track).map((m) => m / finishAt));
    const k = rallyRun.stage;
    announce(`${tl('SS{n} OF {total}', { n: k + 1, total: rallyEvent(rallyRun.rally).stages.length })} · ${layout.name.toUpperCase()}`, COLOR.gold, 3);
  };
  /** The controls lap: you on the shakedown, off at once, a prompt at a time for the controls. */
  const startTutorial = () => {
    session = 'tutorial';
    stage = undefined;
    resetSession();
    // (no countdown: straight off)
    onTheLine(-LIGHTS, 1);
    learn = { o: newOnboarding(), bends: 0, lastIdx: race.entrants[0].progress.idx };
    tutorCaller = newCaller(paceNotes(track, (layout.jumps ?? []).map((j) => j.at)));
    // (the bends, for the prompts that wait for one: the middle of each the co-driver calls)
    tutorApexes = tutorCaller.notes.filter((n) => n.dir).map((n) => Math.round((n.at + n.end) / 2 / track.spacing));
  };
  /** Your place among the crews at time `x` on the stage, against their times scaled to the same share of it (`share`: of the reference's). */
  const placeAt = (x: number, share: (time: number) => number) =>
    1 + (stage?.rivals.filter((r) => r !== undefined && share(r) < x).length ?? 0);
  /** A stage step: a split at each third (against the stage's quickest crew), and the stage over at the finish or a wreck. */
  const stepStage = () => {
    if (!stage || !rallyRun || stage.result) return;
    const me = race.entrants[you];
    const p = me.progress;
    // no tyre wear on a stage: a fresh set for each one
    me.tyres.wear = 0;
    fitTyres(me.tyres, me.car, race.wetness);
    if (race.phase !== 'racing') return;
    // how far along the road you are, against its splits and its flying finish
    const along = p.idx * track.spacing;
    const marks = stageSplits(track);
    if (stage.sector < marks.length && along >= marks[stage.sector]) {
      const k = stage.sector++;
      const now = race.clock;
      const ref = stage.reference;
      const share = (time: number) => (time * (ref.splits[k] ?? now)) / ref.time;
      const delta = now - share(stage.leader);
      stage.gap = delta;
      announce(`${tl('SPLIT {n}', { n: k + 1 })} · ${fmt(now)} · ${delta < 0 ? '−' : '+'}${Math.abs(delta).toFixed(2)} · P${placeAt(now, share)}`, gapColor(delta < 0), 2.5);
      // (the readout flashes green or red with it)
      flashReadout(gapColor(delta < 0));
    }
    const out = me.car.wrecked || !!p.retired;
    if (along < finishAt && !out) return;
    const time = out ? undefined : race.clock + p.penalty;
    stage.result = { at: race.clock, time, place: 0, shown: false, clean: !out && p.penalty === 0 && me.car.health >= stage.startHealth - 1e-6 };
    done = true;
    paceCard.hush();
    noteDriven();
    // into the rally at once (and kept): the stage is run, whatever happens next
    const r = rallyRun.rally;
    recordStage(r, rallyRun.stage, { time, penalty: p.penalty, health: me.car.wrecked ? 0 : me.car.health / me.car.cls.health }, aiStage(r, rallyRun.stage, stage.reference.time, difficulty));
    if (recordBest(r)) sounds.record();
    saveRally(r);
    const place = stageOrder(r, rallyRun.stage).findIndex((o) => o.crew === r.you) + 1;
    stage.result.place = place;
    noteStat('race_finish', { circuit: layout.id, mode: 'rally', data: { place: time === undefined ? null : place, stage: rallyRun.stage } });
    if (time === undefined) return;
    // your best on this stage
    const kept = recordStageBest(bestKey(layout.id, style), time);
    if (kept.best) {
      best = time;
      if (kept.had !== undefined) {
        announce(`${tl('STAGE BEST {time}', { time: fmt(time) })} · −${(kept.had - time).toFixed(2)}`, splitColor('record'), 1.8);
        sounds.record();
      }
    }
  };
  /** The stage's results: every crew's time, then the rally after it. */
  const showStageResults = () => {
    if (!stage?.result || !rallyRun) return;
    stage.result.shown = true;
    results.style.animation = 'row-in 0.25s ease-out both';
    renderStageResults(results, rallyRun.rally, rallyRun.stage, layout.name);
    results.style.display = 'block';
  };

  if (mode === 'tutorial') startTutorial();
  else startStage();
  /** A restart during the count back from a pause: the count's over (the stage from the line isn't held by it), and its sounds are back. */
  const cancelResumeCount = () => {
    if (!resumeLeft) return;
    resumeLeft = 0;
    setAudioPaused(false);
    last = performance.now();
    settle = 2;
  };
  /** Restart: the stage from the line (not once it's finished: it counts), or the controls lap afresh. */
  const restart = () => {
    if (session !== 'tutorial' && done) return;
    cancelResumeCount();
    if (session === 'tutorial') startTutorial();
    else startStage();
  };

  const seen = new Map<Button, number>();
  /** SELECT was pressed: back once it's released */
  let quitting = false;
  const pressed = (b: Button) => {
    const n = controls.presses(b);
    const edge = n > (seen.get(b) ?? n);
    seen.set(b, n);
    return edge;
  };

  if (new URLSearchParams(window.location.search).has('debug')) {
    Object.assign(window, {
      __cc: {
        circuit: () => layout.id,
        /** hold the picture at a quality level (0 high … 3 minimum), for measuring each */
        quality: (level: number) => {
          governor.level = level;
          governor.locked = true;
          qualityHeld = true;
        },
        /** what the picture costs: the quality level, and the last frame's draw calls and triangles */
        perf: () => ({ level: QUALITY_LEVELS[governor.level].name, locked: governor.locked, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures }),
        /** the count back from a pause (s left; 0: none) */
        resumeLeft: () => resumeLeft,
        /** the next frame fails on purpose: the loop has to carry on past it */
        failFrame: () => (failNext = true),
        phase: () => (done ? 'done' : race.phase),
        clock: () => race.clock,
        paused: () => paused,
        you: () => ({ ...race.entrants[you].progress, speed: speedOf(race.entrants[you].car), health: race.entrants[you].car.health, x: race.entrants[you].car.x, y: race.entrants[you].car.y }),
        /** your car driven by the AI's line at `pace`, for trying out a stage hands-off */
        autopilot: (pace = 0.97) => (race.entrants[you].ai = { lane: 0, pace }),
        /** the middle of the road `px` ahead of your car along it (for steering a test thumb at it) */
        ahead: (px: number) => {
          const n = track.samples.length;
          const q = track.samples[Math.min(n - 1, race.entrants[you].progress.idx + Math.round(px / track.spacing))];
          return { x: q.x, y: q.y };
        },
        /** your car: where, which way, how fast (px/s) */
        me: () => {
          const c = race.entrants[you].car;
          return { x: c.x, y: c.y, heading: c.heading, speed: Math.hypot(c.vx, c.vy), vx: c.vx, vy: c.vy };
        },
        /** a rally's stage: its notes, the reference run, the rivals' times, the next note to call, the card's call, and its result */
        stage: () => stage && { notes: stage.caller.notes.length, next: stage.caller.next, reference: stage.reference, leader: stage.leader, card: paceCard.el.style.display === 'flex' ? paceCard.el.textContent : undefined, result: stage.result },
        /** the controls lap's prompt */
        learn: () => learn && { step: learn.o.step, bends: learn.bends },
        session: () => session,
        /** the camera held on a point of the map (none: back on your car), for looking at the scenery */
        look: (x?: number, y?: number) => (lookAt = x === undefined || y === undefined ? undefined : { x, y }),
        /** set your tyres' wear (0 new … 1 gone) */
        wear: (w: number) => (race.entrants[you].tyres.wear = Math.max(0, Math.min(1, w))),
        feel: () => ({ trauma: shake.trauma, hold: shake.hold, rush: rushNow }),
        /** your start off the line, judged */
        launch: () => ({ ...launch }),
        /** hit your car for `health` (a crash of your own, for trying out the shake and sparks) */
        hitMe: (health: number) => (pendingHit = health),
        /** parts torn off in crashes, flying or lying on the ground now */
        debris: () => debris.count,
        /** the music track playing (or loading) */
        music: () => musicPlaying(),
        skip: (seconds: number) => (race.clock += seconds),
        /** your car moved by (dx, dy) px and turned to `heading`, stopped (off the road, say) */
        put: (dx: number, dy: number, heading: number) => Object.assign(race.entrants[you].car, { x: race.entrants[you].car.x + dx, y: race.entrants[you].car.y + dy, heading, vx: 0, vy: 0, spin: 0 }),
        /** put your car `along` px down the road (less than 0: that far short of the flying finish), going along it at `speed` px/s */
        place: (along: number, speed = 150) => {
          const e = race.entrants[you];
          const idx = Math.max(0, Math.min(track.samples.length - 1, Math.round((along < 0 ? finishAt + along : along) / track.spacing)));
          const q = track.samples[idx];
          Object.assign(e.car, { x: q.x, y: q.y, heading: q.dir, vx: Math.sin(q.dir) * speed, vy: -Math.cos(q.dir) * speed, spin: 0 });
          e.progress = { ...newProgress(idx), lap: e.progress.lap };
        },
      },
    });
  }

  // vibration on or off, from the pause screen (and remembered)
  const rumbleState = newRumble();
  // the settings, from the pause screen: the menu's (but difficulty, not changed mid-stage), each remembered as it
  // changes; tapped and swiped, or up/down and left/right on the deck and A; B (or BACK) up a level, and from the list back to the pause screen
  const pauseSettings = document.createElement('div');
  pauseSettings.className = 'circuit-menu pause-settings';
  Object.assign(pauseSettings.style, { zIndex: '5', display: 'none', justifyContent: 'safe center', background: 'rgba(14,13,22,.9)' });
  /** the settings are up */
  let pauseSettingsOn = false;
  // (laid out as the menu's are: a list of pages, CONTROLS, GAME, SOUND, ACCESSIBILITY, each its rows: settingsRows.ts)
  const pausePages = settingsPages(settingsRows(), () => openPauseSettings(false));
  pauseSettings.append(...pausePages.els);
  host.append(pauseSettings);
  function openPauseSettings(on: boolean) {
    if (on === pauseSettingsOn) return;
    menuPick();
    pauseSettingsOn = on;
    pauseSettings.style.display = on ? 'flex' : 'none';
    // (the pause screen's buttons out of the way under it)
    pauseScreen.style.visibility = on ? 'hidden' : '';
    pausePages.reset();
  }
  // the pause screen's buttons, and in their place once EXIT is pressed, the question: leave? (STAY first)
  const pauseMain = [
    pauseButton('RESUME', () => setPaused(false)),
    pauseButton('RESTART', () => restart()),
    pauseButton('SETTINGS', () => openPauseSettings(true)),
    // a report: the stage as it is (the pause screen out of the picture), to draw on and say what happened (not on
    // YouTube: it goes to the game's own backend)
    ...(YOUTUBE ? [] : [pauseButton('REPORT', () => void openReport({ circuit: layout.id, mode: session }, [pauseScreen]))]),
    pauseButton('EXIT', () => askExit(true)),
  ];
  const exitLine = document.createElement('div');
  Object.assign(exitLine.style, { color: COLOR.muted, font: 'calc(11px * var(--ts, 1)) Silkscreen, monospace', textAlign: 'center', margin: '-4px 16px 6px', textWrap: 'balance' });
  const stayButton = pauseButton('STAY', () => askExit(false));
  const leaveButton = pauseButton('MAIN MENU', () => onQuit());
  Object.assign(leaveButton.style, { borderColor: COLOR.red, color: COLOR.redText });
  // (side by side, STAY on the left, wide enough for MAIN MENU on one line in larger text: as Corner Cutters asks)
  const exitRow = document.createElement('div');
  Object.assign(exitRow.style, { width: '84%', maxWidth: '420px', gap: '10px' });
  for (const b of [stayButton, leaveButton]) Object.assign(b.style, { width: 'auto', flex: '1 1 0', whiteSpace: 'nowrap' });
  exitRow.append(stayButton, leaveButton);
  const exitParts = [exitLine, exitRow];
  const showExitParts = (on: boolean) => {
    for (const el of exitParts) el.style.display = on ? (el === exitRow ? 'flex' : '') : 'none';
  };
  /** EXIT pressed: asked once more (the button the deck's on: 0 STAY, 1 MAIN MENU) */
  let asking = false;
  let exitFocus = 0;
  const showExitFocus = () => {
    stayButton.style.boxShadow = exitFocus === 0 ? `0 0 0 2px ${COLOR.teal}` : '';
    leaveButton.style.boxShadow = exitFocus === 1 ? `0 0 0 2px ${COLOR.redText}` : '';
  };
  /** What leaving loses, said under the question. */
  const exitCost = () => (session === 'tutorial' ? tl('ON TO THE RALLIES') : done ? tl('BACK TO THE RALLY') : tl("THE STAGE WON'T COUNT"));
  function askExit(on: boolean) {
    if (on === asking) return;
    if (on) menuPick();
    asking = on;
    pauseTitle.textContent = !on ? tl('PAUSED') : tl('LEAVE THE STAGE?');
    exitLine.textContent = exitCost();
    for (const el of pauseMain) el.style.display = on ? 'none' : '';
    showExitParts(on);
    exitFocus = 0;
    showExitFocus();
  }
  pauseScreen.append(pauseTitle, ...pauseMain, ...exitParts);
  showExitParts(false);
  // the phone's back button: the pause screen's settings closed, the pause screen resumed, the stage paused; once it's
  // over, on (a stage's results up: on to the rally, as with A)
  const offBack = onBack(() => {
    if (pauseSettingsOn) pausePages.back();
    else if (asking) askExit(false);
    else if (paused) setPaused(false);
    else if (!done) setPaused(true);
    else if (rallyRun && results.style.display === 'block') rallyRun.onDone();
    else onQuit();
    return true;
  });
  // leaving the app or the tab (or YouTube pausing the game: host.ts) pauses the stage; so do Esc and P on a keyboard
  const offHidden = onHidden((hidden) => {
    if (hidden && !done) setPaused(true);
  });
  const onKey = (e: KeyboardEvent) => {
    if (e.repeat || e.target instanceof HTMLInputElement || reportOpen()) return;
    if ((e.code === 'Escape' || e.code === 'KeyP') && !done) setPaused(!paused);
    // (C: the next view)
    if (e.code === 'KeyC' && !paused) cycleView();
  };
  window.addEventListener('keydown', onKey);

  /** The device you're driving with (before you've driven at all: what you last pressed, else a touch screen's touch). */
  const device = (): Device => {
    const d = driver.source();
    if (d === 'touch' || d === 'keys' || d === 'pad') return d;
    const s = controls.lastSource();
    if (s === 'keyboard') return 'keys';
    if (s === 'gamepad') return 'pad';
    return isTouchScreen() ? 'touch' : 'keys';
  };

  /** What each deck button does just now (race/deckLabels.ts). */
  const deckLabels = () => labelsFor({
    settings: pauseSettingsOn, resultsUp: results.style.display === 'block', tutorial: session === 'tutorial', learnt: learn?.o.step === 'done', done, paused,
    // (on a touch screen DRIFT is the driving layer's, not the deck's; TOP-DOWN has none: the brake slides)
    drift: device() !== 'touch' && style !== 'topdown',
  });
  const deckEl = document.getElementById('deck');
  const showDeckLabels = () => {
    // the driving layer while you drive (game.css: #deck.driving), set out as the settings say, its wheel turned
    deckEl?.classList.toggle('driving', !paused && !done && results.style.display !== 'block');
    if (touchDrive) {
      const ds = driveSettings();
      touchDrive.setOptions(ds.side, ds.gas, ds.style, ds.control);
      touchDrive.showWheel(driver.wheelPos());
    }
    const labels = deckLabels();
    for (const k of ['a', 'b', 'start', 'select'] as const) hud.setLabel(k, labels[k]);
    // with the results up, RESTART and EXIT go under the table, big (on a phone: game.css)
    const resultsUp = results.style.display === 'block' && !paused;
    deckEl?.classList.toggle('results-up', resultsUp);
    // (and TUNE and the thumbstick go too while they're up: game.css)
    document.documentElement.classList.toggle('results-up', resultsUp);
    // (the pause screen too: its buttons and settings rows are tapped)
    document.documentElement.classList.toggle('paused', paused);
    // on a phone the results have the screen to themselves (no readout), and the table with the buttons
    // under it sits in the middle of the screen, top to bottom
    const alone = resultsUp && phoneHud;
    readout.style.visibility = alone ? 'hidden' : '';
    if (alone) results.style.top = `${Math.max(8, (host.clientHeight - results.offsetHeight - 64) / 2)}px`;
    else if (results.style.top !== '18%') results.style.top = '18%';
    if (resultsUp) document.documentElement.style.setProperty('--results-bottom', `${results.offsetTop + results.offsetHeight}px`);
  };

  // ---------------------------------------------------------------- loop
  const focus = new THREE.Vector3(race.entrants[you].car.x, 0, race.entrants[you].car.y);
  const target = new THREE.Vector3();
  /** the camera held on a point of the map (a debug hook, for looking at the scenery) */
  let lookAt: { x: number; y: number } | undefined;
  /**
   * The cameras, VIEW in the settings (view.ts; chase, low behind the car, unless another was picked): classic (the
   * HD-2D view, north up), heading (the same, turned with the car so it drives up the screen), road (turned with the
   * road ahead instead, steady through a slide), bonnet (from the front of the car) and iso (a fixed diagonal). One
   * tried out with ?cam= holds until the view is changed in the game.
   */
  const camParam = new URLSearchParams(window.location.search).get('cam');
  let camTry: ViewId | undefined = isView(camParam) ? camParam : undefined;
  // (TOP-DOWN: CLASSIC, always; no camera button, game.css)
  const camMode = (): ViewId => (style === 'topdown' ? 'classic' : camTry ?? viewSetting());
  document.documentElement.classList.toggle('topdown', style === 'topdown');
  /** The next view (the deck's camera button, or C), named on the banner a moment, and remembered (SIM only). */
  const cycleView = () => {
    if (style === 'topdown') return;
    const v = nextView(camMode());
    camTry = undefined;
    setView(v);
    announce(`${tl('VIEW')} · ${tl(v.toUpperCase())}`, COLOR.white, 1.2);
  };
  const viewButton = document.querySelector<HTMLElement>('#deck [data-view]');
  const onViewButton = (e: PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!paused && !done) cycleView();
  };
  viewButton?.addEventListener('pointerdown', onViewButton);
  /** the way a turning camera looks (eased), radians */
  let camYaw: number | undefined;
  /** px the TOP-DOWN camera looks ahead of the car (eased) */
  let topLead = TOP_VIEW.lead / 2;
  /** the way TOP-DOWN's camera frames the road for (radians, eased; style.ts: SIGHT) */
  let sightWay: number | undefined;
  const setFov = (fov: number) => {
    if (camera.fov === fov) return;
    camera.fov = fov;
    camera.updateProjectionMatrix();
  };
  /** the view has been closed: the loop stops */
  let closed = false;
  /** a frame failing on purpose (a debug hook: the loop has to carry on past one) */
  let failNext = false;
  /** the session and phase last noted (the logbook notes each change) */
  let notedPhase = '';
  const frame = (now: number) => {
    if (closed) return;
    // (GRAPHICS: SAVER draws 30 frames a second: a frame too soon after the last is left for the next; `last` stays, so the time adds up)
    if (skipFrame(frameCap(graphicsSetting()), now - last)) {
      requestAnimationFrame(tick);
      return;
    }
    {
      const phase = `${session} ${done ? 'done' : race.phase}`;
      if (phase !== notedPhase) note((notedPhase = phase));
    }
    if (failNext) {
      failNext = false;
      throw new Error('debug: a frame failing');
    }
    // (the first frame's timestamp can be a touch before mount time)
    const real = Math.max(0, (now - last) / 1000);
    const dt = Math.min(0.05, real);
    last = now;
    // (the time on the road as it passes, slow frames and all; a gap of more than a second is the tab put away)
    if (!paused && !resumeLeft && real < 1) drivenSecs += real;
    if (resumeLeft > 0) {
      resumeLeft = Math.max(0, resumeLeft - Math.min(real, 0.1));
      if (!resumeLeft) {
        setAudioPaused(false);
        last = now;
        settle = 2;
      }
    }
    showDeckLabels();
    // (a report being made: the deck and keys are its, not the stage's)
    if (reportOpen()) {
      // (the presses meanwhile seen, so none fires here once it's closed)
      for (const b of ['up', 'down', 'left', 'right', 'a', 'b', 'start', 'select'] as const) pressed(b);
      requestAnimationFrame(tick);
      return;
    }
    // the pause screen's settings: the deck moves through them (and nothing else)
    if (pauseSettingsOn) {
      const [up, down, left, right, a, b, start] = (['up', 'down', 'left', 'right', 'a', 'b', 'start'] as const).map(pressed);
      pressed('select');
      if (up || down) pausePages.move(down ? 1 : -1);
      if (left || right) pausePages.step(right ? 1 : -1);
      if (b) pausePages.back();
      else if (a || start) pausePages.pick();
      requestAnimationFrame(tick);
      return;
    }
    if (asking) {
      // leave? left/right (or up/down) moves between STAY and MAIN MENU, A or START picks, B stays, SELECT again leaves
      const [up, down, left, right, a, b, start, select] = (['up', 'down', 'left', 'right', 'a', 'b', 'start', 'select'] as const).map(pressed);
      if (up || down || left || right) {
        exitFocus = 1 - exitFocus;
        menuTick();
        showExitFocus();
      }
      if (b) askExit(false);
      else if (select || ((a || start) && exitFocus === 1)) quitting = true;
      else if (a || start) askExit(false);
      if (quitting && !controls.isDown('select') && !controls.isDown('a') && !controls.isDown('start')) {
        quitting = false;
        onQuit();
        return;
      }
      requestAnimationFrame(tick);
      return;
    }
    const startPressed = pressed('start');
    // (SELECT pauses while driving, as its label says; otherwise it exits)
    const selectPauses = deckLabels().select === 'PAUSE';
    const aPressed = pressed('a');
    // a rally's stage, over: its results (at once, at A), then on to the rally's screen
    if (rallyRun && done && (aPressed || startPressed)) {
      if (results.style.display === 'block') rallyRun.onDone();
      else showStageResults();
    }
    // the controls lap: A skips it, or once it's done goes on to the rallies
    else if (aPressed && session === 'tutorial') onQuit();
    else if (startPressed && !done) restart();
    else if (aPressed && !done) setPaused(!paused);
    // SELECT pauses while driving; otherwise it goes back once it's let go: leaving the page with a finger still down
    // can leave the next page deaf to touch on a phone
    if (pressed('select')) {
      if (selectPauses) setPaused(true);
      // (paused: asked first, as the pause screen's EXIT asks)
      else if (paused && !done) askExit(true);
      else quitting = true;
    }
    if (quitting && !controls.isDown('select')) {
      quitting = false;
      onQuit();
    }
    // paused, or counting back in from a pause: nothing moves, and the last frame stays on the screen
    if (paused || resumeLeft > 0) {
      // (the count back onto the stage: 3, 2, 1, over the still picture)
      if (!paused && resumeLeft > 0) {
        showBanner(String(Math.ceil(resumeLeft)));
        banner.style.color = COLOR.gold;
        banner.style.fontSize = 'calc(64px * var(--ts, 1))';
      }
      // (a screenshot waiting for a frame, the report's: the still picture drawn again for it)
      if (frameWanted()) {
        const q = QUALITY_LEVELS[governor.level];
        post.render(0, { bloom: LOOK.bloom, blur: LOOK.blur, bloomOn: q.bloom, blurOn: q.blur });
      }
      requestAnimationFrame(tick);
      return;
    }

    // the stage: you drive, the rules run
    // what you're asking for, from whatever you drove with last (src/engine/drive/)
    driver.sample();
    /** the road a little ahead of your car (further the faster it goes), and how far right of its middle the car is: for the assist */
    const roadAhead = (car: Car) => {
      const at = race.entrants[you].progress.idx;
      const ahead = Math.min(track.samples.length - 1, at + 6 + Math.round((Math.max(0, forwardSpeed(car)) * 0.35) / track.spacing));
      return { dir: track.samples[ahead].dir, lateral: lateralOffset(track, at, car.x, car.y), safe: safeAt(at, car.tyreGrip) };
    };
    /** your car's input for one fixed step */
    const driveInput = (car: Car): DriveInput => driver.step(car, SIM_DT, roadAhead(car));
    /** past the flying finish (or the controls lap's end): on the brakes to the stop */
    const pastFinish = () => done || race.entrants[you].progress.idx * track.spacing >= finishAt;
    // the start: going in the last of the countdown is a jump start; after GO, your reaction is judged
    if (session === 'rally') {
      const car = race.entrants[you].car;
      // (with GAS on AUTO the gas is on from before GO: an ordinary start, never a jump start nor a launch)
      const gas = driver.intent().throttle;
      const verdict = stepLaunch(launch, race.phase === 'lights' && race.clock >= 0, race.phase === 'racing' ? race.clock : undefined, gas);
      if (verdict === 'jump') {
        race.entrants[you].progress.penalty += LAUNCH.jumpPenalty;
        announce(tl('JUMP START · +{n} S', { n: LAUNCH.jumpPenalty }), COLOR.red, 3);
      } else if (verdict && verdict !== 'slow') {
        const kick = kickOf(verdict);
        car.vx += Math.sin(car.heading) * kick;
        car.vy -= Math.cos(car.heading) * kick;
        announce(tl(verdict === 'great' ? 'GREAT LAUNCH · {time} S' : 'GOOD LAUNCH · {time} S', { time: launch.reaction!.toFixed(2) }), verdict === 'great' ? '#b36bff' : COLOR.teal, 2);
      }
    }
    const healthBefore = race.entrants[you].car.health;
    // (the debug hook's hit, dealt inside the frame so the frame feels it)
    if (pendingHit) {
      applyDamage(race.entrants[you].car, pendingHit, HANDLING);
      pendingHit = 0;
    }
    // the stage runs in fixed steps: as many as this frame's time holds (none, one, or a few)
    // (through a big hit's hit-stop, at a crawl)
    const { steps, alpha } = advance(simClock, dt * timeScale(shake));
    const raceEvents: RaceEvent[] = [];
    const cars: StepEvents[] = race.entrants.map(() => ({ damage: 0, skidding: false, wreckedNow: false, onRough: false, airborne: false, landed: 0, impact: 0, scrape: 0, rolledNow: false, rolling: false }));
    /** on the brakes, straight on, and stopped there (never backing up) */
    const brakes = (): DriveInput => ({ wheel: { turn: 0, gas: 0, reverse: false }, brake: true, handbrake: false });
    /** past the flying finish: on down the road, easing down to a stop at the stop control (out of the stage: just the brakes) */
    const toTheStop = (e: Entrant) => {
      const left = stopLine - e.progress.idx * track.spacing;
      if (done && !stage?.result) return brakes();
      if (left <= 4) return brakes();
      return aiInput(e.car, track, e.progress.idx, { lane: 0, pace: 0.7 }, [], { limit: Math.sqrt(2 * STOP_DECEL * left) });
    };
    for (let k = 0; k < steps; k++) {
      before = race.entrants.map((e) => ({ x: e.car.x, y: e.car.y, z: e.car.z, heading: e.car.heading }));
      const s = stepRace(race, SIM_DT, (e) => (pastFinish() ? toTheStop(e) : driveInput(e.car)));
      raceEvents.push(...s.race);
      s.cars.forEach((ev, i) => {
        const m = cars[i];
        m.damage += ev.damage;
        m.skidding ||= ev.skidding;
        m.wreckedNow ||= ev.wreckedNow;
        m.onRough ||= ev.onRough;
        m.airborne ||= ev.airborne;
        m.landed = Math.max(m.landed, ev.landed);
      });
      if (stage) stepStage();
    }
    // a frame between steps (a screen faster than the simulation) carries on the last one's skids and ground
    if (steps === 0) frameEvents.forEach((ev, i) => cars[i] && Object.assign(cars[i], { skidding: ev.skidding, onRough: ev.onRough, airborne: ev.airborne }));
    frameEvents = cars;
    // the controls lap: the prompt moves on as you do each thing; a wreck starts it again
    if (learn) {
      const me = race.entrants[you];
      const p = me.progress;
      me.tyres.wear = 0;
      fitTyres(me.tyres, me.car, race.wetness);
      learn.bends += apexesPassed(tutorApexes, learn.lastIdx, p.idx, track.samples.length);
      learn.lastIdx = p.idx;
      const facts = { speed: speedOf(me.car), top: me.car.cls.topSpeed, bends: learn.bends, drifting: driver.intent().handbrake, canDrift: true, lapDone: pastFinish() };
      if (nextPrompt(learn.o, facts, lapSteps)) sounds.record();
      if (me.car.wrecked) startTutorial();
    }
    const me = race.entrants[you];
    const p = me.progress;
    // TOP-DOWN: stopped off the road a while, back on it where you left it, facing down it, at a cost (rescue.ts)
    if (style === 'topdown' && race.phase === 'racing' && steps > 0 && !pastFinish() && !me.car.wrecked && running(me)) {
      const out = lateralOffset(track, p.idx, me.car.x, me.car.y);
      if (stepRescue(rescue, out, speedOf(me.car), steps * SIM_DT)) {
        const q = track.samples[p.idx];
        Object.assign(me.car, { x: q.x, y: q.y, heading: q.dir, vx: 0, vy: 0, spin: 0 });
        me.car.z = groundAt(grid, q.x, q.y).h;
        before = undefined;
        driver.reset();
        if (session === 'rally') p.penalty += RESCUE.cost;
        announce(session === 'rally' ? tl('BACK ON THE ROAD · +{n} S', { n: RESCUE.cost }) : 'BACK ON THE ROAD', COLOR.gold, 2);
      }
    }
    // your car's vibration: crashes, landings, rough ground, kerbs
    {
      const ev = cars[you];
      const cell = circuit.cells[Math.floor(me.car.y / TILE) * circuit.width + Math.floor(me.car.x / TILE)];
      const felt = {
        dt, speed: speedOf(me.car), topSpeed: me.car.cls.topSpeed, healthLost: healthBefore - me.car.health,
        wreckedNow: ev.wreckedNow, landed: ev.landed, onRough: ev.onRough, onKerb: cell === 'kerb',
      };
      vibrate(rumble(rumbleState, felt));
      // and the camera's shake (not once you're out)
      stepShake(shake, !running(me) ? { ...felt, healthLost: 0, wreckedNow: false, landed: 0, onRough: false, onKerb: false } : felt);
      // and its sounds: the engine, tyres, ground, and hits
      const lost = healthBefore - me.car.health;
      if (ev.wreckedNow) sounds.hit(1);
      else if (lost > 0.5) sounds.hit(Math.min(1, 0.25 + lost / 15));
      // (and the scrape of metal with the sparks)
      if (lost > 0.5 || ev.landed > 160) sounds.scrape(Math.min(1, 0.3 + Math.max(lost, 0) / 10));
      // (a scrape along a tree or rock: quieter the gentler it is)
      else if (ev.scrape > 60 && Math.random() < dt * 6) sounds.scrape(Math.min(0.5, ev.scrape / 600));
      if (!running(me) || me.car.wrecked) sounds.quiet();
      else {
        const f = { x: Math.sin(me.car.heading), y: -Math.cos(me.car.heading) };
        sounds.update({
          dt, speed: speedOf(me.car), top: me.car.cls.topSpeed, slide: Math.abs(me.car.vx * -f.y + me.car.vy * f.x),
          onRough: ev.onRough, onKerb: cell === 'kerb', onGravel: cell === 'gravel',
        });
      }
    }
    for (const e of raceEvents) {
      if (e.kind === 'lights-out') sounds.go();
      else if (e.kind === 'roll' && e.who === you) {
        announce('ROLLED IT!', COLOR.red, 2);
        sounds.hit(0.8);
      }
      // a big crash tears the bumper off (the car keeps going, if it can); a wreck loses a wheel or two as well
      else if (e.kind === 'crash') {
        const { nose, wheels } = looks[e.who].mesh.userData.parts;
        const power = e.wrecked ? 1 : Math.min(1, e.hit * 1.5);
        debris.tear(nose, race.clock, e.vx, e.vy, power);
        if (e.wrecked) {
          const first = Math.floor(Math.random() * 4);
          const lost = Math.random() < 0.5 ? [first] : [first, (first + 1 + Math.floor(Math.random() * 3)) % 4];
          for (const k of lost) debris.tear(wheels[k], race.clock, e.vx, e.vy, power, onItsSide);
        }
      } else if (e.kind === 'rain') announce(e.on ? tl('RAIN · THE ROAD IS GETTING WET') : tl('THE RAIN HAS STOPPED'), COLOR.sky, 2.5);
      else if (e.kind === 'track' && race.clock >= notice.until) announce(`${tl('ROAD {state}', { state: tl(e.condition.toUpperCase()) })} · ${tl(COMPOUNDS[tyreFor(e.condition, race.track.dirt)].name)}`, COLOR.sky, 2);
    }
    // your car (race/drawCars.ts)
    drawCars({ race, looks, events: cars, track, grid, skids, particles, pose: (i) => pose(race.entrants[i].car, i, alpha), dt });
    const clock = race.clock;
    // (the km you drive: your car's way, live, between frames; not a jump of a restart)
    {
      const c = me.car;
      if (lastAt) {
        const d = Math.hypot(c.x - lastAt.x, c.y - lastAt.y);
        if (d < 400) drivenPx += d;
      }
      lastAt = { x: c.x, y: c.y };
    }
    // your flag at the flying finish: big over the picture for a few seconds
    const flagAt = stage?.result && stage.result.time !== undefined ? stage.result.at : undefined;
    const yourFlag = flagAt !== undefined && clock < flagAt + 3.5 && results.style.display !== 'block';
    flagOverlay.el.style.display = yourFlag ? 'block' : 'none';
    if (yourFlag) flagOverlay.draw(performance.now() / 1000);
    if (flagAt !== undefined && !soundState.flag) {
      soundState.flag = true;
      sounds.flag();
      // the stage's music gives way to the menu's, after your flag
      playMusic(MENU_MUSIC, 3);
    }
    // (a rally's stage: its results a few seconds after the finish)
    if (stage?.result && !stage.result.shown && clock >= stage.result.at + 3) showStageResults();
    // the co-driver: each note called far enough ahead of it, at your speed
    const caller = stage?.caller ?? tutorCaller;
    if (caller && !done && race.phase === 'racing' && running(me)) {
      const call = stepCaller(caller, p.idx * track.spacing, speedOf(me.car));
      // (the card's arrow drawn the way the bend goes on the screen, in a view that doesn't turn with the car)
      if (call) paceCard.call(call, clock, screenFacing(lookAt ? 'classic' : camMode()));
    }
    paceCard.update(clock, done);
    const bar = progressBar();
    hud.setPosition(bar ? '' : rallyRun ? `SS${rallyRun.stage + 1}/${rallyEvent(rallyRun.rally).stages.length}` : tl('SHAKEDOWN'));
    hud.setLap(learn ? `${Math.min(lapSteps.length - 1, lapSteps.indexOf(learn.o.step) + 1)}/${lapSteps.length - 1}`
      : stage?.result ? (stage.result.time === undefined ? tl('DNF') : `P${stage.result.place}`)
      : race.phase === 'lights' ? tl('ON THE LINE')
      // (with the bar up, the stage's number; without it, the km to go)
      : bar && rallyRun ? tl('SS{n} OF {total}', { n: rallyRun.stage + 1, total: rallyEvent(rallyRun.rally).stages.length })
      : tl('{km} KM TO GO', { km: Math.max(0, kmOf(finishAt - p.idx * track.spacing)).toFixed(1) }));
    if (bar) setProgress((p.idx * track.spacing) / finishAt);
    // the banner: the countdown, GO!, then the most urgent message
    crewCard.style.opacity = race.phase === 'lights' ? '1' : '0';
    if (race.phase === 'lights') {
      // the countdown on the line: five, four… one, then GO
      const left = Math.max(1, Math.ceil(race.lightsOut - clock));
      if (left <= COUNTDOWN && left < (soundState.lights || COUNTDOWN + 1)) {
        sounds.light();
        soundState.lights = left;
      }
      banner.textContent = left <= COUNTDOWN ? String(left) : '';
      // (and the start clock beside the line, its lights going out with it)
      world.setStartClock(left <= COUNTDOWN ? left : null);
      banner.style.color = left <= 1 ? COLOR.gold : COLOR.white;
      // (big: the one thing to watch on the line)
      banner.style.fontSize = 'calc(64px * var(--ts, 1))';
    } else {
      banner.style.fontSize = '';
      const state = {
        out: me.car.wrecked || !!p.retired, done, finishedPlace: stage?.result?.place || undefined, clean: stage?.result?.clean, resultsUp: results.style.display === 'block',
        wrongWay: p.wrongWay, clock, notice,
        learn: learn && { text: prompt(learn.o.step, device(), driveSettings().gas, style, driveSettings().control), last: learn.o.step === 'done' },
      };
      const [text, color] = bannerMessage(state);
      showBanner(text);
      banner.style.color = color;
      // (the controls lap's prompt in its own slot, over the driving it's about)
      const [said, tone] = lessonMessage(state);
      if (lesson.dataset.text !== said) {
        lesson.dataset.text = said;
        // (a phrase a line, at its ' · ': race/banner.ts)
        lesson.replaceChildren(...evenLines(said).split('\n').map((row) => Object.assign(document.createElement('div'), { textContent: row })));
      }
      lesson.style.display = said && !paused ? 'block' : 'none';
      lesson.style.color = tone;
    }
    const stageTime = stage?.result ? stage.result.time : race.phase === 'racing' && !done ? clock : undefined;
    const health = me.car.health / me.car.cls.health;
    if (style === 'topdown') {
      // (TOP-DOWN's: the clock, the gap at the last split, your car; no tyres: you never pick them)
      paintRows(mainLines, topDownReadout({ time: stageTime, gap: stage?.gap, splits: !!stage, health, wrecked: me.car.wrecked }));
      paintRows(tyreLine, '');
    } else {
      paintRows(mainLines, readoutText({ time: stageTime, best, health, wrecked: me.car.wrecked }));
      paintRows(tyreLine, tyreText(COMPOUNDS[me.tyres.compound].short, me.tyres.wear, !phoneHud));
      tyreLine.style.color = COMPOUNDS[me.tyres.compound].color;
    }

    particles.update(dt);
    debris.update(race.clock, (x, z) => groundAt(grid, x, z).h);
    rain.draw(dt, race.rain);
    {
      // (the way the car's going, on the screen: the ground's y is foreshortened by the camera's pitch)
      const c = me.car;
      const sy = c.vy * Math.sin(deg(LOOK.pitch));
      const len = Math.hypot(c.vx, sy) || 1;
      // (none for a device asking for less motion)
      streaks.draw(dt, calm() ? 0 : rushNow, c.vx / len, sy / len);
    }
    skids.update(dt);

    // camera: follow your car, looking ahead along its motion
    const c = me.car;
    const drawn = pose(c, you, alpha);
    // (TOP-DOWN's framing, for the way the car's going, eased: style.ts)
    const moving = speedOf(c) > 30;
    const way = moving ? Math.atan2(c.vx, -c.vy) : c.heading;
    // (snapped to it after a restart)
    sightWay = sightWay === undefined || !before ? way : lerpAngle(sightWay, way, 1 - Math.exp(-dt / SIGHT.ease));
    const framing = topDownFraming(Math.sin(sightWay), -Math.cos(sightWay), { width: viewW, height: viewH, desktop }, c.cls.topSpeed);
    if (lookAt) {
      // (the debug hook's: the camera on a point of the map)
      target.set(lookAt.x, groundAt(grid, lookAt.x, lookAt.y).h, lookAt.y);
      focus.copy(target);
    } else {
      // (TOP-DOWN looks further ahead: further still, and pulled back, with the road running across or down the screen)
      const lead = style === 'topdown' ? framing.lead : t.lead;
      target.set(drawn.x + (c.vx / c.cls.topSpeed) * lead, drawn.z * 0.5, drawn.y + (c.vy / c.cls.topSpeed) * lead);
    }
    focus.lerp(target, 1 - Math.exp(-dt * 6));
    const pitch = deg(LOOK.pitch);
    // (the rush of speed pulls the camera back a touch)
    const rushWant = running(me) ? rushOf(speedOf(me.car), me.car.cls.topSpeed) : 0;
    rushNow += (rushWant - rushNow) * Math.min(1, dt * 3);
    // (TOP-DOWN's pulled back further)
    const dist = (viewH / (2 * Math.tan(deg(LOOK.fov / 2))) / (style === 'topdown' ? framing.zoom : t.zoom)) * (1 + RUSH.pullBack * rushNow);
    // (the chase camera, or another tried out with ?cam=: CAMERAS; held on a point of the map, the classic view)
    const mode = lookAt ? 'classic' : camMode();
    if (mode === 'classic') {
      setFov(LOOK.fov);
      camera.up.set(0, 0, -1);
      camera.position.set(focus.x, focus.y + Math.sin(pitch) * dist, focus.z + Math.cos(pitch) * dist);
      camera.lookAt(focus.x, focus.y, focus.z);
      camYaw = undefined;
    } else {
      camera.up.set(0, 1, 0);
      // the way the view looks: the car's heading (eased), the road's a little ahead, or a fixed diagonal
      const n = track.samples.length;
      const roadAhead = track.samples[track.open ? Math.min(n - 1, p.idx + 25) : (p.idx + 25) % n].dir;
      const want = mode === 'road' || mode === 'top' ? roadAhead : mode === 'iso' ? -Math.PI / 4 : drawn.heading;
      camYaw = camYaw === undefined ? want : lerpAngle(camYaw, want, 1 - Math.exp(-dt * (mode === 'chase' ? 2.5 : 3)));
      const fx = Math.sin(camYaw);
      const fz = -Math.cos(camYaw);
      if (mode === 'bonnet') {
        // on the front of the car, looking down the road
        setFov(62);
        const hx = Math.sin(drawn.heading);
        const hz = -Math.cos(drawn.heading);
        camera.position.set(drawn.x + hx * 17, drawn.z + 11, drawn.y + hz * 17);
        camera.lookAt(drawn.x + hx * 260, drawn.z + 2, drawn.y + hz * 260);
      } else if (mode === 'top') {
        // high, turned with the road, looking well ahead of the car (further the faster), so it sits low on the screen
        setFov(LOOK.fov);
        const pp = deg(TOP_VIEW.pitch);
        const d = (viewH / (2 * Math.tan(deg(LOOK.fov / 2))) / TOP_VIEW.zoom) * (1 + RUSH.pullBack * rushNow);
        const ahead = TOP_VIEW.lead * (0.5 + 0.5 * Math.min(1, speedOf(c) / c.cls.topSpeed));
        topLead += (ahead - topLead) * Math.min(1, dt * 2);
        const aim = { x: drawn.x + fx * topLead, y: drawn.z * 0.5, z: drawn.y + fz * topLead };
        camera.position.set(aim.x - fx * Math.cos(pp) * d, aim.y + Math.sin(pp) * d, aim.z - fz * Math.cos(pp) * d);
        camera.lookAt(aim.x, aim.y, aim.z);
      } else {
        const chase = mode === 'chase';
        setFov(chase ? 50 : LOOK.fov);
        const pp = chase ? deg(20) : mode === 'iso' ? deg(42) : pitch;
        const d = chase ? 130 / t.zoom : dist;
        const aim = chase ? { x: drawn.x + fx * 50, y: drawn.z + 6, z: drawn.y + fz * 50 } : focus;
        camera.position.set(aim.x - fx * Math.cos(pp) * d, aim.y + Math.sin(pp) * d, aim.z - fz * Math.cos(pp) * d);
        camera.lookAt(aim.x, aim.y, aim.z);
      }
    }
    // the shake: the camera moved across and up its own view (SCREEN SHAKE off in the settings: still)
    if (shakeOn()) {
      const o = shakeOffset(shake);
      camera.translateX(o.x);
      camera.translateY(o.y);
    }
    world.followSun(focus);
    if (race.phase === 'racing') world.setStartClock(undefined);
    world.animate(performance.now() / 1000, race.entrants.filter(running).map((e) => e.car));
    // the weather's look, eased as the road wets and dries and the rain comes and goes (redone only as it changes)
    if (Math.abs(race.wetness - shownLook.wetness) > 0.02 || Math.abs(race.rain - shownLook.rain) > 0.02) {
      shownLook = { wetness: race.wetness, rain: race.rain };
      const look = weatherLook(race.wetness, race.rain);
      world.setSky(look.sky);
      world.setGroundTint(look.groundTint);
      sounds.setRain(race.rain);
    }

    // (GRAPHICS: HIGH and LOW hold their level, whatever the frame rate: the governor's watch is over and nothing is kept)
    const held = heldLevel(graphicsSetting());
    if (held !== undefined) {
      governor.level = held;
      governor.locked = true;
    } else if (wasHeld && !qualityHeld) {
      // (back to AUTO: the governor watches again, from full quality)
      governor.level = 0;
      governor.locked = false;
    }
    wasHeld = held !== undefined;
    if (held !== undefined) {
      // nothing to sample
    } else if (settle > 0) settle--;
    // (the frame's real length, not the simulation's capped one: at 5 fps the capped time ran the governor's waits four times too long)
    else governor.sample(Math.min(real, 0.25));
    if (!qualityHeld && !wasHeld && (governor.level !== keptLevel.level || governor.locked !== keptLevel.locked)) {
      keptLevel = { level: governor.level, locked: governor.locked };
      saveValue('device', 'quality', { ...keptLevel, at: Date.now(), version: gameVersion });
    }
    setQuality(QUALITY_LEVELS[governor.level].name);
    const q = QUALITY_LEVELS[governor.level];
    // (the pause menus' blur is a cost on a phone already at the lowest level: they go darker instead, game.css)
    document.documentElement.classList.toggle('no-pause-blur', governor.level >= QUALITY_LEVELS.length - 1);
    applySize();
    world.setShadowMapSize(q.shadowMap);
    // (the frame's draw calls counted across all the passes, not just the last: for __cc.perf)
    renderer.info.reset();
    post.render(dt, { bloom: LOOK.bloom, blur: LOOK.blur, bloomOn: q.bloom, blurOn: q.blur });
    requestAnimationFrame(tick);
  };
  /** errors in the stage's frames (reported, the first few) */
  let failures = 0;
  /**
   * A frame of the stage, carried on past one that fails: the next is asked for at the end of each, so an error
   * partway through one would stop the loop for good (the picture frozen, every button deaf). The error's still
   * reported (the crash reports: crashes.ts), the first few.
   */
  const tick = (now: number) => {
    try {
      frame(now);
    } catch (e) {
      if (!closed) requestAnimationFrame(tick);
      if (failures++ < 3)
        setTimeout(() => {
          throw e;
        });
    }
  };
  // where you are on the stage, for a freeze or slow stretch reported mid-stage (crashes.ts)
  setRaceSpot(() => {
    const me = race.entrants[you];
    const around = Math.round(((me.progress.idx * track.spacing) / Math.max(1, finishAt)) * 100);
    return [`${session}${race.phase === 'lights' ? ' (countdown)' : ''}`, `${Math.min(100, around)}% down the stage`, `${Math.round(speedOf(me.car))} px/s`].join(' · ');
  });
  // one frame drawn now, behind the loading card, of the whole scene: the first draw of a scene compiles its shaders
  // and sends its meshes and textures to the graphics chip, seconds on a slow phone, which fell after the curtain lifted
  try {
    const q = QUALITY_LEVELS[governor.level];
    const had = renderer.info.programs?.length ?? 0;
    const from = performance.now();
    drawWhole(world.scene, () => post.render(0, { bloom: LOOK.bloom, blur: LOOK.blur, bloomOn: q.bloom, blurOn: q.blur }));
    // (for the logbook: how long the first draw took, and how many of its shaders were new to the renderer)
    note(`first draw ${Math.round(performance.now() - from)} ms, ${(renderer.info.programs?.length ?? 0) - had} shaders compiled, ${had} kept`);
  } catch {
    // (a frame that fails here fails in the loop too, which reports it)
  }
  requestAnimationFrame(tick);

  const dispose = () => {
    if (closed) return;
    closed = true;
    setRaceSpot(undefined);
    // (each part let go even if one before it fails: a stage half closed would keep the back button and its overlays,
    // and the next screen would open under them; the first failure is thrown once the rest are done)
    let failed: unknown;
    const step = (f: () => void) => {
      try {
        f();
      } catch (e) {
        failed ??= e;
      }
    };
    step(noteDriven);
    step(offHidden);
    step(() => window.removeEventListener('keydown', onKey));
    step(() => viewButton?.removeEventListener('pointerdown', onViewButton));
    step(() => setAudioPaused(false));
    step(() => sounds.dispose());
    step(() => paceCard.hush());
    step(offBack);
    for (const el of [cardSlot, streaks.el, rain.el, readout, progress, banner, lesson, results, crewCard, pauseScreen, pauseSettings, flagOverlay.el]) step(() => el.remove());
    step(() => {
      deckEl?.classList.remove('results-up');
      deckEl?.classList.remove('driving');
    });
    step(() => touchDrive?.dispose());
    step(() => keyDrive.dispose());
    step(() => document.documentElement.classList.remove('results-up', 'paused', 'dirt', 'topdown', 'no-pause-blur'));
    delete (window as { __cc?: unknown }).__cc;
    // the renderer given back for the next screen (its canvas out of the page, its compiled shaders kept), then
    // everything of this stage's on the GPU: the scene's meshes, materials and textures
    step(() => canvasEvents.abort());
    step(() => returnView(view));
    step(() => disposeDeep(world.scene));
    if (failed !== undefined) throw failed;
  };
  return { resize, dispose };
};

