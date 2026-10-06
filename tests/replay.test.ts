import { describe, expect, it } from 'vitest';
import { CRASH_REPLAY, REPLAY, crashSpeed, crashWindow, newReplay, recordReplay, replayPose, replaySpeed, replayWindow, wantsCrashReplay, type Pose } from '../src/f1/replay';

/** Two cars driving north at 100 px/s; the second only from t = 3 (before that it's off the track). */
const at = (t: number): (Pose | undefined)[] => [{ x: 0, y: -100 * t, z: 1, heading: 0 }, t >= 3 ? { x: 30, y: -100 * t, z: 1, heading: 0.1 } : undefined];

function recorded(until: number) {
  const r = newReplay(2);
  // (stepped at 60 Hz, as the race is)
  for (let t = 0; t <= until + 1e-9; t += 1 / 60) recordReplay(r, t, at(t));
  return r;
}

describe('the replay', () => {
  it('records 20 frames a second, and keeps only the last 15 seconds', () => {
    const r = recorded(30);
    expect(r.frames.length).toBe(REPLAY.keep * REPLAY.hz);
    expect(r.start).toBeCloseTo(30 - REPLAY.keep + 1 / REPLAY.hz, 5);
  });
  it('plays a car back where it was, between frames', () => {
    const r = recorded(30);
    const p = replayPose(r, 0, 22.37)!;
    expect(p.y).toBeCloseTo(-2237, 0);
    expect(p.z).toBeCloseTo(1);
    // before what's kept, or after: nothing
    expect(replayPose(r, 0, 10)).toBeUndefined();
    expect(replayPose(r, 0, 31)).toBeUndefined();
  });
  it('plays a car back as it was then: whole before the crash that set it alight', () => {
    const r = newReplay(1);
    // (a crash at t = 2: burning from then on)
    for (let t = 0; t <= 4 + 1e-9; t += 1 / 60) recordReplay(r, t, [{ x: 0, y: -100 * t, z: 0, heading: 0, condition: t < 2 ? 'ok' : 'burning' }]);
    expect(replayPose(r, 0, 1.5)!.condition).toBe('ok');
    expect(replayPose(r, 0, 1.9)!.condition).toBe('ok');
    expect(replayPose(r, 0, 2.5)!.condition).toBe('burning');
    // (a car recorded without one: whole)
    expect(replayPose(recorded(8), 0, 5)!.condition).toBe('ok');
  });
  it("doesn't show a car where it wasn't on the track", () => {
    const r = recorded(8);
    expect(replayPose(r, 1, 2)).toBeUndefined();
    expect(replayPose(r, 1, 5)!.x).toBeCloseTo(30);
  });
  it('runs 10 seconds, to just after your finish, slowing through the line', () => {
    const r = recorded(30);
    const w = replayWindow(r, 26);
    expect(w.to).toBeCloseTo(26 + REPLAY.after);
    expect(w.to - w.from).toBeCloseTo(REPLAY.length);
    // (a finish soon after the start: only what was recorded)
    expect(replayWindow(recorded(5), 4).from).toBe(0);
    expect(replaySpeed(26.5, 26)).toBe(REPLAY.slow);
    expect(replaySpeed(22, 26)).toBe(1);
  });
});

describe('the replay of a big crash', () => {
  const base = { mine: true, wrecked: false, hit: 0, bigHit: 0.4, distance: 0, now: 60, last: -Infinity };

  it('is for your big crash (a wreck, or a big hit), or an AI wreck in sight of you', () => {
    expect(wantsCrashReplay({ ...base, wrecked: true })).toBe(true);
    expect(wantsCrashReplay({ ...base, hit: 0.45 })).toBe(true);
    expect(wantsCrashReplay({ ...base, hit: 0.2 })).toBe(false);
    expect(wantsCrashReplay({ ...base, mine: false, wrecked: true, distance: 300 })).toBe(true);
    expect(wantsCrashReplay({ ...base, mine: false, wrecked: true, distance: CRASH_REPLAY.near + 50 })).toBe(false);
    // (an AI car's big hit that doesn't wreck it: no)
    expect(wantsCrashReplay({ ...base, mine: false, hit: 0.9, distance: 10 })).toBe(false);
  });

  it('is not too soon after the last', () => {
    expect(wantsCrashReplay({ ...base, wrecked: true, last: 60 - CRASH_REPLAY.gap + 1 })).toBe(false);
    expect(wantsCrashReplay({ ...base, wrecked: true, last: 60 - CRASH_REPLAY.gap - 1 })).toBe(true);
  });

  it('plays the seconds round the impact, within what was recorded, slowest through the impact', () => {
    const r = recorded(12);
    expect(crashWindow(r, 8)).toEqual({ from: 8 - CRASH_REPLAY.before, to: 8 + CRASH_REPLAY.after });
    // (a crash just recorded: it ends where the recording does)
    expect(crashWindow(r, 11.5).to).toBeCloseTo(12, 1);
    expect(crashSpeed(8, 8)).toBe(CRASH_REPLAY.slow);
    expect(crashSpeed(6, 8)).toBe(CRASH_REPLAY.speed);
    // (it starts once the seconds after the impact it shows are recorded)
    expect(CRASH_REPLAY.delay).toBeGreaterThanOrEqual(CRASH_REPLAY.after);
  });
});
