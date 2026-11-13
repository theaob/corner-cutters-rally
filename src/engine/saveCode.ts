// A save as a code: text a player can copy on one device and paste on another (a new phone, the web and the app,
// after a reinstall). It is the save's JSON in base64 with a check number at the end, so a code cut short or changed
// on the way is refused rather than half read. Anyone holding the code can read the progress in it, so it says so.

import { parseSaveDoc, type SaveDoc } from './save';

/** What a code starts with (and its version: a change of format is a new prefix). */
export const CODE_PREFIX = 'CC1.';

/** FNV-1a over the text's UTF-16 units: a check number, not a lock. */
export function checkOf(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}

const toBase64 = (text: string): string => {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromBase64 = (b64: string): string => {
  const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

/** `doc` as a code. */
export function encodeSave(doc: SaveDoc): string {
  const json = JSON.stringify(doc);
  return `${CODE_PREFIX}${toBase64(json)}.${checkOf(json)}`;
}

/** The save in a code (whitespace and line breaks from copying are ignored), or undefined if it isn't a whole, unchanged code. */
export function decodeSave(code: string): SaveDoc | undefined {
  const text = code.replace(/\s+/g, '');
  if (!text.startsWith(CODE_PREFIX)) return undefined;
  const at = text.lastIndexOf('.');
  if (at <= CODE_PREFIX.length - 1) return undefined;
  const body = text.slice(CODE_PREFIX.length, at);
  const check = text.slice(at + 1);
  try {
    const json = fromBase64(body);
    if (checkOf(json) !== check.toLowerCase()) return undefined;
    return parseSaveDoc(json);
  } catch {
    return undefined;
  }
}
