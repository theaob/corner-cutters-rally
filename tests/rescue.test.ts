import { describe, expect, it } from 'vitest';
import { RESCUE, newRescue, stepRescue } from '../src/f1/rescue';
import { HALF_WIDTH } from '../src/f1/circuit';

const run = (out: number, speed: number, seconds: number) => {
  const r = newRescue();
  let back = false;
  for (let t = 0; t < seconds; t += 1 / 60) back ||= stepRescue(r, out, speed, 1 / 60);
  return back;
};

describe("TOP-DOWN's way back onto the road", () => {
  it(`puts a car back once it's been stopped off the road ${RESCUE.after} s`, () => {
    expect(run(HALF_WIDTH + 30, 0, RESCUE.after - 0.2)).toBe(false);
    expect(run(HALF_WIDTH + 30, 0, RESCUE.after + 0.1)).toBe(true);
  });

  it('leaves a car on the road, or one still moving off it, alone', () => {
    expect(run(HALF_WIDTH - 10, 0, 10)).toBe(false);
    expect(run(HALF_WIDTH + 30, RESCUE.stopped * 2, 10)).toBe(false);
    expect(RESCUE.off).toBeGreaterThan(HALF_WIDTH);
  });

  it('starts counting again once the car gets going', () => {
    const r = newRescue();
    for (let t = 0; t < RESCUE.after - 0.5; t += 1 / 60) stepRescue(r, -90, 0, 1 / 60);
    stepRescue(r, -90, 100, 1 / 60);
    expect(r.stuck).toBe(0);
  });
});
