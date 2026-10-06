import { describe, expect, it } from 'vitest';
import { CROWD, GEARS, RaceSounds, crowdGain, crowdNear, doppler, engineNote } from '../src/f1/sounds';

describe('the engine note', () => {
  const top = 320;
  it('idles lower than it ever revs on the move', () => {
    const idle = engineNote(0, top, 0).freq;
    for (let v = 5; v <= top; v += 5) expect(engineNote(v, top, 1).freq).toBeGreaterThan(idle);
  });

  it('drops less at an upshift in the high gears than in the low (closer ratios), and never past the limiter', () => {
    const at = (share: number) => engineNote(share * top, top, 1).freq;
    const w = 1 / GEARS;
    const drop = (g: number) => at((g + 0.999) * w) / at((g + 1.001) * w);
    expect(drop(1)).toBeGreaterThan(drop(6));
    expect(drop(6)).toBeGreaterThan(1.1);
    for (let v = 0; v <= top; v += 3) expect(engineNote(v, top, 1).freq).toBeLessThanOrEqual(630);
  });

  it('counts the gears up to the top one', () => {
    expect(engineNote(10, top, 1).gear).toBe(0);
    expect(engineNote(top, top, 1).gear).toBe(GEARS - 1);
  });

  it('climbs through each gear, and drops back at each upshift', () => {
    const at = (share: number) => engineNote(share * top, top, 1).freq;
    const gearWidth = 1 / GEARS;
    // within the third gear the pitch rises…
    expect(at(2.9 * gearWidth)).toBeGreaterThan(at(2.1 * gearWidth));
    // …and falls as it shifts into the fourth
    expect(at(3.05 * gearWidth)).toBeLessThan(at(2.95 * gearWidth));
    // top gear, flat out, is the highest note of all
    expect(at(1)).toBeGreaterThan(at(0.5));
  });

  it('is louder and brighter on the throttle', () => {
    const on = engineNote(200, top, 1);
    const off = engineNote(200, top, 0);
    expect(on.gain).toBeGreaterThan(off.gain);
    expect(on.brightness).toBeGreaterThan(off.brightness);
  });
});

describe('a passing car', () => {
  it('sounds higher coming, lower going, and the same keeping pace', () => {
    expect(doppler(200)).toBeGreaterThan(1);
    expect(doppler(-200)).toBeLessThan(1);
    expect(doppler(0)).toBe(1);
    expect(doppler(5000)).toBeLessThanOrEqual(1.2);
  });
});

describe('the race sounds without Web Audio (tests, old browsers)', () => {
  it('do nothing, quietly', () => {
    const s = new RaceSounds(1);
    expect(() => {
      s.update({ dt: 1 / 60, speed: 200, top: 320, slide: 100, onRough: true, onKerb: false, rival: { speed: 180, distance: 40 } });
      s.update({ dt: 1 / 60, speed: 100, top: 320, slide: 0, onRough: true, onKerb: false, onGravel: true, crowd: 1, limiter: true });
      s.cheer(1);
      s.scrape(1);
      s.radio();
      s.hit(1);
      s.light();
      s.go();
      s.flag();
      s.finalLap();
      s.record();
      s.quiet();
    }).not.toThrow();
  });
});

describe('the crowd', () => {
  const stands = [{ x: 0, y: 0 }, { x: 2000, y: 0 }];
  it('is near by a grandstand and out of earshot far from them all', () => {
    expect(crowdNear(stands, 50, 0)).toBe(1);
    expect(crowdNear(stands, 1000, 0)).toBe(0);
    expect(crowdNear(stands, 300, 0)).toBeGreaterThan(0);
    expect(crowdNear(stands, 300, 0)).toBeLessThan(1);
    expect(crowdNear([], 0, 0)).toBe(0);
  });
  it('murmurs by the stands, and cheers loudest there, though a cheer carries everywhere', () => {
    expect(crowdGain(0, 0)).toBe(0);
    expect(crowdGain(1, 0)).toBeCloseTo(CROWD.murmur);
    expect(crowdGain(1, 1)).toBeGreaterThan(crowdGain(1, 0) * 3);
    expect(crowdGain(0, 1)).toBeGreaterThan(0);
    expect(crowdGain(0, 1)).toBeLessThan(crowdGain(1, 1));
  });
});
