import { describe, expect, it } from 'vitest';
import { titleLine } from '../src/f1/screens/titleWin';

describe("the title's celebration", () => {
  it('says your season in numbers: points, wins and how far clear', () => {
    expect(titleLine({ points: 212, wins: 6, clear: 31 })).toBe('212 POINTS · 6 WINS · 31 CLEAR');
    expect(titleLine({ points: 90, wins: 1, clear: 4 })).toBe('90 POINTS · 1 WIN · 4 CLEAR');
    // (level on points, won on more wins)
    expect(titleLine({ points: 120, wins: 3, clear: 0 })).toBe('120 POINTS · 3 WINS · ON COUNTBACK');
  });
});
