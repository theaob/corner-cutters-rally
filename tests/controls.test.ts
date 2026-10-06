import { describe, expect, it, vi } from 'vitest';
import { Controls, THUMBSTICK, directionsFromOffset, guardInput, readGamepad, thumbstick } from '../src/engine/controls';

describe('directionsFromOffset', () => {
  it('ignores the dead zone', () => {
    expect(directionsFromOffset(3, -2, 10)).toEqual([]);
  });

  it('maps the four arms', () => {
    expect(directionsFromOffset(40, 0, 10)).toEqual(['right']);
    expect(directionsFromOffset(-40, 2, 10)).toEqual(['left']);
    expect(directionsFromOffset(0, -40, 10)).toEqual(['up']);
    expect(directionsFromOffset(1, 40, 10)).toEqual(['down']);
  });

  it('maps diagonals', () => {
    expect(directionsFromOffset(30, -30, 10)).toEqual(['up', 'right']);
    expect(directionsFromOffset(-30, 30, 10)).toEqual(['down', 'left']);
  });
});

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

describe('thumbstick', () => {
  const len = (v: { x: number; y: number }) => Math.hypot(v.x, v.y);

  it('keeps the exact angle and ramps the push from the dead zone to full, short of the rim', () => {
    const s = thumbstick(30, 40, 50).stick; // 50 px out: at the rim
    expect(s.x / s.y).toBeCloseTo(0.75);
    expect(len(s)).toBeCloseTo(1);
    expect(len(thumbstick(0, 50 * THUMBSTICK.deadZone * 0.9, 50).stick)).toBe(0);
    expect(len(thumbstick(0, 50 * THUMBSTICK.full, 50).stick)).toBeCloseTo(1);
    const mid = (THUMBSTICK.deadZone + THUMBSTICK.full) / 2;
    expect(len(thumbstick(50 * mid, 0, 50).stick)).toBeCloseTo(0.5);
  });

  it('moves the knob with the thumb, stopped at the rim', () => {
    expect(thumbstick(10, -20, 50).knob).toEqual({ x: 10, y: -20 });
    const far = thumbstick(300, 400, 50).knob;
    expect(len(far)).toBeCloseTo(50);
    expect(far.x / far.y).toBeCloseTo(0.75);
    expect(thumbstick(0, 0, 50)).toEqual({ stick: { x: 0, y: 0 }, knob: { x: 0, y: 0 }, dirs: [] });
  });

  it('holds direction buttons only when pushed well out, 8-way', () => {
    expect(thumbstick(0, -20, 50).dirs).toEqual([]);
    expect(thumbstick(0, -40, 50).dirs).toEqual(['up']);
    expect(thumbstick(30, 30, 50).dirs).toEqual(['down', 'right']);
  });
});

describe('Controls.direction', () => {
  it('uses the touch thumb position when there is one', () => {
    const c = new Controls();
    c.setStick('dpad', { x: 0.3, y: -0.4 });
    c.set('dpad', ['up']);
    expect(c.direction()).toEqual({ x: 0.3, y: -0.4 });
  });

  it('falls back to the held buttons, 8-way at full length', () => {
    const c = new Controls();
    c.press('keyboard', 'right', true);
    c.press('keyboard', 'down', true);
    const d = c.direction();
    expect(d.x).toBeCloseTo(Math.SQRT1_2);
    expect(d.y).toBeCloseTo(Math.SQRT1_2);
    c.clear('keyboard');
    expect(c.direction()).toEqual({ x: 0, y: 0 });
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
    c.set('dpad', ['up']);
    c.setStick('dpad', { x: 0, y: -1 });
    return c;
  };

  it('lets go of every source when the page is left', () => {
    const win = fakeWindow();
    const c = holding();
    const onRelease = vi.fn();
    guardInput(c, onRelease, win as unknown as Window);
    win.dispatchEvent(new Event('pagehide'));
    expect(c.isDown('select') || c.isDown('start') || c.isDown('up')).toBe(false);
    expect(c.stick()).toBeUndefined();
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
    const { rowGesture } = await import('../src/f1/circuitSelect');
    expect(rowGesture(-60, 0.5)).toBe(1);
    expect(rowGesture(45, 0.5)).toBe(-1);
    expect(rowGesture(3, 0.8)).toBe(1); // a tap on the right
    expect(rowGesture(-2, 0.1)).toBe(-1); // a tap on the ◀ side
    expect(rowGesture(18, 0.5)).toBe(0); // neither a tap nor a swipe
  });

  it('turns a gesture on the circuit card into a step through the circuits, or a race', async () => {
    const { cardGesture } = await import('../src/f1/circuitSelect');
    expect(cardGesture(-60, 0.5)).toBe(1); // a swipe left: the next circuit
    expect(cardGesture(45, 0.5)).toBe(-1);
    expect(cardGesture(2, 0.1)).toBe(-1); // a tap on its ◀
    expect(cardGesture(-3, 0.9)).toBe(1); // a tap on its ▶
    expect(cardGesture(4, 0.5)).toBe('race'); // a tap in the middle races it
    expect(cardGesture(18, 0.5)).toBe(0); // neither a tap nor a swipe
  });
});

describe('the last source used, and gamepads', () => {
  it('remembers which source the player last used', () => {
    const c = new Controls();
    expect(c.lastSource()).toBe('');
    c.press('keyboard', 'up', true);
    expect(c.lastSource()).toBe('keyboard');
    c.setStick('touch-stick', { x: 0.5, y: 0 });
    expect(c.lastSource()).toBe('touch-stick');
    // a gamepad lying idle doesn't take over
    c.setDrive('gamepad', { turn: 0, gas: 0, brake: 0 });
    c.set('gamepad', []);
    expect(c.lastSource()).toBe('touch-stick');
    c.setDrive('gamepad', { turn: 0, gas: 0.6, brake: 0 });
    expect(c.lastSource()).toBe('gamepad');
    expect(c.drive('gamepad')?.gas).toBe(0.6);
  });

  it('reads a gamepad: the left stick steers (with a dead zone), the triggers are gas and brake, A drifts, Start pauses', () => {
    const pad = (axes: number[], pressed: Record<number, number> = {}) => ({
      axes, buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: (pressed[i] ?? 0) > 0.5, value: pressed[i] ?? 0 })),
    });
    expect(readGamepad(pad([0.1, 0])).drive.turn).toBe(0);
    expect(readGamepad(pad([1, 0])).drive.turn).toBeCloseTo(1);
    expect(readGamepad(pad([-0.575, 0])).drive.turn).toBeCloseTo(-0.5);
    const r = readGamepad(pad([0, 0], { 7: 0.8, 6: 0.3, 0: 1, 9: 1 }));
    expect(r.drive.gas).toBe(0.8);
    expect(r.drive.brake).toBe(0.3);
    expect(r.buttons).toEqual(expect.arrayContaining(['b', 'a']));
  });
});
