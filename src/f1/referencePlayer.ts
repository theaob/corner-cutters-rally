// Reference players: scripted drivers that drive the way a player can, through
// the same inputs a player has, for measuring the game's balance (a player's lap
// and race against the AI's, per circuit and difficulty) without a person at the
// controls (tests/balance.test.ts).
//
// - On the touch thumbstick the stick points where to go and how far it's pushed
//   is the speed wanted: there's no brake pedal, so it slows by easing off ahead
//   of a bend (and scrubs speed turning in).
// - On keys or a gamepad it steers the wheel and brakes for a bend like the AI.
//
// Both follow the middle of the track, looking ahead with speed, and take each
// bend at `skill` of the speed the racing line allows there (1 is a very good
// lap, less a steadier one), as the AI does, worn tyres or not. In a race they pull
// out round a car in their way, and come in when the pit wall calls BOX, BOX.

import { lateralOffset, playerInput, wheelInput, type Track } from './racing';
import { speedOf, type Car, type DriveInput } from '../engine/driving';
import { HALF_WIDTH } from './circuit';
import { PIT, between } from './pits';
import { stopCalled, type Entrant, type Race } from './raceControl';

export type ReferenceDevice = 'touch' | 'wheel';

export interface ReferencePlayer {
  device: ReferenceDevice;
  /** share of the line's speed it takes the bends at */
  skill: number;
}

/** px/s² a car slows at off the stick (the driving's drag), and the share of full brakes the wheel player uses */
const LIFT = 90;
const BRAKE_SHARE = 0.75;
/** px ahead it reads the bends for, at most */
const READ_AHEAD = 900;
/** px across it pulls out from a car in its way, and furthest from the middle it goes */
const PASS_GAP = 26;
const LANE_LIMIT = 30;
/** samples before the pit entry from which it moves over for the pit lane when called in */
const PIT_APPROACH = 40;
/** samples before the entry by which it has to have started over: after that, it stays out */
const PIT_DECIDE = 15;
/** px/s² a driver counts on slowing at behind a slower car ahead */
const FOLLOW_DECEL = 260;

/** The speed (px/s) to be doing now at `idx` so as to slow at `decel` px/s² to every bend within reach at `skill` of the line's speed. */
export function speedToCarry(track: Track, idx: number, skill: number, decel: number): number {
  const { samples, spacing } = track;
  const n = samples.length;
  let want = Infinity;
  for (let k = 0; k * spacing <= READ_AHEAD; k++) {
    const s = samples[(idx + k) % n];
    want = Math.min(want, Math.sqrt((s.speed * skill) ** 2 + 2 * decel * k * spacing));
  }
  return want;
}

/**
 * A reference player's input at nearest sample `idx`, aiming `lane` px right of
 * the middle (a little way ahead, further the faster it goes), no faster than `cap` px/s.
 */
export function referenceInput(car: Car, track: Track, idx: number, player: ReferencePlayer, lane = 0, cap = Infinity): DriveInput {
  const n = track.samples.length;
  const v = speedOf(car);
  const t = track.samples[(idx + Math.round((40 + v * 0.3) / track.spacing)) % n];
  const heading = Math.atan2(t.x + Math.cos(t.dir) * lane - car.x, -(t.y + Math.sin(t.dir) * lane - car.y));
  const { skill } = player;
  if (player.device === 'touch') {
    // the stick toward the line ahead, pushed as far as the speed it wants (full over the top speed)
    const want = Math.min(cap, speedToCarry(track, idx, skill, LIFT));
    const mag = Math.max(0.15, Math.min(1, want / car.cls.topSpeed));
    return playerInput({ stick: { x: Math.sin(heading) * mag, y: -Math.cos(heading) * mag }, a: false, b: false });
  }
  // the wheel: turn toward the line ahead (full lock past ~9°, as a quick hand on the keys does), gas unless over the
  // speed for what's coming, then brake
  const want = Math.min(cap, speedToCarry(track, idx, skill, (car.cls.topSpeed / car.cls.brakeTime) * BRAKE_SHARE));
  const diff = Math.atan2(Math.sin(heading - car.heading), Math.cos(heading - car.heading));
  const turn = Math.max(-1, Math.min(1, diff / 0.15));
  const over = v > want + 6;
  // (wheelInput eases the turn by its 1.5 power; undone here, so the turn is as asked)
  return wheelInput({ turn: Math.sign(turn) * Math.abs(turn) ** (1 / 1.5), gas: over ? 0 : 1, brake: over ? 1 : 0, drift: false }, car);
}

/**
 * The reference player driving entrant `e` in `race`: round a car in its way,
 * and into the pit lane when a stop pays (as the pit wall's BOX, BOX call says).
 */
export function referenceDriver(race: Race, e: Entrant, player: ReferencePlayer): DriveInput {
  const { track, pit } = race;
  const n = track.samples.length;
  const { car, progress: p } = e;
  let lane = 0;
  let cap = Infinity;
  const mine = lateralOffset(track, p.idx, car.x, car.y);
  // BOX, BOX: over to the pit side for the entry, when the call comes on the approach (not a late dive at the wall);
  // once it's heading over, on in
  const called = pit && p.lapStart !== undefined && p.finished === undefined
    && (between(p.idx, pit.entry - PIT_APPROACH, pit.entry - PIT_DECIDE, n) || (between(p.idx, pit.entry - PIT_DECIDE, pit.wallTo, n) && mine * pit.side > 16))
    && stopCalled(race, e);
  // (over to the track's edge on the approach; onto the entry road once it leaves the track, not across the grass before it)
  if (called) lane = pit.side * (between(p.idx, pit.entry, pit.wallTo, n) ? PIT.commit + 12 : HALF_WIDTH - 8);
  else {
    // a car in its way: out to the side with more room
    const reach = 50 + speedOf(car) * 0.5;
    const f = { x: Math.sin(car.heading), y: -Math.cos(car.heading) };
    for (const o of race.entrants) {
      if (o === e || o.progress.retired) continue;
      // (a car in the pit lane is no matter while it's off the track; on the entry or exit road, still on it, it is)
      if (o.pit && Math.abs(lateralOffset(track, p.idx, o.car.x, o.car.y)) > HALF_WIDTH) continue;
      const along = (o.car.x - car.x) * f.x + (o.car.y - car.y) * f.y;
      const theirs = lateralOffset(track, p.idx, o.car.x, o.car.y);
      if (along > 0 && along < reach && Math.abs(theirs - mine) < 20) lane = theirs > 0 ? theirs - PASS_GAP : theirs + PASS_GAP;
      // and a slower car right ahead in its line: no faster than it can slow to their speed behind them (as a
      // driver lifts rather than run into the car braking in front)
      if (along > 0 && along < reach && Math.abs(theirs - mine) < 16) cap = Math.min(cap, Math.sqrt(speedOf(o.car) ** 2 + 2 * FOLLOW_DECEL * Math.max(0, along - 30)));
    }
    lane = Math.max(-LANE_LIMIT, Math.min(LANE_LIMIT, lane));
  }
  return referenceInput(car, track, p.idx, player, lane, cap);
}
