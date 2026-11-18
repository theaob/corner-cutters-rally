import { describe, expect, it } from 'vitest';
import { HOLD_FOR, STEPS, advance, apexesPassed, newOnboarding, prompt, teaches, type Facts } from '../src/f1/onboarding';

const facts = (f: Partial<Facts> = {}): Facts => ({ speed: 0, holding: 'none', reversing: false, bends: 0, lapDone: false, dt: 0.1, ...f });
/** hold `f` for `s` seconds, a tenth at a time */
const hold = (o: ReturnType<typeof newOnboarding>, f: Partial<Facts>, s: number) => {
  for (let t = 0; t < s - 1e-9; t += 0.1) advance(o, facts(f));
};

describe('the controls lap', () => {
  it('steers left, then right, then brakes to a stop and reverses, before the calls and the finish', () => {
    const o = newOnboarding();
    expect(o.step).toBe('left');
    // (the right half held does nothing for the left step; the left one, held a moment while moving, does)
    hold(o, { speed: 80, holding: 'right' }, 2);
    expect(o.step).toBe('left');
    hold(o, { speed: 80, holding: 'left' }, HOLD_FOR.steer + 0.1);
    expect(o.step).toBe('right');
    hold(o, { speed: 80, holding: 'right' }, HOLD_FOR.steer + 0.1);
    expect(o.step).toBe('brake');
    // braking: both held, until the car stops
    expect(advance(o, facts({ speed: 120, holding: 'both' }))).toBe(false);
    expect(advance(o, facts({ speed: 2, holding: 'left' }))).toBe(false);
    expect(advance(o, facts({ speed: 2, holding: 'both' }))).toBe(true);
    expect(o.step).toBe('reverse');
    // reversing a moment (let go, and it starts again)
    hold(o, { speed: 20, holding: 'both', reversing: true }, HOLD_FOR.reverse / 2);
    advance(o, facts({ speed: 20 }));
    hold(o, { speed: 20, holding: 'both', reversing: true }, HOLD_FOR.reverse / 2);
    expect(o.step).toBe('reverse');
    hold(o, { speed: 20, holding: 'both', reversing: true }, HOLD_FOR.reverse);
    expect(o.step).toBe('notes');
    advance(o, facts({ bends: 0 }));
    expect(o.step).toBe('notes');
    advance(o, facts({ bends: 1 }));
    expect(o.step).toBe('lap');
    advance(o, facts({ bends: 5, lapDone: true }));
    expect(o.step).toBe('done');
    expect(advance(o, facts({ lapDone: true }))).toBe(false);
  });

  it('a steering step needs only the half held a moment (a car stuck against a tree still counts)', () => {
    const o = newOnboarding();
    hold(o, { speed: 0, holding: 'left' }, HOLD_FOR.steer + 0.1);
    expect(o.step).toBe('right');
  });

  it('lights up the halves to hold: each one for its step, both to brake and reverse, none after', () => {
    expect(teaches('left')).toBe('left');
    expect(teaches('right')).toBe('right');
    expect(teaches('brake')).toBe('both');
    expect(teaches('reverse')).toBe('both');
    for (const step of ['notes', 'lap', 'done'] as const) expect(teaches(step)).toBe('none');
  });

  it('says each prompt for the device you drive with', () => {
    for (const step of STEPS) for (const device of ['touch', 'keys', 'pad'] as const) expect(prompt(step, device).length).toBeGreaterThan(5);
    expect(prompt('left', 'touch')).toContain('LEFT HALF');
    expect(prompt('brake', 'touch')).toContain('BOTH HALVES');
    expect(prompt('brake', 'keys')).toContain('DOWN');
    expect(prompt('brake', 'pad')).toContain('TRIGGER');
    expect(prompt('reverse', 'touch')).toContain('REVERSE');
  });

  it('counts the bends passed, round the loop', () => {
    const apexes = [10, 50, 95];
    expect(apexesPassed(apexes, 5, 12, 100)).toBe(1);
    expect(apexesPassed(apexes, 12, 60, 100)).toBe(1);
    // across the line
    expect(apexesPassed(apexes, 90, 15, 100)).toBe(2);
    // standing still, or a jump backwards: none
    expect(apexesPassed(apexes, 20, 20, 100)).toBe(0);
    expect(apexesPassed(apexes, 60, 40, 100)).toBe(0);
  });
});
