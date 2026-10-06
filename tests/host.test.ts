import { afterEach, describe, expect, it, vi } from 'vitest';
import { CLOUD_SAVE_MS, CloudStore, YOUTUBE, hostStore } from '../src/engine/host';

describe('the host', () => {
  afterEach(() => vi.useRealTimers());

  it("is the web's (or the app's) in an ordinary build: the browser's storage", () => {
    expect(YOUTUBE).toBe(false);
    const items = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => items.get(k) ?? null, setItem: (k: string, v: string) => void items.set(k, v), removeItem: (k: string) => void items.delete(k) });
    hostStore()?.setItem('cc:x', '1');
    expect(items.get('cc:x')).toBe('1');
    vi.unstubAllGlobals();
  });

  it("the YouTube build's save: loaded from YouTube's, sent back a moment after the changes, all together", () => {
    vi.useFakeTimers();
    const sent: string[] = [];
    const store = new CloudStore((d) => sent.push(d));
    store.load(JSON.stringify({ 'cc:save': '{"version":2}', 'cc:other': 'x', bad: 3 }));
    expect(store.getItem('cc:save')).toBe('{"version":2}');
    expect(store.getItem('bad')).toBeNull();
    store.setItem('cc:save', '{"version":2,"data":{}}');
    store.removeItem('cc:other');
    // (the same value again: nothing to send)
    store.setItem('cc:save', '{"version":2,"data":{}}');
    expect(sent).toEqual([]);
    vi.advanceTimersByTime(CLOUD_SAVE_MS);
    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0])).toEqual({ 'cc:save': '{"version":2,"data":{}}' });
  });

  it('sent at once when YouTube pauses the game; nothing waiting, nothing sent', () => {
    vi.useFakeTimers();
    const sent: string[] = [];
    const store = new CloudStore((d) => sent.push(d));
    store.flush();
    expect(sent).toEqual([]);
    store.setItem('a', '1');
    store.flush();
    expect(sent).toEqual(['{"a":"1"}']);
    vi.advanceTimersByTime(CLOUD_SAVE_MS * 2);
    expect(sent).toHaveLength(1);
  });

  it("a YouTube save that isn't one of ours: started afresh", () => {
    const store = new CloudStore(() => {});
    store.load('not json');
    store.load('');
    store.load('[1,2]');
    expect(store.serialise()).toBe('{}');
  });
});
