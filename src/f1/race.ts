// The F1 race: you and the AI field in F1 cars on one of the circuits.
// Start lights, laps, positions, lap times, damage, pit stops to repair it,
// the safety car after a big crash, a minimap, and results at the flag. The rules live in raceControl.ts;
// this is the picture and the HUD. A pauses (so does leaving the app or tab); START restarts;
// SELECT goes back to choose a circuit.

import { gridFor } from './bridge';
import { carOutline, type CarOutline } from './outline3d';
import * as THREE from 'three';
import type { Button } from '../engine/controls';
import { applyDamage, bodyTilt, carClass, condition, newCar, speedOf, type Car, type StepEvents } from '../engine/driving';
import { SIM_DT, advance, fixedClock, lerp, lerpAngle, resetClock } from '../engine/fixedStep';
import { newSeed, seededRandom } from '../engine/rng';
import { groundAt } from '../engine/sim';
import { SECTORS, keysWheel, lineCornerSpeed, lineDecel, nearestSample, playerInput, stickWheel, wheelInput, type AiDriver } from './racing';
import { NORMAL, aiCraftFor, aiIncidentsFor, aiMistakesFor, aiPaceFor, handlingFor, paceRanks, type Difficulty } from './difficulty';
import { numberOf, styleOf } from './drivers';
import { DRY, lookAt as weatherLook, type Weather, type WeatherId } from './weather';
import { changeableForecast, conditionOf, fixedForecast, roundForecast, type Forecast } from './forecast';
import { COMPOUNDS, fitTyres, isDry, tyreFor, type Compound, type DryCompound } from './tyres';
import { planText } from './strategy';
import { LIMITS } from './trackLimits';
import { aiTimes, gridOrder, judgeLap, newQualiLap, newQualifying, referenceLap, type QualiLap } from './qualifying';
import { roundSeed, teamOf, type Season } from './championship';
import { RACE_LAPS } from './laps';
import { GRID_PAN, gridWalkOn, panAt, panLength } from './gridPan';
import { landmarksOf } from './town3d';
import { standsOf } from './stands';
import { CRASH_REPLAY, REPLAY, crashSpeed, crashWindow, newReplay, recordReplay, replayPose, replaySpeed, replayWindow, wantsCrashReplay, type ReplayRecorder } from './replay';
import { advance as nextPrompt, apexesPassed, newOnboarding, prompt, STEPS, type Device, type Onboarding } from './onboarding';
import { driveStyle, pointsOn } from './driveStyle';
import { GHOST_HZ, ghostPose, ghostTimeAt, loadGhost, markSplit, newRecorder, recordFrame, saveGhost, toGhost, type Ghost, type LapRecorder } from './timeTrial';
import { LIGHTS, SAFETY_CAR, VSC, callVsc, newRace, stopCalled, tyreCall, wrongTyres, type RaceEvent, order as raceOrder, running, skipToParked, stepRace, type Race } from './raceControl';
import { createSafetyCarMesh } from './safetyCar3d';
import { createChequeredFlag } from './flag3d';
import { CEREMONY } from './podium3d';
import { between, inLimitZone } from './pits';
import { TEAMS, driverSeats, teamGrid, type Seat, type Team } from './teams';
import { formatTime as fmt, loadRecords, recordAttack, recordLap, recordQualifying, recordRace, saveRecords } from './records';
import { distance, newAttack, shortDistance, stepAttack, type Attack } from './timeAttack';
import { createCarMesh, type CarMesh } from '../engine/render/vehicles3d';
import { CarFx, DebrisLayer, Particles, SkidLayer } from '../engine/render/effects';
import { Hd2dPipeline } from '../engine/render/hd2d';
import { HD2D_VIEW } from '../engine/look';
import { QUALITY_LEVELS, QualityGovernor } from '../engine/render/quality';
import type { ScreenFit } from '../engine/layout';
import { loadVehicleEdits } from '../engine/vehicleEdits';
import type { MountStandalone } from '../engine/view';
import { defaults } from '../engine/tuning';
import { HALF_WIDTH, TILE, buildCircuit } from './circuit';
import { vibrate } from '../engine/haptics';
import { newRumble, rumble } from './rumble';
import { RUSH, newShake, rushOf, shakeOffset, shakeOn, stepShake, timeScale } from './shake';
import { RaceSounds, crowdNear, menuPick, menuTick } from './sounds';
import { onBack } from '../engine/backButton';
import { menuButton } from './circuitSelect';
import { settingsRows, versionLine } from './settingsRows';
import { LAUNCH, aiReaction, kickOf, newLaunch, stepLaunch } from './launch';
import { finishLine, newRadio, radioFor, radioLine, say, stepRadio, type RadioCue } from './radio';
import { setAudioPaused } from '../engine/audio';
import { musicPlaying, playMusic } from '../engine/music';
import { MENU_MUSIC, PODIUM_MUSIC, RACE_MUSIC } from './music';
import { gapBetween, newGapTimer, stepGaps, type GapTimer } from './gaps';
import { overtakeOf, towerGap, towerRows } from './tower';
import { achievementToast, stampMedal } from './screens/celebrate';
import { TORPEDO, medalAchievements, raceAchievements, raced, torpedo, unlock } from './achievements';
import { LAYOUTS } from './layouts';
import { type Medal, MEDALS, MEDAL_COLOR, MEDAL_NAME, attackMedal, attackTargets, awardMedal, lapMedal, lapTargets, loadTrophies, nextMedal } from './medals';
import type { CircuitLayout } from './layouts';
import { createCircuitScene } from './circuitScene';
import { style } from './race/dom';
import { createHud } from './race/hud';
import { createShareButton } from './race/shareButton';
import { kmOf, track as noteStat } from './metrics';
import { fetchBoard, loadDaily, logRun, saveDaily, sendPending, type Run } from './daily';
import { fetchDailyGhost, fetchLapBoard, isBoardWeather, packGhost, queueLap, sendLaps, type DailyRival } from './boards';
import { initials, playerId } from './profile';
import { attackCard, raceCard, type ShareCard } from './shareCard';
import { drawCars } from './race/drawCars';
import { BLUE_COLOR, renderTower } from './race/towerView';
import { createCeremonyView } from './race/ceremonyView';
import { ghostText, limitsText, readoutText, towText, tyreText } from './race/readout';
import { paintRows } from './race/readoutView';
import { bannerMessage, evenLines } from './race/banner';
import { motionReduced, splitColor, splitWord } from './access';
import { deckLabels as labelsFor } from './race/deckLabels';
import { qualifyingRows, renderQualifying, renderResults, resultRows } from './race/resultsView';
import { createFlagOverlay, createRain, createStreaks } from './race/screenFx';
import { F1_TUNING } from './tuning';
import { openReport, reportOpen } from './report';
import { frameWanted } from '../engine/render/capture';
import { YOUTUBE, onHidden } from '../engine/host';
import { dropKeptRace, keepRace, restoreRace, snapshotRace, type KeptRace } from './raceSave';
import { DESIGNER_DRAFT_ID } from './designerDraft';

type F1Tuning = Record<keyof typeof F1_TUNING, number>;
const deg = THREE.MathUtils.degToRad;
const LOOK = HD2D_VIEW;
/** Seconds of the champagne ceremony before the results (A shows them at once). */
const PODIUM_HOLD = CEREMONY.len;
/** How much closer the camera comes for the ceremony. */
const CEREMONY_ZOOM = 2.6;

/** The T-camera colour marking a team's second car. */
const TCAM_GREEN = '#39ff14';

/** How each entrant looks: its name, team, colour, model and effects (index-matched with the race's entrants). */
interface Look {
  name: string;
  /** its outline, for when it's under a bridge (a circuit with one only) */
  outline?: CarOutline;
  /** the driver's race number (yours: the seat's) */
  number?: number;
  team: Team;
  /** its livery (for its car again in the parc fermé) */
  livery: Parameters<typeof createCarMesh>[1];
  mesh: CarMesh;
  fx: CarFx;
  color: string;
  /** last frame's speed and health (for its rear light and its sparks), and s its rear light stays lit */
  was?: { speed: number; health: number };
  lit?: number;
}

/** A driver as the screens name them: their number first, when they have one (#44 HAM). */
const numbered = (l: Pick<Look, 'name' | 'number'>) => (l.number === undefined ? l.name : `#${l.number} ${l.name}`);



/** How a race weekend is set up. */
export interface RaceOptions {
  /** the team you drive for, and which of its cars (its first unless set) */
  team?: Team;
  seat?: Seat;
  difficulty?: Difficulty;
  weather?: Weather;
  /** a qualifying lap first, to set your grid slot */
  qualifying?: boolean;
  /** how many laps the race is (a Championship round: its season's length, RACE_LAPS unless a Grand Prix season) */
  laps?: number;
  /** the dry tyres you start on (none: the pit wall's strategy's) */
  startTyres?: DryCompound;
  /** a race kept on the device to come back to (raceSave.ts): built as it was and picked up where it was left, paused */
  resume?: KeptRace;
  /** a race weekend, a Time Trial (flying laps on your own against your best lap's ghost), or the controls lap for a new player */
  mode?: 'race' | 'timetrial' | 'timeattack' | 'tutorial';
  /**
   * a round of a Championship: the season (its field, all season), and where the result goes once you've seen the
   * results: the drivers (the season's indexes) in finishing order, and those who didn't finish
   */
  championship?: { season: Season; onDone(finish: number[], out: Set<number>): void };
  /** the Daily Challenge (a Time Attack): its day, for the board */
  daily?: { day: string };
}

/**
 * The race on `layout` with `options` (your team, the difficulty, the weather, and whether you qualify first);
 * `onQuit` runs when the player leaves (EXIT on the deck, SELECT inside).
 */
export const raceOn = (layout: CircuitLayout, onQuit: () => void, options: RaceOptions = {}): MountStandalone => async ({ host, services, tuning, fit }) => {
  const { team = TEAMS[0], seat: yourSeat = 0, difficulty = NORMAL, weather = DRY, qualifying = false, mode = 'race', championship } = options;
  const LAPS = Math.max(1, Math.round(options.laps ?? RACE_LAPS));
  const t = (tuning ?? defaults(F1_TUNING)) as F1Tuning;
  const { controls, hud } = services;
  loadVehicleEdits(); // (any saved stat edits apply to the cars)
  const f1 = carClass('f1');
  // the difficulty sets how much a crash costs (every car alike) and how quick the AI is
  const HANDLING = handlingFor(difficulty);
  // the AI's line: flat out wherever the car can follow the bend, like a player can
  const circuit = buildCircuit(layout, { cornerSpeed: lineCornerSpeed(f1, HANDLING), decel: lineDecel(f1) });
  // (on dirt, the touch deck has a DRIFT button too: index.html)
  document.documentElement.classList.toggle('dirt', !!layout.dirt);
  const { track, grid } = circuit;
  const world = createCircuitScene(circuit, weather);
  /**
   * the weekend's weather: the one picked, the same all session, or (a changeable one, or a Championship round's)
   * a forecast drawn with the weekend; the race runs to it, qualifying in the weather it starts in
   */
  const changeable = !!championship || weather.id === 'changeable';
  /** about how long the race runs (s: its laps at a typical pace), for the forecast's timing */
  const raceSeconds = (LAPS * track.length) / 300;
  const roundWeather = championship && roundForecast(roundSeed(championship.season, championship.season.round), raceSeconds);
  let forecast: Forecast = roundWeather || fixedForecast(weather.id === 'changeable' ? 'dry' : weather.id);
  /** the weather for a session on your own (it doesn't change there): the race's at the start */
  const sessionWeather = (): WeatherId => conditionOf(forecast.start);
  /** how the circuit looks now (wetness and rain), last put on the scene, so it's only redone as it changes */
  let shownLook = { wetness: -1, rain: -1 };
  const skids = new SkidLayer((x, y) => groundAt(grid, x, y).h);
  // (a bridge: the marks of cars up on its deck on a layer of their own at the deck's height, over the road beneath)
  const deckSkids = track.levels ? new SkidLayer((x, y) => groundAt(track.levels!.upper, x, y).h) : undefined;
  // (a bigger pool in the wet, and on dirt: every car throws up spray, or dust)
  const particles = new Particles(weather.spray || changeable || circuit.layout.dirt ? 220 : 90);
  // parts torn off in big crashes: the nose, and wheels off a wreck
  const debris = new DebrisLayer();
  world.scene.add(skids.group, particles.group, debris.group);
  if (deckSkids) world.scene.add(deckSkids.group);
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
  /** the phone's overlay (the HUD Lab's): its lap readout without the gaps (the tower has them) or the tyres' share */
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
  // the HUD (race/hud.ts)
  const {
    readout, mainLines, tyreLine, towLine, ghostLine, medalLine, limitsLine, banner, radioPanel, radioText, results, teamCard, weatherTag,
    mini, miniCtx, tower, pauseScreen, pauseTitle, pauseButton, MINI_W, MINI_H, place: layHud,
  } = createHud(team, difficulty, circuit);
  const map = world.minimap(MINI_W * 2, MINI_H * 2);
  let radioQ = newRadio();
  /** Your engineer says `cue` (in a race or qualifying: not on your own against the clock; and once your car's
   * wrecked, only that: the safety car and the rest are no news to a driver who's out). */
  const sayRadio = (cue: RadioCue) => {
    if (session !== 'race' && session !== 'qualifying') return;
    if (race.entrants[you].car.wrecked && cue !== 'wreck') return;
    say(radioQ, radioLine(cue));
  };
  // the rush of speed, the rain, and your chequered flag, drawn over the picture (race/screenFx.ts)
  const streaks = createStreaks();
  /** the device asks for less motion: no speed lines */
  const calm = motionReduced();
  /** the rush now (eased toward what the speed says) */
  let rushNow = 0;
  /** wheel to wheel: a rival this close (px) pulls the camera back this much more, eased in and slowly out */
  const BATTLE = { near: 50, pullBack: 0.08 };
  let battleNow = 0;
  const rain = createRain();
  const flagOverlay = createFlagOverlay();
  // the banner's message, on even lines if it takes two: a message in phrases (' · ') a phrase a line; otherwise the
  // browser balances them (text-wrap: balance), or where it can't, it's split at its most even point; once it's seen
  // to wrap (the same message: left as it is)
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
  host.append(streaks.el, rain.el, readout, banner, radioPanel, results, mini, tower, teamCard, pauseScreen, flagOverlay.el);
  placeHud = (desktop) => {
    phoneHud = !desktop;
    layHud(desktop, host);
  };
  placeHud(fit.desktop);

  // ---------------------------------------------------------------- race state
  let race!: Race;
  /** the HUD's own state: gap timing, your last position and its flash, and the race's fastest lap so far (set up by startRace) */
  let hudState: { gaps: GapTimer; lastPos: number; lastOrder?: number[]; flashUntil: number; lapsSeen: number[]; fastest?: { time: number; who: number } } = {
    gaps: newGapTimer(0), lastPos: 0, flashUntil: 0, lapsSeen: [],
  };
  let looks: Look[] = [];
  /** your race is over (finished, or out) and the results are coming */
  let done = false;
  /** the champagne ceremony: the top three, and seconds the camera has been on them (the results follow) */
  let mistakeCount = 0;
  let podium: { top: number[]; time: number } | undefined;
  let you = 0;
  const safetyCar = createSafetyCarMesh();
  // your car's marker on the grid, so you can find it before the start: a gold arrow bobbing above it and a
  // gold ring on the ground round it (unlit, so they stay bright in shade and in the rain); gone at lights out
  const youMarker = new THREE.Group();
  const markerGold = new THREE.MeshBasicMaterial({ color: 0xf2c14e, toneMapped: false });
  const youArrow = new THREE.Mesh(new THREE.ConeGeometry(7, 12, 4).rotateX(Math.PI), markerGold);
  const youRing = new THREE.Mesh(
    new THREE.RingGeometry(19, 22, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xf2c14e, toneMapped: false, transparent: true, opacity: 0.6, depthWrite: false }),
  );
  youRing.position.y = 0.8;
  youMarker.add(youArrow, youRing);
  world.scene.add(youMarker);
  // the chequered flag, on the pit wall at the line, flying out over the track: out once the winner has crossed it
  const chequered = createChequeredFlag();
  {
    const s0 = track.samples[0];
    const lat = circuit.pit.side * 58;
    const fx = s0.x + Math.cos(s0.dir) * lat;
    const fy = s0.y + Math.sin(s0.dir) * lat;
    chequered.group.position.set(fx, groundAt(grid, fx, fy).h, fy);
    // (the cloth flies toward the flag's +x: the right of the way of the race, so turned round when the pole's on the right)
    chequered.group.rotation.y = -s0.dir + (circuit.pit.side > 0 ? Math.PI : 0);
    chequered.group.visible = false;
    world.scene.add(chequered.group);
  }
  // the champagne ceremony: parc fermé, a set of its own by the main straight (race/ceremonyView.ts)
  const ceremonyView = createCeremonyView(circuit, layout.name.toUpperCase(), world.scene, camera);
  const { ceremony, plates } = ceremonyView;
  host.append(...plates);
  /** a message over the race for a few seconds (safety car, penalty…), shown unless something more urgent is */
  let notice = { text: '', color: '', until: 0 };
  const announce = (text: string, color: string, seconds = 3) => (notice = { text, color, until: race.clock + seconds });
  /** an announcement waiting for the one up now to be over (news from the boards: never over a record's) */
  let nextNotice: { text: string; color: string; seconds: number } | undefined;
  const announceNext = (text: string, color: string, seconds = 3) => {
    if (race.clock >= notice.until) announce(text, color, seconds);
    else nextNotice = { text, color, seconds };
  };
  /** Whether car `i` is near yours (within about a screen's height). */
  const near = (i: number) => {
    const a = race.entrants[i].car;
    const b = race.entrants[you].car;
    return Math.hypot(a.x - b.x, a.y - b.y) < 360;
  };
  /** Fill the timing tower (a race, from the lights to your flag). */
  const drawTower = () => {
    const show = session === 'race' && race.phase === 'racing' && !gridPan && !done && !podium;
    tower.style.display = show ? 'block' : 'none';
    if (!show) return;
    const order = raceOrder(race);
    const lead = order[0];
    const n = track.samples.length;
    const along = (i: number) => race.entrants[i].progress.lap * n + race.entrants[i].progress.idx;
    renderTower(tower, towerRows(order, you).map((i) => {
      if (i === 'gap') return 'gap';
      const e = race.entrants[i];
      const place = order.indexOf(i) + 1;
      const gap = e.progress.retired ? 'OUT' : e.pit ? 'PIT' : e.blue !== undefined ? '▮ BLUE' : race.phase === 'lights' ? '' : towerGap(place, gapBetween(hudState.gaps, lead, i), Math.max(0, Math.floor((along(lead) - along(i)) / n)));
      return { place, color: looks[i].color, trim: looks[i].team.trim, number: looks[i].number, name: looks[i].name, gap, you: i === you, out: !!e.progress.retired, blue: e.blue !== undefined };
    }));
  };
  /** Show the next medal here and what it asks for (on starting a Time Trial or a Time Attack, and on winning one). */
  const showMedal = () => {
    const kind = session === 'timetrial' ? 'trial' : session === 'timeattack' ? 'attack' : undefined;
    if (!kind || reference === undefined) {
      paintRows(medalLine, '');
      return;
    }
    // (in a Time Attack, the medal this run has reached already counts: past bronze, it's silver you're after)
    const held = loadTrophies().medals[layout.id]?.[kind];
    const reached = kind === 'attack' && attack ? attackMedal(attack.a.passed, attack.a.generous) : undefined;
    const next = nextMedal(reached && (!held || MEDALS.indexOf(reached) > MEDALS.indexOf(held)) ? reached : held);
    const target = !next ? undefined : kind === 'trial' ? fmt(lapTargets(reference)[next]) : attack ? shortDistance(attackTargets(attack.a.generous)[next]) : undefined;
    paintRows(medalLine, !next ? 'GOLD ●\n' : target ? `${MEDAL_NAME[next]} ${target}\n` : '');
    medalLine.style.color = MEDAL_COLOR[next ?? 'gold'];
  };
  // your records here, kept between races: each lap is saved as soon as it's done, the race at your flag
  const records = loadRecords();
  // (kept apart for each weather: a wet lap is slower)
  // (a changeable weekend's apart from them all: a Championship round's too, unless its weather's the same all race)
  const recordKind = championship ? (forecast.fixed ? sessionWeather() : 'changeable') : weather.id;
  const recordId = recordKind === 'dry' ? layout.id : `${layout.id}:${recordKind}`;
  const rec = () => records.circuits[recordId];
  /** your laps saved so far this race, whether your finish is saved, and the records this race (or qualifying) set */
  let saved = { laps: 0, race: false, newLap: false, newRace: false, newQualifying: false };

  /** the race is stopped: nothing moves and the clock doesn't run */
  let paused = false;
  /** frames to leave out of the quality governor after a pause (the first frame back measures the pause) */
  let settle = 0;
  let last = performance.now();
  // the race's sounds (silent until the first tap or key: browsers require one)
  const sounds = new RaceSounds(0);
  /** start lights lit so far (a beep for each), and whether your flag has been sounded */
  let soundState = { lights: 0, flag: false, finalLap: false, boxLap: -1 };
  /** the camera's shake, and the hit-stop of a big hit */
  let shake = newShake();
  /** a hit to your car the debug hook asked for, dealt next frame */
  let pendingHit = 0;
  /** your start off the lights (judged once, in a race) */
  let launch = newLaunch();
  /** you've taken damage this session (for SPOTLESS) */
  let tookDamage = false;
  /** the cars you've hit off the start (their places in the field), for TORPEDO */
  const startHits = new Set<number>();
  /** Unlock achievements `ids`: a toast for each new one. */
  const achieve = (ids: string[]) => {
    for (const a of unlock(ids)) achievementToast(a);
  };
  const setPaused = (on: boolean) => {
    // (paused: the race kept on the device, to come back to if the app's closed now)
    if (on) keepNow();
    if (on === paused) return;
    paused = on;
    setAudioPaused(on);
    pauseScreen.style.display = on ? 'flex' : 'none';
    if (!on) openPauseSettings(false);
    askExit(false);
    if (!on) {
      last = performance.now();
      settle = 2;
    }
  };

  // the simulation steps at a fixed rate (engine/fixedStep.ts); each car is drawn between its last two steps
  const simClock = fixedClock();
  /** each car (then the safety car, when it's out) where it was before the latest step (undefined: draw it where it is, after a restart or a skip) */
  let before: { x: number; y: number; z: number; heading: number }[] | undefined;
  const pose = (car: Car, i: number, alpha: number) => {
    const b = before?.[i];
    return b ? { x: lerp(b.x, car.x, alpha), y: lerp(b.y, car.y, alpha), z: lerp(b.z, car.z, alpha), heading: lerpAngle(b.heading, car.heading, alpha) } : car;
  };
  /** the cars' driving events over the latest frame's steps (kept through a frame with none, less its one-off hits) */
  let frameEvents: StepEvents[] = [];
  // each race's random draws (its rival teams, the start-light wait) come from its seed: ?seed=<n> repeats a race exactly
  const seedParam = Number(new URLSearchParams(window.location.search).get('seed'));
  let seed = 0;
  /** the session on track: qualifying (your flying lap, alone), the race, or a Time Trial (flying laps, alone, against your ghost) */
  let session: 'qualifying' | 'race' | 'timetrial' | 'timeattack' | 'tutorial' = 'race';
  /** The replay over (or skipped): back to the race, live (after your flag, the ceremony follows). */
  const endReplay = () => {
    // (a crash's replay over, the race goes on; the finish's is shown once)
    if (replay?.kind === 'finish') replayed = true;
    replay = undefined;
    before = undefined;
    debris.back();
  };
  /** The grid pan over: the lights come on (the camera swings back to your car). */
  const endPan = () => {
    gridPan = undefined;
  };
  /** qualifying: your laps so far, this weekend's field, and once it's over, the grid it set (drivers by slot) and the times */
  let quali: { lap: QualiLap; weekend: ReturnType<typeof drawWeekend>; flying?: boolean; over?: { grid: number[]; times: (number | undefined)[] } } | undefined;
  /**
   * a Time Trial: the lap being recorded (its start, the sectors passed), your laps' verdicts (a cut deletes one), the
   * session's best lap and your record lap (the ghost you chase, kept on the device)
   */
  /** the controls lap: the prompt you're on, the bends you've been through, and where you were last frame */
  let learn: { o: Onboarding; bends: number; lastIdx: number } | undefined;
  let trial: { recorder: LapRecorder; lapStart?: number; sector: number; lap: QualiLap; best?: Ghost; record?: Ghost } | undefined;
  /** a Time Attack: the clock, and the best distance here when it started (checkpoints) */
  let attack: {
    a: Attack; best?: number;
    /** the run as it's driven (from the clock starting), and the Daily Challenge's leading run to chase */
    rec: LapRecorder; rival?: DailyRival;
    result?: { passed: number; record: boolean; medal?: Medal; newMedal: boolean; daily?: { best: boolean; dayBest: Run; place?: number; entries?: number } };
  } | undefined;

  /** The champagne ceremony, after your finish's replay: the race finished at once (the rest at their pace, everyone put
   * in their garage), and the top three on the podium, spraying champagne, till the results. */
  const startCeremony = () => {
    podium = { top: skipToParked(race), time: 0 };
    before = undefined;
    hudState.flashUntil = 0;
    ceremonyView.setDrivers(podium.top.map((i) => ({
      body: looks[i].team.body, trim: looks[i].team.trim, car: createCarMesh('f1', looks[i].livery, !!circuit.layout.dirt), number: looks[i].number, name: looks[i].name, you: i === you,
    })));
  };

  /**
   * This weekend's field, drawn from its seed (so the same for the qualifying and the race after it): your team and four
   * at random, two cars each, in their liveries; each car's seat in its team (you take the car you picked, your
   * teammate the other); each AI driver's pace, line, racecraft and dice; and the start lights' wait. Driver `k`'s grid slot is
   * `k` unless qualifying sets another; you're `youDriver`, mid-grid.
   */
  const drawWeekend = () => {
    const rng = seededRandom(seed);
    // (a Championship round: the season's field, its teams and each driver's pace all season)
    const season = championship?.season;
    const total = season ? season.drivers.length : Math.min(circuit.slots.length, 1 + Math.round(t.opponents));
    const youDriver = season ? season.you : Math.floor(total / 2);
    const teams = season ? season.drivers.map(teamOf) : teamGrid(team, total, youDriver, rng);
    const seats = driverSeats(teams, youDriver, season ? (season.seat ?? 0) : yourSeat);
    const ranks = season ? season.drivers.map((d) => d.rank) : paceRanks(total, rng);
    const boxes = [...new Set(teams)];
    const drivers = teams.map((livery, k) => {
      // AI drivers differ in pace, line and racecraft (the difficulty's, and their style's aggression), and make
      // mistakes now and then (fewer the more consistent their style), on their own dice from the race's seed; the
      // quicker cars start mostly further up the grid, but not always
      const style = styleOf(livery.drivers[seats[k]]);
      const ai: AiDriver | undefined = k === youDriver ? undefined : {
        lane: ((k * 7) % 11) - 5, pace: aiPaceFor(difficulty, ranks[k], total, t.aiPaceAdjust), craft: aiCraftFor(difficulty, rng, style.aggression),
        mistakes: aiMistakesFor(difficulty, style.consistency), rng: seededRandom(Math.floor(rng() * 4294967296)),
        incidents: aiIncidentsFor(difficulty, style.aggression),
      };
      // its reaction off the lights, on dice of its own from the seed and its slot (not drawn from the weekend's, so the
      // rest of the field is drawn as it was)
      if (ai) ai.reaction = aiReaction(seededRandom(((seed * 2654435761) ^ ((k + 1) * 40503)) >>> 0 || 1), ai.craft ?? 0.6, style.consistency);
      // each team its own box in the pit lane
      return { livery, seat: seats[k], ai, box: boxes.indexOf(livery) };
    });
    // five lights, one every 0.6 s, then out after a short random wait
    return { youDriver, drivers, lightsOut: 0.3 + rng() * 0.7 };
  };
  /** A car on the track in its team's livery (teammates: the team's second car has the bright green T-camera). */
  const addLook = (livery: Team, seat: number, mine: boolean): Look => {
    const number = numberOf(livery.drivers[seat]);
    const look = { body: livery.body, stripe: livery.trim, accent: livery.accent, pattern: livery.pattern, tcam: seat === 1 ? TCAM_GREEN : undefined, helmet: mine ? ('gold' as const) : undefined, number };
    // (on dirt, on off-road tyres)
    const mesh = createCarMesh('f1', look, !!circuit.layout.dirt);
    world.scene.add(mesh);
    // (under a bridge, the deck hides it: its outline drawn through the deck, yours in gold)
    const outline = track.levels ? carOutline(mesh, mine ? 0xf2c14e : 0xf4f4f8) : undefined;
    if (outline) world.scene.add(outline.group);
    return { name: mine ? 'YOU' : livery.drivers[seat], outline, number, team: livery, livery: look, mesh, fx: new CarFx(mesh), color: livery.body };
  };
  /** Clear the track and the screen for a new session. */
  /** px you've driven since the last 'drive' event, and where your car was last frame; and s on the circuit since then, not paused (for the play stats) */
  let drivenPx = 0;
  let lastAt: { x: number; y: number } | undefined;
  let drivenSecs = 0;
  /** Note the km driven and the time on the circuit since the last time (play stats: metrics.ts). */
  const noteDriven = () => {
    if (drivenPx > 0 || drivenSecs >= 1) noteStat('drive', { circuit: layout.id, mode: drivenMode, km: kmOf(drivenPx), data: { seconds: Math.round(drivenSecs) } });
    drivenPx = 0;
    drivenSecs = 0;
  };
  /** The team and driver you picked for a weekend (`w`), for the play stats. */
  const pickOf = (w: ReturnType<typeof drawWeekend>) => {
    const d = w.drivers[w.youDriver];
    return { team: d.livery.id, driver: d.livery.drivers[d.seat] };
  };
  /** The session, as the play stats name it. */
  const statsMode = () => (championship && session === 'race' ? 'championship' : options.daily ? 'daily' : session);
  /** A Daily Challenge run over: kept (your streak, your best today), on to the board, and your place there. */
  const dailyRun = (day: string, run: Run, ghost?: Ghost) => {
    const result = attack?.result;
    if (!result) return;
    const log = loadDaily();
    const best = logRun(log, day, run, ghost);
    saveDaily(log);
    result.daily = { best, dayBest: log.best[day] };
    const name = initials();
    if (!name) return;
    const player = playerId();
    void sendPending(log, player, name).then(async (sent) => {
      if (sent && best) noteStat('daily_submit', { circuit: layout.id, mode: 'daily', data: { score: run.score } });
      const board = await fetchBoard(day, player, 1);
      if (board?.you && result.daily && attack?.result === result) Object.assign(result.daily, { place: board.you.place, entries: board.entries });
    });
  };
  /** the session the km being counted are driven in */
  let drivenMode = 'race';
  const resetSession = () => {
    noteDriven();
    drivenMode = statsMode();
    lastAt = undefined;
    shake = newShake();
    launch = newLaunch();
    tookDamage = false;
    startHits.clear();
    paintRows(medalLine, '');
    setPaused(false);
    resetClock(simClock);
    before = undefined;
    frameEvents = [];
    soundState = { lights: 0, flag: false, finalLap: false, boxLap: -1 };
    radioQ = newRadio();
    radioPanel.style.display = 'none';
    playMusic(RACE_MUSIC);
    for (const l of looks) world.scene.remove(l.mesh, ...(l.outline ? [l.outline.group] : []));
    world.scene.remove(safetyCar.group);
    hud.setPositionChange(undefined);
    done = false;
    podium = undefined;
    saved = { laps: 0, race: false, newLap: false, newRace: false, newQualifying: false };
    notice = { text: '', color: '', until: 0 };
    nextNotice = undefined;
    skids.clear();
    deckSkids?.clear();
    particles.clear();
    debris.clear();
    results.style.display = 'none';
  };

  /** every car through the race, for the replay after your flag; and the replay when it's on: the race time it's showing, its end, your finish */
  let recorder: ReplayRecorder = newReplay(0);
  let replay: { t: number; to: number; kind: 'finish' | 'crash'; at: number; follow: number } | undefined;
  /** a big crash's replay to come (its race time, and the car), and when the last was */
  let crashDue: { at: number; who: number } | undefined;
  let lastCrashReplay = -Infinity;
  /** when the results went up (ms, page time), for their rows sliding in */
  let resultsUpAt = 0;
  /** the replay has been shown (or skipped) this race */
  let replayed = false;
  /** the grid pan before the lights: seconds in, and how long it lasts (undefined: it's over, or skipped) */
  let gridPan: { t: number; length: number } | undefined;
  /** the grid the race started from (drivers by slot; none: everyone in their own), for restarting it */
  let raceGrid: number[] | undefined;
  /** the race's entrants' drivers (entrant i is driver raceDrivers[i]) */
  let raceDrivers: number[] = [];
  /** your strategy's been said, after GO */
  let strategySaid = false;
  /** The race, from the grid qualifying set (drivers by slot, pole first), or everyone in their own slot. */
  const startRace = (gridSlots?: number[]) => {
    session = 'race';
    learn = undefined;
    quali = undefined;
    trial = undefined;
    attack = undefined;
    raceGrid = gridSlots;
    resetSession();
    const w = drawWeekend();
    noteStat('race_start', { circuit: layout.id, mode: statsMode(), data: pickOf(w) });
    const slots = gridSlots ?? w.drivers.map((_, k) => k);
    raceDrivers = slots;
    you = slots.indexOf(w.youDriver);
    looks = slots.map((k) => addLook(w.drivers[k].livery, w.drivers[k].seat, k === w.youDriver));
    const field = slots.map((k, i) => {
      const slot = circuit.slots[i];
      return { car: newCar(carClass('f1'), slot.x, slot.y, slot.heading), ai: w.drivers[k].ai, box: w.drivers[k].box, start: k === w.youDriver ? options.startTyres : undefined };
    });
    strategySaid = false;
    race = newRace(track, grid, HANDLING, LAPS, field, w.lightsOut, circuit.pit, forecast);
    // (on the ground from the start: the grid pan shows them before the first step puts them there)
    for (const e of race.entrants) e.car.z = groundAt(grid, e.car.x, e.car.y).h;
    hudState = { gaps: newGapTimer(slots.length), lastPos: 0, flashUntil: 0, lapsSeen: new Array(slots.length).fill(0), fastest: undefined };
    // the grid pan first (A skips it), then the lights
    // (unless GRID WALK is off in the settings: straight to the lights)
    gridPan = gridWalkOn() ? { t: 0, length: panLength(slots.length) } : undefined;
    // (every car and the safety car recorded, for the replay)
    recorder = newReplay(slots.length + 1);
    replay = undefined;
    replayed = false;
    crashDue = undefined;
    lastCrashReplay = -Infinity;
  };

  /** Qualifying: you on your own, on a flying lap (A skips it: you start mid-grid). */
  const startQualifying = () => {
    session = 'qualifying';
    gridPan = undefined;
    learn = undefined;
    trial = undefined;
    attack = undefined;
    resetSession();
    const w = drawWeekend();
    noteStat('race_start', { circuit: layout.id, mode: statsMode(), data: pickOf(w) });
    you = 0;
    const d = w.drivers[w.youDriver];
    looks = [addLook(d.livery, d.seat, true)];
    race = newQualifying(track, grid, HANDLING, sessionWeather());
    quali = { lap: newQualiLap(), weekend: w };
    hudState = { gaps: newGapTimer(1), lastPos: 0, flashUntil: 0, lapsSeen: [0], fastest: undefined };
    announce('QUALIFYING · ONE FLYING LAP', '#f2c14e', 3);
  };

  /** A Time Trial: you on your own, on the run-up to your first flying lap, your record lap's ghost to chase. */
  const startTimeTrial = () => {
    session = 'timetrial';
    gridPan = undefined;
    learn = undefined;
    quali = undefined;
    resetSession();
    const w = drawWeekend();
    noteStat('race_start', { circuit: layout.id, mode: statsMode(), data: pickOf(w) });
    you = 0;
    const d = w.drivers[w.youDriver];
    looks = [addLook(d.livery, d.seat, true)];
    race = newQualifying(track, grid, HANDLING, sessionWeather());
    trial = { recorder: newRecorder(), sector: 0, lap: newQualiLap(), record: loadGhost(recordId) };
    // (the medals' laps are shares of it)
    reference ??= referenceLap(track, grid, HANDLING, sessionWeather());
    showMedal();
    hudState = { gaps: newGapTimer(1), lastPos: 0, flashUntil: 0, lapsSeen: [0], fastest: undefined };
    announce(trial.record ? `TIME TRIAL · BEAT ${fmt(trial.record.time)}` : 'TIME TRIAL', '#f2c14e', 3);
  };

  /** A Time Attack: you on your own, on the run-up; at the line the clock starts, and each checkpoint adds time. */
  const startTimeAttack = () => {
    session = 'timeattack';
    gridPan = undefined;
    learn = undefined;
    quali = undefined;
    trial = undefined;
    resetSession();
    const w = drawWeekend();
    noteStat('race_start', { circuit: layout.id, mode: statsMode(), data: pickOf(w) });
    you = 0;
    const d = w.drivers[w.youDriver];
    looks = [addLook(d.livery, d.seat, true)];
    race = newQualifying(track, grid, HANDLING, sessionWeather());
    reference ??= referenceLap(track, grid, HANDLING, sessionWeather());
    const best = rec()?.bestAttack;
    const run = { a: newAttack(reference, difficulty), best, rec: newRecorder() } as NonNullable<typeof attack>;
    attack = run;
    // the Daily Challenge: the day's leading run, as a gold ghost to chase (once it's here)
    const daily = options.daily;
    if (daily) {
      void fetchDailyGhost(daily.day).then((rival) => {
        if (!rival || attack !== run) return;
        run.rival = rival;
        announceNext(`CHASING ${rival.name} · ${distance(rival.score)}`, '#f2c14e', 3);
      });
    }
    showMedal();
    hudState = { gaps: newGapTimer(1), lastPos: 0, flashUntil: 0, lapsSeen: [0], fastest: undefined };
    announce(best ? `TIME ATTACK · BEAT ${distance(best)}` : 'TIME ATTACK · THE CLOCK STARTS AT THE LINE', '#f2c14e', 3);
  };

  /** The controls lap: you on your own on the run-up, a prompt at a time for the controls. */
  const startTutorial = () => {
    session = 'tutorial';
    gridPan = undefined;
    quali = undefined;
    trial = undefined;
    attack = undefined;
    resetSession();
    const w = drawWeekend();
    you = 0;
    const d = w.drivers[w.youDriver];
    looks = [addLook(d.livery, d.seat, true)];
    race = newQualifying(track, grid, HANDLING, sessionWeather());
    learn = { o: newOnboarding(), bends: 0, lastIdx: race.entrants[0].progress.idx };
    hudState = { gaps: newGapTimer(1), lastPos: 0, flashUntil: 0, lapsSeen: [0], fastest: undefined };
  };

  /** A reference lap for the AI's qualifying times (worked out once: it's the same all weekend). */
  let reference: number | undefined;
  /** Qualifying's over: your time (none if you wrecked) against the AI's, and the grid they make, up until A. */
  const endQualifying = (time: number | undefined) => {
    if (!quali) return;
    const w = quali.weekend;
    reference ??= referenceLap(track, grid, HANDLING, sessionWeather());
    const times = aiTimes(w.drivers.map((d) => d.ai?.pace), reference, seededRandom(seed + 1));
    times[w.youDriver] = time;
    // your qualifying record here (apart from the race's lap record)
    if (time !== undefined) {
      saved.newQualifying = recordQualifying(records, recordId, time);
      saveRecords(records);
    }
    quali.over = { grid: gridOrder(times), times };
    // (the session's held from here, on the times: the car falls quiet)
    sounds.quiet();
    showQualifying();
  };

  /** the race kept on the device to pick up (the first weekend only: a restart's a new one) */
  let resuming = options.resume?.mode === (championship ? 'championship' : 'race') && options.resume.circuit === layout.id ? options.resume : undefined;
  /** your lap when the race was last kept (it's kept again as each lap of yours is done) */
  let keptAtLap = -1;
  /** a race picked up: frames to draw before it's paused (the minimap and tower filled in), to go on when you're ready */
  let pauseOnStart = 0;
  /** this race is the one kept (or picked up): it's this one's to throw away (another session leaves a kept race be) */
  let keptHere = false;
  const dropOurs = () => {
    if (keptHere) dropKeptRace();
    keptHere = false;
  };
  /**
   * Keep the race on the device (raceSave.ts), to come back to if the app's closed: a race under way (lights out, your
   * flag still to come), not a replay of it. Each time over the last.
   */
  const keepNow = () => {
    if (session !== 'race' || done || replay || podium || race.phase !== 'racing' || mode !== 'race' || options.daily || layout.id === DESIGNER_DRAFT_ID) return;
    const me = race.entrants[you];
    if (me.progress.finished !== undefined || me.progress.retired) return;
    keptAtLap = me.progress.lap;
    keptHere = true;
    try {
      keepRace({
        v: 1, at: Date.now(), circuit: layout.id, name: layout.name, mode: championship ? 'championship' : 'race', round: championship?.season.round,
        setup: { team: team.id, seat: yourSeat, difficulty: difficulty.id, weather: weather.id, laps: LAPS, startTyres: options.startTyres },
        seed, grid: raceGrid, lapsSaved: saved.laps, you, state: snapshotRace(race),
      });
    } catch {
      // (the device's storage full or off: the race goes on, just not kept)
    }
  };
  /** Pick up `k`, the race kept on the device: the same weekend built again (its seed, its grid), its state laid over it, paused. */
  const resumeRace = (k: KeptRace) => {
    resuming = undefined;
    keptHere = true;
    startRace(k.grid);
    if (!restoreRace(race, k.state, seed) || k.you !== you) {
      // (not this race after all: a fresh one, and the kept one gone)
      dropOurs();
      startRace(k.grid);
      return;
    }
    gridPan = undefined;
    strategySaid = true;
    saved.laps = k.lapsSaved;
    keptAtLap = race.entrants[you].progress.lap;
    hudState.lapsSeen = race.entrants.map((e) => e.progress.lap);
    // (paused once its first few frames are drawn: the pause screen's not up yet while the race is being set up)
    pauseOnStart = 3;
    announce('RACE RESUMED', '#5fe0d0', 2.5);
  };
  /** A new weekend: a new seed (unless ?seed= gave one), then qualifying if it's on, or straight to the race. */
  const newWeekend = () => {
    seed = resuming ? resuming.seed : championship ? roundSeed(championship.season, championship.season.round) : Number.isInteger(seedParam) && seedParam > 0 ? seedParam : newSeed();
    reference = undefined;
    // (a Championship round's weather is its own; a changeable weekend's drawn afresh)
    forecast = roundWeather || (weather.id === 'changeable' ? changeableForecast(seed, raceSeconds) : fixedForecast(weather.id));
    weatherTag.textContent = forecast.name;
    if (mode === 'tutorial') startTutorial();
    else if (mode === 'timetrial') startTimeTrial();
    else if (mode === 'timeattack') startTimeAttack();
    else if (resuming) resumeRace(resuming);
    else if (qualifying) startQualifying();
    else startRace();
  };
  newWeekend();
  /**
   * Restart: in qualifying, qualifying afresh; in a race after qualifying, the same race again from the grid it set (no
   * need to qualify again); without qualifying, a new weekend (new rivals), as ever.
   */
  const restart = () => (dropOurs(), session === 'race' && qualifying ? startRace(raceGrid) : session === 'timetrial' ? startTimeTrial() : session === 'timeattack' ? startTimeAttack() : session === 'tutorial' ? startTutorial() : newWeekend());

  const seen = new Map<Button, number>();
  /** SELECT was pressed: back to the circuits when it's released */
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
        order: () => raceOrder(race).map((i) => looks[i].name),
        you: () => ({ ...race.entrants[you].progress, tow: race.entrants[you].tow, speed: speedOf(race.entrants[you].car), health: race.entrants[you].car.health, x: race.entrants[you].car.x, y: race.entrants[you].car.y }),
        racers: () => race.entrants.map((e, i) => ({ name: looks[i].name, team: looks[i].team.code, react: e.ai?.reaction, speed: Math.round(speedOf(e.car)), lap: e.progress.lap, idx: e.progress.idx, finished: e.progress.finished, retired: !!e.progress.retired, penalty: e.progress.penalty, strikes: e.limits.strikes, health: e.car.health, stops: e.stops, pit: e.pit?.phase, move: e.ai?.move?.kind, craft: e.ai?.craft, mistakes: e.ai?.mistakes, dice: !!e.ai?.rng })),
        safetyCar: () => !!race.sc,
        /** the virtual safety car: seconds it's been out (undefined: it isn't) */
        vsc: () => race.vsc?.out,
        /** call the virtual safety car now, for trying it out */
        /** a changeable race: a shower from now for `seconds`, as hard as `rain` (0…1), and the track soaked to it at once, for trying out the tyre calls */
        shower: (seconds = 60, rain = 0.5) => {
          if (!race.forecast) return;
          race.forecast.showers.push({ from: race.clock, to: race.clock + seconds, rain });
          race.wetness = 2 * rain;
        },
        callVsc: () => {
          callVsc(race);
          announce('VIRTUAL SAFETY CAR', '#f2c14e', 2.5);
        },
        /** your car driven by the AI's line at `pace`, for trying out a session hands-off */
        autopilot: (pace = 0.97) => (race.entrants[you].ai = { lane: 0, pace }),
        /** your car: where, which way, how fast (px/s) */
        me: () => {
          const c = race.entrants[you].car;
          return { x: c.x, y: c.y, heading: c.heading, speed: Math.hypot(c.vx, c.vy) };
        },
        /** Time Trial: laps done, the session's best, your record lap's time and splits */
        /** Time Attack: seconds left, checkpoints passed, whether it's over, and your best here */
        attack: () => attack && { left: attack.a.left, passed: attack.a.passed, over: attack.a.over, best: attack.best, rival: attack.rival?.name, rivalShown: rivalMesh.visible, frames: attack.rec.frames.length / 4 },
        /** a Time Attack's clock run down now (once it's started), for trying out its end */
        timeUp: () => attack && attack.a.left !== undefined && (attack.a.left = 0.01),
        trial: () => trial && { laps: race.entrants[you].progress.lapTimes, best: trial.best?.time, record: trial.record?.time, splits: trial.record?.splits, ghost: ghostMesh.visible },
        /** a street circuit's landmarks (where they stand on the map), and the camera held on a point of the map (none: back on your car), for looking at the scenery */
        landmarks: () => landmarksOf(circuit),
        /** the circuit's grandstands */
        stands: () => standsOf(circuit),
        look: (x?: number, y?: number) => (lookAt = x === undefined || y === undefined ? undefined : { x, y }),
        /** set your tyres' wear (0 new … 1 gone) */
        wear: (w: number) => (race.entrants[you].tyres.wear = Math.max(0, Math.min(1, w))),
        /** the gopher (a circuit with one): what it's doing, where, and its crossings so far */
        /** the yeti (a circuit with one): what it's doing and where, and its chases so far */
        yeti: () => world.yeti && { pose: world.yeti.pose && { ...world.yeti.pose }, chases: world.yeti.chases },
        gopher: () => world.gopher && { phase: world.gopher.crossing?.phase, pose: world.gopher.pose(), crossings: world.gopher.crossings, bolts: world.gopher.bolts },
        /** the champagne ceremony: s it's been on (undefined: it isn't) */
        ceremony: () => podium?.time,
        /** the replay after your flag: whether it's on, the race time it's showing, its end and your finish */
        replay: () => replay && { ...replay },
        /** the grid pan before the lights: whether it's on, and the car it's on */
        gridPan: () => gridPan && { t: gridPan.t, length: gridPan.length, car: panAt(circuit.slots, gridPan.t).car },
        /** the session (qualifying or race), and once qualifying's over, the grid it set (names, pole first) and your time */
        session: () => session,
        qualifying: () => quali?.over && { grid: quali.over.grid.map((k) => (k === quali!.weekend.youDriver ? 'YOU' : quali!.weekend.drivers[k].livery.drivers[quali!.weekend.drivers[k].seat])), you: quali.over.times[quali.weekend.youDriver] },
        skip: (seconds: number) => (race.clock += seconds),
        /** wreck the car in position `pos` (1 = the leader), for trying out the safety car */
        wreck: (pos: number) => applyDamage(race.entrants[raceOrder(race)[pos - 1]].car, 1000, HANDLING),
        /** the team radio's line up now, and the camera's shake (trauma) and the rush of speed */
        radio: () => radioQ.now?.text,
        /** the weather: the forecast, the track's wetness and the rain now, and your tyres (and whether they're the wrong ones) */
        weather: () => ({ forecast: { ...forecast }, wetness: race.wetness, rain: race.rain, condition: race.weather, tyres: race.entrants[you].tyres.compound, wrong: !!race.forecast && wrongTyres(race, you), compounds: race.entrants.map((e) => e.tyres.compound) }),
        feel: () => ({ trauma: shake.trauma, hold: shake.hold, rush: rushNow, battle: battleNow }),
        /** your start off the lights, judged */
        launch: () => ({ ...launch }),
        /** hit your car for `health` (a crash of your own, for trying out the shake and sparks) */
        hitMe: (health: number) => (pendingHit = health),
        /** parts torn off in crashes, flying or lying on the ground now */
        debris: () => debris.count,
        /** show the results table as the race stands, for checking its layout */
        results: () => showResults(raceOrder(race)),
        records: () => records,
        /** mistakes the AI has made this race */
        mistakes: () => mistakeCount,
        /** this race's seed (?seed=<n> plays it again) */
        seed: () => seed,
        /** the music track playing (or loading) */
        music: () => musicPlaying(),
        /** wave the chequered flag for everyone now, in race order (you in `place`, 1 = the winner, if given), for watching the cool-down lap */
        flag: (place?: number) => {
          const ranked = raceOrder(race).filter((i) => i !== you);
          ranked.splice(place ? place - 1 : raceOrder(race).indexOf(you), 0, you);
          ranked.forEach((i, k) => (race.entrants[i].progress = { ...race.entrants[i].progress, finished: race.clock + k * 0.5 }));
        },
        inLap: () => race.entrants.map((e, i) => ({ name: looks[i].name, to: e.inLap?.to, parked: !!e.inLap?.parked, pit: e.pit?.phase })),
        /** put your car on the inside of marked corner `k` (off the track, at its apex), for trying out track limits; `wide`: on its outside instead */
        cut: (k = 0, wide = false) => {
          const me = race.entrants[you];
          const corner = race.corners[k % race.corners.length];
          const s = track.samples[corner.apex];
          const lat = (HALF_WIDTH + 16) * corner.side * (wide ? -1 : 1);
          Object.assign(me.car, { x: s.x + Math.cos(s.dir) * lat, y: s.y + Math.sin(s.dir) * lat, heading: s.dir, vx: Math.sin(s.dir) * 120, vy: -Math.cos(s.dir) * 120 });
          me.progress = { ...me.progress, idx: corner.apex };
        },
        /** damage your car by `share` of its health and put it in the pit entry, turning in, for trying out a stop */
        toPits: (share = 0.5) => {
          const me = race.entrants[you];
          const { pit } = circuit;
          const idx = (pit.entry + 6) % track.samples.length;
          const s = track.samples[idx];
          const out = 58 * pit.side;
          Object.assign(me.car, { x: s.x + Math.cos(s.dir) * out, y: s.y + Math.sin(s.dir) * out, heading: s.dir, vx: Math.sin(s.dir) * 200, vy: -Math.cos(s.dir) * 200 });
          me.progress = { ...me.progress, idx };
          applyDamage(me.car, me.car.cls.health * share, HANDLING);
        },
      },
    });
  }

  // the pit entry is on this side of the track, and the pit wall calls you in when a stop would pay off
  const pitSide = circuit.pit.side < 0 ? 'LEFT' : 'RIGHT';
  const boxBox = () => {
    const me = race.entrants[you];
    const p = me.progress;
    const n = track.samples.length;
    if (!race.pit || p.lapStart === undefined || p.finished !== undefined || !between(p.idx, circuit.pit.entry - 60, circuit.pit.entry + 4, n)) return false;
    return stopCalled(race, me);
  };
  /** The radio's box call: for the tyres the weather wants (when it's turned), or plain. */
  const boxCue = (): RadioCue => {
    const me = race.entrants[you];
    const call: Compound = tyreCall(race, me);
    // (off-road tyres: on dirt, the only ones, so never a change of compound)
    return call === me.tyres.compound || call === 'dirt' ? 'box' : `box-${call}`;
  };

  /** The results (race/resultsView.ts): rebuilt as the others finish, the rows sliding in from when they first went up. */
  /** what the results last showed (they're redrawn only as it changes: the others finishing) */
  let resultsShown = '';
  const showResults = (order: number[]) => {
    if (results.style.display !== 'block') {
      resultsUpAt = performance.now();
      results.style.animation = 'row-in 0.25s ease-out both';
      resultsShown = '';
    }
    const title = championship ? `ROUND ${championship.season.round + 1} OF ${championship.season.rounds.length} · ${layout.name.toUpperCase()}` : `CHEQUERED FLAG · ${difficulty.name} · ${weather.name}`;
    const rows = resultRows(race, order, looks, you, hudState.fastest?.who);
    const notes = [
      { text: `LAP RECORD ${fmt(rec()?.bestLap)}`, isNew: saved.newLap },
      { text: `BEST ${race.laps}-LAP RACE ${fmt(rec()?.bestRace[race.laps])}`, isNew: saved.newRace },
    ];
    const key = JSON.stringify([title, rows, notes]);
    if (key === resultsShown) return;
    resultsShown = key;
    shareButton.reset();
    // (no SHARE on YouTube: its card links out of it)
    renderResults(results, title, rows, notes, championship ? 'NEXT: on to the standings' : undefined, (performance.now() - resultsUpAt) / 1000, YOUTUBE ? undefined : shareButton.el);
  };

  /** Your result as a card to share (race/shareButton.ts, shareCard.ts): a race's, or a Time Attack's. */
  const resultCard = (): ShareCard | undefined => {
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const yours = { name: team.name, body: team.body, trim: team.trim };
    if (attack?.result) {
      const { passed, medal, record, daily } = attack.result;
      return attackCard({
        circuit: layout.name.toUpperCase(), mode: options.daily ? `DAILY CHALLENGE · ${weather.name}` : `TIME ATTACK · ${difficulty.name} · ${weather.name}`,
        distance: distance(passed), medal, record, best: distance(daily ? daily.dayBest.score : Math.max(passed, attack.best ?? 0)), team: yours, date,
        place: daily?.place !== undefined ? `#${daily.place} OF ${daily.entries}` : undefined,
      });
    }
    if (session !== 'race') return undefined;
    const order = raceOrder(race);
    const p = race.entrants[you].progress;
    const winner = race.entrants[order[0]].progress;
    return raceCard({
      circuit: layout.name.toUpperCase(),
      mode: championship ? `CHAMPIONSHIP · ROUND ${championship.season.round + 1} OF ${championship.season.rounds.length}` : `QUICK RACE · ${difficulty.name} · ${weather.name}`,
      place: p.retired || p.finished === undefined ? undefined : order.indexOf(you) + 1, field: race.entrants.length, grid: you + 1,
      gap: p.finished !== undefined ? p.finished + p.penalty - ((winner.finished ?? 0) + winner.penalty) : undefined,
      best: p.lapTimes.length ? fmt(Math.min(...p.lapTimes)) : undefined, fastest: hudState.fastest?.who === you, team: yours, date,
    });
  };
  const shareButton = createShareButton(resultCard, () => map.canvas, () => noteStat('share', { circuit: layout.id, mode: statsMode() }));
  host.append(shareButton.float);
  // the pit lane, the track dry: your next set picked on the way to your box (left/right, or ◀ ▶ tapped), the pit
  // wall's strategy's to start with
  const tyrePick = document.createElement('div');
  style(tyrePick, {
    position: 'absolute', left: '50%', transform: 'translateX(-50%)', zIndex: '3', display: 'none', justifyContent: 'center', alignItems: 'center', gap: '12px',
    padding: '6px', borderRadius: '14px', background: 'rgba(18,17,28,.82)', border: '1px solid #3a3858',
    font: 'calc(13px * var(--ts, 1)) Silkscreen, monospace', color: '#f4f2fa', textShadow: '0 2px 0 #1b1b26', pointerEvents: 'none',
  });
  const tyrePickName = document.createElement('span');
  style(tyrePickName, { minWidth: '9.5em', textAlign: 'center' });
  const stepTyrePick = () => {
    const me = race.entrants[you];
    const now = tyreCall(race, me);
    if (!isDry(now) || !me.pit || me.pit.phase !== 'in') return;
    me.next = now === 'slick' ? 'hard' : 'slick';
    menuTick();
  };
  const tyrePickSide = (text: string) => {
    const b = document.createElement('button');
    b.textContent = text;
    style(b, {
      width: '44px', height: '40px', borderRadius: '10px', border: '1px solid #3a3858', background: 'rgba(37,35,58,.85)', color: '#f4f2fa',
      font: '14px Silkscreen, monospace', pointerEvents: 'auto', touchAction: 'none', cursor: 'pointer',
    });
    let armed = false;
    b.addEventListener('pointerdown', () => (armed = true));
    b.addEventListener('pointerleave', () => (armed = false));
    b.addEventListener('pointerup', () => {
      if (armed) stepTyrePick();
      armed = false;
    });
    return b;
  };
  tyrePick.append(tyrePickSide('◀'), tyrePickName, tyrePickSide('▶'));
  host.append(tyrePick);

  /** Qualifying's times as a table, in grid order: your row in gold; then A or START to go to the grid. */
  const showQualifying = () => {
    if (!quali?.over) return;
    const w = quali.weekend;
    const named = w.drivers.map((d, k) => ({ name: k === w.youDriver ? 'YOU' : d.livery.drivers[d.seat], team: d.livery }));
    renderQualifying(results, `QUALIFYING · ${difficulty.name} · ${weather.name}`, qualifyingRows(quali.over.grid, quali.over.times, named, w.youDriver), {
      text: `QUALIFYING RECORD ${fmt(rec()?.bestQualifying)}`, isNew: saved.newQualifying,
    });
  };

  // vibration on or off, from the pause screen (and remembered)
  const rumbleState = newRumble();
  /** the grandstands (where the crowd is heard) */
  const stands = standsOf(circuit);
  // the settings, from the pause screen: the menu's (but difficulty, not changed mid-race), each remembered as it
  // changes; tapped and swiped, or up/down and left/right on the deck, A, START or B back to the pause screen
  const pauseSettings = document.createElement('div');
  pauseSettings.className = 'circuit-menu pause-settings';
  style(pauseSettings, { zIndex: '5', display: 'none', justifyContent: 'center', background: '#000' });
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
  const openPauseSettings = (on: boolean) => {
    if (on === pauseSettingsOn) return;
    menuPick();
    pauseSettingsOn = on;
    pauseSettings.style.display = on ? 'flex' : 'none';
    // (the pause screen's buttons out of the way under it)
    pauseScreen.style.visibility = on ? 'hidden' : '';
    pauseFocus = 0;
    showPauseFocus();
  };
  // the pause screen's buttons, and in their place once EXIT is pressed, the question: leave? (STAY first)
  const pauseMain = [
    pauseButton('RESUME', () => setPaused(false)),
    pauseButton('RESTART', () => restart()),
    pauseButton('SETTINGS', () => openPauseSettings(true)),
    // a report: the race as it is (the pause screen out of the picture), to draw on and say what happened (not on
    // YouTube: it goes to the game's own backend)
    ...(YOUTUBE ? [] : [pauseButton('REPORT', () => void openReport({ circuit: layout.id, mode: statsMode() }, [pauseScreen]))]),
    pauseButton('EXIT', () => askExit(true)),
  ];
  const exitLine = document.createElement('div');
  style(exitLine, { color: '#9d9ab8', font: 'calc(11px * var(--ts, 1)) Silkscreen, monospace', textAlign: 'center', margin: '-4px 16px 6px', textWrap: 'balance' });
  const stayButton = pauseButton('STAY', () => askExit(false));
  const leaveButton = pauseButton('EXIT', () => onQuit());
  style(leaveButton, { borderColor: '#d8323c', color: '#ff6b6b' });
  const exitParts = [exitLine, stayButton, leaveButton];
  /** EXIT pressed: asked once more (the button the deck's on: 0 STAY, 1 EXIT) */
  let asking = false;
  let exitFocus = 0;
  const showExitFocus = () => {
    stayButton.style.boxShadow = exitFocus === 0 ? '0 0 0 2px #5fe0d0' : '';
    leaveButton.style.boxShadow = exitFocus === 1 ? '0 0 0 2px #ff6b6b' : '';
  };
  /** What leaving loses, said under the question. */
  const exitCost = () => championship ? "THE ROUND WON'T COUNT" : options.daily ? 'THIS RUN WON\'T COUNT' : session === 'race' || session === 'qualifying' ? "THIS RACE WON'T COUNT" : 'BACK TO THE CIRCUITS';
  const askExit = (on: boolean) => {
    if (on === asking) return;
    if (on) menuPick();
    asking = on;
    pauseTitle.textContent = !on ? 'PAUSED' : session === 'race' || session === 'qualifying' ? 'LEAVE THE RACE?' : 'LEAVE THE SESSION?';
    exitLine.textContent = exitCost();
    for (const el of pauseMain) el.style.display = on ? 'none' : '';
    for (const el of exitParts) el.style.display = on ? '' : 'none';
    exitFocus = 0;
    showExitFocus();
  };
  pauseScreen.append(pauseTitle, ...pauseMain, ...exitParts);
  for (const el of exitParts) el.style.display = 'none';
  // the phone's back button: a replay skipped, the pause screen's settings closed, the pause screen resumed, the race paused; once
  // it's over, on (a Championship round with its results seen counts, as with A)
  const offBack = onBack(() => {
    if (replay && !paused) endReplay();
    else if (pauseSettingsOn) openPauseSettings(false);
    else if (asking) askExit(false);
    else if (paused) setPaused(false);
    else if (!done) setPaused(true);
    else if (championship && results.style.display === 'block') finishRound();
    else onQuit();
    return true;
  });
  // leaving the app or the tab (or YouTube pausing the game: host.ts) pauses the race; so do Esc and P on a keyboard
  const offHidden = onHidden((hidden) => {
    if (hidden && !done) setPaused(true);
    // (kept as it goes out of sight, paused already or not: the app may not come back)
    if (hidden) keepNow();
  });
  const onKey = (e: KeyboardEvent) => {
    if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat && !(e.target instanceof HTMLInputElement) && !reportOpen() && !done) setPaused(!paused);
  };
  window.addEventListener('keydown', onKey);

  /** A Championship round's result to the season: the drivers in finishing order, and the ones who didn't finish. */
  let roundDone = false;
  const finishRound = () => {
    if (!championship || roundDone) return;
    roundDone = true;
    const ranked = raceOrder(race);
    const out = new Set(ranked.filter((i) => race.entrants[i].progress.retired).map((i) => raceDrivers[i]));
    championship.onDone(ranked.map((i) => raceDrivers[i]), out);
  };

  /** The device you're driving with (before you've touched anything: touch on a touch screen, else keys). */
  const device = (): Device => {
    const s = controls.lastSource();
    if (s === 'keyboard') return 'keys';
    if (s === 'gamepad') return 'pad';
    if (s === 'dpad' || s === 'wheel') return 'touch';
    return window.matchMedia?.('(any-pointer: coarse)').matches ? 'touch' : 'keys';
  };

  // ---------------------------------------------------------------- time trial
  /**
   * A new lap record of yours in a Time Trial: on to the circuit's online board (with your initials; kept to send
   * later without them, or offline), and your place there said once the record's announcement is over.
   */
  const boardLap = (time: number) => {
    if (!isBoardWeather(recordKind)) return;
    queueLap({ circuit: layout.id, weather: recordKind, time });
    const name = initials();
    if (!name) return;
    const player = playerId();
    const weatherNow = recordKind;
    void sendLaps(player, name, typeof __APP_VERSION__ === 'string' ? __APP_VERSION__.slice(0, 40) : undefined).then(async (sent) => {
      if (!sent) return;
      const board = await fetchLapBoard(layout.id, weatherNow, player, 1);
      if (board?.you && session === 'timetrial') {
        announceNext(board.you.place === 1 ? `WORLD RECORD · #1 OF ${board.entries}` : `WORLD BOARD · #${board.you.place} OF ${board.entries}`, board.you.place === 1 ? '#f2c14e' : '#5fe0d0', 3);
      }
    });
  };
  const signed = (d: number) => `${d < 0 ? '−' : '+'}${Math.abs(d).toFixed(2)}`;
  /** A Time Trial lap done, `g`: a new record (saved, and the ghost from now on), the session's best, or neither. */
  const trialLapDone = (g: Ghost) => {
    if (!trial) return;
    const { record, best } = trial;
    if (!record || g.time < record.time) {
      trial.record = g;
      saveGhost(recordId, g);
      boardLap(g.time);
      announce(`NEW RECORD ${fmt(g.time)}${record ? ` · ${signed(g.time - record.time)}` : ''}`, splitColor('record'), 3);
      sounds.record();
    } else if (!best || g.time < best.time) announce(`BEST LAP ${fmt(g.time)} · ${signed(g.time - record.time)}`, splitColor('better'), 3);
    else announce(`LAP ${fmt(g.time)} · ${signed(g.time - best.time)}`, splitColor('worse'), 3);
    if (!best || g.time < best.time) trial.best = g;
    // a medal here, better than the one you had: said over the rest
    const medal = reference === undefined ? undefined : lapMedal(g.time, reference);
    if (medal && awardMedal(layout.id, 'trial', medal)) {
      showMedal();
      stampMedal(host, medal, fmt(g.time));
      sounds.record();
      achieve(medalAchievements(loadTrophies(), LAYOUTS.map((l) => l.id)));
    }
  };
  /** A Time Trial step (`cut`: you cut a corner): the lap's verdict at the line, its splits, and its frames for a ghost. */
  const stepTrial = (cut: boolean) => {
    if (!trial) return;
    const me = race.entrants[you];
    const p = me.progress;
    // no tyre wear against the clock: every lap on fresh tyres
    me.tyres.wear = 0;
    fitTyres(me.tyres, me.car, race.wetness);
    const verdict = judgeLap(trial.lap, p, cut);
    if (p.lapStart !== trial.lapStart) {
      // over the line: the lap before is over (as the verdict says), and the next is timed
      const done = trial.recorder;
      trial.recorder = newRecorder();
      trial.lapStart = p.lapStart;
      trial.sector = 0;
      if (verdict && typeof verdict === 'object') trialLapDone(toGhost(done, verdict.time));
      else if (verdict === 'void') announce('LAP DELETED · GO AGAIN', '#f2c14e', 2);
      else announce('FLYING LAP', '#5fe0d0', 1.5);
    }
    if (verdict === 'deleted') {
      announce('LAP DELETED · TRACK LIMITS', '#d8323c', 3);
      sounds.trackLimits(true);
    }
    if (p.lapStart === undefined) return;
    const t = race.clock - p.lapStart;
    // a sector's split, against the session's best lap and your record
    if (p.sector > trial.sector) {
      trial.sector = p.sector;
      trial.recorder.splits.push(t);
      if (!trial.lap.deleted) {
        const k = p.sector - 1;
        const { delta, mark } = markSplit(t, k, trial.best ?? trial.record, trial.record);
        announce(`S${k + 1} ${fmt(t)}${delta === undefined ? '' : ` · ${signed(delta)}`}${splitWord(mark)}`, splitColor(mark), 2);
      }
    }
    recordFrame(trial.recorder, t, me.car, p.idx);
  };
  // ---------------------------------------------------------------- time attack
  /** A Time Attack step (`cut`: you cut a corner): the clock, time added at each checkpoint, and TIME UP. */
  const stepTimeAttack = (cut: boolean) => {
    if (!attack || attack.a.over) return;
    const me = race.entrants[you];
    const p = me.progress;
    // no tyre wear against the clock: fresh tyres all the way
    me.tyres.wear = 0;
    fitTyres(me.tyres, me.car, race.wetness);
    const reachedBefore = attackMedal(attack.a.passed, attack.a.generous);
    const step = stepAttack(attack.a, SIM_DT, p.lapStart !== undefined, p.lapTimes.length * SECTORS + p.sector, cut);
    // (the run, for the board's ghost: from the clock starting)
    if (attack.a.left !== undefined) recordFrame(attack.rec, attack.a.elapsed, me.car, p.idx);
    // a medal's distance passed: the line shows the next one's
    if (attackMedal(attack.a.passed, attack.a.generous) !== reachedBefore) showMedal();
    if (step.started) announce('THE CLOCK IS RUNNING', '#5fe0d0', 1.5);
    if (step.added) announce(`+${step.added.toFixed(1)} S`, '#5fe0d0', 1.2);
    if (step.lost) {
      announce(`CUT · −${step.lost} S`, '#d8323c', 2);
      sounds.trackLimits(true);
    }
    if (step.timeUp) {
      noteStat('race_finish', { circuit: layout.id, mode: 'timeattack', data: { passed: attack.a.passed } });
      const passed = attack.a.passed;
      const record = recordAttack(records, recordId, passed);
      if (record) saveRecords(records);
      const medal = attackMedal(passed, attack.a.generous);
      attack.result = { passed, record, medal, newMedal: awardMedal(layout.id, 'attack', medal) };
      if (options.daily) dailyRun(options.daily.day, { score: passed, time: attack.a.lastAt }, packGhost(toGhost(attack.rec, attack.a.elapsed), GHOST_HZ));
      if (attack.result.newMedal && medal) {
        sounds.record();
        stampMedal(host, medal, distance(passed));
        achieve(medalAchievements(loadTrophies(), LAYOUTS.map((l) => l.id)));
      }
      showMedal();
      if (record) sounds.record();
      sounds.quiet();
    }
  };
  // your record lap's ghost: your car, see-through, driving it again from the line
  const ghostMesh = createCarMesh('f1', { body: '#f4f4f8', stripe: '#9d9ab8' }, !!circuit.layout.dirt);
  /** the track sample the ghost is beside (followed round, for its level on a bridge) */
  let ghostIdx: number | undefined;
  ghostMesh.traverse((o) => {
    const mesh = o as THREE.Mesh;
    for (const m of [mesh.material ?? []].flat() as THREE.Material[]) {
      m.transparent = true;
      m.opacity = 0.35;
      m.depthWrite = false;
    }
    mesh.castShadow = false;
  });
  ghostMesh.visible = false;
  world.scene.add(ghostMesh);
  // the Daily Challenge's leading run: a gold ghost, as far into its run as you are into yours
  const rivalMesh = createCarMesh('f1', { body: '#f2c14e', stripe: '#b07a22' }, !!circuit.layout.dirt);
  let rivalIdx: number | undefined;
  rivalMesh.traverse((o) => {
    const mesh = o as THREE.Mesh;
    for (const m of [mesh.material ?? []].flat() as THREE.Material[]) {
      m.transparent = true;
      m.opacity = 0.4;
      m.depthWrite = false;
    }
    mesh.castShadow = false;
  });
  rivalMesh.visible = false;
  world.scene.add(rivalMesh);

  /** What each deck button does just now (race/deckLabels.ts). */
  const deckLabels = () => labelsFor({
    settings: pauseSettingsOn, resultsUp: results.style.display === 'block', roundOver: !!championship && done, qualifyingOver: !!quali?.over,
    attackOver: !!attack?.result, session, learnt: learn?.o.step === 'done', watching: !!gridPan || !!replay, done, paused,
  });
  const deckEl = document.getElementById('deck');
  /** a touch screen: STEER there is the steering slider and the pedals, in the thumbstick's and A's places (index.html) */
  const touchScreen = window.matchMedia?.('(any-pointer: coarse)').matches ?? false;
  const showDeckLabels = () => {
    deckEl?.classList.toggle('steer-deck', touchScreen && driveStyle() === 'steer');
    const labels = deckLabels();
    for (const k of ['a', 'b', 'start', 'select'] as const) hud.setLabel(k, labels[k]);
    // with the results (or qualifying's times) up, RESTART and EXIT go under the table, big (on a phone: index.html)
    const resultsUp = results.style.display === 'block' && !paused;
    deckEl?.classList.toggle('results-up', resultsUp);
    // (and TUNE and the thumbstick go too while they're up: index.html)
    document.documentElement.classList.toggle('results-up', resultsUp);
    // (the champagne ceremony: nothing to steer either, so no thumbstick: index.html)
    document.documentElement.classList.toggle('ceremony', !!podium && !resultsUp);
    // (the pause screen too: its buttons and settings rows are tapped)
    document.documentElement.classList.toggle('paused', paused);
    // on a phone the results have the screen to themselves (no readout, minimap or timing tower), and the table with
    // the buttons under it (12 px gap, 52 px tall) sits in the middle of the screen, top to bottom
    const alone = resultsUp && phoneHud;
    // (and the champagne ceremony, on any screen: the set and its name plates, nothing else)
    const clear = (phoneHud && resultsUp) || (!!podium && !resultsUp && !paused);
    for (const el of [readout, mini, tower]) el.style.visibility = clear ? 'hidden' : '';
    if (alone) results.style.top = `${Math.max(8, (host.clientHeight - results.offsetHeight - 64) / 2)}px`;
    else if (results.style.top !== '18%') results.style.top = '18%';
    if (resultsUp) document.documentElement.style.setProperty('--results-bottom', `${results.offsetTop + results.offsetHeight}px`);
  };

  // ---------------------------------------------------------------- loop
  const focus = new THREE.Vector3(race.entrants[you].car.x, 0, race.entrants[you].car.y);
  const target = new THREE.Vector3();
  let miniTime = 0;

  /** the camera held on a point of the map (a debug hook, for looking at the scenery) */
  let lookAt: { x: number; y: number } | undefined;
  /** the camera's zoom for the grid pan, eased */
  let panZoom = 1;
  /** the view has been closed: the loop stops */
  let closed = false;
  const tick = (now: number) => {
    if (closed) return;
    // (the first frame's timestamp can be a touch before mount time)
    const real = Math.max(0, (now - last) / 1000);
    const dt = Math.min(0.05, real);
    last = now;
    // (the time on the circuit as it passes, slow frames and all; a gap of more than a second is the tab put away)
    if (!paused && real < 1) drivenSecs += real;
    showDeckLabels();
    // the pause screen's settings: the deck moves through them (and nothing else)
    // (a report being made: the deck and keys are its, not the race's)
    if (reportOpen()) {
      requestAnimationFrame(tick);
      return;
    }
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
    // (SELECT pauses while racing, as its label says; otherwise it exits)
    const selectPauses = deckLabels().select === 'PAUSE';
    // A pauses and resumes (not once the race is over: the results are up); in qualifying it skips it, or once it's
    // over goes to the grid
    const aPressed = pressed('a');
    // a Championship round, over: on to the standings with the result, once you've seen the results (and a finished
    // round can't be restarted)
    if (championship && done && (aPressed || startPressed) && results.style.display === 'block') finishRound();
    else if (quali?.over && (aPressed || startPressed)) startRace(quali.over.grid);
    else if (attack?.result && (aPressed || startPressed)) startTimeAttack();
    else if (startPressed && !(championship && done)) restart();
    else if (aPressed && session === 'qualifying') startRace();
    // the controls lap: A skips it, or once it's done goes on to the menu
    else if (aPressed && session === 'tutorial') onQuit();
    // the grid pan: A skips it, straight to the lights
    else if (aPressed && gridPan) endPan();
    // a replay: A skips it, back to the race (or, after your flag, on to the ceremony)
    else if (aPressed && replay) endReplay();
    else if (aPressed && !done) setPaused(!paused);
    // after your flag (or once you're out), A goes straight to the champagne ceremony, then the results
    else if (aPressed && done && results.style.display !== 'block') {
      if (!podium) startCeremony();
      else podium.time = PODIUM_HOLD;
    }
    // SELECT pauses while racing; otherwise it goes back to the circuits once it's let go: leaving the page with a
    // finger still down can leave the next page deaf to touch on a phone (in itch.io's frame the lifting finger's
    // events go to a page that's gone)
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
    // paused (or qualifying's times up): nothing moves, and the last frame stays on the screen
    if (attack?.result) {
      const { passed, record, medal, newMedal, daily } = attack.result;
      // (the Daily Challenge: your best today, and your place on the board once it's back)
      banner.style.whiteSpace = 'pre-line';
      banner.textContent = daily
        ? `TIME UP · ${distance(passed)}\n${daily.best ? 'NEW BEST TODAY' : `TODAY'S BEST ${distance(daily.dayBest.score)}`}${daily.place ? ` · #${daily.place} OF ${daily.entries}` : ''}`
        // (the result, then on a line of its own the medal and the record, or your best: never broken mid-phrase)
        : [`TIME UP · ${distance(passed)}`, [medal ? `${MEDAL_NAME[medal]}${newMedal ? ' MEDAL!' : ''}` : '', record ? 'NEW RECORD' : attack.best ? `BEST ${distance(attack.best)}` : ''].filter(Boolean).join(' · ')].filter(Boolean).join('\n');
      banner.style.color = medal && newMedal ? MEDAL_COLOR[medal] : record || daily?.best ? splitColor('record') : '#f2c14e';
    } else banner.style.whiteSpace = '';
    // (SHARE under a Time Attack's result)
    // (under the banner as it stands, however many lines it takes)
    shareButton.floatAt(attack?.result && !YOUTUBE ? `${banner.offsetTop + banner.offsetHeight + 12}px` : undefined);
    // (your next set, on the way to your box in the dry: under the banner)
    {
      const me = race.entrants[you];
      // (left and right watched every frame, so the first press in the pit lane counts)
      const stepped = [pressed('left'), pressed('right')].some(Boolean);
      const call = session === 'race' && me.pit?.phase === 'in' ? tyreCall(race, me) : undefined;
      if (call && isDry(call) && !paused) {
        if (stepped) stepTyrePick();
        tyrePick.style.display = 'flex';
        // (under the banner, and under the radio if it's on: never over either)
        const radioOn = radioPanel.style.display !== 'none';
        tyrePick.style.top = `${Math.max(banner.offsetTop + banner.offsetHeight, radioOn ? radioPanel.offsetTop + radioPanel.offsetHeight : 0) + 10}px`;
        tyrePickName.textContent = `NEXT: ${COMPOUNDS[call].name}`;
        tyrePickName.style.color = COMPOUNDS[call].color;
      } else tyrePick.style.display = 'none';
    }
    // (your strategy, said once the race is under way: its tyres, its stops, and the lap you'll box)
    if (session === 'race' && !strategySaid && race.phase === 'racing' && race.clock > 1.4) {
      strategySaid = true;
      const mine = race.entrants[you].plan;
      if (mine && race.laps >= 3) announceNext(`STRATEGY: ${planText(mine.plan)}${mine.stopAt !== undefined ? ` · BOX LAP ${mine.stopAt}` : ''}`, '#5fe0d0', 4);
    }
    if (paused || quali?.over || attack?.result) {
      // (a screenshot waiting for a frame, the report's: the still picture drawn again for it)
      if (frameWanted()) {
        const q = QUALITY_LEVELS[governor.level];
        post.render(0, { bloom: LOOK.bloom, blur: LOOK.blur, bloomOn: q.bloom, blurOn: q.blur && !(ceremony.group.visible && !!podium) });
      }
      requestAnimationFrame(tick);
      return;
    }
    const laps = race.laps;

    // the race: everyone drives, the rules run
    const pad = { stick: controls.direction(), a: controls.isDown('a'), b: controls.isDown('b') };
    // the device you last used, and DRIVING in the settings, decide how you drive: pointing where to go (the touch
    // stick, the arrows as eight ways, a gamepad's left stick), or steering the car itself (up or the right trigger
    // is gas, down or the left trigger the brake; on the touch stick, up and down, across steers)
    const source = controls.lastSource();
    const drive = source === 'gamepad' ? controls.drive('gamepad') : undefined;
    // (STEER on a touch screen: the slider turns, the pedals are the gas and the brake)
    const pedals = source === 'wheel' ? controls.drive('wheel') ?? { turn: 0, gas: 0, brake: 0 } : undefined;
    const points = pointsOn(device());
    const driveInput = (car: Car) =>
      points ? playerInput(drive ? { ...pad, stick: drive.stick ?? { x: 0, y: 0 } } : pad)
      : drive ? wheelInput({ ...drive, drift: pad.b }, car)
      : pedals ? wheelInput({ ...pedals, drift: false }, car)
      : source === 'keyboard' ? wheelInput(keysWheel({ up: controls.isDown('up'), down: controls.isDown('down'), left: controls.isDown('left'), right: controls.isDown('right') }, pad.b), car)
      : wheelInput(stickWheel(pad.stick, pad.b), car);
    // the start: once all five lights are lit, going is a jump start; after they're out, your reaction is judged
    if (session === 'race' && !gridPan) {
      const car = race.entrants[you].car;
      const input = driveInput(car);
      const gas = input.wheel ? (input.wheel.reverse ? 0 : input.wheel.gas) : Math.hypot(input.steer?.x ?? 0, input.steer?.y ?? 0);
      const verdict = stepLaunch(launch, race.phase === 'lights' && race.clock >= 0, race.phase === 'racing' ? race.clock : undefined, gas);
      if (verdict === 'jump') {
        race.entrants[you].progress.penalty += LAUNCH.jumpPenalty;
        achieve(['too-keen']);
        announce(`JUMP START · +${LAUNCH.jumpPenalty} S`, '#d8323c', 3);
        sayRadio('jump-start');
      } else if (verdict && verdict !== 'slow') {
        const kick = kickOf(verdict);
        car.vx += Math.sin(car.heading) * kick;
        car.vy -= Math.cos(car.heading) * kick;
        if (verdict === 'great') achieve(['rocket']);
        announce(`${verdict === 'great' ? 'GREAT' : 'GOOD'} LAUNCH · ${launch.reaction!.toFixed(2)} S`, verdict === 'great' ? '#b36bff' : '#5fe0d0', 2);
      }
    }
    const healthBefore = race.entrants[you].car.health;
    // (the debug hook's hit, dealt inside the frame so the frame feels it)
    if (pendingHit) {
      applyDamage(race.entrants[you].car, pendingHit, HANDLING);
      pendingHit = 0;
    }
    // the race runs in fixed steps: as many as this frame's time holds (none, one, or a few)
    // (during the grid pan nothing moves and the lights wait)
    if (gridPan) {
      gridPan.t += dt;
      if (gridPan.t >= gridPan.length) endPan();
    }
    // the replay: a few seconds after your flag (the flag's moment live), the race holds and your finish plays again
    {
      const mine = race.entrants[you].progress;
      if (!replay && !replayed && session === 'race' && mine.finished !== undefined && race.clock >= mine.finished + REPLAY.startAt && !podium && results.style.display !== 'block') {
        const w = replayWindow(recorder, mine.finished);
        replay = { t: w.from, to: w.to, kind: 'finish', at: mine.finished, follow: you };
      }
      // a big crash's: a moment after it, the seconds round it, on the crashed car (then the race goes on)
      if (!replay && crashDue && race.clock >= crashDue.at + CRASH_REPLAY.delay) {
        const w = crashWindow(recorder, crashDue.at);
        replay = { t: w.from, to: w.to, kind: 'crash', at: crashDue.at, follow: crashDue.who };
        crashDue = undefined;
      }
      if (replay) {
        replay.t += dt * (replay.kind === 'crash' ? crashSpeed(replay.t, replay.at) : replaySpeed(replay.t, replay.at));
        if (replay.t >= replay.to) endReplay();
      }
    }
    // (through a big hit's hit-stop, the race runs at a crawl)
    const { steps, alpha } = gridPan || replay ? { steps: 0, alpha: 1 } : advance(simClock, dt * timeScale(shake));
    const raceEvents: RaceEvent[] = [];
    const cars: StepEvents[] = race.entrants.map(() => ({ damage: 0, skidding: false, wreckedNow: false, onRough: false, airborne: false, landed: 0 }));
    for (let k = 0; k < steps; k++) {
      before = [...race.entrants.map((e) => e.car), ...(race.sc ? [race.sc.car] : [])].map((c) => ({ x: c.x, y: c.y, z: c.z, heading: c.heading }));
      const s = stepRace(race, SIM_DT, (e) => driveInput(e.car));
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
      // gaps at the timing points, timed to the step
      if (race.phase === 'racing') stepGaps(hudState.gaps, race.entrants.map((e) => e.progress), track, race.clock);
      if (trial) stepTrial(s.race.some((e) => (e.kind === 'track-limits' || e.kind === 'off-track') && e.who === you));
      if (attack) stepTimeAttack(s.race.some((e) => e.kind === 'track-limits' && e.who === you));
      if (session === 'race' && race.phase === 'racing') {
        const scCar = race.sc?.car;
        recordReplay(recorder, race.clock, [...race.entrants.map((e) => (running(e) && e.pit?.phase !== 'garage' ? { x: e.car.x, y: e.car.y, z: e.car.z, heading: e.car.heading, condition: condition(e.car) } : undefined)), scCar]);
      }
    }
    // a frame between steps (a screen faster than the simulation) carries on the last one's skids and ground
    if (steps === 0) frameEvents.forEach((ev, i) => cars[i] && Object.assign(cars[i], { skidding: ev.skidding, onRough: ev.onRough, airborne: ev.airborne }));
    frameEvents = cars;
    const step = { cars, race: raceEvents };
    // qualifying: a cut deletes the lap you're on; a good lap (or a wreck) ends it
    if (quali) {
      // (track limits against the clock: a cut, or all four wheels past the white line anywhere)
      const lap = judgeLap(quali.lap, race.entrants[you].progress, raceEvents.some((e) => (e.kind === 'track-limits' || e.kind === 'off-track') && e.who === you));
      if (lap === 'deleted') {
        announce('LAP DELETED · TRACK LIMITS', '#d8323c', 3);
        sounds.trackLimits(true);
      } else if (lap === 'void') announce('FLYING LAP · GO AGAIN', '#f2c14e', 2);
      else if (lap) endQualifying(lap.time);
      else if (race.entrants[you].car.wrecked) endQualifying(undefined);
      else if (!quali.flying && race.entrants[you].progress.lapStart !== undefined) {
        // over the line from the run-up: the clock's running
        quali.flying = true;
        announce('FLYING LAP', '#5fe0d0', 1.5);
      }
    }
    // the controls lap: the prompt moves on as you do each thing; a wreck starts it again
    if (learn) {
      const me = race.entrants[you];
      const p = me.progress;
      me.tyres.wear = 0;
      fitTyres(me.tyres, me.car, race.wetness);
      learn.bends += apexesPassed(race.corners.map((c) => c.apex), learn.lastIdx, p.idx, track.samples.length);
      learn.lastIdx = p.idx;
      const facts = { speed: speedOf(me.car), top: me.car.cls.topSpeed, bends: learn.bends, drifting: pad.b, canDrift: device() !== 'touch', lapDone: p.lapTimes.length > 0 };
      if (nextPrompt(learn.o, facts)) sounds.record();
      if (me.car.wrecked) startTutorial();
    }
    // your car's vibration: crashes, landings, grass and gravel, kerbs
    {
      const me = race.entrants[you];
      const ev = step.cars[you];
      const cell = circuit.cells[Math.floor(me.car.y / TILE) * circuit.width + Math.floor(me.car.x / TILE)];
      const felt = {
        dt, speed: speedOf(me.car), topSpeed: me.car.cls.topSpeed, healthLost: healthBefore - me.car.health,
        wreckedNow: ev.wreckedNow, landed: ev.landed, onRough: ev.onRough, onKerb: cell === 'kerb',
      };
      vibrate(rumble(rumbleState, felt));
      // and the camera's shake (not in the replay, nor once you're out)
      stepShake(shake, replay || !running(me) ? { ...felt, healthLost: 0, wreckedNow: false, landed: 0, onRough: false, onKerb: false } : felt);
      // and its sounds: the engine, tyres, ground, the nearest rival, and hits
      const lost = healthBefore - me.car.health;
      if (lost > 0) tookDamage = true;
      if (ev.wreckedNow) sounds.hit(1);
      else if (lost > 0.5) sounds.hit(Math.min(1, 0.25 + lost / 15));
      // (and the scrape of metal with the sparks)
      if (!replay && (lost > 0.5 || ev.landed > 160)) sounds.scrape(Math.min(1, 0.3 + Math.max(lost, 0) / 10));
      else if (ev.landed > 160) sounds.hit(0.3);
      if (!running(me) || me.car.wrecked || replay) sounds.quiet();
      else {
        const f = { x: Math.sin(me.car.heading), y: -Math.cos(me.car.heading) };
        let rival: { speed: number; distance: number } | undefined;
        race.entrants.forEach((o, i) => {
          if (i === you || !running(o) || o.car.wrecked) return;
          const d = Math.hypot(o.car.x - me.car.x, o.car.y - me.car.y);
          if (!rival || d < rival.distance) rival = { speed: speedOf(o.car), distance: d };
        });
        sounds.update({
          dt, speed: speedOf(me.car), top: me.car.cls.topSpeed, slide: Math.abs(me.car.vx * -f.y + me.car.vy * f.x),
          onRough: ev.onRough, onKerb: cell === 'kerb', rival, tow: me.tow,
          onGravel: cell === 'gravel', crowd: crowdNear(stands, me.car.x, me.car.y),
          limiter: !!me.pit && inLimitZone(circuit.pit, circuit.pit.points[me.pit.at].s),
        });
      }
    }
    mistakeCount += step.race.filter((e) => e.kind === 'mistake').length;
    for (const e of step.race) {
      // achievements as they happen: a stop, lapping a car, a wreck (in a race)
      if (session === 'race') {
        if (e.kind === 'pit-stop' && e.who === you) achieve(['box']);
        // (the cars you hit off the start: TORPEDO at the Ardennes, three or more)
        if (e.kind === 'contact' && (e.a === you || e.b === you) && race.phase === 'racing' && race.clock <= TORPEDO.window) {
          startHits.add(e.a === you ? e.b : e.a);
          if (torpedo(layout.id, startHits)) achieve(['torpedo']);
        }
        if (e.kind === 'blue' && e.by === you) achieve(['lapped']);
        if (e.kind === 'wreck' && e.who === you) achieve(['scrapheap']);
      }
      if (e.kind === 'lights-out') {
        sounds.go();
        // (the crowd roars them away)
        if (session === 'race') sounds.cheer(0.9);
      }
      else if (e.kind === 'safety-car') {
        announce('SAFETY CAR', '#f2c14e', 2.5);
        sayRadio('safety-car');
      }
      else if (e.kind === 'vsc') {
        announce('VIRTUAL SAFETY CAR', '#f2c14e', 2.5);
        sayRadio('vsc');
      }
      else if (e.kind === 'vsc-ending') announce('VSC ENDING', '#f2c14e', VSC.warn);
      else if (e.kind === 'green') {
        announce('GREEN FLAG', '#5fe0d0', 2);
        sayRadio('green');
      }
      else if (e.kind === 'penalty' && e.who === you) announce(`NO PASSING UNDER ${race.vsc ? 'VSC' : 'SC'} · +${e.seconds} S`, '#d8323c', 3);
      else if (e.kind === 'track-limits' && e.who === you && session === 'tutorial') announce("THAT'S A CUT: IN A RACE, A WARNING, THEN +5 S", '#d8323c', 3);
      else if (e.kind === 'track-limits' && e.who === you && session === 'race') {
        sayRadio(e.seconds ? 'penalty' : 'warning');
        announce(e.seconds ? `TRACK LIMITS · +${e.seconds} S` : `TRACK LIMITS · WARNING ${e.strike}/${LIMITS.warnings}`, e.seconds ? '#d8323c' : '#f2c14e', 2.5);
        sounds.trackLimits(e.seconds > 0);
      }
      // (cleared off the track: hidden, though the replay may show it again)
      else if (e.kind === 'retired') looks[e.who].mesh.visible = false;
      // a big crash tears the nose off (the car keeps going, if it can); a wreck loses a wheel or two as well
      else if (e.kind === 'crash') {
        // a big one: replayed in a moment (in a race, before your flag)
        const me = race.entrants[you];
        const them = race.entrants[e.who].car;
        if (session === 'race' && !done && !crashDue && wantsCrashReplay({
          mine: e.who === you, wrecked: e.wrecked, hit: e.hit, bigHit: SAFETY_CAR.bigHit, distance: Math.hypot(them.x - me.car.x, them.y - me.car.y), now: race.clock, last: lastCrashReplay,
        })) {
          crashDue = { at: race.clock, who: e.who };
          lastCrashReplay = race.clock;
        }
        // (a gasp from the stands)
        sounds.cheer(e.wrecked ? 0.55 : 0.3);
        if (e.who === you && e.wrecked) sayRadio('wreck');
        const { nose, wheels } = looks[e.who].mesh.userData.parts;
        const power = e.wrecked ? 1 : Math.min(1, e.hit * 1.5);
        debris.tear(nose, race.clock, e.vx, e.vy, power);
        if (e.wrecked) {
          const first = Math.floor(Math.random() * 4);
          const lost = Math.random() < 0.5 ? [first] : [first, (first + 1 + Math.floor(Math.random() * 3)) % 4];
          for (const k of lost) debris.tear(wheels[k], race.clock, e.vx, e.vy, power, onItsSide);
        }
      }
      // (a stop repairs the car: the parts torn off it fitted back as the crew finish, before it pulls away)
      else if (e.kind === 'rain') {
        announce(e.on ? 'RAIN · THE TRACK IS GETTING WET' : 'THE RAIN HAS STOPPED · THE TRACK WILL DRY', '#8fb8e8', 2.5);
        sayRadio(e.on ? 'rain' : 'rain-stops');
      } else if (e.kind === 'track' && race.clock >= notice.until) announce(`TRACK ${e.condition.toUpperCase()} · ${COMPOUNDS[tyreFor(e.condition, race.track.dirt)].name.toUpperCase()} TYRES`, '#8fb8e8', 2);
      else if (e.kind === 'pit-repaired') debris.refit(looks[e.who].mesh, race.clock);
      else if (e.kind === 'pit-out') {
        if (e.who === you) {
          announce('PIT EXIT', '#5fe0d0', 1.5);
          sayRadio('pit-out');
        }
      }
      else if (e.kind === 'pit-stop' && e.who !== you && race.clock >= notice.until) announce(`${looks[e.who].name} PITS`, '#9d9ab8', 1.5);
      // blue flags: yours (let the leader by), or one shown to a car you're coming up to lap
      else if (e.kind === 'blue' && e.who === you) {
        announce(`BLUE FLAG · LET ${looks[e.by].name} BY`, BLUE_COLOR, 3);
        sayRadio('blue');
      } else if (e.kind === 'blue' && e.by === you && race.clock >= notice.until) announce(`BLUE FLAG · ${looks[e.who].name}`, BLUE_COLOR, 1.5);
      // a mistake by a car near you (on the screen, more or less): called out
      else if (e.kind === 'mistake' && !done && race.clock >= notice.until && near(e.who)) announce(e.what === 'late' ? `LOCK-UP · ${looks[e.who].name}` : `${looks[e.who].name} RUNS WIDE`, '#9d9ab8', 1.5);
    }
    // the race's fastest lap (announced; purple in the results)
    race.entrants.forEach((e, i) => {
      if (session !== 'race') return;
      const count = e.progress.lapTimes.length;
      if (count <= hudState.lapsSeen[i]) return;
      const lap = e.progress.lapTimes[count - 1];
      hudState.lapsSeen[i] = count;
      if (hudState.fastest && lap >= hudState.fastest.time) return;
      const first = !hudState.fastest;
      hudState.fastest = { time: lap, who: i };
      // (not for the first lap anyone completes: that's always the fastest so far)
      if (!first && race.clock >= notice.until) announce(`FASTEST LAP · ${looks[i].name} ${fmt(lap)}`, '#b36bff', 2.5);
      if (!first && i === you) {
        sounds.record();
        sayRadio('fastest-lap');
      }
    });
    // your records: a new lap as soon as it's done (a record announced if it beats one), the race at your flag
    const mine = race.entrants[you].progress;
    // (race laps only: qualifying keeps its own record, set as its good lap ends)
    if (session === 'race' && (mine.lapTimes.length > saved.laps || (mine.finished !== undefined && !saved.race))) {
      for (const lap of mine.lapTimes.slice(saved.laps)) {
        const had = rec()?.bestLap !== undefined;
        if (recordLap(records, recordId, lap)) {
          saved.newLap = true;
          if (had) {
            announce(`NEW LAP RECORD ${fmt(lap)}`, '#f2c14e', 3);
            sounds.record();
          }
        }
      }
      saved.laps = mine.lapTimes.length;
      if (mine.finished !== undefined && !saved.race) {
        saved.race = true;
        saved.newRace = recordRace(records, recordId, race.laps, mine.finished + mine.penalty);
        // achievements for how the race went (and GLOBETROTTER once every circuit's been raced)
        const me = race.entrants[you];
        achieve([
          ...raceAchievements({
            place: raceOrder(race).indexOf(you) + 1, field: race.entrants.length, grid: you + 1, fastest: hudState.fastest?.who === you,
            damaged: tookDamage, strikes: me.limits.strikes, laps: race.laps, difficulty: difficulty.id, weather: race.weather,
            tyresLeft: Math.round((1 - me.tyres.wear) * 100), burning: me.car.burn !== undefined, stops: me.stops,
          }),
          ...(raced(layout.id, LAYOUTS.map((l) => l.id)) ? ['globetrotter'] : []),
        ]);
      }
      saveRecords(records);
    }
    // every car (race/drawCars.ts)
    drawCars({
      race, looks, events: step.cars, track, grid, skids, deckSkids, particles, recorder, replayAt: replay?.t,
      pose: (i) => pose(race.entrants[i].car, i, alpha), dt, now: performance.now() / 1000,
    });
    // the ghost: your record lap from the line, drawn where it was as far into its lap as you are into yours
    {
      const p0 = race.entrants[you].progress;
      const pose = trial?.record && p0.lapStart !== undefined ? ghostPose(trial.record, race.clock - p0.lapStart - (1 - alpha) * SIM_DT) : undefined;
      ghostMesh.visible = !!pose;
      if (pose) {
        // (on its level: followed round the lap, so on a bridge it's on the deck, or underneath)
        const gi = nearestSample(track, pose.x, pose.y, ghostIdx);
        ghostIdx = gi;
        ghostMesh.position.set(pose.x, groundAt(gridFor(track, grid, gi), pose.x, pose.y).h, pose.y);
        ghostMesh.rotation.set(0, -pose.heading, 0);
      }
      // (the Daily Challenge's leader: from the clock starting, till its run or yours is over)
      const rival = attack?.rival;
      const rivalPose = rival && attack && attack.a.left !== undefined && !attack.result ? ghostPose(rival.ghost, attack.a.elapsed - (1 - alpha) * SIM_DT) : undefined;
      rivalMesh.visible = !!rivalPose;
      if (rivalPose) {
        const gi = nearestSample(track, rivalPose.x, rivalPose.y, rivalIdx);
        rivalIdx = gi;
        rivalMesh.position.set(rivalPose.x, groundAt(gridFor(track, grid, gi), rivalPose.x, rivalPose.y).h, rivalPose.y);
        rivalMesh.rotation.set(0, -rivalPose.heading, 0);
      } else rivalIdx = undefined;
    }
    // your marker, on the grid while the lights are on
    {
      const mine = race.entrants[you];
      youMarker.visible = race.phase === 'lights' && running(mine);
      youMarker.position.set(mine.car.x, mine.car.z, mine.car.y);
      const t = performance.now() / 1000;
      youArrow.position.y = 34 + Math.sin(t * 4) * 3;
      youArrow.rotation.y = t * 1.5;
    }
    // the safety car on the track while it's out (in the replay, if it was out then)
    const sc = race.sc;
    const scThen = replay && replayPose(recorder, race.entrants.length, replay.t);
    const scShown = replay ? !!scThen : !!sc;
    if (scShown && !safetyCar.group.parent) world.scene.add(safetyCar.group);
    if (!scShown && safetyCar.group.parent) world.scene.remove(safetyCar.group);
    if (scThen) {
      safetyCar.group.position.set(scThen.x, scThen.z, scThen.y);
      safetyCar.group.rotation.set(0, -scThen.heading, 0, 'YXZ');
    } else if (sc && !replay) {
      const tilt = bodyTilt(sc.car, gridFor(track, grid, sc.idx));
      // (drawn between its steps too, once it has been out for one)
      const at = before && before.length > race.entrants.length ? pose(sc.car, race.entrants.length, alpha) : sc.car;
      safetyCar.group.position.set(at.x, at.z, at.y);
      safetyCar.group.rotation.set(tilt.pitch, -at.heading, tilt.roll, 'YXZ');
      safetyCar.update(dt);
    }

    // standings and HUD
    const order = raceOrder(race);
    const me = race.entrants[you];
    const pos = order.indexOf(you) + 1;
    const p = me.progress;
    const clock = race.clock;
    if (!done && session === 'race' && race.phase === 'racing' && (p.finished !== undefined || p.retired)) {
      done = true;
      // (your flag: nothing to come back to)
      dropOurs();
      noteStat('race_finish', { circuit: layout.id, mode: statsMode(), data: { place: p.retired ? null : pos, field: race.entrants.length, laps: race.laps } });
      noteDriven();
    }
    // (the km you drive: your car's way, live, between frames; not the replay's, nor a jump of a restart)
    {
      const c = me.car;
      if (!replay && !gridPan && !paused && lastAt) {
        const d = Math.hypot(c.x - lastAt.x, c.y - lastAt.y);
        if (d < 400) drivenPx += d;
      }
      lastAt = { x: c.x, y: c.y };
    }
    // your last lap: called, with a bell, as you start it
    if (race.phase === 'racing' && p.lapStart !== undefined && p.finished === undefined && !p.retired && p.lap === laps - 1 && !soundState.finalLap) {
      soundState.finalLap = true;
      announce('FINAL LAP', '#f4f4f8', 3);
      sounds.finalLap();
      sayRadio('final-lap');
    }
    // the chequered flag: out at the line from the winner's finish, and big over the picture for a few seconds at yours
    const flagOut = race.entrants.some((e) => e.progress.finished !== undefined);
    chequered.group.visible = flagOut;
    if (flagOut) chequered.update(performance.now() / 1000);
    const yourFlag = p.finished !== undefined && clock < p.finished + 3.5 && !podium && !replay && results.style.display !== 'block';
    flagOverlay.el.style.display = yourFlag ? 'block' : 'none';
    if (yourFlag) flagOverlay.draw(performance.now() / 1000);
    if (p.finished !== undefined && !soundState.flag) {
      soundState.flag = true;
      sounds.flag();
      sounds.cheer(1);
      if (session === 'race') say(radioQ, finishLine(raceOrder(race).indexOf(you) + 1, race.entrants.length));
      // the race's music gives way to the menu's, after your flag
      playMusic(MENU_MUSIC, 3);
    }
    // after your flag and its replay (or at A), the champagne ceremony, then the results; if you're out, the results once
    // the rest have finished
    const others = race.entrants.filter((e) => e !== me && running(e));
    if (!podium && p.finished !== undefined && replayed) startCeremony();
    ceremonyView.show(!!podium && results.style.display !== 'block');
    if (podium) {
      podium.time += dt;
      const beat = ceremony.update(podium.time, dt);
      if (beat.pop) {
        sounds.cork();
        sounds.cheer(0.6);
      }
      if (beat.firework) sounds.firework();
    }
    // the ceremony to a march
    if (podium) playMusic(PODIUM_MUSIC, 1);
    const showNow = podium ? podium.time >= PODIUM_HOLD : p.finished === undefined && others.every((e) => e.progress.finished !== undefined);
    if (done && (results.style.display === 'block' || showNow)) showResults(order); // live as the others finish
    hud.setPosition(session === 'qualifying' ? 'QUALI' : session === 'timetrial' ? 'TIME TRIAL' : session === 'timeattack' ? 'TIME ATTACK' : session === 'tutorial' ? 'CONTROLS' : `P${pos}/${race.entrants.length}`);
    // a place gained or lost lights the position up in the strip below, green ▲ or red ▼, for a moment
    // (not while the lights are on, nor after your flag)
    if (race.phase === 'racing' && !done && hudState.lastPos && pos !== hudState.lastPos) {
      hud.setPositionChange(pos < hudState.lastPos ? 'gain' : 'lose');
      // the callout: who you went by, or who went by you (not a car in the pits: that's its stop, not a pass)
      const move = hudState.lastOrder && clock > 3 ? overtakeOf(hudState.lastOrder, order, you) : undefined;
      const other = move && race.entrants[move.other];
      if (move && other && !other.pit && !race.entrants[you].pit && running(other) && (race.clock >= notice.until || / PASS/.test(notice.text))) {
        const name = looks[move.other].name;
        announce(move.kind === 'passed' ? `PASSED ${name} · P${move.place}` : `${name} PASSES · P${move.place}`, move.kind === 'passed' ? '#5fe0d0' : '#f08a24', 1.8);
      }
      // (an overtake of yours: the crowd's with you)
      if (pos < hudState.lastPos) sounds.cheer(0.35);
      hudState.flashUntil = clock + 1.5;
    }
    if (clock > hudState.flashUntil) hud.setPositionChange(undefined);
    // (each lap of yours done: the race kept)
    if (session === 'race' && !done && p.lap !== keptAtLap && race.phase === 'racing') keepNow();
    hudState.lastPos = pos;
    hudState.lastOrder = order;
    hud.setLap(learn ? `${Math.min(STEPS.length - 1, STEPS.indexOf(learn.o.step) + 1)}/${STEPS.length - 1}` : session === 'timetrial' ? (p.lapStart === undefined ? 'OUT TO THE LINE' : trial?.lap.deleted ? 'LAP DELETED' : `LAP ${p.lapTimes.length + 1}`) : session === 'timeattack' ? (p.lapStart === undefined ? 'OUT TO THE LINE' : `LAP ${p.lapTimes.length + 1}`) : session === 'qualifying' ? (p.lapStart === undefined ? 'OUT TO THE LINE' : quali?.lap.deleted ? 'LAP DELETED' : 'FLYING LAP') : p.retired ? 'OUT' : p.finished === undefined && p.lap === laps - 1 && p.lapStart !== undefined ? 'FINAL LAP' : `LAP ${Math.min(laps, p.lap + 1)}/${laps}`);

    // box, box: on the radio once a lap, as the pit wall's call goes up
    if (session === 'race' && soundState.boxLap !== p.lap && boxBox()) {
      soundState.boxLap = p.lap;
      sayRadio(boxCue());
    }
    // the radio: the next line up once the last is done; off the race (a replay, the ceremony, the results) it's
    // hidden: held over a crash's replay (the race goes on after it), dropped for good after your flag
    if (replay || podium || results.style.display === 'block') {
      radioPanel.style.display = 'none';
      if (replay?.kind !== 'crash' && (radioQ.now || radioQ.waiting.length)) radioQ = newRadio();
    }
    else {
      const line = stepRadio(radioQ, dt);
      if (line) {
        radioText.textContent = line;
        radioPanel.style.display = 'block';
        sounds.radio(Math.max(0.6, radioFor(line) - 0.5));
      }
      if (!radioQ.now) radioPanel.style.display = 'none';
    }
    // (an announcement waiting: up once the one before is over)
    if (nextNotice && race.clock >= notice.until) {
      announce(nextNotice.text, nextNotice.color, nextNotice.seconds);
      nextNotice = undefined;
    }
    // the banner: start lights, GO!, then the most urgent message
    teamCard.style.opacity = race.phase === 'lights' ? '1' : '0';
    if (gridPan) {
      // the grid pan: the car the camera's on, by grid place, name and team (you in gold)
      const k = panAt(circuit.slots, gridPan.t).car;
      banner.textContent = `P${k + 1} ${numbered(looks[k])} · ${looks[k].team.code}`;
      banner.style.color = k === you ? '#f2c14e' : '#f4f4f8';
    } else if (race.phase === 'lights') {
      const lit = Math.max(0, Math.min(5, Math.floor((clock + LIGHTS) / 0.6)));
      // a beep as each light comes on
      if (clock < 0 && lit > soundState.lights) sounds.light();
      soundState.lights = Math.max(soundState.lights, clock < 0 ? lit : 5);
      banner.textContent = clock < 0 ? '● '.repeat(lit).trim() + ' ○'.repeat(5 - lit) : '● ● ● ● ●';
      banner.style.color = '#d8323c';
    } else {
      const stop = me.pit;
      const [text, color] = bannerMessage({
        replay: !!replay, blink: Math.floor(performance.now() / 500) % 2 === 1, ceremony: !!podium, resultsUp: results.style.display === 'block',
        out: me.car.wrecked || !!p.retired, championship: !!championship, done, finishedPlace: p.finished !== undefined ? order.indexOf(you) + 1 : undefined,
        pit: stop && { stopped: stop.phase === 'stopped', left: stop.left, limiter: inLimitZone(circuit.pit, circuit.pit.points[stop.at].s) },
        boxBox: !done && !stop && boxBox(), pitSide, wrongWay: p.wrongWay, clock, session, notice,
        learn: learn && { text: prompt(learn.o.step, device(), pointsOn(device())), last: learn.o.step === 'done' },
        beforeLine: p.lapStart === undefined, safetyCar: !!sc, vsc: !!race.vsc, attackLeft: attack?.a.left,
      });
      showBanner(text);
      banner.style.color = color;
    }
    const lapTime = p.lapStart !== undefined && p.finished === undefined ? clock - p.lapStart : undefined;
    // (in a Time Trial your best good lap: a deleted one doesn't count)
    const best = session === 'timetrial' ? trial?.best?.time : p.lapTimes.length ? Math.min(...p.lapTimes) : undefined;
    // the cars either side of you (by the timing points), while you're racing (on the wide screen: the phone's tower has them)
    const ahead = pos > 1 ? order[pos - 2] : undefined;
    const behindCar = order[pos];
    const behind = behindCar !== undefined && running(race.entrants[behindCar]) && !race.entrants[behindCar].car.wrecked ? behindCar : undefined;
    const showGaps = !done && !phoneHud;
    paintRows(mainLines, readoutText({
      lapTime, last: p.lapTimes[p.lapTimes.length - 1], best,
      record: session === 'qualifying' ? rec()?.bestQualifying : session === 'timetrial' ? trial?.record?.time : rec()?.bestLap,
      ahead: showGaps && ahead !== undefined ? { name: looks[ahead].name, gap: gapBetween(hudState.gaps, ahead, you) } : undefined,
      behind: showGaps && behind !== undefined ? { name: looks[behind].name, gap: gapBetween(hudState.gaps, you, behind) } : undefined,
      health: me.car.health / me.car.cls.health, wrecked: me.car.wrecked,
      attack: attack && { left: attack.a.left, passed: attack.a.passed, best: attack.best },
    }));
    // the tyre line in its compound's colour (the wrong ones for the weather: what the crew would fit, in amber)
    const wrong = session === 'race' && !done && race.forecast && wrongTyres(race, you);
    paintRows(tyreLine, tyreText(COMPOUNDS[me.tyres.compound].short, me.tyres.wear, !phoneHud, wrong ? COMPOUNDS[tyreCall(race, me)].short : undefined));
    tyreLine.style.color = COMPOUNDS[me.tyres.compound].color;
    paintRows(towLine, done ? '' : towText(me.tow));
    const strikes = me.limits.strikes;
    paintRows(limitsLine, session === 'race' ? limitsText(strikes) : '');
    limitsLine.style.color = strikes > LIMITS.warnings ? '#d8323c' : '#f2c14e';
    // (the gap: how much sooner or later than the ghost you've reached this point of the lap)
    const ghostAt = trial?.record && p.lapStart !== undefined && !trial.lap.deleted ? ghostTimeAt(trial.record, p.idx, track.samples.length) : undefined;
    const ghostGap = ghostAt === undefined ? undefined : clock - p.lapStart! - ghostAt;
    paintRows(ghostLine, ghostText(ghostGap));
    ghostLine.style.color = (ghostGap ?? 0) < 0 ? '#5fe0d0' : '#d8323c';

    // minimap, ten times a second: wrecks in grey, the safety car in amber
    miniTime += dt;
    // (a race picked up: drawn at once, before it's paused)
    if (miniTime > 0.1 || pauseOnStart) {
      miniTime = 0;
      miniCtx.clearRect(0, 0, mini.width, mini.height);
      miniCtx.drawImage(map.canvas, 0, 0);
      const dot = (x: number, y: number, color: string, size: number) => {
        const q = map.toMap(x, y);
        miniCtx.fillStyle = color;
        miniCtx.fillRect(q.x - size / 2, q.y - size / 2, size, size);
      };
      race.entrants.forEach((e, i) => {
        if (running(e) && i !== you) dot(e.car.x, e.car.y, e.car.wrecked ? '#6c707a' : looks[i].color, 5);
      });
      if (sc) dot(sc.car.x, sc.car.y, '#ffb020', 6);
      dot(me.car.x, me.car.y, '#f2c14e', 7);
      drawTower();
    }
    particles.update(dt);
    // the cherry blossom's petals (where there's blossom): falling round your car, kicked up as the cars drive over them
    // (still while paused, or as the replay plays)
    if (!paused && !replay) world.stepScenery(dt, race.entrants.map((e) => e.car), race.entrants[you].car);
    // (in the replay, thrown again as they flew then)
    if (replay) debris.replay(replay.t, (x, z) => groundAt(grid, x, z).h);
    else debris.update(race.clock, (x, z) => groundAt(grid, x, z).h);
    rain.draw(dt, race.rain);
    {
      // (the way the car's going, on the screen: the ground's y is foreshortened by the camera's pitch)
      const c = race.entrants[you].car;
      const sy = c.vy * Math.sin(deg(LOOK.pitch));
      const len = Math.hypot(c.vx, sy) || 1;
      // (none for a device asking for less motion)
      streaks.draw(dt, calm ? 0 : rushNow, c.vx / len, sy / len);
    }
    skids.update(dt);
    deckSkids?.update(dt);

    // camera: follow your car, looking ahead along its motion; or, at the ceremony, on the podium
    const c = me.car;
    const drawn = pose(c, you, alpha);
    const mineThen = replay && replayPose(recorder, replay.follow, replay.t);
    if (lookAt) {
      // (the debug hook's: the camera on a point of the map)
      target.set(lookAt.x, groundAt(grid, lookAt.x, lookAt.y).h, lookAt.y);
      focus.copy(target);
    } else if (mineThen) {
      // the replay: on your car as it was, looking ahead along its way
      target.set(mineThen.x + Math.sin(mineThen.heading) * t.lead * 0.6, mineThen.z * 0.5, mineThen.y - Math.cos(mineThen.heading) * t.lead * 0.6);
    } else if (gridPan) {
      // the grid pan: along the grid from pole to the back
      const at = panAt(circuit.slots, gridPan.t);
      target.set(at.x, groundAt(grid, at.x, at.y).h * 0.5, at.y);
      focus.copy(target);
    } else if (podium) {
      // on the ceremony's set (the results over it: from above, as ever)
      target.copy(ceremony.view(CEREMONY.len, camera.aspect, camera.fov).at);
      ceremony.group.localToWorld(target);
      if (podium.time <= dt) focus.copy(target);
    } else target.set(drawn.x + (c.vx / c.cls.topSpeed) * t.lead, drawn.z * 0.5, drawn.y + (c.vy / c.cls.topSpeed) * t.lead);
    focus.lerp(target, 1 - Math.exp(-dt * 6));
    const pitch = deg(LOOK.pitch);
    // (the zoom eases back out from the grid pan's)
    panZoom += ((gridPan ? GRID_PAN.zoom : 1) - panZoom) * (1 - Math.exp(-dt * 4));
    // (the rush of speed pulls the camera back a touch)
    const meNow = race.entrants[you];
    const rushWant = !replay && !podium && !gridPan && running(meNow) && !meNow.pit ? rushOf(speedOf(meNow.car), meNow.car.cls.topSpeed, meNow.tow) : 0;
    rushNow += (rushWant - rushNow) * Math.min(1, dt * 3);
    // (wheel to wheel with a rival, it pulls back a touch more, to show you both)
    const battleWant = !replay && !podium && !gridPan && session === 'race' && race.phase === 'racing' && running(meNow) && !meNow.pit
      && race.entrants.some((e, i) => i !== you && running(e) && !e.pit && Math.hypot(e.car.x - meNow.car.x, e.car.y - meNow.car.y) < BATTLE.near) ? 1 : 0;
    battleNow += (battleWant - battleNow) * Math.min(1, dt * (battleWant ? 2 : 0.8));
    const dist = (viewH / (2 * Math.tan(deg(LOOK.fov / 2))) / (t.zoom * (podium ? CEREMONY_ZOOM : panZoom))) * (1 + RUSH.pullBack * rushNow + BATTLE.pullBack * battleNow);
    camera.position.set(focus.x, focus.y + Math.sin(pitch) * dist, focus.z + Math.cos(pitch) * dist);
    camera.lookAt(focus.x, focus.y, focus.z);
    // the shake: the camera moved across and up its own view (SCREEN SHAKE off in the settings: still)
    if (shakeOn()) {
      const o = shakeOffset(shake);
      camera.translateX(o.x);
      camera.translateY(o.y);
    }
    // the ceremony: its own camera, from third across to the three of them (the plates under them)
    const onSet = ceremony.group.visible && !!podium;
    if (onSet) focus.copy(ceremonyView.aim(podium!.time, camera));
    ceremonyView.placePlates(onSet && !paused, host.clientWidth, host.clientHeight);
    world.followSun(focus);
    world.animate(performance.now() / 1000);
    // the weather's look, eased as the track wets and dries and the rain comes and goes (redone only as it changes)
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
    post.render(dt, { bloom: LOOK.bloom, blur: LOOK.blur, bloomOn: q.bloom, blurOn: q.blur && !onSet });

    // (a race picked up: paused once its first few frames are drawn, the HUD as the race has it)
    if (pauseOnStart && --pauseOnStart === 0) setPaused(true);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  const dispose = () => {
    if (closed) return;
    closed = true;
    // (you've left the race: it's not kept to come back to)
    dropOurs();
    noteDriven();
    offHidden();
    window.removeEventListener('keydown', onKey);
    setAudioPaused(false);
    sounds.dispose();
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
    for (const el of [streaks.el, rain.el, readout, banner, radioPanel, results, mini, tower, teamCard, pauseScreen, pauseSettings, flagOverlay.el, shareButton.float, tyrePick, ...plates]) el.remove();
    deckEl?.classList.remove('results-up');
    deckEl?.classList.remove('steer-deck');
    document.documentElement.classList.remove('results-up', 'ceremony', 'paused', 'dirt');
    delete (window as { __cc?: unknown }).__cc;
  };
  return { resize, dispose };
};
