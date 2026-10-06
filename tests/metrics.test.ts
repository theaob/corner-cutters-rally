import { describe, expect, it } from 'vitest';
import { online } from '../src/engine/backend';
import { METRES_PER_PX, batchesOf, flush, kmOf, track } from '../src/f1/metrics';
import { INITIALS } from '../src/f1/profile';

describe('the play stats', () => {
  it('a lap of Silver Heath (8,800 px) is about the 5.9 km of the circuit it is traced from', () => {
    expect(kmOf(8800)).toBeCloseTo(5.9, 1);
    expect(METRES_PER_PX).toBeGreaterThan(0);
  });

  it('without a backend in the build, nothing is queued or sent (the game plays offline)', () => {
    expect(online()).toBe(false);
    let fetched = 0;
    const was = globalThis.fetch;
    globalThis.fetch = (async () => {
      fetched++;
      return new Response('');
    }) as typeof fetch;
    try {
      track('launch');
      track('drive', { km: 1.2 });
      flush(true);
    } finally {
      globalThis.fetch = was;
    }
    expect(fetched).toBe(0);
  });

  it("the board's initials: three letters or digits", () => {
    expect(INITIALS.test('ABC')).toBe(true);
    expect(INITIALS.test('A1Z')).toBe(true);
    expect(INITIALS.test('ab')).toBe(false);
    expect(INITIALS.test('ABCD')).toBe(false);
  });
});

describe('the play stats batches', () => {
  it('every row of a batch has the same keys (the database takes a batch only so), the time in the game apart, no time on them', () => {
    const base = { player: 'p', platform: 'web' as const, version: '1' };
    const batches = batchesOf([
      { ...base, kind: 'race_finish', circuit: 'baku', mode: 'race', data: { place: 1 } },
      { ...base, kind: 'drive', circuit: 'baku', mode: 'race', km: 12.5 },
      { ...base, kind: 'launch' },
      { ...base, kind: 'session', seconds: 60, data: { launch: 'x' } },
    ]);
    expect(batches).toHaveLength(2);
    for (const batch of batches) {
      const keys = Object.keys(batch[0]).sort().join();
      for (const row of batch) expect(Object.keys(row).sort().join()).toBe(keys);
      for (const row of batch) expect(row).not.toHaveProperty('at');
    }
    const [events, sessions] = batches;
    expect(events.map((r) => r.kind)).toEqual(['race_finish', 'drive', 'launch']);
    expect(events[1]).toMatchObject({ km: 12.5, data: null });
    expect(events[0]).not.toHaveProperty('seconds');
    expect(sessions[0]).toMatchObject({ kind: 'session', seconds: 60 });
    expect(sessions[0]).not.toHaveProperty('km');
  });
});
