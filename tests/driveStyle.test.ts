import { describe, expect, it } from 'vitest';
import { TOUCH_ABOUT, TOUCH_SCHEMES, autoThrottle, howOn, pointsOn, touchDrifts } from '../src/f1/driveStyle';
import { prompt } from '../src/f1/onboarding';
import { readGamepad } from '../src/engine/controls';
import { STICK_WHEEL, TAP_RAMP, autoWheel, steerToward, stickWheel, tapWheel, wheelInput } from '../src/f1/racing';
import { SLIDER_DEAD, sliderTurn } from '../src/engine/deck';
import { TILT, tiltTurn } from '../src/engine/tilt';
import { newLaunch, stepLaunch } from '../src/f1/launch';
import { newCar, carClass } from '../src/engine/driving';

describe('how you drive, in the settings', () => {
  it('TOUCH picks the touch deck; DRIVING picks STEER or POINT for the keys and a gamepad', () => {
    for (const t of TOUCH_SCHEMES) expect(howOn('touch', 'steer', t)).toBe(t);
    expect(howOn('keys', 'point', 'tap')).toBe('point');
    expect(howOn('pad', 'steer', 'point')).toBe('steer');
    expect(pointsOn('touch', 'steer', 'point')).toBe(true);
    expect(pointsOn('touch', 'point', 'pedals')).toBe(false);
    expect(pointsOn('keys', 'point', 'pedals')).toBe(true);
  });

  it('every touch scheme says what it is; the gas is always on in ARCADE, TAP and TILT; only TAP has no drift', () => {
    for (const t of TOUCH_SCHEMES) expect(TOUCH_ABOUT[t].length).toBeGreaterThan(10);
    expect(TOUCH_SCHEMES.filter(autoThrottle)).toEqual(['arcade', 'tap', 'tilt']);
    expect(TOUCH_SCHEMES.filter((t) => !touchDrifts(t))).toEqual(['tap']);
  });
});

describe('STICK: the touch stick as a wheel', () => {
  it('across steers, up is the gas, down the brake', () => {
    expect(stickWheel({ x: 0, y: -1 }, false)).toEqual({ turn: 0, gas: 1, brake: 0, drift: false });
    const down = stickWheel({ x: 0, y: 0.8 }, false);
    expect(down.gas).toBe(0);
    expect(down.brake).toBeCloseTo((0.8 - STICK_WHEEL.pedalDead) / (1 - STICK_WHEEL.pedalDead));
    expect(stickWheel({ x: 0.5, y: 0 }, true).drift).toBe(true);
  });

  it('out to the rim on a diagonal is full lock and full gas together (the well read as a square)', () => {
    const w = stickWheel({ x: Math.SQRT1_2, y: -Math.SQRT1_2 }, false);
    expect(w.turn).toBeCloseTo(1);
    expect(w.gas).toBeCloseTo(1);
  });

  it('a small push across steers a little; the same push up or down leaves the pedals alone', () => {
    expect(stickWheel({ x: 0.12, y: 0 }, false).turn).toBeGreaterThan(0);
    expect(stickWheel({ x: 0.05, y: 0 }, false).turn).toBe(0);
    const w = stickWheel({ x: 0.9, y: -0.12 }, false);
    expect(w.gas).toBe(0);
    expect(w.brake).toBe(0);
  });
});

describe('the gas always on: ARCADE, TAP and TILT', () => {
  it('full gas until the brake is on; then off the gas, and once stopped it backs up', () => {
    expect(autoWheel(0.3, 0, false)).toEqual({ turn: 0.3, gas: 1, brake: 0, drift: false });
    expect(autoWheel(0, 1, true)).toEqual({ turn: 0, gas: 0, brake: 1, drift: true });
    const car = newCar(carClass('f1'), 0, 0);
    expect(wheelInput(autoWheel(0, 1, false), car).wheel?.reverse).toBe(true);
  });

  it('on from before GO, it is an ordinary start: never a jump start, never a launch', () => {
    const l = newLaunch();
    for (let t = -1; t < 0; t += 0.1) expect(stepLaunch(l, true, undefined, 1)).toBeUndefined();
    expect(stepLaunch(l, false, 0, 1)).toBe('slow');
  });

  it('TAP: a side steers that way, harder the longer it is held; both brake', () => {
    expect(tapWheel(false, false, 0)).toEqual({ turn: 0, gas: 1, brake: 0, drift: false });
    expect(tapWheel(true, false, 0).turn).toBeCloseTo(-TAP_RAMP.from);
    expect(tapWheel(false, true, TAP_RAMP.secs / 2).turn).toBeCloseTo((1 + TAP_RAMP.from) / 2);
    expect(tapWheel(false, true, 5).turn).toBe(1);
    expect(tapWheel(true, true, 1)).toEqual({ turn: 0, gas: 0, brake: 1, drift: false });
  });

  it('TILT: level is straight on, a little roll nothing, full lock at the full roll and no more', () => {
    expect(tiltTurn(undefined)).toBe(0);
    expect(tiltTurn(TILT.dead - 1)).toBe(0);
    expect(tiltTurn((TILT.dead + TILT.full) / 2)).toBeCloseTo(0.5);
    expect(tiltTurn(-TILT.full)).toBe(-1);
    expect(tiltTurn(80)).toBe(1);
  });
});

describe('POINT: aiming at a spot', () => {
  it('heads for the spot, the push the throttle; no push, no steer', () => {
    const car = { x: 100, y: 100 };
    const ahead = steerToward(car, { x: 100, y: 0 }, 0.5, false).steer!;
    expect(ahead.x).toBeCloseTo(0);
    expect(ahead.y).toBeCloseTo(-0.5);
    const right = steerToward(car, { x: 400, y: 100 }, 1, true);
    expect(right.steer!.x).toBeCloseTo(1);
    expect(right.handbrake).toBe(true);
    expect(steerToward(car, { x: 0, y: 0 }, 0, false).steer).toBeUndefined();
  });

  it("a gamepad's left stick as a direction to point (its dead zone round the centre)", () => {
    const pad = (axes: number[]) => ({ axes, buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) });
    expect(readGamepad(pad([0.05, 0.1])).drive.stick).toEqual({ x: 0, y: 0 });
    const up = readGamepad(pad([0, -1])).drive.stick!;
    expect(up.x).toBeCloseTo(0);
    expect(up.y).toBeCloseTo(-1);
  });
});

describe('the controls lap says how you drive', () => {
  it('each touch scheme its own way; the keys and a pad steering or pointing', () => {
    expect(prompt('go', 'touch')).toBe('GAS TO GO · SLIDE TO STEER');
    expect(prompt('go', 'touch', 'pedals')).toBe('GAS TO GO · SLIDE TO STEER');
    expect(prompt('go', 'touch', 'stick')).toContain('STICK UP');
    expect(prompt('go', 'touch', 'arcade')).toContain('THE GAS IS ON');
    expect(prompt('go', 'touch', 'tap')).toContain('HOLD LEFT OR RIGHT');
    expect(prompt('go', 'touch', 'tilt')).toContain('TILT');
    expect(prompt('go', 'touch', 'point')).toContain('THE WAY YOU WANT TO GO');
    expect(prompt('bend', 'touch', 'tap')).toContain('BOTH SIDES');
    expect(prompt('bend', 'touch', 'pedals')).toBe('BRAKE BEFORE A BEND');
    expect(prompt('drift', 'touch', 'pedals')).toContain('DRIFT');
    expect(prompt('go', 'keys')).toContain('UP TO GO');
    expect(prompt('go', 'keys', 'point')).toContain('POINT THE ARROWS');
    expect(prompt('bend', 'keys', 'point')).toContain('LET GO');
    expect(prompt('go', 'pad', 'point')).toContain('THE WAY YOU WANT TO GO');
    expect(prompt('go', 'pad')).toContain('TRIGGER');
  });

  it("the slider: turn as far as the thumb is from the middle, straight on near it, no further than the ends", () => {
    expect(sliderTurn(0, 50)).toBe(0);
    expect(sliderTurn(2, 50)).toBe(0);
    expect(sliderTurn(SLIDER_DEAD * 50 + 1, 50)).toBeGreaterThan(0);
    expect(sliderTurn(25, 50)).toBeCloseTo(0.5);
    expect(sliderTurn(-80, 50)).toBe(-1);
  });
});
