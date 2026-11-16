import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DUST, DUST_MAX, DustLayer, dustKindOf } from '../src/engine/render/dust';

// (no page here: a canvas that draws nothing, for the cloud's texture)
beforeAll(() => {
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) });
});
afterAll(() => vi.unstubAllGlobals());

const dt = 1 / 60;

/** A car going straight up the screen (heading 0: -y) at `speed` for `s` seconds, kicking up `kind`'s dust. */
function drive(d: DustLayer, s: number, amount = 1, slide = 0, kind: keyof typeof DUST = 'gravel'): number {
  let z = 0;
  for (let t = 0; t < s; t += dt) {
    z -= 300 * dt;
    d.kick(0, kind, 0, z, 0, 0, 0, -300, amount, slide, dt);
    d.update(dt);
  }
  return z;
}

describe('dust', () => {
  it('is the stage road’s: gravel, sand or snow on dirt, and earth off the grass by a sealed road', () => {
    expect(dustKindOf({ dirt: true })).toBe('gravel');
    expect(dustKindOf({ dirt: true, desert: true })).toBe('sand');
    expect(dustKindOf({ dirt: true, snow: true })).toBe('snow');
    expect(dustKindOf({})).toBe('grass');
  });

  it('comes off a car at its look’s rate, and more while it slides', () => {
    const straight = new DustLayer();
    drive(straight, 0.5);
    const sliding = new DustLayer();
    drive(sliding, 0.5, 1, 1);
    expect(straight.count).toBeGreaterThan(DUST.gravel.rate * 0.5 - 2);
    expect(straight.count).toBeLessThan(DUST.gravel.rate * 0.5 + 2);
    expect(sliding.count).toBeGreaterThan(straight.count * 1.8);
  });

  it('thins out at a lower quality level', () => {
    const full = new DustLayer();
    drive(full, 0.5);
    const half = new DustLayer();
    half.density = 0.5;
    drive(half, 0.5);
    expect(half.count).toBeLessThan(full.count * 0.6);
  });

  it('settles and is gone once its life is over', () => {
    const d = new DustLayer();
    drive(d, 0.3);
    expect(d.count).toBeGreaterThan(0);
    for (let t = 0; t < DUST.gravel.life[1] + 0.1; t += dt) d.update(dt);
    expect(d.count).toBe(0);
  });

  it('never holds more than its pool, however many cars are kicking it up', () => {
    const d = new DustLayer();
    for (let t = 0; t < 2; t += dt) {
      for (let id = 0; id < 12; id++) d.kick(id, 'sand', id * 50, 0, 0, 0, 0, -300, 1, 1, dt);
      d.update(dt);
    }
    expect(d.count).toBe(DUST_MAX);
  });

  it('is thrown out behind the car, not ahead of it', () => {
    const d = new DustLayer();
    const z = drive(d, 0.4);
    const off = d.mesh.geometry.getAttribute('offset');
    for (let i = 0; i < d.count; i++) expect(off.getZ(i)).toBeGreaterThan(z);
  });
});
