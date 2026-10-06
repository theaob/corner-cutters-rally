import { beforeEach, describe, expect, it } from 'vitest';
import { useSave, type SaveStore } from '../src/engine/save';
import { CC_SAVE } from '../src/f1/save';
import { MEDAL_PACE, attackMedal, attackReach, attackTargets, awardMedal, awardTitle, better, lapMedal, lapTargets, loadTrophies, parseTrophies } from '../src/f1/medals';

describe('the medals', () => {
  it('asks for a lap as quick as the quickest AI on EASY for bronze, NORMAL for silver, HARD for gold', () => {
    const t = lapTargets(60);
    expect(t.gold).toBeLessThan(t.silver);
    expect(t.silver).toBeLessThan(t.bronze);
    expect(t.gold).toBeCloseTo(60 / MEDAL_PACE.gold);
    expect(lapMedal(t.gold, 60)).toBe('gold');
    expect(lapMedal(t.gold + 0.01, 60)).toBe('silver');
    expect(lapMedal(t.bronze - 0.01, 60)).toBe('bronze');
    expect(lapMedal(t.bronze + 0.01, 60)).toBeUndefined();
  });

  it('in a Time Attack asks for a lap for bronze, then as far as a driver at NORMAL or HARD pace gets', () => {
    expect(attackReach(1)).toBeGreaterThan(attackReach(0.95));
    for (const g of [0.95, 1, 1.08]) {
      const t = attackTargets(g);
      expect(t.bronze).toBe(3);
      expect(t.silver).toBeGreaterThan(t.bronze);
      expect(t.gold).toBeGreaterThan(t.silver);
      expect(attackMedal(t.gold, g)).toBe('gold');
      expect(attackMedal(t.gold - 1, g)).toBe('silver');
      expect(attackMedal(2, g)).toBeUndefined();
    }
    // (a more generous clock asks you to go further)
    expect(attackTargets(1.08).gold).toBeGreaterThan(attackTargets(1).gold);
  });

  it('keeps the better of two', () => {
    expect(better('silver', 'gold')).toBe('gold');
    expect(better('gold', 'bronze')).toBe('gold');
    expect(better(undefined, 'bronze')).toBe('bronze');
  });
});

describe('the trophy cabinet', () => {
  beforeEach(() => {
    const items = new Map<string, string>();
    const store: SaveStore = { getItem: (k) => items.get(k) ?? null, setItem: (k, v) => void items.set(k, v), removeItem: (k) => void items.delete(k) };
    useSave(CC_SAVE, store);
  });

  it('keeps the best medal on each circuit, and the titles won', () => {
    expect(awardMedal('harbour', 'trial', 'silver')).toBe(true);
    expect(awardMedal('harbour', 'trial', 'bronze')).toBe(false);
    expect(awardMedal('harbour', 'trial', 'gold')).toBe(true);
    expect(awardMedal('harbour', 'attack', 'bronze')).toBe(true);
    expect(awardMedal('harbour', 'attack', undefined)).toBe(false);
    awardTitle();
    awardTitle();
    expect(loadTrophies()).toEqual({ medals: { harbour: { trial: 'gold', attack: 'bronze' } }, titles: 2 });
  });

  it('reads an odd save as nothing', () => {
    expect(parseTrophies({ medals: { a: { trial: 'platinum', attack: 'gold' }, b: 3 }, titles: -1 })).toEqual({ medals: { a: { attack: 'gold' } }, titles: 0 });
    expect(parseTrophies(undefined)).toEqual({ medals: {}, titles: 0 });
  });
});
