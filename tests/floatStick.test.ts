import { describe, expect, it } from 'vitest';
import { FLOAT_MARGIN, floatOffset } from '../src/engine/deck';

// a 390 × 844 phone, the stick (54 px across its middle) at rest in the bottom right corner
const screen = { left: 0, top: 0, right: 390, bottom: 844 };
const home = { x: 390 - 12 - 54, y: 844 - 16 - 54 };

describe('the floating thumbstick', () => {
  it('comes to the thumb: centred under it, wherever it lands on its side of the screen', () => {
    expect(floatOffset(250, 600, home.x, home.y, 54, screen)).toEqual({ x: 250 - home.x, y: 600 - home.y });
  });

  it('stays where it is for a thumb landing on it at rest', () => {
    expect(floatOffset(home.x, home.y, home.x, home.y, 54, screen)).toEqual({ x: 0, y: 0 });
  });

  it("never goes off the screen: a thumb by the edge brings it as close as fits, its base whole", () => {
    const o = floatOffset(385, 840, home.x, home.y, 54, screen);
    expect(home.x + o.x + 54 + FLOAT_MARGIN).toBe(390);
    expect(home.y + o.y + 54 + FLOAT_MARGIN).toBe(844);
    const l = floatOffset(2, 300, home.x, home.y, 54, screen);
    expect(home.x + l.x - 54 - FLOAT_MARGIN).toBe(0);
  });
});
