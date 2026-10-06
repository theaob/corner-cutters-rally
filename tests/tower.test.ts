import { describe, expect, it } from 'vitest';
import { overtakeOf, towerGap, towerRows } from '../src/f1/tower';

describe('the timing tower', () => {
  const order = [4, 2, 7, 0, 9, 1, 3, 5, 8, 6];
  it('shows the top three and you near the front, or the top three and the cars either side of you further back', () => {
    expect(towerRows(order, 2)).toEqual([4, 2, 7]);
    expect(towerRows(order, 9)).toEqual([4, 2, 7, 0, 9, 1]);
    expect(towerRows(order, 5)).toEqual([4, 2, 7, 'gap', 3, 5, 8]);
    expect(towerRows(order, 6)).toEqual([4, 2, 7, 'gap', 8, 6]);
  });

  it('gives the leader, gaps in seconds and cars a lap down', () => {
    expect(towerGap(1, undefined, 0)).toBe('LEAD');
    expect(towerGap(3, 2.345, 0)).toBe('+2.3');
    expect(towerGap(8, 40, 1)).toBe('+1L');
    expect(towerGap(2, undefined, 0)).toBe('');
  });
});

describe('the overtake callouts', () => {
  it('names the car you passed, and the car that passed you, with your place', () => {
    expect(overtakeOf([1, 2, 0, 3], [1, 0, 2, 3], 0)).toEqual({ kind: 'passed', other: 2, place: 2 });
    expect(overtakeOf([1, 0, 2, 3], [1, 2, 0, 3], 0)).toEqual({ kind: 'passed-by', other: 2, place: 3 });
    expect(overtakeOf([1, 0, 2], [1, 0, 2], 0)).toBeUndefined();
  });
});
