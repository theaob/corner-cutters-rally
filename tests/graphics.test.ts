import { describe, expect, it } from 'vitest';
import { QUALITY_LEVELS } from '../src/engine/render/quality';
import { frameCap, heldLevel, skipFrame } from '../src/f1/graphics';

describe('GRAPHICS', () => {
  it('AUTO leaves the level to the governor; HIGH, LOW and SAVER hold one', () => {
    expect(heldLevel('auto')).toBeUndefined();
    expect(QUALITY_LEVELS[heldLevel('high')!].name).toBe('high');
    expect(QUALITY_LEVELS[heldLevel('low')!].name).toBe('low');
    expect(heldLevel('saver')).toBe(heldLevel('low'));
  });
  it('only SAVER caps the frame rate, and keeps 30 a second on a 60 Hz screen', () => {
    expect(frameCap('auto')).toBe(0);
    expect(frameCap('saver')).toBe(30);
    expect(skipFrame(0, 1)).toBe(false);
    // 60 Hz: every other frame is drawn
    let last = 0, drawn = 0;
    for (let n = 1; n <= 600; n++) {
      const now = n * (1000 / 60);
      if (skipFrame(30, now - last)) continue;
      last = now;
      drawn++;
    }
    expect(drawn).toBe(300);
    // 120 Hz: one in four
    last = 0; drawn = 0;
    for (let n = 1; n <= 1200; n++) {
      const now = n * (1000 / 120);
      if (skipFrame(30, now - last)) continue;
      last = now;
      drawn++;
    }
    expect(drawn).toBe(300);
  });
});
