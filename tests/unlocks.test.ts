import { describe, expect, it } from 'vitest';
import { openCircuits } from '../src/f1/unlocks';

describe('circuit unlocks', () => {
  const circuits = ['crescent-park', 'silver-heath', 'harbour'];
  it('open the first circuit from the start, and no others', () => {
    expect([...openCircuits(circuits, [], [])]).toEqual(['crescent-park']);
  });
  it('open a free circuit from the start too', () => {
    expect(openCircuits([...circuits, 'glacier-pass'], [], [], ['glacier-pass'])).toEqual(new Set(['crescent-park', 'glacier-pass']));
  });
  it('open a circuit once a championship has reached it', () => {
    expect(openCircuits(circuits, ['silver-heath'], []).has('silver-heath')).toBe(true);
    expect(openCircuits(circuits, ['silver-heath'], []).has('harbour')).toBe(false);
  });
  it("keep a circuit open for anyone with a record there (from before unlocks), in any weather", () => {
    expect(openCircuits(circuits, [], ['silver-heath:wet']).has('silver-heath')).toBe(true);
    expect(openCircuits(circuits, [], ['harbour']).has('harbour')).toBe(true);
  });
  it("ignore circuits the game doesn't have", () => {
    expect(openCircuits(circuits, ['nowhere'], ['elsewhere:dry']).size).toBe(1);
  });
});
