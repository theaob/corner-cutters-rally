import { beforeEach, describe, expect, it } from 'vitest';
import { migrateSave, parseSaveDoc, save, saved, savedSection, saveVersion, useSave, type SaveFormat, type SaveStore } from '../src/engine/save';
import { useStore } from '../src/engine/storage';
import { CC_SAVE } from '../src/f1/save';
import { loadRecords, recordLap, saveRecords } from '../src/f1/records';

/** The device's storage, in memory; `broken` makes every call throw (blocked storage), `full` makes writes throw. */
function fakeStore(init: Record<string, string> = {}, mode: 'ok' | 'broken' | 'full' = 'ok'): SaveStore & { items: Map<string, string> } {
  const items = new Map(Object.entries(init));
  return {
    items,
    getItem: (k) => {
      if (mode === 'broken') throw new Error('blocked');
      return items.get(k) ?? null;
    },
    setItem: (k, v) => {
      if (mode !== 'ok') throw new Error('no room');
      items.set(k, v);
    },
    removeItem: (k) => {
      if (mode === 'broken') throw new Error('blocked');
      items.delete(k);
    },
  };
}

const stored = (s: ReturnType<typeof fakeStore>) => JSON.parse(s.items.get('cc:save')!);

beforeEach(() => useStore('cc:'));

describe('the first save, from the keys of before', () => {
  it('carries every setting, choice and record over, and removes the old keys', () => {
    const s = fakeStore({
      'cc:sound': '0.35',
      'cc:vibration': 'off',
      'cc:stick-side': 'right',
      'cc:layout': 'desktop',
      'cc:circuit': 'silver-heath',
      'cc:team': 'maas',
      'cc:difficulty': 'hard',
      'cc:weather': 'wet',
      'cc:records': JSON.stringify({ version: 1, circuits: { 'silver-heath': { bestLap: 24.5, bestRace: { 3: 80.1 } } } }),
      'cc:controls': 'pedals',
      'cc:tune:f1': '{"zoom":1.5}',
      'other:records': 'another game',
    });
    useSave(CC_SAVE, s);
    expect(saved('settings', 'sound')).toBe(0.35);
    expect(saved('settings', 'vibration')).toBe(false);
    expect(saved('settings', 'stickSide')).toBe('right');
    expect(saved('settings', 'layout')).toBe('desktop');
    expect(savedSection('choices')).toEqual({ circuit: 'silver-heath', team: 'maas', difficulty: 'hard', weather: 'wet' });
    expect(loadRecords().circuits['silver-heath']).toEqual({ bestLap: 24.5, bestRace: { 3: 80.1 } });
    expect(saveVersion()).toBe(2);
    // one save now, the old keys gone; dev tools' own keys and other games' keys untouched
    expect([...s.items.keys()].sort()).toEqual(['cc:save', 'cc:tune:f1', 'other:records']);
    expect(stored(s).version).toBe(2);
  });

  it("starts empty on a new device, with the defaults where they're read", () => {
    const s = fakeStore();
    useSave(CC_SAVE, s);
    expect(saved('settings', 'sound')).toBeUndefined();
    expect(loadRecords().circuits).toEqual({});
    expect(stored(s)).toEqual({ version: 2, data: { settings: {}, choices: {}, records: { circuits: {} } } });
  });

  it('keeps what it can of a damaged old record', () => {
    useSave(CC_SAVE, fakeStore({ 'cc:records': '{broken', 'cc:sound': 'loud' }));
    expect(loadRecords().circuits).toEqual({});
    expect(saved('settings', 'sound')).toBeUndefined();
  });
});

describe('saving', () => {
  it('keeps each value, and reads it back after a reload', () => {
    const s = fakeStore();
    useSave(CC_SAVE, s);
    save('settings', 'sound', 1);
    save('choices', 'team', 'dmw');
    const r = loadRecords();
    recordLap(r, 'crescent-park', 21.2);
    saveRecords(r);
    useSave(CC_SAVE, s); // a reload
    expect(saved('settings', 'sound')).toBe(1);
    expect(saved('choices', 'team')).toBe('dmw');
    expect(loadRecords().circuits['crescent-park'].bestLap).toBe(21.2);
    save('choices', 'team', undefined);
    expect(saved('choices', 'team')).toBeUndefined();
  });

  it("doesn't undo another tab's save", () => {
    const s = fakeStore();
    useSave(CC_SAVE, s);
    saved('settings', 'sound'); // this tab has read the save
    // another tab saves a record…
    const other = stored(s);
    other.data.records.circuits = { x: { bestLap: 30, bestRace: {} } };
    s.items.set('cc:save', JSON.stringify(other));
    // …then this one changes a setting
    save('settings', 'vibration', false);
    expect(stored(s).data.records.circuits.x.bestLap).toBe(30);
    expect(stored(s).data.settings.vibration).toBe(false);
  });

  it('works in memory when storage is blocked or full', () => {
    for (const mode of ['broken', 'full'] as const) {
      useSave(CC_SAVE, fakeStore({}, mode));
      save('settings', 'sound', 0.35);
      expect(saved('settings', 'sound')).toBe(0.35);
    }
    useSave(CC_SAVE, undefined);
    save('choices', 'weather', 'damp');
    expect(saved('choices', 'weather')).toBe('damp');
  });
});

describe("a save it can't read", () => {
  it('is set aside, not lost, and the game starts afresh (old keys still read)', () => {
    const s = fakeStore({ 'cc:save': '{"version":1,"data":', 'cc:team': 'maas' });
    useSave(CC_SAVE, s);
    expect(saved('choices', 'team')).toBe('maas');
    expect(s.items.get('cc:save.bad')).toBe('{"version":1,"data":');
    expect(stored(s).version).toBe(2);
  });

  it('from a newer version of the game is read but never written over', () => {
    const newer = JSON.stringify({ version: 7, data: { settings: { sound: 0.35, fancy: 'x' }, future: { a: 1 } } });
    const s = fakeStore({ 'cc:save': newer });
    useSave(CC_SAVE, s);
    expect(saved('settings', 'sound')).toBe(0.35);
    save('settings', 'sound', 1);
    expect(saved('settings', 'sound')).toBe(1); // for now
    expect(s.items.get('cc:save')).toBe(newer);
  });
});

describe('migrations', () => {
  const format: SaveFormat = {
    version: 3,
    legacyKeys: ['vol'],
    migrations: [
      (_, legacy) => ({ settings: { volume: Number(legacy('vol') ?? 0.7) } }),
      (d) => ({ ...d, settings: { sound: d.settings.volume } }),
      (d) => ({ ...d, records: { circuits: {} } }),
    ],
  };

  it("run in order from the save's version up to the current one", () => {
    expect(migrateSave({ version: 1, data: { settings: { volume: 0.35 } } }, format)).toEqual({ version: 3, data: { settings: { sound: 0.35 }, records: { circuits: {} } } });
    expect(migrateSave({ version: 3, data: { settings: { sound: 1 } } }, format)).toEqual({ version: 3, data: { settings: { sound: 1 } } });
  });

  it('bring a very old device, from the keys of before, all the way up, and save it', () => {
    const s = fakeStore({ 'cc:vol': '0.35' });
    useSave(format, s);
    expect(saved('settings', 'sound')).toBe(0.35);
    expect(stored(s).version).toBe(3);
    expect(s.items.has('cc:vol')).toBe(false);
  });

  it('upgrade a stored save on first read, and write it back', () => {
    const s = fakeStore({ 'cc:save': JSON.stringify({ version: 2, data: { settings: { sound: 0.35 } } }) });
    useSave(format, s);
    expect(savedSection('records')).toEqual({ circuits: {} });
    expect(stored(s)).toEqual({ version: 3, data: { settings: { sound: 0.35 }, records: { circuits: {} } } });
  });
});

describe('reading a stored save', () => {
  it('takes only a versioned document of sections', () => {
    expect(parseSaveDoc('{"version":2,"data":{"a":{"x":1},"b":3,"c":[1]}}')).toEqual({ version: 2, data: { a: { x: 1 } } });
    for (const bad of ['', 'null', '[]', '{"data":{}}', '{"version":0}', '{"version":"1"}', '{"version":1.5}']) expect(parseSaveDoc(bad)).toBeUndefined();
  });
});
