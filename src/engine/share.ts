// Sharing a picture with a line of text: in the Android app, the phone's own
// share sheet (the picture written to the app's cache first); in a browser, the
// Web Share sheet where there is one; otherwise the picture is downloaded and
// the text copied, ready to paste.

import { Capacitor } from '@capacitor/core';

export type Shared = 'shared' | 'saved' | 'cancelled' | 'failed';

/** The picture's bytes as base64 (for the app's filesystem). */
const base64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

/** Share `png` (named `filename`) with `text`: how it went. */
export async function shareImage(png: Blob, filename: string, text: string): Promise<Shared> {
  if (Capacitor.isNativePlatform()) {
    try {
      const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
      const { uri } = await Filesystem.writeFile({ path: filename, data: await base64(png), directory: Directory.Cache });
      await Share.share({ title: 'Corner Cutters', text, files: [uri], dialogTitle: 'Share your result' });
      return 'shared';
    } catch (e) {
      // (closing the share sheet rejects too)
      return /cancel/i.test(String((e as Error)?.message ?? e)) ? 'cancelled' : 'failed';
    }
  }
  const file = new File([png], filename, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      return 'shared';
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return 'cancelled';
      // (not allowed here, e.g. in a frame without the permission: saved instead)
    }
  }
  try {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(png);
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  } catch {
    return 'failed';
  }
  try {
    await navigator.clipboard?.writeText(text);
  } catch {
    // (no clipboard: the picture's enough)
  }
  return 'saved';
}
