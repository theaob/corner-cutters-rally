import { describe, expect, it } from 'vitest';
import { BLUE, blueFlags } from '../src/f1/blueFlags';
import type { RaceProgress } from '../src/f1/racing';

const n = 1000;
const spacing = 2;
const at = (lap: number, idx: number): RaceProgress => ({ lap, idx, sector: 0, lapStart: 0, lapTimes: [], wrongWay: 0, penalty: 0 } as RaceProgress);

describe('blue flags', () => {
  it('come out for a car with a car a lap ahead close behind it', () => {
    // car 1 is a lap ahead of car 0 and 40 samples (80 px) behind it on the track
    expect(blueFlags([at(2, 500), at(3, 460)], [true, true], [], n, spacing)).toEqual([1, undefined]);
  });

  it("don't for a car just behind on the same lap, or a lapping car still far back", () => {
    expect(blueFlags([at(2, 500), at(2, 460)], [true, true], [], n, spacing)).toEqual([undefined, undefined]);
    expect(blueFlags([at(2, 500), at(3, 300)], [true, true], [], n, spacing)).toEqual([undefined, undefined]);
  });

  it('see across the line: a leader on its next lap, just behind on the track', () => {
    // car 0 just past the line; the leader a lap ahead, just short of it
    expect(blueFlags([at(2, 10), at(2, 980)], [true, true], [], n, spacing)).toEqual([1, undefined]);
  });

  it('stay out a little further once out, and go once the car is past', () => {
    const d = (BLUE.range + BLUE.keep) / 2 / spacing;
    expect(blueFlags([at(2, 500), at(3, 500 - d)], [true, true], [], n, spacing)[0]).toBeUndefined();
    expect(blueFlags([at(2, 500), at(3, 500 - d)], [true, true], [1, undefined], n, spacing)[0]).toBe(1);
    // passed: now ahead on the track
    expect(blueFlags([at(2, 500), at(3, 520)], [true, true], [1, undefined], n, spacing)[0]).toBeUndefined();
  });

  it('not for a car in the pits (or out of the race), nor from one', () => {
    expect(blueFlags([at(2, 500), at(3, 460)], [false, true], [], n, spacing)).toEqual([undefined, undefined]);
    expect(blueFlags([at(2, 500), at(3, 460)], [true, false], [], n, spacing)).toEqual([undefined, undefined]);
  });

  it('name the nearest when two are lapping', () => {
    expect(blueFlags([at(2, 500), at(3, 450), at(3, 480)], [true, true, true], [], n, spacing)[0]).toBe(2);
  });
});
