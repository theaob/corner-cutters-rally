import { describe, expect, it } from 'vitest';
import { carClass } from '../src/engine/driving';
import { SIM_DT } from '../src/engine/fixedStep';
import { buildCircuit } from '../src/f1/circuit';
import { LAYOUTS } from '../src/f1/layouts';
import { RACE_HANDLING, lineCornerSpeed, lineDecel } from '../src/f1/racing';
import { stepRace } from '../src/f1/raceControl';
import { newQualifying } from '../src/f1/qualifying';
import { GHOST_HZ, ghostPose, ghostTimeAt, markSplit, newRecorder, parseGhost, recordFrame, toGhost, type Ghost } from '../src/f1/timeTrial';

const f1 = carClass('f1');

/** A flying lap on the AI's line, recorded as the game records one: its ghost, and where the car was at each step. */
function recordedLap() {
  const c = buildCircuit(LAYOUTS[0], { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });
  const q = newQualifying(c.track, c.grid, RACE_HANDLING, 'dry');
  const me = q.entrants[0];
  me.ai = { lane: 0, pace: 0.95 };
  const r = newRecorder();
  let sector = 0;
  const path: { t: number; x: number; y: number; idx: number }[] = [];
  let lapStart: number | undefined;
  for (let t = 0; t < 120 && !me.progress.lapTimes.length; t += SIM_DT) {
    stepRace(q, SIM_DT);
    const p = me.progress;
    if (p.lapStart === undefined || p.lapTimes.length) continue;
    lapStart ??= p.lapStart;
    const at = q.clock - p.lapStart;
    if (p.sector > sector) {
      sector = p.sector;
      r.splits.push(at);
    }
    recordFrame(r, at, me.car, p.idx);
    path.push({ t: at, x: me.car.x, y: me.car.y, idx: p.idx });
  }
  return { ghost: toGhost(r, me.progress.lapTimes[0]), path, n: c.track.samples.length };
}

describe('a Time Trial lap', () => {
  const { ghost, path, n } = recordedLap();
  it('is recorded 20 times a second, with a split for each sector but the last', () => {
    expect(ghost.frames.length / 4).toBeCloseTo(ghost.time * GHOST_HZ, -1);
    expect(ghost.splits.length).toBe(2);
    expect(ghost.splits[0]).toBeLessThan(ghost.splits[1]);
    expect(ghost.splits[1]).toBeLessThan(ghost.time);
  });
  it('drives again as a ghost where the car was (within a couple of px)', () => {
    for (const at of path.filter((_, i) => i % 37 === 0)) {
      const pose = ghostPose(ghost, at.t)!;
      expect(Math.hypot(pose.x - at.x, pose.y - at.y)).toBeLessThan(3);
    }
    expect(ghostPose(ghost, -1)).toBeUndefined();
    expect(ghostPose(ghost, ghost.time + 1)).toBeUndefined();
  });
  it('knows when it reached each point of the lap, for the live gap', () => {
    for (const at of path.filter((_, i) => i % 41 === 0 && _.idx > 2 && _.idx < n * 0.9)) {
      expect(Math.abs(ghostTimeAt(ghost, at.idx, n)! - at.t)).toBeLessThan(0.1);
    }
    // (on the run-up, behind the line, there's no gap yet)
    expect(ghostTimeAt(ghost, n - 3, n)).toBeUndefined();
  });
  it('survives the save, and a damaged one is dropped', () => {
    expect(parseGhost(JSON.parse(JSON.stringify(ghost)))).toEqual(ghost);
    expect(parseGhost(null)).toBeUndefined();
    expect(parseGhost({ ...ghost, time: -1 })).toBeUndefined();
    expect(parseGhost({ ...ghost, frames: [1, 2, 3] })).toBeUndefined();
    expect(parseGhost({ ...ghost, frames: [...ghost.frames.slice(0, 7), 'x'] })).toBeUndefined();
  });
});

describe('the splits', () => {
  const ghost: Ghost = { time: 30, splits: [10, 20], frames: [] };
  const record: Ghost = { time: 29.5, splits: [9.8, 19.8], frames: [] };
  it('are purple quicker than your record, green quicker than the lap you chase, amber slower', () => {
    expect(markSplit(9.7, 0, ghost, record)).toEqual({ delta: expect.closeTo(-0.3), mark: 'record' });
    expect(markSplit(9.9, 0, ghost, record)).toEqual({ delta: expect.closeTo(-0.1), mark: 'better' });
    expect(markSplit(10.2, 0, ghost, record)).toEqual({ delta: expect.closeTo(0.2), mark: 'worse' });
    // no lap yet: every split is a record
    expect(markSplit(12, 1)).toEqual({ delta: undefined, mark: 'record' });
  });
});
