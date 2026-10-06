import { beforeEach, describe, expect, it, vi } from 'vitest';

const sent: { kind: string; about: Record<string, unknown> }[] = [];
vi.mock('../src/f1/metrics', () => ({ track: (kind: string, about: Record<string, unknown>) => sent.push({ kind, about }) }));

const { CRASHES_MAX, crashOf, shortPath, watchCrashes } = await import('../src/f1/crashes');
const { batchesOf } = await vi.importActual<typeof import('../src/f1/metrics')>('../src/f1/metrics');

/** a page to throw in: its listeners, and a way to fire them */
function page() {
  const on = new Map<string, (e: unknown) => void>();
  return {
    target: { addEventListener: (type: string, fn: (e: unknown) => void) => on.set(type, fn) } as unknown as Window,
    throwError: (error: unknown, filename = '', lineno = 0, colno = 0) => on.get('error')!({ error, message: String(error), filename, lineno, colno }),
    refuse: (reason: unknown) => on.get('unhandledrejection')!({ reason }),
  };
}

describe('crash reporting', () => {
  beforeEach(() => (sent.length = 0));

  it("an error: its name and message, where it was thrown (the page's address left out), and its stack", () => {
    const err = new TypeError("Cannot read properties of undefined (reading 'progress')");
    err.stack = "TypeError: Cannot read properties of undefined (reading 'progress')\n    at stepRace (https://game.example/assets/race-1.js?v=2:1:48211)\n    at frame (https://game.example/assets/race-1.js:1:90)";
    const c = crashOf('error', err, '', 0, 0)!;
    expect(c.message).toBe("TypeError: Cannot read properties of undefined (reading 'progress')");
    expect(shortPath('https://game.example/assets/race-1.js?v=2:1:48211', 'https://game.example')).toBe('/assets/race-1.js:1:48211');
    expect(c.stack.split('\n')).toHaveLength(3);
    // (a refusal's reason that's no Error: as words)
    expect(crashOf('rejection', { code: 7 })!.message).toBe('{"code":7}');
    expect(crashOf('rejection', 'offline')!.message).toBe('offline');
  });

  it("noise that isn't ours: a cross-origin script's, an extension's, the browser's resize warning", () => {
    expect(crashOf('error', 'Script error.')).toBeUndefined();
    expect(crashOf('error', 'ResizeObserver loop completed with undelivered notifications.')).toBeUndefined();
    expect(crashOf('error', new Error('x'), 'chrome-extension://abc/content.js', 1, 1)).toBeUndefined();
  });

  it('each once a launch, at most a few, with the screen it happened on', () => {
    const p = page();
    let at: { name: string; circuit?: string; mode?: string } = { name: 'menu' };
    watchCrashes(() => at, p.target);
    p.throwError(new Error('boom'), 'https://x/a.js', 3, 4);
    p.throwError(new Error('boom'), 'https://x/a.js', 3, 4);
    at = { name: 'race', circuit: 'baku', mode: 'race' };
    p.refuse(new Error('refused'));
    expect(sent).toHaveLength(2);
    expect(sent[0]).toMatchObject({ kind: 'error', about: { data: { kind: 'error', message: 'Error: boom', screen: 'menu' } } });
    expect(sent[1]).toMatchObject({ kind: 'error', about: { circuit: 'baku', mode: 'race', data: { kind: 'rejection', screen: 'race' } } });
    for (let k = 0; k < CRASHES_MAX + 5; k++) p.throwError(new Error(`e${k}`));
    expect(sent).toHaveLength(CRASHES_MAX);
  });

  it('errors go to the backend in a batch of their own (a database not yet told of them refuses only them)', () => {
    const base = { player: 'p', platform: 'web' as const, version: '1' };
    const batches = batchesOf([
      { ...base, kind: 'launch' },
      { ...base, kind: 'error', data: { message: 'x' } },
      { ...base, kind: 'session', seconds: 5 },
      { ...base, kind: 'race_start', circuit: 'baku' },
    ]);
    expect(batches.map((b) => b.map((r) => r.kind))).toEqual([['launch', 'race_start'], ['session'], ['error']]);
  });
});
