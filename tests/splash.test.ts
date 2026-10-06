import { describe, expect, it } from 'vitest';
import { SPLASH_GO_MS, startPrompt } from '../src/f1/screens/splash';

describe('the title splash', () => {
  it('asks for a tap on a touch screen, a key otherwise', () => {
    expect(startPrompt(true)).toBe('TAP TO START');
    expect(startPrompt(false)).toBe('PRESS ANY KEY');
  });

  it('goes on quickly once started (the prompt flashes, no more)', () => {
    expect(SPLASH_GO_MS).toBeGreaterThan(0);
    expect(SPLASH_GO_MS).toBeLessThanOrEqual(500);
  });
});
