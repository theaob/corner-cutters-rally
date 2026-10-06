// Every car on the screen each frame: where it is (between its last two steps),
// tilted on the ground, its skid marks, smoke
// and fire as it's damaged, dust off the grass (mud off a dirt track), its tyres' compound colour,
// its brake lights (lit while it slows), sparks off a hit or
// a hard landing, and spray off a wet track.

import { bodyTilt, condition, speedOf, type StepEvents } from '../../engine/driving';
import type { CarFx, Particles, SkidLayer } from '../../engine/render/effects';
import type { CarMesh } from '../../engine/render/vehicles3d';
import type { Grid } from '../../engine/sim';
import { running, type Race } from '../raceControl';
import type { Track } from '../racing';
import { COMPOUNDS } from '../tyres';

/** The brake lights: lit while a car slows by more than this (px/s²: braking hard, or lifting at speed), held this long (s) so they don't flicker. */
const BRAKE_LIGHTS = { decel: 140, hold: 0.18 };

/** A car's model and effects, and what's remembered of it from frame to frame. */
export interface CarLook {
  mesh: CarMesh;
  fx: CarFx;
  /** last frame's speed and health (for its brake lights and its sparks), and s its brake lights stay lit */
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
  particles: Particles;
  /** car `i` drawn between its last two steps */
  pose: (i: number) => { x: number; y: number; z: number; heading: number };
  dt: number;
}

/** Mud off a dirt track: clods a second behind a car at full speed, and more while it slides */
const MUD = { rate: 12, slide: 16 };

export function drawCars(f: CarsFrame): void {
  const { race, looks, grid, skids, particles, dt } = f;
  // (spray off a damp or wet road)
  const spray = race.wetness > 0.4;
  // (mud off a dirt road: its earth's wet)
  const muddy = !!race.track.dirt && !spray;
  race.entrants.forEach((e, i) => {
    const l = looks[i];
    if (!running(e)) {
      // (out: gone off the road)
      l.mesh.visible = false;
      return;
    }
    const ev = f.events[i];
    if (ev.skidding) skids.mark(i, e.car.x, e.car.y, e.car.heading, Math.min(1, speedOf(e.car) / e.car.cls.topSpeed), e.car.cls);
    else skids.lift(i);
    l.mesh.visible = true;
    const tilt = bodyTilt(e.car, grid);
    const at = f.pose(i);
    l.mesh.position.set(at.x, at.z + tilt.lift, at.y);
    l.mesh.rotation.set(tilt.pitch, -at.heading, tilt.roll, 'YXZ');
    const speed = speedOf(e.car);
    l.fx.update(dt, condition(e.car), particles, ev.onRough && speed > 25 ? Math.min(1, speed / 120) : 0);
    // the tyres' compound colour, and spray off a wet road from behind the car at speed
    l.mesh.userData.tyreMark.color.set(COMPOUNDS[e.tyres.compound].color);
    // the brake lights: lit while the car slows
    const was = l.was ?? { speed, health: e.car.health };
    if (dt > 0 && speed > 30 && (was.speed - speed) / dt > BRAKE_LIGHTS.decel) l.lit = BRAKE_LIGHTS.hold;
    else l.lit = Math.max(0, (l.lit ?? 0) - dt);
    l.mesh.userData.brakeLights.visible = l.lit > 0;
    // sparks: off a hit, thrown back the way it was going, and off a hard landing, from under it
    const lost = was.health - e.car.health;
    const back = speed > 1 ? { x: -e.car.vx / speed, z: -e.car.vy / speed } : { x: 0, z: 0 };
    if (lost > 0.5) particles.sparks(e.car.x, e.car.y, e.car.z, Math.min(14, 4 + Math.round(lost)), back.x * 0.6, back.z * 0.6);
    if (ev.landed > 160) particles.sparks(e.car.x, e.car.y, e.car.z, 6);
    // (and off a scrape along a tree or rock, now and then while it lasts)
    if (ev.scrape > 60 && lost <= 0.5 && Math.random() < dt * 20) particles.sparks(e.car.x, e.car.y, e.car.z, 2, back.x * 0.4, back.z * 0.4);
    l.was = { speed, health: e.car.health };
    if (spray && speed > 60 && Math.random() < dt * (6 + 8 * race.rain) * Math.min(1, speed / 250)) {
      particles.spray(e.car.x - Math.sin(e.car.heading) * 14, e.car.y + Math.cos(e.car.heading) * 14, e.car.z);
    }
    // on dirt, mud flung up behind it at speed: the faster, the more, and a spray of it sliding through a bend
    if (muddy && !ev.airborne && speed > 50 && Math.random() < dt * (MUD.rate * Math.min(1, speed / 250) + (ev.skidding ? MUD.slide : 0))) {
      particles.mud(e.car.x - Math.sin(e.car.heading) * 15, e.car.y + Math.cos(e.car.heading) * 15, e.car.z);
    }
  });
}
