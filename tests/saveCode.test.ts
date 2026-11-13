import { beforeEach, describe, expect, it } from 'vitest';
import { exportSaveDoc, replaceSave, save, saved, useSave, type SaveFormat, type SaveStore } from '../src/engine/save';
import { CODE_PREFIX, decodeSave, encodeSave } from '../src/engine/saveCode';

const memory = (): SaveStore & { items: Map<string, string> } => {
  const items = new Map<string, string>();
  return { items, getItem: (k) => items.get(k) ?? null, setItem: (k, v) => void items.set(k, v), removeItem: (k) => void items.delete(k) };
};
const format: SaveFormat = { version: 2, migrations: [(d) => d, (d) => d], legacyKeys: [] };

describe('a save as a code', () => {
  beforeEach(() => useSave(format, memory()));

  it('round-trips, including text outside ASCII', () => {
    const doc = { version: 2, data: { profile: { initials: 'ÖNR', id: 'x' }, records: { a: [1, 2, 3.5] } } };
    const code = encodeSave(doc);
    expect(code.startsWith(CODE_PREFIX)).toBe(true);
    expect(decodeSave(code)).toEqual(doc);
  });
  it('ignores the line breaks and spaces a copy adds', () => {
    const doc = { version: 2, data: { a: { b: 1 } } };
    const code = encodeSave(doc);
    expect(decodeSave(`  ${code.slice(0, 10)}\n${code.slice(10)}\n`)).toEqual(doc);
  });
  it('refuses a code that is cut short, changed, or not a code', () => {
    const code = encodeSave({ version: 2, data: { a: { b: 'hello world' } } });
    expect(decodeSave(code.slice(0, -3))).toBeUndefined();
    expect(decodeSave(code.replace('.', 'A.'))).toBeUndefined();
    expect(decodeSave(code.slice(0, 12) + (code[12] === 'A' ? 'B' : 'A') + code.slice(13))).toBeUndefined();
    expect(decodeSave('hello')).toBeUndefined();
    expect(decodeSave('')).toBeUndefined();
    expect(decodeSave(CODE_PREFIX)).toBeUndefined();
  });
  it('a big save (ghosts) comes through whole', () => {
    const ghost = Array.from({ length: 60000 }, (_, i) => i % 97);
    const doc = { version: 2, data: { timeTrial: { ghost } } };
    expect(decodeSave(encodeSave(doc))).toEqual(doc);
  });
});

describe('moving a save to a device', () => {
  it('leaves out the device sections, and keeps this device\'s own when replacing', () => {
    const from = memory();
    useSave(format, from);
    save('records', 'best', 71.2);
    save('device', 'quality', { level: 2 });
    const doc = exportSaveDoc();
    expect(doc.data.device).toBeUndefined();
    expect(doc.data.records).toEqual({ best: 71.2 });

    const to = memory();
    useSave(format, to);
    save('records', 'best', 90);
    save('device', 'quality', { level: 0 });
    expect(replaceSave(doc)).toBe(true);
    expect(saved('records', 'best')).toBe(71.2);
    expect(saved('device', 'quality')).toEqual({ level: 0 });
    // what it replaced is kept aside
    expect([...to.items.keys()].some((k) => k.endsWith('save.bak'))).toBe(true);
  });
  it('refuses a save from a newer game', () => {
    useSave(format, memory());
    save('records', 'best', 1);
    expect(replaceSave({ version: 3, data: { records: { best: 2 } } })).toBe(false);
    expect(saved('records', 'best')).toBe(1);
  });
});
