import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSave, type SaveStore } from '../src/engine/save';
import { CC_SAVE } from '../src/f1/save';
import { LARGE_TEXT, applyText, colourSafe, largeText, motionReduced, setColourSafe, setLargeText, splitColor, splitWord } from '../src/f1/access';

/** a device asking for less motion, or not */
const reducedMotion = (on: boolean) => vi.stubGlobal('matchMedia', (q: string) => ({ matches: on && q.includes('prefers-reduced-motion: reduce') }));

/** a page root, as applyText sees it */
function root() {
  const classes = new Set<string>();
  const props = new Map<string, string>();
  return {
    el: { classList: { toggle: (c: string, on: boolean) => void (on ? classes.add(c) : classes.delete(c)) }, style: { setProperty: (k: string, v: string) => void props.set(k, v) } } as unknown as HTMLElement,
    classes,
    props,
  };
}

describe('accessibility', () => {
  beforeEach(() => {
    const items = new Map<string, string>();
    const store: SaveStore = { getItem: (k) => items.get(k) ?? null, setItem: (k, v) => void items.set(k, v), removeItem: (k) => void items.delete(k) };
    useSave(CC_SAVE, store);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("TEXT: normal to start with; LARGE a fifth bigger, on the page's root", () => {
    expect(largeText()).toBe(false);
    const r = root();
    applyText(r.el);
    expect(r.props.get('--ts')).toBe('1');
    setLargeText(true);
    expect(largeText()).toBe(true);
    applyText(r.el);
    expect(LARGE_TEXT).toBe(1.2);
    expect(r.props.get('--ts')).toBe('1.2');
    expect(r.classes.has('large-text')).toBe(true);
  });

  it('COLOURS: standard to start with; colour-safe splits are blue, white and orange, and say which in words', () => {
    expect(colourSafe()).toBe(false);
    expect([splitColor('record'), splitColor('better'), splitColor('worse')]).toEqual(['#b36bff', '#5fe0d0', '#f2c14e']);
    expect(splitWord('record')).toBe('');
    setColourSafe(true);
    expect(colourSafe()).toBe(true);
    expect([splitColor('record'), splitColor('better'), splitColor('worse')]).toEqual(['#56b4e9', '#f4f2fa', '#e69f00']);
    expect([splitWord('record'), splitWord('better'), splitWord('worse')]).toEqual([' · RECORD', ' · BEST', '']);
  });

  it('less motion asked for: SCREEN SHAKE starts off (and on as before otherwise); a choice made stays', async () => {
    reducedMotion(true);
    expect(motionReduced()).toBe(true);
    vi.resetModules();
    const calm = await import('../src/f1/shake');
    // (a fresh save for the fresh module)
    const { useSave: use } = await import('../src/engine/save');
    const { CC_SAVE: cc } = await import('../src/f1/save');
    const items = new Map<string, string>();
    use(cc, { getItem: (k) => items.get(k) ?? null, setItem: (k, v) => void items.set(k, v), removeItem: (k) => void items.delete(k) });
    expect(calm.shakeOn()).toBe(false);
    calm.setShake(true);
    expect(calm.shakeOn()).toBe(true);

    reducedMotion(false);
    vi.resetModules();
    const full = await import('../src/f1/shake');
    const { useSave: use2 } = await import('../src/engine/save');
    const { CC_SAVE: cc2 } = await import('../src/f1/save');
    const fresh = new Map<string, string>();
    use2(cc2, { getItem: (k) => fresh.get(k) ?? null, setItem: (k, v) => void fresh.set(k, v), removeItem: (k) => void fresh.delete(k) });
    expect(full.shakeOn()).toBe(true);
  });
});
