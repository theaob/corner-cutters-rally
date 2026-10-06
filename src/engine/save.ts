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

const KEY = () => storeKey('save');
const BAD_KEY = () => storeKey('save.bad');

/** The device's storage (or, in the YouTube build, the player's YouTube save: host.ts). */
const deviceStore = (): SaveStore | undefined => hostStore();

/** Use `f` as this game's save format, reading and writing `s` (the device's storage unless given). Forgets the save read so far. */
export function useSave(f: SaveFormat, s: SaveStore | undefined = deviceStore()): void {
  format = f;
  store = s;
  doc = undefined;
  readOnly = false;
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
    if (doc.version !== stored.version) write();
    return doc;
  }
  // a damaged save is kept aside (not lost), and the game starts afresh
  if (json !== null) set(BAD_KEY(), json);
  // no save yet: the first one, from the separate keys of before (if any)
  const legacy = (name: string) => get(storeKey(name));
  doc = migrateSave({ version: 0, data: {} }, format, legacy);
  if (write()) for (const name of format.legacyKeys) remove(storeKey(name));
  return doc;
}

function write(): boolean {
  if (readOnly || !doc) return false;
  return set(KEY(), JSON.stringify(doc));
}

/** The saved value `name` in `section` (undefined if there's none): check it before using it. */
export function saved(section: string, name: string): unknown {
  return load().data[section]?.[name];
}

/** A whole saved section (empty if there's none): check its values before using them. */
export function savedSection(section: string): Record<string, unknown> {
  return load().data[section] ?? {};
}

/** Save `value` as `name` in `section` (undefined removes it); on the device if it can be, in memory at least. */
export function save(section: string, name: string, value: unknown): void {
  const d = load();
  // another tab may have saved since: start from what's stored now, when it's this version's
  const fresh = readOnly ? undefined : readStored();
  if (fresh && fresh.version === d.version) d.data = fresh.data;
  const s = (d.data[section] ??= {});
  if (value === undefined) delete s[name];
  else s[name] = value;
  write();
}

/** The version of the save in use (for the debug readout and tests). */
export const saveVersion = () => load().version;
