import { beforeEach, describe, expect, it } from 'vitest';
import { EXIT_WINDOW, onBack, pressBack, resetBack } from '../src/engine/backButton';

describe("the phone's back button", () => {
  beforeEach(resetBack);
  const press = (now: number) => {
    const said: string[] = [];
    const r = pressBack(now, () => said.push('warn'), () => said.push('exit'));
    return { r, said };
  };

  it('goes to the screen up now, the latest first', () => {
    const went: string[] = [];
    onBack(() => (went.push('menu'), true));
    const off = onBack(() => (went.push('race'), true));
    expect(press(0).r).toBe('handled');
    off();
    expect(press(1).r).toBe('handled');
    expect(went).toEqual(['race', 'menu']);
  });

  it('passes on when a screen has nowhere to go back to', () => {
    const went: string[] = [];
    onBack(() => (went.push('outer'), true));
    onBack(() => false);
    expect(press(0).r).toBe('handled');
    expect(went).toEqual(['outer']);
  });

  it('with nothing to go back to, warns first, and leaves on a second press soon after', () => {
    expect(press(0)).toEqual({ r: 'warned', said: ['warn'] });
    expect(press(EXIT_WINDOW - 0.5)).toEqual({ r: 'exit', said: ['exit'] });
    // (too late: warned again)
    expect(press(10).r).toBe('warned');
    expect(press(10 + EXIT_WINDOW + 0.5).r).toBe('warned');
  });
});
