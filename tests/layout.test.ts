import { describe, expect, it } from 'vitest';
import { DESKTOP_GAME_HEIGHT, GAME_WIDTH, MAX_GAME_HEIGHT, MAX_HANDHELD_HEIGHT, MIN_GAME_HEIGHT, fitDesktop, fitHandheld, fitScreen, startLayout } from '../src/engine/layout';

describe('fitScreen', () => {
  it('fills the width edge to edge, whatever the pixel ratio', () => {
    // iPhone 12–15: 390 pt wide; Pixel-style 412 pt (2.625×) used to get side borders
    for (const width of [390, 412, 360, 375, 430]) {
      const fit = fitScreen(width, 844 - 220);
      expect(GAME_WIDTH * fit.scale).toBeCloseTo(width);
    }
  });

  it('shows as much height as fits, between the minimum and maximum', () => {
    expect(fitScreen(390, 844 - 220).height).toBe(MAX_GAME_HEIGHT);
    const se = fitScreen(375, 667 - 220); // iPhone SE
    expect(se.height).toBeGreaterThanOrEqual(MIN_GAME_HEIGHT);
    expect(se.height * se.scale).toBeLessThanOrEqual(667 - 220);
  });

  it('narrows only when the screen is too short for the minimum height at full width', () => {
    const fit = fitScreen(430, 300);
    expect(fit.height).toBe(MIN_GAME_HEIGHT);
    expect(fit.height * fit.scale).toBeLessThanOrEqual(300);
    expect(GAME_WIDTH * fit.scale).toBeLessThan(430);
  });
});

describe('fitScreen on a phone', () => {
  it('keeps the portrait width', () => {
    const fit = fitScreen(390, 844 - 220);
    expect(fit.width).toBe(GAME_WIDTH);
    expect(fit.desktop).toBe(false);
  });
});

describe('fitHandheld', () => {
  it('fills a phone top to bottom and edge to edge (the deck floats over it)', () => {
    for (const [w, h] of [[390, 844], [375, 667], [412, 915], [360, 780]]) {
      const fit = fitHandheld(w, h);
      expect(GAME_WIDTH * fit.scale).toBeCloseTo(w);
      expect(fit.height * fit.scale).toBeGreaterThanOrEqual(h);
      expect(fit.height * fit.scale).toBeLessThan(h + fit.scale);
    }
  });

  it('stops at its tallest on a tablet held upright, and narrows on a short screen', () => {
    expect(fitHandheld(430, 2000).height).toBe(MAX_HANDHELD_HEIGHT);
    const short = fitHandheld(430, 300);
    expect(short.height).toBe(MIN_GAME_HEIGHT);
    expect(GAME_WIDTH * short.scale).toBeLessThan(430);
  });
});

describe('fitDesktop', () => {
  it('fills a 16:9 window edge to edge', () => {
    const fit = fitDesktop(1920, 1080);
    expect(fit.height).toBe(DESKTOP_GAME_HEIGHT);
    expect(fit.height * fit.scale).toBeCloseTo(1080);
    expect(fit.width * fit.scale).toBeLessThanOrEqual(1920);
    expect(fit.width * fit.scale).toBeGreaterThan(1920 - fit.scale);
    expect(fit.desktop).toBe(true);
  });

  it('stops at 16:9 on an ultrawide window, leaving side borders', () => {
    const fit = fitDesktop(3440, 1440);
    expect(fit.width / fit.height).toBeCloseTo(16 / 9, 1);
    expect(fit.width * fit.scale).toBeLessThan(3440);
  });

  it('never goes narrower than the phone screen, shrinking instead', () => {
    const fit = fitDesktop(300, 1000);
    expect(fit.width).toBe(GAME_WIDTH);
    expect(fit.width * fit.scale).toBeLessThanOrEqual(300);
    expect(fit.height * fit.scale).toBeLessThanOrEqual(1000);
  });
});

describe('startLayout', () => {
  it('starts handheld, whatever the device', () => {
    expect(startLayout('', null)).toBe('handheld');
    expect(startLayout('?tune', 'handheld')).toBe('handheld');
  });

  it('remembers the player switching to desktop', () => {
    expect(startLayout('', 'desktop')).toBe('desktop');
  });

  it('can be forced either way from the address', () => {
    expect(startLayout('?desktop', null)).toBe('desktop');
    expect(startLayout('?tune&mobile', 'desktop')).toBe('handheld');
  });
});
