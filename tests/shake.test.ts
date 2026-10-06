import { describe, expect, it } from 'vitest';
import { SHAKE, newShake, rushOf, shakeOffset, stepShake, timeScale, type ShakeFrame } from '../src/f1/shake';

const quiet: ShakeFrame = { dt: 1 / 60, speed: 200, topSpeed: 320, healthLost: 0, wreckedNow: false, landed: 0, onRough: false, onKerb: false };
/** The most the camera moves over `seconds` of frames like `f` (the first frame as given, the rest quiet but for the ground). */
function most(f: Partial<ShakeFrame>, seconds = 0.5) {
  const s = newShake();
  let top = 0;
  for (let t = 0; t < seconds; t += 1 / 60) {
    stepShake(s, t === 0 ? { ...quiet, ...f } : { ...quiet, onRough: !!f.onRough, onKerb: !!f.onKerb, speed: f.speed ?? quiet.speed });
    const o = shakeOffset(s);
    top = Math.max(top, Math.hypot(o.x, o.y));
  }
  return { top, s };
}

describe('the camera shake', () => {
  it('is still on a clean drive', () => {
    expect(most({}).top).toBe(0);
  });

  it('shakes harder the harder the hit, a wreck hardest, never past its most', () => {
    const knock = most({ healthLost: 2 }).top;
    const crash = most({ healthLost: 15 }).top;
    const wreck = most({ wreckedNow: true }).top;
    expect(knock).toBeGreaterThan(0);
    expect(crash).toBeGreaterThan(knock * 2);
    expect(wreck).toBeGreaterThan(crash);
    expect(wreck).toBeLessThanOrEqual(SHAKE.most * Math.SQRT2 + 1e-9);
  });

  it('fades away by itself', () => {
    const { s } = most({ wreckedNow: true }, 2);
    expect(s.trauma).toBe(0);
    expect(Math.hypot(shakeOffset(s).x, shakeOffset(s).y)).toBe(0);
  });

  it('judders on the kerbs and more on the grass, as long as you are on them, more at speed', () => {
    const kerb = most({ onKerb: true }, 1);
    const grass = most({ onRough: true }, 1);
    expect(kerb.s.trauma).toBeGreaterThan(0);
    expect(grass.s.trauma).toBeGreaterThan(kerb.s.trauma);
    expect(most({ onRough: true, speed: 100 }, 1).s.trauma).toBeLessThan(grass.s.trauma);
    expect(most({ onRough: true, speed: 20 }, 1).s.trauma).toBe(0);
  });

  it('thumps on a hard landing, not a soft one', () => {
    expect(most({ landed: 100 }).top).toBe(0);
    expect(most({ landed: 300 }).top).toBeGreaterThan(0);
  });

  it('stops time for a moment on a big hit (a hit-stop), not a knock', () => {
    const s = newShake();
    stepShake(s, { ...quiet, healthLost: 2 });
    expect(timeScale(s)).toBe(1);
    stepShake(s, { ...quiet, healthLost: SHAKE.bigHit });
    expect(timeScale(s)).toBe(SHAKE.crawl);
    for (let t = 0; t < SHAKE.hold + 0.02; t += 1 / 60) stepShake(s, quiet);
    expect(timeScale(s)).toBe(1);
  });
});

describe('the rush of speed', () => {
  it('is nothing at a cruise, builds near top speed, and comes in a tow at a fair speed', () => {
    expect(rushOf(150, 320)).toBe(0);
    expect(rushOf(250, 320)).toBe(0);
    expect(rushOf(300, 320)).toBeGreaterThan(0);
    expect(rushOf(320, 320)).toBe(1);
    expect(rushOf(250, 320, 1)).toBeGreaterThan(0.5);
    expect(rushOf(100, 320, 1)).toBe(0);
  });
});
