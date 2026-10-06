import { describe, expect, it } from 'vitest';
import { pointsOn } from '../src/f1/driveStyle';
import { prompt } from '../src/f1/onboarding';
import { readGamepad } from '../src/engine/controls';
import { stickWheel } from '../src/f1/racing';
import { SLIDER_DEAD, sliderTurn } from '../src/engine/deck';

describe('DRIVING in the settings', () => {
  it('AUTO: the touch stick points the way, keys and a gamepad steer; POINT and STEER the same on every device', () => {
    expect(pointsOn('touch', 'auto')).toBe(true);
    expect(pointsOn('keys', 'auto')).toBe(false);
    expect(pointsOn('pad', 'auto')).toBe(false);
    for (const device of ['touch', 'keys', 'pad'] as const) {
      expect(pointsOn(device, 'point')).toBe(true);
      expect(pointsOn(device, 'steer')).toBe(false);
    }
  });

  it('steering on the touch stick: across turns the wheel, up is the gas, down the brake', () => {
    expect(stickWheel({ x: 0, y: -1 }, false)).toEqual({ turn: 0, gas: 1, brake: 0, drift: false });
    expect(stickWheel({ x: 0, y: 0.8 }, false)).toEqual({ turn: 0, gas: 0, brake: 0.8, drift: false });
    const w = stickWheel({ x: -0.6, y: -0.8 }, true);
    expect(w.turn).toBe(-0.6);
    expect(w.gas).toBeCloseTo(0.8);
    expect(w.drift).toBe(true);
  });

  it("a gamepad's left stick as a direction to point (its dead zone round the centre)", () => {
    const pad = (axes: number[]) => ({ axes, buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) });
    expect(readGamepad(pad([0.05, 0.1])).drive.stick).toEqual({ x: 0, y: 0 });
    const up = readGamepad(pad([0, -1])).drive.stick!;
    expect(up.x).toBeCloseTo(0);
    expect(up.y).toBeCloseTo(-1);
    const diag = readGamepad(pad([0.6, 0.6])).drive.stick!;
    expect(diag.x).toBeCloseTo(diag.y);
    expect(Math.hypot(diag.x, diag.y)).toBeLessThan(1);
  });

  it('the controls lap says how you drive: pointing or steering, on each device', () => {
    expect(prompt('go', 'touch')).toContain('THE WAY YOU WANT TO GO');
    // (STEER on a touch screen: the slider and the pedals)
    expect(prompt('go', 'touch', false)).toBe('GAS TO GO · SLIDE TO STEER');
    expect(prompt('bend', 'touch', false)).toBe('BRAKE BEFORE A BEND');
    expect(prompt('go', 'keys')).toContain('UP TO GO');
    expect(prompt('go', 'keys', true)).toContain('POINT THE ARROWS');
    expect(prompt('bend', 'keys', true)).toContain('LET GO');
    expect(prompt('go', 'pad', true)).toContain('THE WAY YOU WANT TO GO');
    expect(prompt('go', 'pad')).toContain('TRIGGER');
  });

  it("STEER's slider on a touch screen: turn as far as the thumb is from the middle, straight on near it, no further than the ends", () => {
    expect(sliderTurn(0, 50)).toBe(0);
    expect(sliderTurn(2, 50)).toBe(0);
    expect(sliderTurn(SLIDER_DEAD * 50 + 1, 50)).toBeGreaterThan(0);
    expect(sliderTurn(25, 50)).toBeCloseTo(0.5);
    expect(sliderTurn(-25, 50)).toBeCloseTo(-0.5);
    expect(sliderTurn(80, 50)).toBe(1);
    expect(sliderTurn(-80, 50)).toBe(-1);
  });
});
