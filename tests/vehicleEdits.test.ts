import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_COLORS, parseVehicleEdits, statOverrides, vehicleColors } from '../src/engine/vehicleEdits';
import { CAR_CLASS_IDS, carClass, classStats, setStatOverrides } from '../src/engine/driving';

afterEach(() => setStatOverrides({}));

describe('vehicle edits', () => {
  it('keeps known classes, stats and #rrggbb colours, and drops junk', () => {
    const edits = parseVehicleEdits(
      JSON.stringify({
        f1: { topSpeed: 300, grip: 'fast', health: -5, nonsense: 1, colors: ['#FF0000', 'red', 42] },
        spaceship: { topSpeed: 999 },
      }),
    );
    expect(edits).toEqual({ f1: { topSpeed: 300, colors: ['#ff0000'] } });
    expect(parseVehicleEdits('not json')).toEqual({});
    expect(parseVehicleEdits(null)).toEqual({});
  });

  it('applies stat edits to the driving rules without touching colours', () => {
    const edits = parseVehicleEdits(JSON.stringify({ f1: { topSpeed: 300, colors: ['#ff0000'] } }));
    expect(statOverrides(edits)).toEqual({ f1: { topSpeed: 300 } });
    setStatOverrides(statOverrides(edits));
    expect(carClass('f1').topSpeed).toBe(300);
    expect(classStats('f1').health).toBe(60);
    setStatOverrides({});
    expect(carClass('f1').topSpeed).toBe(320);
  });

  it('gives every class a default palette, overridden by edits', () => {
    for (const id of CAR_CLASS_IDS) expect(DEFAULT_COLORS[id].length).toBeGreaterThan(0);
    expect(vehicleColors('f1', {})).toEqual(DEFAULT_COLORS.f1);
    expect(vehicleColors('f1', { f1: { colors: ['#000000'] } })).toEqual(['#000000']);
  });
});
