import { describe, expect, it } from 'vitest';
import { VIEWS, VIEW_ABOUT, isView, nextView } from '../src/f1/view';

describe('VIEW: the camera', () => {
  it('chase first; the camera button goes through every view and round again', () => {
    expect(VIEWS[0]).toBe('chase');
    const seen = new Set<string>();
    let v = VIEWS[0];
    for (let i = 0; i < VIEWS.length; i++) {
      seen.add(v);
      v = nextView(v);
    }
    expect(seen.size).toBe(VIEWS.length);
    expect(v).toBe('chase');
  });

  it('every view says what it is; only a known view is one (an address can ask for anything)', () => {
    for (const v of VIEWS) expect(VIEW_ABOUT[v].length).toBeGreaterThan(5);
    expect(isView('bonnet')).toBe(true);
    expect(isView('drone')).toBe(false);
    expect(isView(null)).toBe(false);
  });
});
