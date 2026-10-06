import { describe, expect, it } from 'vitest';
import { DRIVER_NUMBERS, numberOf } from '../src/f1/drivers';
import { TEAMS } from '../src/f1/teams';

describe('driver numbers', () => {
  it('gives every driver on the grid a number of their own, 1 to 99', () => {
    const drivers = TEAMS.flatMap((t) => t.drivers);
    const numbers = drivers.map(numberOf);
    for (const n of numbers) {
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(99);
    }
    expect(new Set(numbers).size).toBe(drivers.length);
  });

  it('has no numbers for drivers who aren’t on the grid', () => {
    const drivers = new Set(TEAMS.flatMap((t) => t.drivers));
    expect(Object.keys(DRIVER_NUMBERS).filter((code) => !drivers.has(code))).toEqual([]);
    expect(numberOf('XXX')).toBeUndefined();
  });
});
