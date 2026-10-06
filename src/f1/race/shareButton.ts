// SHARE: your result as a card (shareCard.ts), to the phone's share sheet (or
// saved, the text copied). Under the results table after a race, and under the
// banner after a Time Attack, centred; it says how the sharing went.

import { shareImage } from '../../engine/share';
import { cardFile, cardPng, shareText, type ShareCard } from '../shareCard';
import { style } from './dom';

const LABEL = '↗ SHARE';

/** The button for the card `card()` makes (none: nothing to share), with the circuit's `map` on it; `onShared` once it's gone. */
export function createShareButton(card: () => ShareCard | undefined, map: () => HTMLCanvasElement | undefined, onShared?: () => void) {
  const el = document.createElement('button');
  el.textContent = LABEL;
  style(el, {
    display: 'block', margin: '10px auto 0', padding: '8px 20px', borderRadius: '10px', border: '1px solid #3a3858',
    background: '#25233a', color: '#f2c14e', font: '13px Silkscreen, monospace', cursor: 'pointer', touchAction: 'none',
  });
  let busy = false;
  const press = async () => {
    const c = card();
    if (!c || busy) return;
    busy = true;
    el.textContent = 'SHARING…';
    try {
      const how = await shareImage(await cardPng(c, map()), cardFile(c), shareText(c));
      if (how === 'shared' || how === 'saved') onShared?.();
      el.textContent = how === 'shared' ? 'SHARED ✓' : how === 'saved' ? 'SAVED · TEXT COPIED' : how === 'failed' ? "COULDN'T SHARE" : LABEL;
    } catch {
      el.textContent = "COULDN'T SHARE";
    }
    busy = false;
  };
  // on the press's release, not 'click' (in a cross-origin frame on a phone a tap's click can go astray)
  let armed = false;
  el.addEventListener('pointerdown', (e) => {
    armed = true;
    e.stopPropagation();
  });
  el.addEventListener('pointerleave', () => (armed = false));
  el.addEventListener('pointerup', (e) => {
    e.stopPropagation();
    if (armed) void press();
    armed = false;
  });
  // the same button floating on its own (centred under the banner), for a Time Attack's result
  const float = document.createElement('div');
  style(float, { position: 'absolute', left: '0', right: '0', zIndex: '3', display: 'none', textAlign: 'center' });
  return {
    el,
    float,
    /** Back to SHARE (a new result). */
    reset() {
      if (!busy) el.textContent = LABEL;
    },
    /** Float it under the banner (at `top`), or put it away. */
    floatAt(top: string | undefined) {
      if (top === undefined) {
        float.style.display = 'none';
        return;
      }
      if (el.parentElement !== float) {
        el.textContent = LABEL;
        float.append(el);
      }
      float.style.top = top;
      float.style.display = 'block';
    },
  };
}
