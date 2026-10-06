import { describe, expect, it } from 'vitest';
import { storeKey, useStore } from '../src/engine/storage';

describe('storage prefix', () => {
  it("defaults to this game's prefix", () => {
    expect(storeKey('layout')).toBe('cc:layout');
  });

  it('keeps each game to its own keys', () => {
    useStore('other:');
    expect(storeKey('vehicles')).toBe('other:vehicles');
    useStore('cc:');
    expect(storeKey('vehicles')).toBe('cc:vehicles');
  });
});
