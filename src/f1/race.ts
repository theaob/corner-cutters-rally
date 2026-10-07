// A rally stage: you on your own on a long road, against the clock. The
// countdown on the line (5, 4, 3, 2, 1), then GO; the co-driver calling every
// bend; a split at each third against the stage's quickest crew; the flying
// finish, the car braking to the stop past it; then the stage's times and the
// rally's standings (rally.ts). Or the controls lap: a new player on the
// shakedown, a prompt at a time for the controls. A pauses (so does leaving the
// app or tab); START restarts a stage not yet finished; SELECT goes back.

import * as THREE from 'three';
import type { Button, Drive } from '../engine/controls';
import { applyDamage, carClass, newCar, speedOf, type Car, type DriveInput, type StepEvents } from '../engine/driving';
import { SIM_DT, advance, fixedClock, lerp, lerpAngle, resetClock } from '../engine/fixedStep';
import { groundAt } from '../engine/sim';
import { aiInput, autoWheel, keysWheel, newProgress, lineCornerSpeed, lineDecel, playerInput, stageSplits, steerToward, stickWheel, tapWheel, wheelInput } from './racing';
import { stopAt } from './stageDressing';
import { NORMAL, handlingFor, type Difficulty } from './difficulty';
import { DRY, lookAt as weatherLook, type Weather } from './weather';
import { conditionOf, fixedForecast } from './forecast';
import { COMPOUNDS, fitTyres, tyreFor } from './tyres';
import { advance as nextPrompt, apexesPassed, newOnboarding, prompt, STEPS, type Device, type Onboarding } from './onboarding';
import { autoThrottle, howOn, touchDrifts, touchScheme } from './driveStyle';
import { askTilt, tiltNow, tiltTurn } from '../engine/tilt';
import { showSliderTurn } from '../engine/deck';
import { LIGHTS, newRace, running, stepRace, type Entrant, type Race, type RaceEvent } from './raceControl';
import { createCarMesh, type CarMesh } from '../engine/render/vehicles3d';
import { CarFx, DebrisLayer, Particles, SkidLayer } from '../engine/render/effects';
import { Hd2dPipeline } from '../engine/render/hd2d';
import { HD2D_VIEW } from '../engine/look';
import { QUALITY_LEVELS, QualityGovernor } from '../engine/render/quality';
import type { ScreenFit } from '../engine/layout';
import { loadVehicleEdits } from '../engine/vehicleEdits';
import type { MountStandalone } from '../engine/view';
import { defaults } from '../engine/tuning';
import { TILE, buildCircuit } from './circuit';
import { vibrate } from '../engine/haptics';
import { newRumble, rumble } from './rumble';
import { RUSH, newShake, rushOf, shakeOffset, shakeOn, stepShake, timeScale } from './shake';
import { RaceSounds, menuPick, menuTick } from './sounds';
import { onBack } from '../engine/backButton';
import { menuButton } from './menu';
import { settingsRows, versionLine } from './settingsRows';
import { LAUNCH, kickOf, newLaunch, stepLaunch } from './launch';
import { setAudioPaused } from '../engine/audio';
import { musicPlaying, playMusic } from '../engine/music';
import { MENU_MUSIC, RACE_MUSIC } from './music';
import type { CircuitLayout } from './layouts';
import { createCircuitScene } from './circuitScene';
import { createHud } from './race/hud';
import { kmOf, track as noteStat } from './metrics';
import { drawCars, type CarLook } from './race/drawCars';
import { readoutText, tyreText } from './race/readout';
import { paintRows } from './race/readoutView';
import { bannerMessage, evenLines } from './race/banner';
import { motionReduced, splitColor } from './access';
import { deckLabels as labelsFor } from './race/deckLabels';
import { createFlagOverlay, createRain, createStreaks } from './race/screenFx';
import { F1_TUNING } from './tuning';
import { openReport, reportOpen } from './report';
import { frameWanted } from '../engine/render/capture';
import { YOUTUBE, onHidden } from '../engine/host';
import { aiStage, loadStageBests, rallyEvent, recordBest, recordStage, recordStageBest, referenceStage, saveRally, stageOrder, type Rally } from './rally';
import { newCaller, paceNotes, stepCaller, type Caller } from './paceNotes';
import { createPaceCard, renderStageResults } from './race/rallyView';
import { formatTime as fmt } from './time';
import { SCHEMES, liveryOf, type Scheme } from './crews';

type F1Tuning = Record<keyof typeof F1_TUNING, number>;
const deg = THREE.MathUtils.degToRad;
const LOOK = HD2D_VIEW;
/** POINT's aim: how far from your car on the screen the stick points (a share of the screen's height), and px on the
 * ground past which a spot is too near the horizon to aim at */
const AIM = { reach: 0.22, far: 1500 };

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
  const f1 = carClass('f1');
  // the difficulty sets how much a crash costs and how quick the rival crews are
  const HANDLING = handlingFor(difficulty);
  // the racing line: flat out wherever the car can follow the bend
  const circuit = buildCircuit(layout, { cornerSpeed: lineCornerSpeed(f1, HANDLING), decel: lineDecel(f1) });
  // (on dirt, the touch deck has a DRIFT button too: index.html)
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
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  Object.assign(renderer.domElement.style, { width: '100%', height: '100%', display: 'block' });
  host.prepend(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(LOOK.fov, fit.width / fit.height, 1, 4000);
  camera.up.set(0, 0, -1);
  const post = new Hd2dPipeline(renderer, world.scene, camera);
  const governor = new QualityGovernor();
  let viewW = fit.width;
  let viewH = fit.height;
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
    camera.aspect = viewW / f.height;
    // (without this the camera keeps its first shape, and a wider screen stretches the picture)
    camera.updateProjectionMatrix();
    applySize();
  };
  resize(fit);

  // ---------------------------------------------------------------- overlays
  const {
    readout, mainLines, tyreLine, banner, results, crewCard, weatherTag, pauseScreen, pauseTitle, pauseButton, place: layHud,
  } = createHud(scheme, difficulty);
  weatherTag.textContent = weather.name;
  // the rush of speed, the rain, and your chequered flag, drawn over the picture (race/screenFx.ts)
  const streaks = createStreaks();
  /** the device asks for less motion: no speed lines */
  const calm = motionReduced();
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
  host.append(paceCard.el, streaks.el, rain.el, readout, banner, results, crewCard, pauseScreen, flagOverlay.el);
  placeHud = (desktop) => {
    phoneHud = !desktop;
    layHud(desktop, host);
  };
  placeHud(fit.desktop);

  // ---------------------------------------------------------------- stage state
  let race!: Race;
  /** your car: its model and effects */
  let looks: CarLook[] = [];
  /** your stage is over (finished, or out) and the results are coming */
  let done = false;
  const you = 0;
  /** a message over the stage for a few seconds (a split, a penalty…), shown unless something more urgent is */
  let notice = { text: '', color: '', until: 0 };
  const announce = (text: string, color: string, seconds = 3) => (notice = { text, color, until: race.clock + seconds });

  /** the stage is stopped: nothing moves and the clock doesn't run */
  let paused = false;
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
  const setPaused = (on: boolean) => {
    if (on === paused) return;
    paused = on;
    setAudioPaused(on);
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
  /** the controls lap's bends (their middles, as samples) */
  let tutorApexes: number[] = [];
  /**
   * a rally's stage: the co-driver's notes, the reference run (its time and splits: the rivals' are off it), the splits
   * passed, and once it's over its result (when, your time, your place on it)
   */
  let stage: {
    caller: Caller; reference: { time: number; splits: number[] }; leader: number; rivals: (number | undefined)[]; sector: number;
    result?: { at: number; time?: number; place: number; shown: boolean };
  } | undefined;
  /** the co-driver on the controls lap too */
  let tutorCaller: Caller | undefined;
  /** your best time on this stage, kept on the device */
  let best = loadStageBests()[layout.id];

  /** Your car on the road in your paint, your number on the roof. */
  const addLook = (): CarLook => {
    const mesh: CarMesh = createCarMesh('f1', { ...liveryOf(scheme), helmet: 'gold' }, !!layout.dirt);
    world.scene.add(mesh);
    return { mesh, fx: new CarFx(mesh) };
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
    setPaused(false);
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
    const reference = (stageReference ??= referenceStage(track, grid, HANDLING, sessionWeather(), slot));
    const rivals = aiStage(rallyRun.rally, rallyRun.stage, reference.time, difficulty).times;
    const leader = Math.min(...rivals.filter((x): x is number => x !== undefined));
    stage = { caller: newCaller(paceNotes(track, (layout.jumps ?? []).map((j) => j.at))), reference, leader, rivals, sector: 0 };
    const k = rallyRun.stage;
    announce(`SS${k + 1} OF ${rallyEvent(rallyRun.rally).stages.length} · ${layout.name.toUpperCase()}`, '#f2c14e', 3);
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
      announce(`SPLIT ${k + 1} · ${fmt(now)} · ${delta < 0 ? '−' : '+'}${Math.abs(delta).toFixed(2)} · P${placeAt(now, share)}`, delta < 0 ? splitColor('record') : splitColor('worse'), 2.5);
    }
    const out = me.car.wrecked || !!p.retired;
    if (along < finishAt && !out) return;
    const time = out ? undefined : race.clock + p.penalty;
    stage.result = { at: race.clock, time, place: 0, shown: false };
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
    const kept = recordStageBest(layout.id, time);
    if (kept.best) {
      best = time;
      if (kept.had !== undefined) {
        announce(`STAGE BEST ${fmt(time)} · −${(kept.had - time).toFixed(2)}`, splitColor('record'), 3);
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
  /** Restart: the stage from the line (not once it's finished: it counts), or the controls lap afresh. */
  const restart = () => (session === 'tutorial' ? startTutorial() : !done && startStage());

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
        phase: () => (done ? 'done' : race.phase),
        clock: () => race.clock,
        paused: () => paused,
        you: () => ({ ...race.entrants[you].progress, speed: speedOf(race.entrants[you].car), health: race.entrants[you].car.health, x: race.entrants[you].car.x, y: race.entrants[you].car.y }),
        /** your car driven by the AI's line at `pace`, for trying out a stage hands-off */
        autopilot: (pace = 0.97) => (race.entrants[you].ai = { lane: 0, pace }),
        /** your car: where, which way, how fast (px/s) */
        me: () => {
          const c = race.entrants[you].car;
          return { x: c.x, y: c.y, heading: c.heading, speed: Math.hypot(c.vx, c.vy) };
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
  // changes; tapped and swiped, or up/down and left/right on the deck, A, START or B back to the pause screen
  const pauseSettings = document.createElement('div');
  pauseSettings.className = 'circuit-menu pause-settings';
  Object.assign(pauseSettings.style, { zIndex: '5', display: 'none', justifyContent: 'center', background: '#000' });
  const settingsTitle = document.createElement('h2');
  settingsTitle.textContent = 'SETTINGS';
  const pauseRows = settingsRows();
  const settingsDone = menuButton('DONE', () => openPauseSettings(false));
  pauseSettings.append(settingsTitle, ...pauseRows.map((r) => r.el), settingsDone, versionLine());
  host.append(pauseSettings);
  /** the settings are up, and the row the deck is on (the last place is DONE) */
  let pauseSettingsOn = false;
  let pauseFocus = 0;
  const showPauseFocus = () => {
    pauseRows.forEach((r, k) => r.el.classList.toggle('focused', k === pauseFocus));
    settingsDone.classList.toggle('focused', pauseFocus === pauseRows.length);
  };
  pauseRows.forEach((r, k) => r.el.addEventListener('pointerdown', () => {
    pauseFocus = k;
    showPauseFocus();
  }));
  function openPauseSettings(on: boolean) {
    if (on === pauseSettingsOn) return;
    menuPick();
    pauseSettingsOn = on;
    pauseSettings.style.display = on ? 'flex' : 'none';
    // (the pause screen's buttons out of the way under it)
    pauseScreen.style.visibility = on ? 'hidden' : '';
    pauseFocus = 0;
    showPauseFocus();
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
  Object.assign(exitLine.style, { color: '#9d9ab8', font: 'calc(11px * var(--ts, 1)) Silkscreen, monospace', textAlign: 'center', margin: '-4px 16px 6px', textWrap: 'balance' });
  const stayButton = pauseButton('STAY', () => askExit(false));
  const leaveButton = pauseButton('EXIT', () => onQuit());
  Object.assign(leaveButton.style, { borderColor: '#d8323c', color: '#ff6b6b' });
  const exitParts = [exitLine, stayButton, leaveButton];
  /** EXIT pressed: asked once more (the button the deck's on: 0 STAY, 1 EXIT) */
  let asking = false;
  let exitFocus = 0;
  const showExitFocus = () => {
    stayButton.style.boxShadow = exitFocus === 0 ? '0 0 0 2px #5fe0d0' : '';
    leaveButton.style.boxShadow = exitFocus === 1 ? '0 0 0 2px #ff6b6b' : '';
  };
  /** What leaving loses, said under the question. */
  const exitCost = () => (session === 'tutorial' ? 'ON TO THE RALLIES' : done ? 'BACK TO THE RALLY' : "THE STAGE WON'T COUNT");
  function askExit(on: boolean) {
    if (on === asking) return;
    if (on) menuPick();
    asking = on;
    pauseTitle.textContent = !on ? 'PAUSED' : 'LEAVE THE STAGE?';
    exitLine.textContent = exitCost();
    for (const el of pauseMain) el.style.display = on ? 'none' : '';
    for (const el of exitParts) el.style.display = on ? '' : 'none';
    exitFocus = 0;
    showExitFocus();
  }
  pauseScreen.append(pauseTitle, ...pauseMain, ...exitParts);
  for (const el of exitParts) el.style.display = 'none';
  // the phone's back button: the pause screen's settings closed, the pause screen resumed, the stage paused; once it's
  // over, on (a stage's results up: on to the rally, as with A)
  const offBack = onBack(() => {
    if (pauseSettingsOn) openPauseSettings(false);
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
    if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat && !(e.target instanceof HTMLInputElement) && !reportOpen() && !done) setPaused(!paused);
  };
  window.addEventListener('keydown', onKey);

  /** The device you're driving with (before you've touched anything: touch on a touch screen, else keys). */
  const device = (): Device => {
    const s = controls.lastSource();
    if (s === 'keyboard') return 'keys';
    if (s === 'gamepad') return 'pad';
    // (the stick, the slider and pedals, the tap zones, and the deck's buttons)
    if (s === 'dpad' || s === 'wheel' || s === 'tap' || s.startsWith('touch-')) return 'touch';
    return window.matchMedia?.('(any-pointer: coarse)').matches ? 'touch' : 'keys';
  };

  /** What each deck button does just now (race/deckLabels.ts). */
  const deckLabels = () => labelsFor({
    settings: pauseSettingsOn, resultsUp: results.style.display === 'block', tutorial: session === 'tutorial', learnt: learn?.o.step === 'done', done, paused,
    drift: !(touchScreen && device() === 'touch' && !touchDrifts(touchScheme())),
  });
  const deckEl = document.getElementById('deck');
  /** a touch screen: TOUCH in the settings picks its deck (index.html: the deck's classes) */
  const touchScreen = window.matchMedia?.('(any-pointer: coarse)').matches ?? false;
  const SCHEME_CLASSES = ['slider-deck', 'auto-gas', 'tilt-deck', 'tap-deck'];
  const showDeckLabels = () => {
    const scheme = touchScreen ? touchScheme() : undefined;
    // (the steering slider and the pedals in the stick's and A's places; the gas pedal gone where the gas is always
    // on; or the screen's halves to hold)
    deckEl?.classList.toggle('slider-deck', scheme === 'pedals' || scheme === 'arcade' || scheme === 'tilt');
    deckEl?.classList.toggle('auto-gas', !!scheme && autoThrottle(scheme));
    deckEl?.classList.toggle('tilt-deck', scheme === 'tilt');
    deckEl?.classList.toggle('tap-deck', scheme === 'tap');
    const labels = deckLabels();
    for (const k of ['a', 'b', 'start', 'select'] as const) hud.setLabel(k, labels[k]);
    // with the results up, RESTART and EXIT go under the table, big (on a phone: index.html)
    const resultsUp = results.style.display === 'block' && !paused;
    deckEl?.classList.toggle('results-up', resultsUp);
    // (and TUNE and the thumbstick go too while they're up: index.html)
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
   * The cameras, chase (low, behind the car) unless another is tried out with ?cam=: classic (the HD-2D view, north
   * up), heading (the same, turned with the car so it drives up the screen), road (turned with the road ahead instead,
   * steady through a slide), bonnet (from the front of the car) and iso (a fixed diagonal)
   */
  const CAMERAS = ['classic', 'heading', 'road', 'chase', 'bonnet', 'iso'];
  const camParam = new URLSearchParams(window.location.search).get('cam') ?? 'chase';
  const camMode = CAMERAS.includes(camParam) ? camParam : 'chase';
  /** the way a turning camera looks (eased), radians */
  let camYaw: number | undefined;
  // POINT's aim, through the camera (aimAt)
  const aimCaster = new THREE.Raycaster();
  const aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const aimHit = new THREE.Vector3();
  const aimSpot = new THREE.Vector3();
  const aimNdc = new THREE.Vector2();
  /**
   * POINT: the spot on the map the stick points at, as the screen shows it. From your car's place on the screen,
   * `AIM.reach` of the screen's height the way the stick is pushed, then down through the camera onto the ground. So
   * pushing toward a bend on the screen aims at that bend, and the stick's angle is never a heading on its own.
   * Undefined under the north-up view (the stick's way is the map's), with the car off the screen, or above the horizon.
   */
  const aimAt = (car: Car, stick: { x: number; y: number }): { x: number; y: number } | undefined => {
    const len = Math.hypot(stick.x, stick.y);
    if (camYaw === undefined || !len) return undefined;
    aimSpot.set(car.x, car.z, car.y).applyMatrix4(camera.matrixWorldInverse);
    if (aimSpot.z > -camera.near) return undefined;
    aimSpot.applyMatrix4(camera.projectionMatrix);
    aimNdc.set(aimSpot.x + ((stick.x / len) * 2 * AIM.reach) / camera.aspect, aimSpot.y - (stick.y / len) * 2 * AIM.reach);
    aimCaster.setFromCamera(aimNdc, camera);
    aimPlane.constant = -car.z;
    const hit = aimCaster.ray.intersectPlane(aimPlane, aimHit);
    if (!hit || Math.hypot(hit.x - car.x, hit.z - car.y) > AIM.far) return undefined;
    return { x: hit.x, y: hit.z };
  };
  /** TAP: the side held now (−1 left, 1 right, 2 both, 0 none), and for how long (s) */
  let tapSide = 0;
  let tapHeld = 0;
  // TILT: read the phone's roll (Android needs no asking; iOS asks on a tap: the settings row's, or one on the deck)
  if (touchScreen && touchScheme() === 'tilt') void askTilt();
  const onDeckTouch = () => {
    if (touchScheme() === 'tilt' && tiltNow() === undefined) void askTilt();
  };
  deckEl?.addEventListener('pointerdown', onDeckTouch);
  const setFov = (fov: number) => {
    if (camera.fov === fov) return;
    camera.fov = fov;
    camera.updateProjectionMatrix();
  };
  /** the view has been closed: the loop stops */
  let closed = false;
  const tick = (now: number) => {
    if (closed) return;
    // (the first frame's timestamp can be a touch before mount time)
    const real = Math.max(0, (now - last) / 1000);
    const dt = Math.min(0.05, real);
    last = now;
    // (the time on the road as it passes, slow frames and all; a gap of more than a second is the tab put away)
    if (!paused && real < 1) drivenSecs += real;
    showDeckLabels();
    // (a report being made: the deck and keys are its, not the stage's)
    if (reportOpen()) {
      requestAnimationFrame(tick);
      return;
    }
    // the pause screen's settings: the deck moves through them (and nothing else)
    if (pauseSettingsOn) {
      const [up, down, left, right, a, b, start] = (['up', 'down', 'left', 'right', 'a', 'b', 'start'] as const).map(pressed);
      pressed('select');
      const places = pauseRows.length + 1;
      if (up || down) {
        pauseFocus = (pauseFocus + (down ? 1 : -1) + places) % places;
        showPauseFocus();
      }
      const row = pauseRows[pauseFocus];
      if (row && (left || right)) row.step(right ? 1 : -1);
      if (a || b || start) openPauseSettings(false);
      requestAnimationFrame(tick);
      return;
    }
    if (asking) {
      // leave? left/right (or up/down) moves between STAY and EXIT, A or START picks, B stays, SELECT again leaves
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
    // paused: nothing moves, and the last frame stays on the screen
    if (paused) {
      // (a screenshot waiting for a frame, the report's: the still picture drawn again for it)
      if (frameWanted()) {
        const q = QUALITY_LEVELS[governor.level];
        post.render(0, { bloom: LOOK.bloom, blur: LOOK.blur, bloomOn: q.bloom, blurOn: q.blur });
      }
      requestAnimationFrame(tick);
      return;
    }

    // the stage: you drive, the rules run
    const pad = { stick: controls.direction(), a: controls.isDown('a'), b: controls.isDown('b') };
    // the device you last used, and the settings, decide how you drive: on a touch screen TOUCH's scheme (driveStyle.ts),
    // on the keys or a gamepad DRIVING's STEER (up or the right trigger the gas, down or the left trigger the brake)
    // or POINT (the arrows or the left stick point where to go)
    const dev = device();
    const how = howOn(dev);
    const zero: Drive = { turn: 0, gas: 0, brake: 0 };
    const gamepad = dev === 'pad' ? controls.drive('gamepad') ?? zero : undefined;
    // (the touch slider and pedals)
    const slider = controls.drive('wheel') ?? zero;
    // TAP: the side held, and for how long (turning harder the longer)
    {
      const tap = controls.drive('tap');
      const side = !tap ? 0 : tap.brake ? 2 : Math.sign(tap.turn);
      tapHeld = side === tapSide ? tapHeld + dt : 0;
      tapSide = side;
    }
    // TILT: the slider while a thumb's on it, else the phone's roll (shown on the slider's knob)
    const tilted = how === 'tilt' ? slider.turn || tiltTurn(tiltNow()) : 0;
    if (how === 'tilt' && !slider.turn && deckEl) showSliderTurn(deckEl, tilted);
    /** the stick that points, for POINT: a gamepad's left stick, else the touch stick or the arrows */
    const pointer = gamepad ? gamepad.stick ?? { x: 0, y: 0 } : pad.stick;
    const driveInput = (car: Car): DriveInput => {
      if (how === 'point') {
        const push = Math.min(1, Math.hypot(pointer.x, pointer.y));
        const at = aimAt(car, pointer);
        // (no spot on the ground to aim at: the stick as seen on the screen, turned by the camera's yaw)
        return at ? steerToward(car, at, push, pad.b) : playerInput({ ...pad, stick: pointer }, camYaw);
      }
      if (gamepad) return wheelInput({ ...gamepad, drift: pad.b }, car);
      if (dev === 'keys') return wheelInput(keysWheel({ up: controls.isDown('up'), down: controls.isDown('down'), left: controls.isDown('left'), right: controls.isDown('right') }, pad.b), car);
      switch (how) {
        case 'pedals':
          return wheelInput({ ...slider, drift: pad.b }, car);
        case 'arcade':
          return wheelInput(autoWheel(slider.turn, slider.brake, pad.b), car);
        case 'tilt':
          return wheelInput(autoWheel(tilted, slider.brake, pad.b), car);
        case 'tap':
          return wheelInput(tapWheel(tapSide === -1 || tapSide === 2, tapSide === 1 || tapSide === 2, tapHeld), car);
        default:
          return wheelInput(stickWheel(pad.stick, pad.b), car);
      }
    };
    /** past the flying finish (or the controls lap's end): on the brakes to the stop */
    const pastFinish = () => done || race.entrants[you].progress.idx * track.spacing >= finishAt;
    // the start: going in the last of the countdown is a jump start; after GO, your reaction is judged
    if (session === 'rally') {
      const car = race.entrants[you].car;
      const input = driveInput(car);
      // (where the gas is always on, it's on from before GO: an ordinary start, never a jump start nor a launch)
      const gas = dev === 'touch' && autoThrottle(touchScheme()) ? 1
        : input.wheel ? (input.wheel.reverse ? 0 : input.wheel.gas) : Math.hypot(input.steer?.x ?? 0, input.steer?.y ?? 0);
      const verdict = stepLaunch(launch, race.phase === 'lights' && race.clock >= 0, race.phase === 'racing' ? race.clock : undefined, gas);
      if (verdict === 'jump') {
        race.entrants[you].progress.penalty += LAUNCH.jumpPenalty;
        announce(`JUMP START · +${LAUNCH.jumpPenalty} S`, '#d8323c', 3);
      } else if (verdict && verdict !== 'slow') {
        const kick = kickOf(verdict);
        car.vx += Math.sin(car.heading) * kick;
        car.vy -= Math.cos(car.heading) * kick;
        announce(`${verdict === 'great' ? 'GREAT' : 'GOOD'} LAUNCH · ${launch.reaction!.toFixed(2)} S`, verdict === 'great' ? '#b36bff' : '#5fe0d0', 2);
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
    const brakes = (car: Car) => wheelInput({ turn: 0, gas: 0, brake: 1, drift: false }, car);
    /** past the flying finish: on down the road, easing down to a stop at the stop control (out of the stage: just the brakes) */
    const toTheStop = (e: Entrant) => {
      const left = stopLine - e.progress.idx * track.spacing;
      if (done && !stage?.result) return brakes(e.car);
      if (left <= 4) return brakes(e.car);
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
      const facts = { speed: speedOf(me.car), top: me.car.cls.topSpeed, bends: learn.bends, drifting: pad.b, canDrift: dev !== 'touch' || (!!layout.dirt && touchDrifts(touchScheme())), lapDone: pastFinish() };
      if (nextPrompt(learn.o, facts)) sounds.record();
      if (me.car.wrecked) startTutorial();
    }
    const me = race.entrants[you];
    const p = me.progress;
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
        announce('ROLLED IT!', '#d8323c', 2);
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
      } else if (e.kind === 'rain') announce(e.on ? 'RAIN · THE ROAD IS GETTING WET' : 'THE RAIN HAS STOPPED', '#8fb8e8', 2.5);
      else if (e.kind === 'track' && race.clock >= notice.until) announce(`ROAD ${e.condition.toUpperCase()} · ${COMPOUNDS[tyreFor(e.condition, race.track.dirt)].name.toUpperCase()}`, '#8fb8e8', 2);
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
      if (call) paceCard.call(call, clock);
    }
    paceCard.update(clock, done);
    hud.setPosition(rallyRun ? `SS${rallyRun.stage + 1}/${rallyEvent(rallyRun.rally).stages.length}` : 'SHAKEDOWN');
    hud.setLap(learn ? `${Math.min(STEPS.length - 1, STEPS.indexOf(learn.o.step) + 1)}/${STEPS.length - 1}`
      : stage?.result ? (stage.result.time === undefined ? 'DNF' : `P${stage.result.place}`)
      : race.phase === 'lights' ? 'ON THE LINE' : `${Math.max(0, kmOf(finishAt - p.idx * track.spacing)).toFixed(1)} KM TO GO`);
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
      banner.style.color = left <= 1 ? '#f2c14e' : '#f4f4f8';
      // (big: the one thing to watch on the line)
      banner.style.fontSize = 'calc(64px * var(--ts, 1))';
    } else {
      banner.style.fontSize = '';
      const [text, color] = bannerMessage({
        out: me.car.wrecked || !!p.retired, done, finishedPlace: stage?.result?.place || undefined, resultsUp: results.style.display === 'block',
        wrongWay: p.wrongWay, clock, notice,
        learn: learn && { text: prompt(learn.o.step, device(), howOn(device())), last: learn.o.step === 'done' },
      });
      showBanner(text);
      banner.style.color = color;
    }
    const stageTime = stage?.result ? stage.result.time : race.phase === 'racing' && !done ? clock : undefined;
    paintRows(mainLines, readoutText({ time: stageTime, best, health: me.car.health / me.car.cls.health, wrecked: me.car.wrecked }));
    paintRows(tyreLine, tyreText(COMPOUNDS[me.tyres.compound].short, me.tyres.wear, !phoneHud));
    tyreLine.style.color = COMPOUNDS[me.tyres.compound].color;

    particles.update(dt);
    debris.update(race.clock, (x, z) => groundAt(grid, x, z).h);
    rain.draw(dt, race.rain);
    {
      // (the way the car's going, on the screen: the ground's y is foreshortened by the camera's pitch)
      const c = me.car;
      const sy = c.vy * Math.sin(deg(LOOK.pitch));
      const len = Math.hypot(c.vx, sy) || 1;
      // (none for a device asking for less motion)
      streaks.draw(dt, calm ? 0 : rushNow, c.vx / len, sy / len);
    }
    skids.update(dt);

    // camera: follow your car, looking ahead along its motion
    const c = me.car;
    const drawn = pose(c, you, alpha);
    if (lookAt) {
      // (the debug hook's: the camera on a point of the map)
      target.set(lookAt.x, groundAt(grid, lookAt.x, lookAt.y).h, lookAt.y);
      focus.copy(target);
    } else target.set(drawn.x + (c.vx / c.cls.topSpeed) * t.lead, drawn.z * 0.5, drawn.y + (c.vy / c.cls.topSpeed) * t.lead);
    focus.lerp(target, 1 - Math.exp(-dt * 6));
    const pitch = deg(LOOK.pitch);
    // (the rush of speed pulls the camera back a touch)
    const rushWant = running(me) ? rushOf(speedOf(me.car), me.car.cls.topSpeed) : 0;
    rushNow += (rushWant - rushNow) * Math.min(1, dt * 3);
    const dist = (viewH / (2 * Math.tan(deg(LOOK.fov / 2))) / t.zoom) * (1 + RUSH.pullBack * rushNow);
    // (the chase camera, or another tried out with ?cam=: CAMERAS; held on a point of the map, the classic view)
    const mode = lookAt ? 'classic' : camMode;
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
      const want = mode === 'road' ? roadAhead : mode === 'iso' ? -Math.PI / 4 : drawn.heading;
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

    if (settle > 0) settle--;
    else governor.sample(dt);
    const q = QUALITY_LEVELS[governor.level];
    applySize();
    world.setShadowMapSize(q.shadowMap);
    post.render(dt, { bloom: LOOK.bloom, blur: LOOK.blur, bloomOn: q.bloom, blurOn: q.blur });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  const dispose = () => {
    if (closed) return;
    closed = true;
    noteDriven();
    offHidden();
    window.removeEventListener('keydown', onKey);
    setAudioPaused(false);
    sounds.dispose();
    paceCard.hush();
    // everything on the GPU: the scene's meshes, materials and textures, the post passes, the context itself
    world.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
      for (const m of [mesh.material ?? []].flat() as THREE.Material[]) {
        for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
        m.dispose();
      }
    });
    post.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
    offBack();
    for (const el of [paceCard.el, streaks.el, rain.el, readout, banner, results, crewCard, pauseScreen, pauseSettings, flagOverlay.el]) el.remove();
    deckEl?.classList.remove('results-up');
    deckEl?.classList.remove(...SCHEME_CLASSES);
    deckEl?.removeEventListener('pointerdown', onDeckTouch);
    document.documentElement.classList.remove('results-up', 'paused', 'dirt');
    delete (window as { __cc?: unknown }).__cc;
  };
  return { resize, dispose };
};

