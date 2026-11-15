// The save: everything the game keeps on the device, in one JSON document
// under the game's prefix ('cc:save'), with a version number. The document
// holds named sections (e.g. settings, records), each a plain object of values
// the code that owns them checks on reading (a save can come from an older or
// a newer game, or be damaged).
//
// The game describes its format once at boot (`useSave`): its current version
// and a migration for each step up from an older one. Version 0 is how things
// were kept before the save format: separate keys, which the first migration
// reads (they're removed once the new save is written). A save from a newer
// version of the game than this one (an app rolled back) is read as far as it
// can be and never written over, so going back and forth loses nothing; a
// save that isn't valid JSON is set aside under 'save.bad' and the game starts
// afresh. Every write re-reads the stored document first and changes just the
// one value, so two tabs don't undo each other's saves. Without storage
// (private mode, blocked) it all works in memory until the page closes.
//
// Two things keep a save cheap as it grows. The writes of one run of code (a lap
// ends with records, a kept race and a ghost to save) are one write, made as that
// run finishes (a microtask: `flushSave` makes it at once). And the bulky
// sections (SPLIT: the Time Trial ghosts, about 18 KB each) live under keys of
// their own, `cc:<section>.<name>`, with only a marker for each in the document, so a ghost
// is written alone and an ordinary save doesn't carry them. A save moved to
// another device (exportSaveDoc, replaceSave) still holds them whole.

import { storeKey } from './storage';
import { hostStore } from './host';

/** The save's data: sections of named values. */
export type SaveData = Record<string, Record<string, unknown>>;

/** A save as stored. */
export interface SaveDoc {
  version: number;
  data: SaveData;
}

/** The device's storage, as far as the save uses it (the host's: host.ts; or a stand-in for tests). */
export interface SaveStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SaveFormat {
  /** this game's save version */
  version: number;
  /**
   * `migrations[v]` takes a save at version v to v + 1. `migrations[0]` builds
   * the first save from the separate keys of before (`legacy` gives each one's
   * stored value, or null).
   */
  migrations: ((data: SaveData, legacy: (name: string) => string | null) => SaveData)[];
  /** the separate keys of before (names without the prefix), removed once they've been read into the save */
  legacyKeys: string[];
}

const EMPTY: SaveFormat = { version: 1, migrations: [(d) => d], legacyKeys: [] };

let format: SaveFormat = EMPTY;
let store: SaveStore | undefined;
let doc: SaveDoc | undefined;
/** the stored save is from a newer game: read it, never write it */
let readOnly = false;
/** a write is waiting for the end of this run of code (see saveSoon) */
let pending = false;

/** The sections kept one key to a value, each value apart from the document (which holds a marker `1` for each). */
const SPLIT = ['ghosts'];
const isSplit = (section: string) => SPLIT.includes(section);
/** what the document holds for a value kept under a key of its own */
const MARK = 1;
/** split values that couldn't be written to the storage (full, blocked, none): kept in memory for as long as the page is open */
const memory = new Map<string, unknown>();

const KEY = () => storeKey('save');
const BAD_KEY = () => storeKey('save.bad');

/** The device's storage (or, in the YouTube build, the player's YouTube save: host.ts). */
const deviceStore = (): SaveStore | undefined => hostStore();

/** Use `f` as this game's save format, reading and writing `s` (the device's storage unless given). Forgets the save read so far. */
export function useSave(f: SaveFormat, s: SaveStore | undefined = deviceStore()): void {
  flushSave();
  format = f;
  store = s;
  doc = undefined;
  readOnly = false;
  pending = false;
  memory.clear();
}

const isSection = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** A stored save's JSON as a document: undefined if it isn't one (not JSON, or no version). */
export function parseSaveDoc(json: string): SaveDoc | undefined {
  try {
    const raw = JSON.parse(json) as { version?: unknown; data?: unknown };
    if (!raw || typeof raw !== 'object' || !Number.isInteger(raw.version) || (raw.version as number) < 1) return undefined;
    const data: SaveData = {};
    if (isSection(raw.data)) for (const [k, v] of Object.entries(raw.data)) if (isSection(v)) data[k] = v;
    return { version: raw.version as number, data };
  } catch {
    return undefined;
  }
}

/** `d` brought up to `f`'s version by its migrations (a newer one as it is). */
export function migrateSave(d: SaveDoc, f: SaveFormat, legacy: (name: string) => string | null = () => null): SaveDoc {
  let { version, data } = d;
  while (version < f.version) {
    const step = f.migrations[version];
    data = step ? step(data, legacy) : data;
    version++;
  }
  return { version, data };
}

function get(key: string): string | null {
  try {
    return store?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function set(key: string, value: string): boolean {
  try {
    if (!store) return false;
    store.setItem(key, value);
    return true;
  } catch {
    return false; // full or blocked: kept in memory
  }
}

function remove(key: string): void {
  try {
    store?.removeItem(key);
  } catch {
    // blocked
  }
}

/** The stored save, read and brought up to date (from the keys of before if there's none yet), or undefined if there's nothing usable. */
function readStored(): SaveDoc | undefined {
  const json = get(KEY());
  if (json === null) return undefined;
  return parseSaveDoc(json);
}

function load(): SaveDoc {
  if (doc) return doc;
  const json = get(KEY());
  const stored = json === null ? undefined : parseSaveDoc(json);
  if (stored) {
    readOnly = stored.version > format.version;
    doc = migrateSave(stored, format);
    const moved = !readOnly && splitOut(doc.data);
    if (doc.version !== stored.version || moved) writeNow();
    return doc;
  }
  // a damaged save is kept aside (not lost), and the game starts afresh
  if (json !== null) set(BAD_KEY(), json);
  // no save yet: the first one, from the separate keys of before (if any)
  const legacy = (name: string) => get(storeKey(name));
  doc = migrateSave({ version: 0, data: {} }, format, legacy);
  if (writeNow()) for (const name of format.legacyKeys) remove(storeKey(name));
  return doc;
}

/** The document written now: false if it can't be (a newer game's save, or the storage's full or blocked). */
function writeNow(): boolean {
  pending = false;
  if (readOnly || !doc) return false;
  return set(KEY(), JSON.stringify(doc));
}

/** The document written as this run of code ends (any more saves before then are part of the same write). */
function saveSoon(): void {
  if (pending) return;
  pending = true;
  queueMicrotask(() => {
    if (pending) writeNow();
  });
}

/** Write what's waiting to be written, now (a page closing; tests). */
export function flushSave(): void {
  if (pending) writeNow();
}

const splitKey = (section: string, name: string) => storeKey(`${section}.${name}`);

/** A split value from where it's kept (undefined if there's none, or it isn't JSON). */
function readSplit(section: string, name: string): unknown {
  const k = splitKey(section, name);
  if (memory.has(k)) return memory.get(k);
  const json = get(k);
  if (json === null) return undefined;
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}

/** Keep a split value under its own key (in memory too, if the storage won't take it); undefined removes it. */
function writeSplit(section: string, name: string, value: unknown): void {
  const k = splitKey(section, name);
  if (value === undefined) {
    memory.delete(k);
    remove(k);
  } else if (set(k, JSON.stringify(value))) memory.delete(k);
  else memory.set(k, value);
}

/** Move the split sections' values out of `data` (a save from before they were split, or from an older build that wrote them in) to keys of their own; true if any moved. */
function splitOut(data: SaveData): boolean {
  let moved = false;
  for (const section of SPLIT) {
    const s = data[section];
    if (!s) continue;
    for (const [name, v] of Object.entries(s)) {
      if (v === MARK) continue;
      writeSplit(section, name, v);
      s[name] = MARK;
      moved = true;
    }
  }
  return moved;
}

/** The saved value `name` in `section` (undefined if there's none): check it before using it. */
export function saved(section: string, name: string): unknown {
  const d = load();
  // (a split value is read from its own key: there's one only if the document has its marker)
  if (isSplit(section)) {
    const v = d.data[section]?.[name];
    // (one still inside the document, in a save not yet moved out, is read from there)
    return v === MARK ? readSplit(section, name) : v;
  }
  return d.data[section]?.[name];
}

/** A whole saved section (empty if there's none): check its values before using them. (A split section gives a marker for each of its names: `saved` gives the value.) */
export function savedSection(section: string): Record<string, unknown> {
  return load().data[section] ?? {};
}

/** Save `value` as `name` in `section` (undefined removes it); on the device if it can be, in memory at least. */
export function save(section: string, name: string, value: unknown): void {
  const d = load();
  // another tab may have saved since: start from what's stored now, when it's this version's (once for a run of saves: nothing can have come between them)
  const fresh = readOnly || pending ? undefined : readStored();
  if (fresh && fresh.version > d.version) {
    // (a newer build in another tab has moved the save on: from here on it's theirs, never written over)
    readOnly = true;
    return;
  }
  if (readOnly) {
    // (a newer game's save: this game's changes stay in memory)
    const s = (d.data[section] ??= {});
    if (value === undefined) delete s[name];
    else if (isSplit(section)) {
      memory.set(splitKey(section, name), value);
      s[name] = MARK;
    } else s[name] = value;
    return;
  }
  if (fresh && fresh.version === d.version) {
    d.data = fresh.data;
    if (splitOut(d.data)) saveSoon();
  }
  const s = (d.data[section] ??= {});
  if (isSplit(section)) {
    // the value to its own key; the document is rewritten only if the name's there or gone now
    writeSplit(section, name, value);
    if (value === undefined ? name in s : s[name] !== MARK) {
      if (value === undefined) delete s[name];
      else s[name] = MARK;
      saveSoon();
    }
    return;
  }
  if (value === undefined) delete s[name];
  else s[name] = value;
  saveSoon();
}

/** The version of the save in use (for the debug readout and tests). */
export const saveVersion = () => load().version;

/** The sections that belong to the device, not the player (what it measured about itself): left out of a save moved to another. */
const DEVICE_SECTIONS = ['device'];

/** The whole save, as a document, for moving to another device (the device's own sections left out). */
export function exportSaveDoc(): SaveDoc {
  const d = load();
  const data: SaveData = {};
  for (const [k, v] of Object.entries(d.data)) {
    if (DEVICE_SECTIONS.includes(k)) continue;
    // (the split values put back in, whole)
    data[k] = isSplit(k) ? Object.fromEntries(Object.keys(v).map((name) => [name, readSplit(k, name)]).filter(([, g]) => g !== undefined)) : v;
  }
  return { version: d.version, data };
}

/**
 * Replace the save with `incoming` (a save moved from another device): false if it's from a newer game than this one
 * (it couldn't be read as it should be) or can't be written. The save it replaces is kept aside under 'save.bak',
 * and this device's own sections stay.
 */
export function replaceSave(incoming: SaveDoc): boolean {
  const d = load();
  if (incoming.version > format.version) return false;
  const migrated = migrateSave(incoming, format);
  const keep: SaveData = {};
  for (const k of DEVICE_SECTIONS) if (d.data[k]) keep[k] = d.data[k];
  const before = get(KEY());
  if (before !== null) set(storeKey('save.bak'), before);
  // (the split values of the save it replaces go; the new ones are moved out to keys of their own)
  for (const section of SPLIT) for (const name of Object.keys(d.data[section] ?? {})) writeSplit(section, name, undefined);
  doc = { version: migrated.version, data: { ...migrated.data, ...keep } };
  readOnly = false;
  splitOut(doc.data);
  return writeNow();
}
