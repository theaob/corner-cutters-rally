// Celebrations: a medal stamped onto the screen when you win one (it drops in
// big, lands with a bounce and a glint runs across it), a trophy for a
// Championship won, and confetti. Drawn with the DOM and a canvas over
// whatever's showing; each goes away by itself. With reduced motion asked for,
// the medal and trophy just appear and there's no confetti.

import { MEDAL_COLOR, MEDAL_NAME, type Medal } from '../medals';

/** ms the medal stays up (dropping in, held, fading). */
export const STAMP_MS = 2600;

const reduced = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** A medal: a disc in its colour on a ribbon, with a star; `size` px across. */
export function medalBadge(medal: Medal, size: number): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'medal-badge';
  el.style.setProperty('--medal', MEDAL_COLOR[medal]);
  el.style.setProperty('--size', `${size}px`);
  const ribbon = document.createElement('i');
  ribbon.className = 'ribbon';
  const disc = document.createElement('b');
  disc.className = 'disc';
  // (an embossed star: a darker shade of the medal's own colour)
  disc.innerHTML = '<svg viewBox="0 0 24 24" width="55%" height="55%"><path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 20.9l1.6-7L2 9.2l7.1-.6z" fill="rgba(0,0,0,.2)"/></svg>';
  el.append(ribbon, disc);
  return el;
}

/** Stamp `medal` onto `host` (a race's screen), with `line` under it (the lap, the distance); gone after STAMP_MS. */
export function stampMedal(host: HTMLElement, medal: Medal, line: string): void {
  const wrap = document.createElement('div');
  wrap.className = `medal-stamp${reduced() ? ' still' : ''}`;
  const name = document.createElement('strong');
  name.textContent = `${MEDAL_NAME[medal]} MEDAL`;
  name.style.color = MEDAL_COLOR[medal];
  const sub = document.createElement('span');
  sub.textContent = line;
  wrap.append(medalBadge(medal, 84), name, sub);
  host.append(wrap);
  setTimeout(() => wrap.remove(), STAMP_MS);
}

/** A trophy (the Championship's), `size` px tall. */
export function trophy(size: number): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 32 36');
  svg.setAttribute('width', String((size * 32) / 36));
  svg.setAttribute('height', String(size));
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.classList.add('trophy');
  // the cup, its handles, the stem and the plinth, in pixel blocks; a highlight down the cup's left
  svg.innerHTML = `
    <rect x="7" y="2" width="18" height="3" fill="#f2c14e"/>
    <rect x="8" y="5" width="16" height="9" fill="#f2c14e"/>
    <rect x="10" y="14" width="12" height="3" fill="#f2c14e"/>
    <rect x="13" y="17" width="6" height="5" fill="#d9a63a"/>
    <rect x="2" y="5" width="6" height="2" fill="#d9a63a"/><rect x="2" y="7" width="2" height="5" fill="#d9a63a"/><rect x="4" y="11" width="4" height="2" fill="#d9a63a"/>
    <rect x="24" y="5" width="6" height="2" fill="#d9a63a"/><rect x="28" y="7" width="2" height="5" fill="#d9a63a"/><rect x="24" y="11" width="4" height="2" fill="#d9a63a"/>
    <rect x="10" y="22" width="12" height="3" fill="#d9a63a"/>
    <rect x="7" y="25" width="18" height="8" fill="#3a3858"/>
    <rect x="9" y="27" width="14" height="2" fill="#f2c14e"/>
    <rect x="10" y="6" width="2" height="7" fill="#fff2c4"/>`;
  return svg;
}

const CONFETTI = ['#f2c14e', '#5fe0d0', '#ff4fd8', '#4fa3ff', '#f4f2fa', '#d8323c'];

/** Confetti over `host` for `ms`: a burst from the top that flutters down (none with reduced motion). */
export function confetti(host: HTMLElement, ms = 3500): void {
  if (reduced()) return;
  const c = document.createElement('canvas');
  c.className = 'confetti';
  host.append(c);
  const x = c.getContext('2d');
  if (!x) return;
  const scale = Math.min(2, globalThis.devicePixelRatio || 1);
  const w = (c.width = host.clientWidth * scale);
  const h = (c.height = host.clientHeight * scale);
  const bits = Array.from({ length: 90 }, () => ({
    x: w * (0.2 + Math.random() * 0.6), y: -10 - Math.random() * h * 0.2,
    vx: (Math.random() - 0.5) * w * 0.9, vy: Math.random() * h * 0.3,
    spin: Math.random() * Math.PI * 2, rate: 4 + Math.random() * 8,
    size: (4 + Math.random() * 4) * scale, color: CONFETTI[Math.floor(Math.random() * CONFETTI.length)],
  }));
  const start = performance.now();
  let last = start;
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now - start;
    x.clearRect(0, 0, w, h);
    x.globalAlpha = Math.min(1, Math.max(0, (ms - t) / 600));
    for (const b of bits) {
      b.vx *= 1 - 1.6 * dt;
      b.vy += (h * 0.5 - b.vy) * 1.2 * dt;
      b.x += (b.vx + Math.sin(t / 300 + b.spin) * w * 0.05) * dt;
      b.y += b.vy * dt;
      b.spin += b.rate * dt;
      x.fillStyle = b.color;
      x.fillRect(b.x, b.y, b.size, b.size * Math.abs(Math.cos(b.spin)));
    }
    if (t < ms && c.isConnected) requestAnimationFrame(frame);
    else c.remove();
  };
  requestAnimationFrame(frame);
}

/** ms an achievement's toast stays up. */
export const TOAST_MS = 3200;
let toasts: { name: string; about: string }[] = [];
let toasting = false;

/** An achievement unlocked: a toast slides down from the top of the page (one at a time, in turn). */
export function achievementToast(a: { name: string; about: string }): void {
  toasts.push(a);
  if (!toasting) nextToast();
}

function nextToast(): void {
  const a = toasts.shift();
  toasting = !!a;
  if (!a) return;
  const el = document.createElement('div');
  el.className = `achievement-toast${reduced() ? ' still' : ''}`;
  const star = document.createElement('b');
  star.textContent = '★';
  const text = document.createElement('div');
  const head = document.createElement('small');
  head.textContent = 'ACHIEVEMENT';
  const name = document.createElement('strong');
  name.textContent = a.name;
  const about = document.createElement('span');
  about.textContent = a.about;
  text.append(head, name, about);
  el.append(star, text);
  document.body.append(el);
  setTimeout(() => {
    el.remove();
    nextToast();
  }, TOAST_MS);
}

/** Forget any toasts still waiting (for tests). */
export const clearToasts = () => {
  toasts = [];
  toasting = false;
};

/** A short line at the bottom of the page for `ms` (PRESS BACK AGAIN TO EXIT). */
export function hintToast(text: string, ms = 2000): void {
  document.querySelector('.hint-toast')?.remove();
  const el = document.createElement('div');
  el.className = 'hint-toast';
  el.textContent = text;
  document.body.append(el);
  setTimeout(() => el.remove(), ms);
}
