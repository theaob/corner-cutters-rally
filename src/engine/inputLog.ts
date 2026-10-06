// ?inputlog: a small overlay listing the last input events the page received
// (pointer, touch, focus, visibility) and the buttons held right now, for
// working out why controls don't respond on a device we can't debug directly.

import type { Button, Controls } from './controls';
import { onHidden } from './host';

const BUTTONS: Button[] = ['up', 'down', 'left', 'right', 'a', 'b', 'start', 'select'];

export function showInputLog(host: HTMLElement, controls: Controls): void {
  const box = document.createElement('pre');
  Object.assign(box.style, {
    position: 'absolute', left: '4px', bottom: '4px', zIndex: '9', margin: '0', padding: '4px 6px',
    maxWidth: 'calc(100% - 8px)', overflow: 'hidden', background: 'rgba(0,0,0,.75)', color: '#9dffb0',
    font: '10px/1.3 ui-monospace, monospace', pointerEvents: 'none', whiteSpace: 'pre-wrap',
  } satisfies Partial<CSSStyleDeclaration>);
  host.append(box);
  const lines: string[] = [];
  const t0 = performance.now();
  const log = (text: string) => {
    lines.push(`${((performance.now() - t0) / 1000).toFixed(2)} ${text}`);
    if (lines.length > 10) lines.shift();
  };
  const where = (e: Event) => {
    const el = e.target instanceof Element ? e.target : null;
    const b = el?.closest<HTMLElement>('[data-button],[data-dpad],button');
    return b?.dataset.button ?? (b?.dataset.dpad !== undefined ? 'dpad' : b ? 'button' : el?.id || el?.tagName.toLowerCase() || '?');
  };
  for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'lostpointercapture'] as const) {
    window.addEventListener(type, (e) => log(`${type} ${e.pointerType}#${e.pointerId} ${where(e)} ${Math.round(e.clientX)},${Math.round(e.clientY)}`), true);
  }
  for (const type of ['touchstart', 'touchend', 'touchcancel'] as const) {
    window.addEventListener(type, (e) => log(`${type} ${e.touches.length} ${where(e)}${e.cancelable ? '' : ' (not cancelable)'}`), { capture: true, passive: true });
  }
  window.addEventListener('click', (e) => log(`click ${where(e)}`), true);
  window.addEventListener('blur', () => log('window blur'));
  window.addEventListener('focus', () => log('window focus'));
  onHidden((hidden) => log(hidden ? 'hidden' : 'shown'));
  log(`start: ${innerWidth}x${innerHeight} dpr ${devicePixelRatio} ${window === window.top ? 'top' : 'in a frame'}`);
  const tick = () => {
    const held = BUTTONS.filter((b) => controls.isDown(b));
    box.textContent = `${lines.join('\n')}\nheld: ${held.join(' ') || '–'}`;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
