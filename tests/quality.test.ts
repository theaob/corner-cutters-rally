import { describe, expect, it } from 'vitest';
import { QUALITY_LEVELS, QualityGovernor } from '../src/engine/render/quality';

/** Run the governor for `seconds`, each frame taking `ms(level)` milliseconds. */
function run(g: QualityGovernor, seconds: number, ms: (level: number) => number): void {
  for (let t = 0; t < seconds; ) {
    const dt = ms(g.level) / 1000;
    g.sample(dt);
    t += dt;
  }
}

describe('the quality governor', () => {
  it('keeps full quality on a phone that keeps up', () => {
    const g = new QualityGovernor();
    run(g, 20, () => 16.7);
    expect(g.level).toBe(0);
  });

  it('steps down on a phone that can\'t keep up, and stays down once that helps', () => {
    const g = new QualityGovernor();
    // too much at high; medium runs at 60
    run(g, 20, (level) => (level === 0 ? 33.3 : 16.7));
    expect(g.level).toBe(1);
    expect(g.locked).toBe(false);
  });

  it('steps down as far as it needs to', () => {
    const g = new QualityGovernor();
    run(g, 20, (level) => [40, 30, 16.7][level]);
    expect(g.level).toBe(QUALITY_LEVELS.length - 1);
  });

  it('goes back to full quality, and stops trying, when the browser holds the page to 30 fps whatever the picture', () => {
    const g = new QualityGovernor();
    run(g, 30, () => 33.3);
    expect(g.level).toBe(0);
    expect(g.locked).toBe(true);
  });

  it('goes back to the last step that helped when the next one doesn\'t', () => {
    const g = new QualityGovernor();
    // high 40 ms, 25 ms on both lower levels: medium helped, low didn't help more
    run(g, 30, (level) => (level === 0 ? 40 : 25));
    expect(g.level).toBe(1);
    expect(g.locked).toBe(true);
  });
});
