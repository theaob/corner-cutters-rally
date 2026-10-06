// The game's backend: a Supabase project's REST API, reached with its public
// (anon) key from the build (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY;
// supabase/README.md). Without them it's off: every call says so, and the game
// plays on offline.

const URL_ = (import.meta.env?.VITE_SUPABASE_URL as string | undefined)?.replace(/\/+$/, '');
const KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Whether the build has a backend. */
export const online = (): boolean => !!URL_ && !!KEY;

const headers = () => ({ apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' });

/** How an insert went: in, refused by the database (it won't go however often it's tried), or not sent (offline). */
export type Sent = 'ok' | 'refused' | 'offline';

/**
 * Add `rows` to `table` (as the page is closing too: `keepalive`). The rows must all have the same keys (the database
 * takes a batch only so).
 */
export async function insert(table: string, rows: object[], keepalive = false): Promise<Sent> {
  if (!online() || !rows.length) return 'offline';
  try {
    const r = await fetch(`${URL_}/rest/v1/${table}`, { method: 'POST', headers: { ...headers(), Prefer: 'return=minimal' }, body: JSON.stringify(rows), keepalive });
    return r.ok ? 'ok' : 'refused';
  } catch {
    return 'offline';
  }
}

/** Call the database function `name` with `args`: its result, or undefined if it didn't go. */
export async function rpc<T>(name: string, args: object): Promise<T | undefined> {
  if (!online()) return undefined;
  try {
    const r = await fetch(`${URL_}/rest/v1/rpc/${name}`, { method: 'POST', headers: headers(), body: JSON.stringify(args) });
    if (!r.ok) return undefined;
    const text = await r.text();
    return (text ? JSON.parse(text) : null) as T;
  } catch {
    return undefined;
  }
}

/** Put `file` in storage bucket `bucket` at `path` (never over one already there): whether it went. */
export async function upload(bucket: string, path: string, file: Blob): Promise<Sent> {
  if (!online()) return 'offline';
  try {
    const r = await fetch(`${URL_}/storage/v1/object/${bucket}/${path}`, {
      method: 'POST', headers: { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'false' }, body: file,
    });
    return r.ok ? 'ok' : 'refused';
  } catch {
    return 'offline';
  }
}
