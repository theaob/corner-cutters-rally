import { describe, expect, it } from 'vitest';
import { versionText } from '../src/f1/settingsRows';

describe('the version under the settings', () => {
  it('says the release and the build (the commit)', () => {
    expect(versionText('0.0.1+2790585')).toBe('VERSION 0.0.1 · BUILD 2790585');
    expect(versionText('1.2.0')).toBe('VERSION 1.2.0');
    expect(versionText('0.0.1+local')).toBe('VERSION 0.0.1 · BUILD LOCAL');
  });
});

describe("home's rallies in a grid, as Corner Cutters' menu", () => {
  it('left/right to a neighbour round the ends, up/down a row, and out of the grid off its top or bottom', async () => {
    const { gridStep } = await import('../src/f1/menuTiles');
    expect(gridStep(0, 1, 0, 4)).toBe(1);
    expect(gridStep(3, 1, 0, 4)).toBe(0);
    expect(gridStep(0, -1, 0, 4)).toBe(3);
    expect(gridStep(1, 0, 1, 4)).toBe(3);
    expect(gridStep(3, 0, -1, 4)).toBe(1);
    expect(gridStep(0, 0, -1, 4)).toBe(-1);
    expect(gridStep(2, 0, 1, 4)).toBe(-1);
    // (three tiles: down from over the short row's gap lands on its last tile)
    expect(gridStep(1, 0, 1, 3)).toBe(2);
  });
});
