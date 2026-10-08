import { describe, expect, it } from 'vitest';
import { carClass, newCar } from '../src/engine/driving';
import { lineCornerSpeed } from '../src/f1/racing';
import { STEERING, lockAt, turnWheel, tyreTurn } from '../src/engine/drive/steering';
import { ASSIST_SHARE, assisted, roadSteer } from '../src/engine/drive/assist';
import { keysIntent } from '../src/engine/drive/keys';
import { PAD, padIntent } from '../src/engine/drive/pad';
import { DRAG, dragSteer, followAnchor } from '../src/engine/drive/touch';
import { Driver, REVERSE_BELOW } from '../src/engine/drive/driver';
import { DRIVE_DEFAULTS, type DriveSettings } from '../src/engine/drive/settings';
import { IDLE, type Intent } from '../src/engine/drive/intent';

describe('the steering wheel', () => {
  it('turns toward where you ask at its rate, and comes back to the middle quicker', () => {
    expect(turnWheel(0, 1, 0.1)).toBeCloseTo(STEERING.rate * 0.1);
    expect(turnWheel(0, 1, 1)).toBe(1);
    expect(turnWheel(1, 0, 0.1)).toBeCloseTo(1 - STEERING.centre * 0.1);
    // (never past where you ask)
    expect(turnWheel(0.95, 1, 0.1)).toBe(1);
    // (GENTLE is slower, QUICK quicker)
    expect(turnWheel(0, 1, 0.1, 'gentle')).toBeLessThan(turnWheel(0, 1, 0.1));
    expect(turnWheel(0, 1, 0.1, 'quick')).toBeGreaterThan(turnWheel(0, 1, 0.1));
  });

  it('turns the tyres softly round the middle and fully at the ends', () => {
    expect(tyreTurn(0.3, 0)).toBeLessThan(0.3);
    expect(tyreTurn(-1, 0)).toBe(-1);
    expect(tyreTurn(0, 0.5)).toBe(0);
  });

  it('keeps flat out at least the lock the racing line uses (the rivals drive that line)', () => {
    expect(lockAt(0)).toBe(1);
    expect(lockAt(1)).toBeLessThan(1);
    const f1 = carClass('f1');
    const corner = lineCornerSpeed(f1);
    // the fastest bend the line takes flat out needs this share of full lock there
    const k = (0.9 * f1.turnRate) / f1.topSpeed;
    expect((corner(k) * k) / f1.turnRate).toBeLessThanOrEqual(lockAt(1) + 1e-9);
    // (the handbrake gives more, never past full)
    expect(lockAt(1, true)).toBeGreaterThan(lockAt(1));
    expect(lockAt(0, true)).toBe(1);
  });
});

describe('the assist', () => {
  const road = (dir: number, lateral = 0) => ({ dir, lateral });
  it('steers toward where the road goes and back toward its middle', () => {
    expect(roadSteer(0, road(0.3))).toBeGreaterThan(0);
    expect(roadSteer(0, road(-0.3))).toBeLessThan(0);
    expect(roadSteer(0, road(0, 30))).toBeLessThan(0);
    expect(roadSteer(0, road(0, -30))).toBeGreaterThan(0);
  });

  it('adds as much as its level gives, and gives way to you: nothing at all at full lock', () => {
    expect(assisted(0, 0, road(0.3), 'off')).toBe(0);
    expect(assisted(0, 0, road(0.3), 'light')).toBeCloseTo(ASSIST_SHARE.light * roadSteer(0, road(0.3)));
    expect(assisted(0, 0, road(0.3), 'strong')).toBeGreaterThan(assisted(0, 0, road(0.3), 'light'));
    expect(assisted(-1, 0, road(0.3), 'strong')).toBe(-1);
    expect(assisted(0.4, 0, undefined, 'strong')).toBe(0.4);
  });
});

describe('the keys and a gamepad', () => {
  it('keys: ← → steer, ↑ gas, ↓ brake, Shift or X the handbrake', () => {
    expect(keysIntent(new Set())).toEqual(IDLE);
    expect(keysIntent(new Set(['ArrowUp', 'KeyD']))).toEqual({ steer: 1, throttle: 1, brake: 0, handbrake: false });
    expect(keysIntent(new Set(['KeyA', 'ArrowDown', 'ShiftLeft']))).toEqual({ steer: -1, throttle: 0, brake: 1, handbrake: true });
    expect(keysIntent(new Set(['ArrowLeft', 'ArrowRight'])).steer).toBe(0);
  });

  it('a gamepad: the stick steers past its dead zone on a curve, the triggers are gas and brake, A or RB the handbrake', () => {
    const pad = (x: number, b: Record<number, number> = {}) => ({ axes: [x, 0], buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: (b[i] ?? 0) > 0.5, value: b[i] ?? 0 })) });
    expect(padIntent(pad(PAD.dead * 0.9)).steer).toBe(0);
    expect(padIntent(pad(-1)).steer).toBe(-1);
    const half = padIntent(pad(PAD.dead + (1 - PAD.dead) / 2)).steer;
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(0.5);
    expect(padIntent(pad(0, { 7: 0.7, 6: 0.02 }))).toMatchObject({ throttle: 0.7, brake: 0 });
    expect(padIntent(pad(0, { 0: 1 })).handbrake).toBe(true);
    expect(padIntent(pad(0, { 5: 1 })).handbrake).toBe(true);
  });
});

describe('the touch steering drag', () => {
  it('steers as far across as the thumb goes from where it landed, full lock a thumb-width away', () => {
    expect(dragSteer(DRAG.dead)).toBe(0);
    expect(dragSteer(DRAG.full)).toBe(1);
    expect(dragSteer(-DRAG.full * 3)).toBe(-1);
    expect(dragSteer((DRAG.full + DRAG.dead) / 2)).toBeCloseTo(0.5);
  });

  it('moves the middle along past full lock, so steering back answers at once', () => {
    expect(followAnchor(100, 120)).toBe(100);
    expect(followAnchor(100, 100 + DRAG.full + 30)).toBe(130);
    expect(followAnchor(100, 100 - DRAG.full - 10)).toBe(90);
  });
});

describe('the driver', () => {
  const f1 = carClass('f1');
  const make = (settings: Partial<DriveSettings> = {}) => {
    const src: { touch: Intent; keys: Intent; pad: Intent | undefined } = { touch: IDLE, keys: IDLE, pad: undefined };
    const d = new Driver({ touch: () => src.touch, keys: () => src.keys, pad: () => src.pad }, () => ({ ...DRIVE_DEFAULTS, assist: 'off', ...settings }));
    return { d, src };
  };
  const moving = (speed: number) => {
    const car = newCar(f1, 0, 0);
    car.vy = -speed;
    return car;
  };

  it('drives with whatever was used last, and keeps it while it is held', () => {
    const { d, src } = make();
    d.sample();
    expect(d.source()).toBeUndefined();
    src.keys = { ...IDLE, throttle: 1 };
    d.sample();
    expect(d.source()).toBe('keys');
    src.touch = { ...IDLE, steer: 1 };
    d.sample();
    expect(d.source()).toBe('keys');
    src.keys = IDLE;
    d.sample();
    expect(d.source()).toBe('touch');
    expect(d.intent().steer).toBe(1);
  });

  it('turns the wheel a step at a time toward where you steer', () => {
    const { d, src } = make();
    src.keys = { ...IDLE, steer: 1, throttle: 1 };
    d.sample();
    const first = d.step(moving(100), 1 / 60).wheel!.turn;
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(0.2);
    for (let k = 0; k < 30; k++) d.step(moving(100), 1 / 60);
    expect(d.wheelPos()).toBe(1);
    d.reset();
    expect(d.wheelPos()).toBe(0);
  });

  it('brakes rolling forwards; held once stopped, backs up', () => {
    const { d, src } = make();
    src.keys = { ...IDLE, brake: 1 };
    d.sample();
    const rolling = d.step(moving(150), 1 / 60);
    expect(rolling.brake).toBe(true);
    expect(rolling.wheel!.reverse).toBe(false);
    expect(d.step(moving(REVERSE_BELOW / 2), 1 / 60).wheel!.reverse).toBe(true);
  });

  it('GAS on AUTO: the gas on unless you brake', () => {
    const { d, src } = make({ gas: 'auto' });
    d.sample();
    expect(d.intent().throttle).toBe(1);
    src.touch = { ...IDLE, brake: 1 };
    d.sample();
    expect(d.intent().throttle).toBe(0);
    expect(d.step(moving(150), 1 / 60).brake).toBe(true);
  });

  it('with the assist, steers toward the road on its own; not reversing, nor with the road behind', () => {
    const { d } = make({ assist: 'strong' });
    d.sample();
    const road = { dir: 0.4, lateral: 0 };
    for (let k = 0; k < 20; k++) d.step(moving(150), 1 / 60, road);
    expect(d.wheelPos()).toBeGreaterThan(0.2);
    const { d: back } = make({ assist: 'strong' });
    back.sample();
    for (let k = 0; k < 20; k++) back.step(moving(150), 1 / 60, { dir: Math.PI, lateral: 0 });
    expect(back.wheelPos()).toBe(0);
  });
});
