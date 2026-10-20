import { afterEach, describe, expect, it, vi } from 'vitest';
import { layoutById } from '../src/f1/layouts';
import type { CircuitLayout } from '../src/f1/layouts';
import { outline } from '../src/f1/screens/curtain';
import { SHAKEDOWN } from '../src/f1/stages';

/** The calls the loading card's outline makes on its canvas. */
function drawn(layout: CircuitLayout): string[] {
  const calls: string[] = [];
  const x = new Proxy({}, { get: (_, k) => () => void calls.push(String(k)), set: () => true });
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => x, style: {} }) });
  outline(layout, 72);
  return calls;
}

describe('the loading card', () => {
  afterEach(() => vi.unstubAllGlobals());

  it("draws a stage's road with its two ends apart, not joined up", () => {
    const calls = drawn(layoutById(SHAKEDOWN)!);
    expect(calls).toContain('stroke');
    expect(calls).not.toContain('closePath');
  });

  it('closes a loop', () => {
    const loop: CircuitLayout = { ...layoutById(SHAKEDOWN)!, stage: undefined };
    expect(drawn(loop)).toContain('closePath');
  });
});
