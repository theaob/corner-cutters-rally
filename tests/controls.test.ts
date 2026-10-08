import { describe, expect, it, vi } from 'vitest';
import { Controls, guardInput, readGamepad } from '../src/engine/controls';

describe('Controls', () => {
  it('holds a button while any source holds it', () => {
    const c = new Controls();
    c.press('keyboard', 'b', true);
    c.press('touch-b', 'b', true);
    c.press('keyboard', 'b', false);
    expect(c.isDown('b')).toBe(true);
    c.clear('touch-b');
    expect(c.isDown('b')).toBe(false);
  });

  it('replaces a source’s buttons with set()', () => {
    const c = new Controls();
    c.set('dpad', ['up', 'right']);
    c.set('dpad', ['down']);
    expect(c.isDown('up')).toBe(false);
    expect(c.isDown('down')).toBe(true);
  });

  it('counts taps shorter than a frame', () => {
    const c = new Controls();
    c.press('keyboard', 'a', true);
    c.press('keyboard', 'a', false);
    expect(c.isDown('a')).toBe(false);
    expect(c.presses('a')).toBe(1);
  });

  it('does not double-count a button held by two sources', () => {
    const c = new Controls();
    c.press('keyboard', 'a', true);
    c.press('touch-a', 'a', true);
    expect(c.presses('a')).toBe(1);
    c.set('dpad', ['up']);
    c.set('dpad', ['up', 'right']);
    expect(c.presses('up')).toBe(1);
    expect(c.presses('right')).toBe(1);
  });
});

describe('guardInput', () => {
  const fakeWindow = () => {
    const win = Object.assign(new EventTarget(), {
      document: Object.assign(new EventTarget(), { visibilityState: 'visible' }),
      location: { reload: vi.fn() },
      focus: vi.fn(),
    });
    return win;
  };
  const holding = () => {
    const c = new Controls();
    c.press('touch-select', 'select', true);
    c.press('touch-start', 'start', true);
    c.set('keyboard', ['up']);
    return c;
  };

  it('lets go of every source when the page is left', () => {
    const win = fakeWindow();
    const c = holding();
    const onRelease = vi.fn();
    guardInput(c, onRelease, win as unknown as Window);
    win.dispatchEvent(new Event('pagehide'));
    expect(c.isDown('select') || c.isDown('start') || c.isDown('up')).toBe(false);
    expect(onRelease).toHaveBeenCalled();
  });

  it('lets go when the page is hidden or loses focus', () => {
    const win = fakeWindow();
    const c = holding();
    // (the page's visibility comes through the host, engine/host.ts, which watches the document)
    vi.stubGlobal('document', win.document);
    guardInput(c, () => {}, win as unknown as Window);
    win.dispatchEvent(new Event('blur'));
    expect(c.isDown('start')).toBe(false);
    c.press('touch-a', 'a', true);
    win.document.visibilityState = 'hidden';
    win.document.dispatchEvent(new Event('visibilitychange'));
    expect(c.isDown('a')).toBe(false);
    vi.unstubAllGlobals();
  });

  it('reloads a page brought back from the back/forward cache, and takes focus', () => {
    const win = fakeWindow();
    guardInput(new Controls(), () => {}, win as unknown as Window);
    expect(win.focus).toHaveBeenCalledTimes(1);
    win.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: false }));
    expect(win.location.reload).not.toHaveBeenCalled();
    win.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
    expect(win.location.reload).toHaveBeenCalled();
    win.dispatchEvent(new Event('pointerdown'));
    expect(win.focus).toHaveBeenCalledTimes(2);
  });
});

describe('menu row gestures', () => {
  it('swipe left for the next value, right for the previous; tap the sides to step; ignore a wobble', async () => {
    const { rowGesture } = await import('../src/f1/menu');
    expect(rowGesture(-60, 0.5)).toBe(1);
    expect(rowGesture(45, 0.5)).toBe(-1);
    expect(rowGesture(3, 0.8)).toBe(1); // a tap on the right
    expect(rowGesture(-2, 0.1)).toBe(-1); // a tap on the ◀ side
    expect(rowGesture(18, 0.5)).toBe(0); // neither a tap nor a swipe
  });
});

describe('the last source used, and gamepads', () => {
  it('remembers which source the player last used (an idle one never takes over)', () => {
    const c = new Controls();
    expect(c.lastSource()).toBe('');
    c.press('keyboard', 'up', true);
    expect(c.lastSource()).toBe('keyboard');
    c.set('gamepad', []);
    expect(c.lastSource()).toBe('keyboard');
    c.set('gamepad', ['a']);
    expect(c.lastSource()).toBe('gamepad');
  });

  it("reads a gamepad's buttons for the menus: A is B, Start is A, Y is START, Back is SELECT, the d-pad moves", () => {
    const pad = (pressed: number[]) => ({ buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })) });
    expect(readGamepad(pad([0, 9])).buttons).toEqual(expect.arrayContaining(['b', 'a']));
    expect(readGamepad(pad([3, 8, 12])).buttons).toEqual(expect.arrayContaining(['start', 'select', 'up']));
    expect(readGamepad(pad([])).buttons).toEqual([]);
  });
});
