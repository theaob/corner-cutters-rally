import { existsSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SHIPPED_STILL, STILL_KEY, STILL_QUALITY, keepStill, stillSource } from '../src/f1/screens/backdropStill';

/** a device's storage (or one that throws, as with storage turned off) */
function storage(failing = false): Map<string, string> {
  const kept = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => {
      if (failing) throw new Error('no storage');
      return kept.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (failing) throw new Error('no storage');
      kept.set(k, v);
    },
  });
  return kept;
}

/** a canvas whose picture is `image` */
const canvas = (image: string) => ({ toDataURL: vi.fn(() => image) }) as unknown as HTMLCanvasElement;

describe("the menu's still", () => {
  afterEach(() => vi.unstubAllGlobals());

  it('ships with the game, so a new device opens the menu on a picture too', () => {
    expect(existsSync(`public/${SHIPPED_STILL}`)).toBe(true);
    storage();
    expect(stillSource()).toBe(SHIPPED_STILL);
  });

  it("is the device's own once the live backdrop has taken one (a JPEG)", () => {
    const kept = storage();
    const drawn = canvas('data:image/jpeg;base64,AAAA');
    keepStill(drawn);
    expect(drawn.toDataURL).toHaveBeenCalledWith('image/jpeg', STILL_QUALITY);
    expect(kept.get(STILL_KEY)).toBe('data:image/jpeg;base64,AAAA');
    expect(stillSource()).toBe('data:image/jpeg;base64,AAAA');
  });

  it("keeps the one before when a canvas gives no picture, and isn't fooled by what isn't one", () => {
    const kept = storage();
    keepStill(canvas('data:image/jpeg;base64,BBBB'));
    // (a lost context gives an empty data URL)
    keepStill(canvas('data:,'));
    expect(kept.get(STILL_KEY)).toBe('data:image/jpeg;base64,BBBB');
    kept.set(STILL_KEY, 'garbage');
    expect(stillSource()).toBe(SHIPPED_STILL);
  });

  it('without storage: the shipped one, and nothing thrown', () => {
    storage(true);
    expect(() => keepStill(canvas('data:image/jpeg;base64,CCCC'))).not.toThrow();
    expect(stillSource()).toBe(SHIPPED_STILL);
  });
});
