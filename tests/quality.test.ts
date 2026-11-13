import { describe, expect, it } from 'vitest';
import { DEFAULT_GOVERNOR, KEEP_QUALITY_DAYS, QUALITY_LEVELS, QualityGovernor, keptQuality } from '../src/engine/render/quality';

/** Run the governor for `seconds`, each frame taking `ms(level)` milliseconds. */
function run(g: QualityGovernor, seconds: number, ms: (level: number) => number): void {
  for (let t = 0; t < seconds; ) {
    const dt = ms(g.level) / 1000;
    g.sample(dt);
    t += dt;
  }
}

describe('the quality governor', () => {
  it('keeps full quality on a phone that keeps up', () => {
    const g = new QualityGovernor();
    run(g, 20, () => 16.7);
    expect(g.level).toBe(0);
  });

  it('steps down on a phone that can\'t keep up, and stays down once that helps', () => {
    const g = new QualityGovernor();
    // too much at high; medium runs at 60
    run(g, 20, (level) => (level === 0 ? 33.3 : 16.7));
    expect(g.level).toBe(1);
    expect(g.locked).toBe(false);
  });

  it('steps down as far as it needs to', () => {
    const g = new QualityGovernor();
    run(g, 30, (level) => [40, 30, 25, 16.7][level]);
    expect(g.level).toBe(QUALITY_LEVELS.length - 1);
  });

  it('goes back to full quality, and stops trying, when the browser holds the page to 30 fps whatever the picture', () => {
    const g = new QualityGovernor();
    run(g, 30, () => 33.3);
    expect(g.level).toBe(0);
    expect(g.locked).toBe(true);
  });

  it('goes back to the last step that helped when the next one doesn\'t', () => {
    const g = new QualityGovernor();
    // high 40 ms, 25 ms on both lower levels: medium helped, low didn't help more
    run(g, 30, (level) => (level === 0 ? 40 : 25));
    expect(g.level).toBe(1);
    expect(g.locked).toBe(true);
  });

  it('starts where a race before settled, and steps on down from there if it has to', () => {
    const g = new QualityGovernor(DEFAULT_GOVERNOR, { level: 2, locked: false });
    expect(g.level).toBe(2);
    run(g, 30, (level) => (level < 3 ? 30 : 16.7));
    expect(g.level).toBe(3);
  });

  it('stays put when it started locked', () => {
    const g = new QualityGovernor(DEFAULT_GOVERNOR, { level: 1, locked: true });
    run(g, 30, () => 40);
    expect(g.level).toBe(1);
  });

  it('keeps shadows on at every level: turning them off makes every shader again mid-race', () => {
    for (const q of QUALITY_LEVELS) expect(q.shadowMap).toBeGreaterThan(0);
  });
});

describe('the kept quality level', () => {
  const day = 86400000;
  const now = Date.UTC(2026, 9, 25);

  it('is trusted for a few days in the same version', () => {
    expect(keptQuality({ level: 2, locked: true, at: now - day, version: '0.2.3' }, now, '0.2.3')).toEqual({ level: 2, locked: true });
  });

  it('is forgotten once it is old, from another version, or damaged', () => {
    expect(keptQuality({ level: 2, locked: false, at: now - (KEEP_QUALITY_DAYS + 1) * day, version: '0.2.3' }, now, '0.2.3')).toBeUndefined();
    expect(keptQuality({ level: 2, locked: false, at: now, version: '0.2.2' }, now, '0.2.3')).toBeUndefined();
    expect(keptQuality({ level: 9, locked: false, at: now, version: '0.2.3' }, now, '0.2.3')).toBeUndefined();
    expect(keptQuality({ level: 1, locked: false, at: now + day, version: '0.2.3' }, now, '0.2.3')).toBeUndefined();
    expect(keptQuality('high', now, '0.2.3')).toBeUndefined();
    expect(keptQuality(undefined, now, '0.2.3')).toBeUndefined();
  });
});
