// The curtain between screens: a dark sheet over the whole page that fades in
// before a screen goes and out once the next is up, so the menu, a race and the
// Championship screen follow one another instead of cutting. Going to a race it
// carries a loading card (the circuit's outline and name, the mode and the
// weather, and a run of chequered squares lighting in turn) while the circuit is
// built. The page opens with it down, lifted once the first screen is up.

import type { CircuitLayout } from '../layouts';

/** ms the curtain takes to fade in or out. */
export const CURTAIN_MS = 180;

let sheet: HTMLDivElement | undefined;
let card: HTMLDivElement | undefined;

function ensure(): HTMLDivElement {
  if (sheet) return sheet;
  sheet = document.getElementById('curtain') as HTMLDivElement | null ?? document.createElement('div');
  sheet.id = 'curtain';
  if (!sheet.parentElement) document.body.append(sheet);
  card = document.createElement('div');
  card.className = 'curtain-card';
  sheet.replaceChildren(card);
  return sheet;
}

/** A small outline of the circuit (its centreline, fitted to `size`). */
function outline(layout: CircuitLayout, size: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size * 2;
  const x = c.getContext('2d');
  if (!x) return c;
  const xs = layout.points.map((p) => p.x);
  const ys = layout.points.map((p) => p.y);
  const [minX, minY] = [Math.min(...xs), Math.min(...ys)];
  const k = (size * 2 - 16) / Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY);
  x.strokeStyle = '#f4f2fa';
  x.lineWidth = 4;
  x.lineJoin = 'round';
  x.beginPath();
  layout.points.forEach((p, i) => (i ? x.lineTo : x.moveTo).call(x, 8 + (p.x - minX) * k, 8 + (p.y - minY) * k));
  x.closePath();
  x.stroke();
  Object.assign(c.style, { width: `${size}px`, height: `${size}px` });
  return c;
}

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Bring the curtain down (resolves once it's down and drawn): with a loading card for a race on `layout` (`line`
 * under its name: the mode, the weather), or plain.
 */
export async function curtainDown(race?: { layout: CircuitLayout; line: string }): Promise<void> {
  const s = ensure();
  card!.replaceChildren();
  if (race) {
    const name = document.createElement('strong');
    name.textContent = race.layout.name.toUpperCase();
    const line = document.createElement('span');
    line.textContent = race.line;
    const dots = document.createElement('div');
    dots.className = 'curtain-dots';
    for (let k = 0; k < 5; k++) dots.append(document.createElement('i'));
    card!.append(outline(race.layout, 72), name, line, dots);
  }
  const was = s.classList.contains('down');
  s.classList.add('down');
  // (already down: just the card; else wait out the fade, and a frame so the card is drawn before the work starts)
  if (!was) await wait(CURTAIN_MS);
  await frame();
  await frame();
}

let lifted: () => void = () => {};
const firstUp = new Promise<void>((resolve) => (lifted = resolve));
/** Resolves once the curtain's first lifted (the game's first screen is up, and can be played). */
export const curtainFirstUp = (): Promise<void> => firstUp;

/** Lift the curtain (the next screen is up). */
export function curtainUp(): void {
  ensure().classList.remove('down');
  lifted();
}
