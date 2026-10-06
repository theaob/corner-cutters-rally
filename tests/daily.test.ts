import { describe, expect, it } from 'vitest';
import { beats, challengeOn, dayBefore, dayOf, logRun, streakOn, untilNext, type DailyLog } from '../src/f1/daily';
import { LAYOUTS } from '../src/f1/layouts';
import { newAttack, stepAttack } from '../src/f1/timeAttack';

describe('the Daily Challenge', () => {
  it('is the same for everyone on a day (UTC), and a new one each day', () => {
    expect(dayOf(new Date('2026-10-04T23:59:00Z'))).toBe('2026-10-04');
    expect(dayOf(new Date('2026-10-05T00:00:30Z'))).toBe('2026-10-05');
    expect(challengeOn('2026-10-04').layout.id).toBe(challengeOn('2026-10-04').layout.id);
    expect(dayBefore('2026-03-01')).toBe('2026-02-28');
    expect(untilNext(new Date('2026-10-04T23:00:00Z'))).toBe(3600000);
  });

  it('goes round every circuit over a few months (from the day the newest joins), never the same one two days running, mostly dry', () => {
    const days = Array.from({ length: 120 }, (_, k) => dayOf(new Date(Date.UTC(2026, 9, 6) + k * 86400000)));
    const picks = days.map((d) => challengeOn(d));
    expect(new Set(picks.map((p) => p.layout.id)).size).toBe(LAYOUTS.length);
    for (let k = 1; k < picks.length; k++) expect(picks[k].layout.id).not.toBe(picks[k - 1].layout.id);
    const dry = picks.filter((p) => p.weather.id === 'dry').length;
    expect(dry).toBeGreaterThan(60);
    expect(dry).toBeLessThan(100);
    expect(picks.some((p) => p.weather.id === 'wet')).toBe(true);
  });

  it('a run beats another going further, or as far sooner', () => {
    expect(beats({ score: 7, time: 90 }, { score: 6, time: 50 })).toBe(true);
    expect(beats({ score: 7, time: 80 }, { score: 7, time: 90 })).toBe(true);
    expect(beats({ score: 7, time: 95 }, { score: 7, time: 90 })).toBe(false);
    expect(beats({ score: 1, time: 9 }, undefined)).toBe(true);
  });

  it('keeps your best on the day (to send), and your streak of days running', () => {
    const log: DailyLog = { streak: 0, best: {} };
    expect(logRun(log, '2026-10-02', { score: 5, time: 60 })).toBe(true);
    expect(log.streak).toBe(1);
    expect(log.pending).toEqual({ day: '2026-10-02', score: 5, time: 60 });
    log.pending = undefined;
    expect(logRun(log, '2026-10-02', { score: 4, time: 30 })).toBe(false);
    expect(log.pending).toBeUndefined();
    expect(log.streak).toBe(1);
    logRun(log, '2026-10-03', { score: 6, time: 70 });
    expect(log.streak).toBe(2);
    expect(streakOn(log, '2026-10-04')).toBe(2);
    expect(streakOn(log, '2026-10-05')).toBe(0);
    logRun(log, '2026-10-06', { score: 6, time: 70 });
    expect(log.streak).toBe(1);
    expect(log.best['2026-10-02']).toEqual({ score: 5, time: 60 });
    // (no checkpoint passed: kept, but not for the board)
    const fresh: DailyLog = { streak: 0, best: {} };
    expect(logRun(fresh, '2026-10-06', { score: 0, time: 0 })).toBe(true);
    expect(fresh.pending).toBeUndefined();
  });

  it("the clock notes when the last checkpoint was passed (the board's tie-break)", () => {
    const a = newAttack(30);
    const dt = 0.1;
    let passed = 0;
    for (let t = 0; t < 30 && !a.over; t += dt) {
      if (Math.abs(t - 8) < dt / 2) passed = 1;
      if (Math.abs(t - 17.5) < dt / 2) passed = 2;
      stepAttack(a, dt, true, passed, false);
    }
    expect(a.passed).toBe(2);
    expect(a.lastAt).toBeCloseTo(17.5, 0);
    expect(a.elapsed).toBeGreaterThan(a.lastAt);
  });
});

describe("a new circuit in the Daily Challenge's rotation", () => {
  it('joins from its day on, so a day already under way keeps its circuit', async () => {
    const { DAILY_FROM, challengeOn, dailyLayouts } = await import('../src/f1/daily');
    const { LAYOUTS } = await import('../src/f1/layouts');
    for (const [id, from] of Object.entries(DAILY_FROM)) {
      const before = new Date(Date.parse(`${from}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
      expect(dailyLayouts(before).map((l) => l.id)).not.toContain(id);
      expect(dailyLayouts(from).map((l) => l.id)).toContain(id);
      // (the day before: the same challenge as without it, among the circuits in the rotation by then)
      const then = LAYOUTS.filter((l) => l.id !== id && (!DAILY_FROM[l.id] || before >= DAILY_FROM[l.id]));
      expect(challengeOn(before).layout.id).toBe(challengeOn(before, then).layout.id);
    }
  });
});
