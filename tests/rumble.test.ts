import { describe, expect, it } from 'vitest';
import { RUMBLE, newRumble, rumble, type RumbleFrame } from '../src/f1/rumble';

const frame = (f: Partial<RumbleFrame> = {}): RumbleFrame => ({
  dt: 1 / 60, speed: 200, topSpeed: 320, healthLost: 0, wreckedNow: false, landed: 0, onRough: false, onKerb: false, ...f,
});

/** Total ms and number of pulses over `seconds` of the same frame. */
function over(seconds: number, f: Partial<RumbleFrame>) {
  const s = newRumble();
  let total = 0;
  let pulses = 0;
  for (let t = 0; t < seconds; t += 1 / 60) {
    const ms = rumble(s, frame(f));
    total += ms;
    if (ms) pulses++;
  }
  return { total, pulses };
}

describe('rumble', () => {
  it('is still on clean track', () => {
    expect(over(2, {}).total).toBe(0);
  });

  it('bumps for a crash, harder for a harder hit, and longest for a wreck', () => {
    const s = newRumble();
    const knock = rumble(s, frame({ healthLost: 3 }));
    const big = rumble(s, frame({ healthLost: 20 }));
    const wreck = rumble(s, frame({ healthLost: 20, wreckedNow: true }));
    expect(knock).toBeGreaterThan(0);
    expect(big).toBeGreaterThan(knock);
    expect(big).toBeLessThanOrEqual(RUMBLE.hitMost);
    expect(wreck).toBeGreaterThan(big);
    expect(rumble(s, frame({ healthLost: 0.2 }))).toBe(0); // a scrape isn't felt
  });

  it('thumps on a hard landing', () => {
    expect(rumble(newRumble(), frame({ landed: 200 }))).toBe(RUMBLE.landingMs);
    expect(rumble(newRumble(), frame({ landed: 60 }))).toBe(0);
  });

  it('rumbles on grass or gravel: a bump going on, then steady pulses', () => {
    const s = newRumble();
    expect(rumble(s, frame({ onRough: true }))).toBe(RUMBLE.roughIn);
    const { pulses } = over(1, { onRough: true });
    expect(pulses).toBeGreaterThanOrEqual(8); // about every 0.12 s
    expect(pulses).toBeLessThanOrEqual(10);
    expect(over(1, { onRough: true, speed: 20 }).total).toBe(0); // crawling: nothing
  });

  it('patters lightly over the kerbs', () => {
    const kerbs = over(1, { onKerb: true });
    expect(kerbs.pulses).toBeGreaterThanOrEqual(10);
    expect(kerbs.total).toBeLessThan(over(1, { onRough: true }).total);
  });
});
