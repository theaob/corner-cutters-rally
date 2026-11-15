import { beforeEach, describe, expect, it } from 'vitest';
import { LOGBOOK, SLOW, clearNotes, frameStats, fromUserAgent, isSlow, lines, note, recent, sightChanged, watchFrames, watchFreezes, withCrumbs } from '../src/engine/logbook';
import { CRASH_DATA_MAX, crashData } from '../src/f1/crashes';

describe('the logbook', () => {
  beforeEach(() => clearNotes());

  it('keeps the latest notes, each with the seconds since launch, short', () => {
    for (let k = 0; k < LOGBOOK.keep + 10; k++) note(`n${k}`);
    expect(recent()).toHaveLength(LOGBOOK.keep);
    expect(recent()[0].what).toBe('n10');
    expect(recent(2).map((n) => n.what)).toEqual([`n${LOGBOOK.keep + 8}`, `n${LOGBOOK.keep + 9}`]);
    note('x'.repeat(500));
    expect(recent(1)[0].what).toHaveLength(LOGBOOK.length);
    expect(lines(recent(1))[0]).toMatch(/^\d+\.\d x+$/);
  });

  it('fits as many of the latest notes as the room allows, the oldest let go first', () => {
    const crumbs = Array.from({ length: 40 }, (_, k) => `${k}.0 press a`);
    const out = withCrumbs({ message: 'boom' }, crumbs, 200);
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(200);
    expect(out.crumbs.at(-1)).toBe('39.0 press a');
    expect(out.crumbs.length).toBeGreaterThan(3);
  });
});

describe('the device, from its user agent', () => {
  it('reads an Android phone: its model, Android and Chrome versions', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 14; SM-S911B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.81 Mobile Safari/537.36';
    expect(fromUserAgent(ua)).toEqual({ model: 'SM-S911B', android: '14', webview: '129' });
  });

  it("leaves out a model the browser hides ('K'), and a desktop has none", () => {
    expect(fromUserAgent('Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36')).toEqual({ model: undefined, android: '10', webview: '130' });
    expect(fromUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36')).toEqual({ model: undefined, android: undefined, webview: '131' });
  });
});

describe("an error's details", () => {
  it('fit the database (the crash, the device, and the notes before it, as many as there is room for)', () => {
    const crash = { kind: 'error' as const, message: 'TypeError: '.padEnd(200, 'x'), where: '/assets/race.js:1:2'.padEnd(120, 'y'), stack: 'at f ('.padEnd(600, 'z') };
    const dev = { model: 'SM-S911B', android: '14', webview: '129', gpu: 'Adreno (TM) 740', mem: 8, cores: 8, screen: '390x844@3', quality: 'high', unknown: undefined };
    const crumbs = Array.from({ length: 60 }, (_, k) => `${k}.0 press a after something happened`);
    const data = crashData(crash, 'race', dev, crumbs);
    expect(JSON.stringify(data).length).toBeLessThanOrEqual(CRASH_DATA_MAX);
    expect(data.screen).toBe('race');
    expect(data.device).toEqual({ model: 'SM-S911B', android: '14', webview: '129', gpu: 'Adreno (TM) 740', mem: 8, cores: 8, screen: '390x844@3', quality: 'high' });
    const kept = data.crumbs as string[];
    expect(kept.length).toBeGreaterThan(5);
    expect(kept.at(-1)).toBe('59.0 press a after something happened');
  });
});

describe('watching for freezes', () => {
  // (frames by hand: a stand-in requestAnimationFrame that keeps the next frame to run when told)
  const frames = () => {
    let next: ((now: number) => void) | undefined;
    globalThis.requestAnimationFrame = ((cb: (now: number) => void) => ((next = cb), 0)) as typeof requestAnimationFrame;
    return (now: number) => next?.(now);
  };

  it('a long gap with the page in sight is a freeze', () => {
    const at = frames();
    const seen: number[] = [];
    watchFreezes((s) => seen.push(s), () => false);
    at(100_000);
    at(100_016);
    at(104_016);
    expect(seen).toEqual([4]);
  });

  it("the time the app was away isn't a freeze (no frames run while it's out of sight to see it go)", () => {
    const at = frames();
    const seen: number[] = [];
    watchFreezes((s) => seen.push(s), () => false);
    at(200_000);
    // (put away and back again between two frames: no frame saw it hidden)
    sightChanged();
    at(206_000);
    at(206_016);
    // (and the next long gap, in sight, counts again)
    at(210_016);
    expect(seen).toEqual([4]);
  });
});

describe('judging the frames', () => {
  const steady = (ms: number, n = 300) => Array.from({ length: n }, () => ms);

  it('needs enough frames to judge', () => {
    expect(frameStats(steady(16, 5))).toBeUndefined();
  });

  it('60 fps is fine; 25 fps and hitches are slow', () => {
    const ok = frameStats(steady(16.7))!;
    expect(ok.fps).toBeCloseTo(60, 0);
    expect(isSlow(ok)).toBe(false);
    const slow = frameStats(steady(40))!;
    expect(slow.fps).toBe(25);
    expect(slow.janks).toBe(0);
    expect(isSlow(slow)).toBe(true);
    const hitchy = frameStats([...steady(16.7), 150, 150, 150])!;
    expect(hitchy.hitches).toBe(3);
    expect(isSlow(hitchy)).toBe(true);
    expect(isSlow(frameStats([...steady(16.7), 150])!)).toBe(false);
    expect(isSlow(frameStats([...steady(16.7), SLOW.worstMs])!)).toBe(true);
  });
});

describe('watching the frames', () => {
  const frames = () => {
    let next: ((now: number) => void) | undefined;
    globalThis.requestAnimationFrame = ((cb: (now: number) => void) => ((next = cb), 0)) as typeof requestAnimationFrame;
    return (now: number) => next?.(now);
  };
  const run = (at: (n: number) => void, from: number, ms: number, seconds: number) => {
    let t = from;
    for (; t < from + seconds * 1000; t += ms) at(t);
    return t;
  };

  it('reports a slow stretch once its window is judged, not a steady one', () => {
    const at = frames();
    const seen: number[] = [];
    watchFrames((s) => seen.push(s.fps), () => false);
    const t = run(at, 400_000, 16.7, 12);
    expect(seen).toEqual([]);
    run(at, t, 50, 12);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[0]).toBeLessThan(40);
  });

  it("leaves out a stretch the app was away for", () => {
    const at = frames();
    const seen: number[] = [];
    watchFrames((s) => seen.push(s.fps), () => false);
    const t = run(at, 800_000, 50, 3);
    sightChanged();
    run(at, t, 50, 3);
    expect(seen).toEqual([]);
  });
});
