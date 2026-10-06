import { beforeEach, describe, expect, it } from 'vitest';
import { useSave, type SaveStore } from '../src/engine/save';
import { CC_SAVE } from '../src/f1/save';
import { CHAMPIONSHIP_PRODUCT, PAYWALL, bought, championshipOpen, circuitsOpen, openShop, ownsChampionship, resetShop } from '../src/f1/purchase';

beforeEach(() => {
  const items = new Map<string, string>();
  const store: SaveStore = { getItem: (k) => items.get(k) ?? null, setItem: (k, v) => void items.set(k, v), removeItem: (k) => void items.delete(k) };
  useSave(CC_SAVE, store);
  resetShop();
  delete (globalThis as { CdvPurchase?: unknown }).CdvPurchase;
});

describe('the Championship as a purchase', () => {
  it('is open in a build without a store (the web game, the sideloaded app), and in the Google Play build once bought', () => {
    expect(championshipOpen(false, false)).toBe(true);
    expect(championshipOpen(true, false)).toBe(false);
    expect(championshipOpen(true, true)).toBe(true);
    // (these tests run as a build without a store)
    expect(PAYWALL).toBe(false);
    expect(ownsChampionship()).toBe(true);
  });

  it('without it, opens the first circuit only; with it, the circuits the Championship has reached', () => {
    const reached = new Set(['crescent-park', 'silver-heath', 'harbour']);
    expect([...circuitsOpen(false, 'crescent-park', reached)]).toEqual(['crescent-park']);
    expect(circuitsOpen(true, 'crescent-park', reached)).toEqual(reached);
  });

  it('opens the free circuits either way', () => {
    const reached = new Set(['crescent-park', 'silver-heath']);
    expect([...circuitsOpen(false, 'crescent-park', reached, ['glacier-pass'])]).toEqual(['crescent-park', 'glacier-pass']);
    expect(circuitsOpen(true, 'crescent-park', reached, ['glacier-pass'])).toEqual(new Set([...reached, 'glacier-pass']));
  });
});

/** A stand-in for Google Play's store (the plugin's CdvPurchase): one product, bought or not. */
function fakePlay(o: { owned?: boolean; price?: string } = {}) {
  let owned = !!o.owned;
  const on: Record<string, ((x: unknown) => void)[]> = { approved: [], finished: [], productUpdated: [] };
  const product = {
    id: CHAMPIONSHIP_PRODUCT,
    pricing: { price: o.price ?? '€2.99' },
    canPurchase: true,
    get owned() {
      return owned;
    },
    getOffer: () => ({
      order: async () => {
        const t = { products: [{ id: CHAMPIONSHIP_PRODUCT }], finish: () => ((owned = true), on.finished.forEach((f) => f(t))) };
        on.approved.forEach((f) => f(t));
        return undefined;
      },
    }),
  };
  const when = {
    approved: (f: (x: unknown) => void) => (on.approved.push(f), when),
    finished: (f: (x: unknown) => void) => (on.finished.push(f), when),
    productUpdated: (f: (x: unknown) => void) => (on.productUpdated.push(f), when),
  };
  const store = {
    register: () => {},
    when: () => when,
    error: () => {},
    initialize: async () => {
      on.productUpdated.forEach((f) => f(product));
      return [];
    },
    get: () => product,
    owned: () => owned,
    restorePurchases: async () => {},
  };
  (globalThis as { CdvPurchase?: unknown }).CdvPurchase = { store, ProductType: { NON_CONSUMABLE: 'non consumable' }, Platform: { GOOGLE_PLAY: 'android-playstore' }, ErrorCode: { PAYMENT_CANCELLED: 6777006 } };
}

describe('the shop (Google Play)', () => {
  it('shows the price from Google Play, and a purchase makes it yours, kept in the save', async () => {
    fakePlay({ price: '€2.99' });
    const shop = openShop();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(shop.state()).toMatchObject({ ready: true, price: '€2.99' });
    expect(bought()).toBe(false);
    expect(await shop.buy()).toBe(true);
    expect(bought()).toBe(true);
  });

  it('gives back a purchase made on another install', async () => {
    fakePlay({ owned: true });
    const shop = openShop();
    expect(await shop.restore()).toBe(true);
    expect(bought()).toBe(true);
  });

  it("finds nothing to restore when it wasn't bought", async () => {
    fakePlay();
    const shop = openShop();
    expect(await shop.restore()).toBe(false);
    expect(bought()).toBe(false);
  });
});
