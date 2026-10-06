import { beforeEach, describe, expect, it } from 'vitest';
import { saved, useSave, type SaveStore } from '../src/engine/save';
import { circuitHash, forgetChangedCircuits } from '../src/f1/circuitHash';
import { LAYOUTS, SILVER_HEATH, type CircuitLayout } from '../src/f1/layouts';
import { loadRecords, recordLap, saveRecords } from '../src/f1/records';
import { CC_SAVE } from '../src/f1/save';
import { loadGhost, saveGhost } from '../src/f1/timeTrial';
import { savedUnlocks } from '../src/f1/unlocks';

const ghost = { time: 30, splits: [10, 20], frames: [0, 0, 0, 0, 1, 1, 0, 1] };
const [first, second] = LAYOUTS;
/** `layout` with its first control point moved a pixel. */
const nudged = (layout: CircuitLayout): CircuitLayout => ({ ...layout, points: [{ x: layout.points[0].x + 1, y: layout.points[0].y }, ...layout.points.slice(1)] });

beforeEach(() => {
  const items = new Map<string, string>();
  const store: SaveStore = { getItem: (k) => items.get(k) ?? null, setItem: (k, v) => void items.set(k, v), removeItem: (k) => void items.delete(k) };
  useSave(CC_SAVE, store);
});

/** A lap record and a ghost on `layout`, dry and wet. */
function play(layout: CircuitLayout) {
  const r = loadRecords();
  recordLap(r, layout.id, 30);
  recordLap(r, `${layout.id}:wet`, 34);
  saveRecords(r);
  saveGhost(layout.id, ghost);
  saveGhost(`${layout.id}:wet`, ghost);
}

describe("a circuit's hash", () => {
  it('is its own for each circuit, the same every time, and changes with how it drives, not its name', () => {
    expect(new Set(LAYOUTS.map(circuitHash)).size).toBe(LAYOUTS.length);
    expect(circuitHash(SILVER_HEATH)).toBe(circuitHash({ ...SILVER_HEATH }));
    expect(circuitHash({ ...SILVER_HEATH, name: 'Renamed', about: 'new words' })).toBe(circuitHash(SILVER_HEATH));
    for (const changed of [nudged(SILVER_HEATH), { ...SILVER_HEATH, scale: SILVER_HEATH.scale + 0.1 }, { ...SILVER_HEATH, pit: { ...SILVER_HEATH.pit, to: SILVER_HEATH.pit.to + 8 } }, { ...SILVER_HEATH, tyreWear: 0.5 }]) {
      expect(circuitHash(changed)).not.toBe(circuitHash(SILVER_HEATH));
    }
  });
});

describe('records and ghosts on a changed circuit', () => {
  it('are kept the first time (no hash saved yet), and while the circuit stays the same', () => {
    play(first);
    expect(forgetChangedCircuits(LAYOUTS)).toEqual([]);
    expect(saved('circuits', first.id)).toBe(circuitHash(first));
    expect(forgetChangedCircuits(LAYOUTS)).toEqual([]);
    expect(loadRecords().circuits[first.id].bestLap).toBe(30);
    expect(loadGhost(`${first.id}:wet`)).toEqual(ghost);
  });

  it('are forgotten, in every weather, once it changes; other circuits keep theirs', () => {
    play(first);
    play(second);
    forgetChangedCircuits(LAYOUTS);
    const changed = [nudged(first), ...LAYOUTS.slice(1)];
    expect(forgetChangedCircuits(changed)).toEqual([first.id]);
    const ids = Object.keys(loadRecords().circuits);
    expect(ids.some((id) => id.startsWith(first.id))).toBe(false);
    expect(loadGhost(first.id)).toBeUndefined();
    expect(loadGhost(`${first.id}:wet`)).toBeUndefined();
    expect(ids).toContain(`${second.id}:wet`);
    expect(loadGhost(second.id)).toEqual(ghost);
    // (and the new hash is kept: once forgotten, new records there stay)
    expect(saved('circuits', first.id)).toBe(circuitHash(changed[0]));
    expect(forgetChangedCircuits(changed)).toEqual([]);
  });

  it('leave a circuit open that was open only thanks to a record there', () => {
    play(second);
    forgetChangedCircuits(LAYOUTS);
    expect(savedUnlocks()).toEqual([]);
    forgetChangedCircuits([first, nudged(second), ...LAYOUTS.slice(2)]);
    expect(savedUnlocks()).toEqual([second.id]);
  });
});
