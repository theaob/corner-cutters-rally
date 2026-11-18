import { describe, expect, it } from 'vitest';
import { GAME_WIDTH, LANDSCAPE_GAME_HEIGHT, MAX_LANDSCAPE_ASPECT, fitLandscape, isTouchScreen } from '../src/engine/layout';

describe('fitLandscape', () => {
  it('fills a landscape phone top to bottom and edge to edge, 300 game px tall', () => {
    for (const [w, h] of [[844, 390], [915, 412], [780, 360], [667, 375]]) {
      const fit = fitLandscape(w, h);
      expect(fit.height).toBe(LANDSCAPE_GAME_HEIGHT);
      expect(fit.height * fit.scale).toBeCloseTo(h);
      expect(fit.width * fit.scale).toBeLessThanOrEqual(w);
      expect(fit.width * fit.scale).toBeGreaterThan(w - fit.scale);
    }
  });

  it('fills a 16:9 window, and stops at 22:9 on an ultrawide one', () => {
    const fit = fitLandscape(1920, 1080);
    expect(fit.height * fit.scale).toBeCloseTo(1080);
    const wide = fitLandscape(3440, 1000);
    expect(wide.width / wide.height).toBeLessThanOrEqual(MAX_LANDSCAPE_ASPECT);
    expect(wide.width * wide.scale).toBeLessThan(3440);
  });

  it('never goes narrower than the game is wide, shrinking instead (a phone held upright)', () => {
    const fit = fitLandscape(390, 844);
    expect(fit.width).toBe(GAME_WIDTH);
    expect(fit.width * fit.scale).toBeLessThanOrEqual(390);
  });
});

describe('isTouchScreen', () => {
  const win = (coarse: boolean, maxTouchPoints: number) =>
    ({ matchMedia: () => ({ matches: coarse }), navigator: { maxTouchPoints } }) as unknown as Window;
  it('a coarse pointer, or a screen that takes touches (an Android WebView can report no coarse pointer)', () => {
    expect(isTouchScreen(win(true, 0))).toBe(true);
    expect(isTouchScreen(win(false, 5))).toBe(true);
    expect(isTouchScreen(win(false, 0))).toBe(false);
  });
});
