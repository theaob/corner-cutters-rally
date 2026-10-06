import { describe, expect, it } from 'vitest';
import { STEPS, advance, apexesPassed, newOnboarding, prompt, type Facts } from '../src/f1/onboarding';

const facts = (f: Partial<Facts> = {}): Facts => ({ speed: 0, top: 320, bends: 0, drifting: false, lapDone: false, ...f });

describe('the controls lap', () => {
  it('moves on a prompt at a time as each thing is done', () => {
    const o = newOnboarding();
    expect(advance(o, facts({ speed: 50 }))).toBe(false);
    expect(advance(o, facts({ speed: 120 }))).toBe(true);
    expect(o.step).toBe('faster');
    expect(advance(o, facts({ speed: 200 }))).toBe(false);
    advance(o, facts({ speed: 290 }));
    expect(o.step).toBe('bend');
    // slowing for a bend: done once through one (counted from when the prompt came up)
    expect(advance(o, facts({ speed: 200, bends: 0 }))).toBe(false);
    advance(o, facts({ speed: 200, bends: 1 }));
    expect(o.step).toBe('drift');
    advance(o, facts({ speed: 150, bends: 1, drifting: true }));
    expect(o.step).toBe('limits');
    advance(o, facts({ bends: 2 }));
    expect(o.step).toBe('lap');
    advance(o, facts({ bends: 5, lapDone: true }));
    expect(o.step).toBe('done');
    expect(advance(o, facts({ lapDone: true }))).toBe(false);
  });
  it('skips the drift prompt where you can\'t drift (no drift button on the touch deck)', () => {
    const o = { step: 'drift' as const, from: 3 };
    expect(advance(o, facts({ bends: 3, canDrift: false }))).toBe(true);
    expect(o.step).toBe('limits');
  });
  it("doesn't hold you up if you never drift: two bends and it moves on", () => {
    const o = { step: 'drift' as const, from: 3 };
    advance(o, facts({ bends: 4 }));
    expect(o.step).toBe('drift');
    advance(o, facts({ bends: 5 }));
    expect(o.step).toBe('limits');
  });
  it('says each prompt for the device you drive with', () => {
    for (const step of STEPS) for (const device of ['touch', 'keys', 'pad'] as const) expect(prompt(step, device).length).toBeGreaterThan(5);
    expect(prompt('go', 'touch')).toContain('STICK');
    expect(prompt('go', 'keys')).toContain('UP');
    expect(prompt('bend', 'pad')).toContain('TRIGGER');
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
