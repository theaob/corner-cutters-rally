import { describe, expect, it } from 'vitest';
import { LAP_CHOICES, RACE_LAPS, lapsAbout, lapsFrom } from '../src/f1/laps';
import { F1_TUNING } from '../src/f1/tuning';

describe('the race length', () => {
  it('is five laps unless the player picks another for a Quick Race', () => {
    expect(RACE_LAPS).toBe(5);
    expect(LAP_CHOICES).toContain(RACE_LAPS);
    // nothing saved, or something odd saved: five
    for (const saved of [null, undefined, '', 'lots', '4', '0', '-3', '100']) expect(lapsFrom(saved)).toBe(5);
    for (const n of LAP_CHOICES) expect(lapsFrom(String(n))).toBe(n);
  });

  it('runs from a sprint to an endurance race, each with a line for the menu', () => {
    expect(Math.min(...LAP_CHOICES)).toBe(1);
    expect(Math.max(...LAP_CHOICES)).toBeGreaterThanOrEqual(15);
    expect([...LAP_CHOICES]).toEqual([...LAP_CHOICES].sort((a, b) => a - b));
    expect(lapsAbout(1)).toMatch(/sprint/);
    expect(lapsAbout(5)).toMatch(/stop/);
    expect(new Set(LAP_CHOICES.map(lapsAbout)).size).toBeGreaterThan(3);
  });

  it("isn't a TUNE value any more (an old saved one there is never read)", () => {
    expect('laps' in F1_TUNING).toBe(false);
  });
});
