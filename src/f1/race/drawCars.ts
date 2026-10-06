// Every car on the screen each frame: where it is (between its last two steps,
// or in a replay where it was then), tilted on the ground, its outline under a
// bridge, its skid marks (on the bridge's deck, a layer of their own), smoke
// and fire as it's damaged, dust off the grass (mud off a dirt track), its tyres' compound colour,
// its rear light (lit while it slows, blinking in the wet), sparks off a hit or
// a hard landing, and spray off a wet track.

import { bodyTilt, condition, speedOf, type StepEvents } from '../../engine/driving';
import type { CarFx, Particles, SkidLayer } from '../../engine/render/effects';
import type { CarMesh } from '../../engine/render/vehicles3d';
import type { Grid } from '../../engine/sim';
import { gridFor, underDeck } from '../bridge';
import type { CarOutline } from '../outline3d';
import { running, type Race } from '../raceControl';
import type { Track } from '../racing';
import { replayPose, type ReplayRecorder } from '../replay';
import { COMPOUNDS } from '../tyres';

/** The rear light: lit while a car slows by more than this (px/s²: braking, or lifting at speed, as the hybrid harvests), held this long (s) so it doesn't flicker. */
const REAR_LIGHT = { decel: 140, hold: 0.18 };

/** A car's model and effects, and what's remembered of it from frame to frame. */
export interface CarLook {
  mesh: CarMesh;
  outline?: CarOutline;
  fx: CarFx;
  /** last frame's speed and health (for its rear light and its sparks), and s its rear light stays lit */
  was?: { speed: number; health: number };
  lit?: number;
}

export interface CarsFrame {
  race: Race;
  looks: CarLook[];
  /** each car's driving events over the frame's steps */
  events: StepEvents[];
  track: Track;
  grid: Grid;
  skids: SkidLayer;
  deckSkids?: SkidLayer;
  particles: Particles;
  /** the replay's recording, and the race time it's showing (undefined: live) */
  recorder: ReplayRecorder;
  replayAt?: number;
  /** car `i` drawn between its last two steps */
  pose: (i: number) => { x: number; y: number; z: number; heading: number };
  dt: number;
  /** s, page time (for the rear lights' blinking) */
  now: number;
}

/** Mud off a dirt track: clods a second behind a car at full speed, and more while it slides */
const MUD = { rate: 12, slide: 16 };

export function drawCars(f: CarsFrame): void {
  const { race, looks, track, grid, skids, deckSkids, particles, dt } = f;
  const replay = f.replayAt !== undefined;
  // (spray off a damp or wet track)
  const spray = race.wetness > 0.4;
  // (mud off a dirt track: its earth's wet)
  const muddy = !!race.track.dirt && !spray;
  race.entrants.forEach((e, i) => {
    const l = looks[i];
    const then = replay ? replayPose(f.recorder, i, f.replayAt!) : undefined;
    if (!running(e)) {
      // (cleared off the track: only in the replay, where it was then)
      l.mesh.visible = !!then;
      if (then) {
        l.mesh.position.set(then.x, then.z, then.y);
        l.mesh.rotation.set(0, -then.heading, 0, 'YXZ');
        l.outline?.update(l.mesh, !!track.levels && underDeck(track.levels, grid, then.x, then.y, then.z));
      } else l.outline?.update(l.mesh, false);
      return;
    }
    const ev = f.events[i];
    const onDeck = !!deckSkids && gridFor(track, grid, e.progress.idx) !== grid;
    if (ev.skidding && !replay) (onDeck ? deckSkids! : skids).mark(i, e.car.x, e.car.y, e.car.heading, Math.min(1, speedOf(e.car) / e.car.cls.topSpeed), e.car.cls);
    // (lifted on the other level, so a slide onto or off the deck doesn't join the two)
    if (!ev.skidding || replay || onDeck) skids.lift(i);
    if (!ev.skidding || replay || !onDeck) deckSkids?.lift(i);
    // (in the replay, where it was then)
    l.mesh.visible = !replay || !!then;
    const tilt = then ? { pitch: 0, roll: 0 } : bodyTilt(e.car, gridFor(track, grid, e.progress.idx));
    const at = then || f.pose(i);
    l.mesh.position.set(at.x, at.z, at.y);
    l.mesh.rotation.set(tilt.pitch, -at.heading, tilt.roll, 'YXZ');
    l.outline?.update(l.mesh, !!track.levels && underDeck(track.levels, grid, at.x, at.y, at.z));
    const speed = speedOf(e.car);
    // (in the replay, as it was then: whole before its crash, not burning before it caught fire)
    l.fx.update(dt, then ? (then.condition ?? 'ok') : condition(e.car), particles, !then && ev.onRough && speed > 25 ? Math.min(1, speed / 120) : 0);
    // the tyres' compound colour, and spray off a wet track from behind the car at speed
    l.mesh.userData.tyreMark.color.set(COMPOUNDS[e.tyres.compound].color);
    // the rear light: lit while the car slows (braking, or lifting at speed: the hybrid harvesting, as in F1), and on a
    // damp or wet track blinking besides, each car a little out of step with the rest
    const was = l.was ?? { speed, health: e.car.health };
    if (!replay && dt > 0 && speed > 30 && (was.speed - speed) / dt > REAR_LIGHT.decel) l.lit = REAR_LIGHT.hold;
    else l.lit = Math.max(0, (l.lit ?? 0) - dt);
    l.mesh.userData.rainLight.visible = l.lit > 0 || (spray && (f.now * 4 + i * 0.37) % 1 < 0.5);
    // sparks: off a hit (a wall, another car), thrown back the way it was going, and off a hard landing, from under it
    if (!replay && !then) {
      const lost = was.health - e.car.health;
      const back = speed > 1 ? { x: -e.car.vx / speed, z: -e.car.vy / speed } : { x: 0, z: 0 };
      if (lost > 0.5) particles.sparks(e.car.x, e.car.y, e.car.z, Math.min(14, 4 + Math.round(lost)), back.x * 0.6, back.z * 0.6);
      if (ev.landed > 160) particles.sparks(e.car.x, e.car.y, e.car.z, 6);
    }
    l.was = { speed, health: e.car.health };
    if (spray && speed > 60 && Math.random() < dt * (6 + 8 * race.rain) * Math.min(1, speed / 250)) {
      particles.spray(e.car.x - Math.sin(e.car.heading) * 14, e.car.y + Math.cos(e.car.heading) * 14, e.car.z);
    }
    // on dirt, mud flung up behind it at speed: the faster, the more, and a spray of it sliding through a bend
    if (muddy && !replay && !ev.airborne && speed > 50 && Math.random() < dt * (MUD.rate * Math.min(1, speed / 250) + (ev.skidding ? MUD.slide : 0))) {
      particles.mud(e.car.x - Math.sin(e.car.heading) * 15, e.car.y + Math.cos(e.car.heading) * 15, e.car.z);
    }
  });
}
