import { describe, expect, it } from 'vitest';
import { evenLines } from '../src/f1/race/banner';
import { STEPS, prompt } from '../src/f1/onboarding';

const lines = (text: string) => evenLines(text).split('\n');

describe("the banner's message on two lines", () => {
  it('splits at its most even point: no word left on its own', () => {
    expect(lines('PUSH THE STICK THE WAY YOU WANT TO GO')).toEqual(['PUSH THE STICK THE', 'WAY YOU WANT TO GO']);
  });

  it("breaks at the ' · ': a phrase a line, and the dot goes", () => {
    expect(lines('UP TO GO · LEFT AND RIGHT TO STEER')).toEqual(['UP TO GO', 'LEFT AND RIGHT TO STEER']);
    expect(lines('GAS TO GO · SLIDE TO STEER')).toEqual(['GAS TO GO', 'SLIDE TO STEER']);
    expect(lines('RIGHT TRIGGER TO GO · STICK TO STEER')).toEqual(['RIGHT TRIGGER TO GO', 'STICK TO STEER']);
    // (of two, the one nearer the middle)
    expect(lines('A · B C D · E')).toEqual(['A · B C D', 'E']);
  });

  it('one word stays as it is', () => {
    expect(evenLines('GO!')).toBe('GO!');
  });

  it("every controls-lap prompt: its two lines within a few letters of each other, unless a ' · ' splits it", () => {
    for (const device of ['touch', 'keys', 'pad'] as const) {
      for (const step of STEPS) {
        for (const points of [true, false]) {
          const text = prompt(step, device, points);
          if (!text.includes(' ')) continue;
          const [a, b] = lines(text);
          expect(a.length && b.length).toBeTruthy();
          if (!text.includes(' · ')) expect(Math.abs(a.length - b.length)).toBeLessThanOrEqual(8);
        }
      }
    }
  });
});
