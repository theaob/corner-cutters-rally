// REPORT (the pause screen, the menu's settings): a screenshot of the game as
// it was, to draw on (to show where) and say what happened under, sent to the
// game's backend: the picture to the 'reports' storage bucket, the words and
// where it was to the 'reports' table (supabase/schema.sql). The screenshot is
// the 3D picture (copied as it's drawn: engine/render/capture.ts) with the HUD
// over it (html-to-image, loaded only when a report is made).

import { Capacitor } from '@capacitor/core';
import { insert, online, upload } from '../engine/backend';
import { onBack } from '../engine/backButton';
import { nextFrame } from '../engine/render/capture';
import { playerId } from './profile';

/** What a report is about: the circuit and the mode, when it's made in a race. */
export interface ReportAbout {
  circuit?: string;
  mode?: string;
}

/** A stroke drawn on the picture: its colour, its width (px of the picture) and its points (px of the picture). */
export interface Stroke {
  color: string;
  width: number;
  points: { x: number; y: number }[];
}

/** The pens: red (the default), amber, cyan, white. */
export const PENS = ['#d8323c', '#f2c14e', '#5fe0d0', '#f4f4f8'];

/** The most a report says, in characters (the database's limit too). */
export const REPORT_TEXT_MAX = 1000;

/** px: the longest side of the picture sent */
const LONGEST = 1280;

/** The build's version (package version and commit). */
const version = (): string => (typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev').slice(0, 40);

/** Where a report's picture goes in the bucket: by the day it was made (UTC), under a random name. */
export function reportPath(now: Date, id: string): string {
  return `${now.toISOString().slice(0, 10)}/${id}.jpg`;
}

/** A report's row in the 'reports' table: who (the device's random id), on what, where, what they said, and the picture's path (if it went). */
export function reportRow(r: { player: string; platform: 'web' | 'android'; version: string; about: ReportAbout; screen: string; text: string; image?: string; picture?: string }) {
  return {
    player: r.player, platform: r.platform, version: r.version, circuit: r.about.circuit ?? null, mode: r.about.mode ?? null,
    screen: r.screen.slice(0, 20), text: r.text.trim().slice(0, REPORT_TEXT_MAX), image: r.image ?? null,
    picture: r.picture && r.picture.length <= PICTURE_MAX ? r.picture : null,
  };
}

/** px: the longest side of the copy of the picture kept with the report, for the dashboard; and its most characters (the database's limit) */
export const PICTURE_SIDE = 960;
export const PICTURE_MAX = 1_500_000;

/** `canvas` as the copy kept with the report: at most PICTURE_SIDE px on its longest side, a JPEG data URL. */
function pictureOf(canvas: HTMLCanvasElement): string {
  const scale = Math.min(1, PICTURE_SIDE / Math.max(canvas.width, canvas.height));
  const small = document.createElement('canvas');
  small.width = Math.round(canvas.width * scale);
  small.height = Math.round(canvas.height * scale);
  small.getContext('2d')!.drawImage(canvas, 0, 0, small.width, small.height);
  // (a little smaller again if it's too big for the database)
  for (const q of [0.8, 0.6, 0.4]) {
    const url = small.toDataURL('image/jpeg', q);
    if (url.length <= PICTURE_MAX) return url;
  }
  return '';
}

/** a report being made (the game leaves its controls alone while it is: set once the picture's taken, the game drawing till then), and one on its way (its picture being taken) */
let open = false;
let busy = false;
/** Whether a report is being made (the game's controls are the report's till it's sent or cancelled). */
export const reportOpen = () => open;

const randomId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);

/**
 * The game as it is on the screen, `hide` (the pause screen) out of the way: the 3D picture copied as it's next drawn,
 * put back where its canvas is for a moment, and the page over it drawn into one picture, at most LONGEST px on its
 * longest side.
 */
async function screenshot(hide: HTMLElement[]): Promise<HTMLCanvasElement> {
  const was = hide.map((el) => el.style.visibility);
  hide.forEach((el) => (el.style.visibility = 'hidden'));
  const frame = await nextFrame();
  // (the 3D picture as a still in its canvas's place, as the page is drawn: the canvas itself can't be read now)
  let still: HTMLImageElement | undefined;
  let source: HTMLCanvasElement | undefined;
  if (frame) {
    source = frame.from;
    still = document.createElement('img');
    still.src = frame.copy.toDataURL('image/png');
    still.style.cssText = source.style.cssText;
    const r = source.getBoundingClientRect();
    Object.assign(still.style, { width: `${r.width}px`, height: `${r.height}px` });
    await still.decode().catch(() => {});
    source.after(still);
    source.style.display = 'none';
  }
  const ratio = Math.min(window.devicePixelRatio || 1, LONGEST / Math.max(window.innerWidth, window.innerHeight));
  let picture: HTMLCanvasElement | undefined;
  try {
    const { toCanvas } = await import('html-to-image');
    picture = await toCanvas(document.body, { pixelRatio: ratio, width: window.innerWidth, height: window.innerHeight, filter: (n) => !(n instanceof HTMLElement && n.dataset.report !== undefined) });
  } catch {
    // (the page couldn't be drawn: the 3D picture alone)
  }
  if (still && source) {
    still.remove();
    source.style.display = '';
  }
  hide.forEach((el, k) => (el.style.visibility = was[k]));
  if (picture) return picture;
  if (frame) return frame.copy;
  const blank = document.createElement('canvas');
  blank.width = 640;
  blank.height = 360;
  const x = blank.getContext('2d')!;
  x.fillStyle = '#0e0d16';
  x.fillRect(0, 0, blank.width, blank.height);
  return blank;
}

/** Draw `strokes` on `x`, over the picture already on it. */
export function drawStrokes(x: CanvasRenderingContext2D, strokes: Stroke[]): void {
  x.lineCap = 'round';
  x.lineJoin = 'round';
  for (const s of strokes) {
    x.strokeStyle = s.color;
    x.lineWidth = s.width;
    x.beginPath();
    s.points.forEach((p, k) => (k ? x.lineTo(p.x, p.y) : x.moveTo(p.x, p.y)));
    // (a dot for a tap)
    if (s.points.length === 1) x.lineTo(s.points[0].x + 0.01, s.points[0].y);
    x.stroke();
  }
}

/** A button, picked on the press's release (not 'click': in a cross-origin frame on a phone a tap's click can go astray). */
const button = (text: string, onPick: () => void, cls = 'menu-button') => {
  const b = document.createElement('button');
  b.className = cls;
  b.textContent = text;
  b.type = 'button';
  let armed = false;
  b.addEventListener('pointerdown', () => (armed = true));
  b.addEventListener('pointerleave', () => (armed = false));
  b.addEventListener('pointerup', () => {
    if (armed && !b.disabled) onPick();
    armed = false;
  });
  return b;
};

/**
 * Make a report: a screenshot of the game now (`hide` out of the way first), drawn on and said what happened under,
 * then sent (or cancelled). `about`: the circuit and mode, in a race. `done` once it's closed.
 */
export async function openReport(about: ReportAbout = {}, hide: HTMLElement[] = [], done?: () => void): Promise<void> {
  if (busy) return;
  busy = true;
  const shot = await screenshot(hide);
  open = true;
  // (the picture sent: at most LONGEST px on its longest side)
  const scale = Math.min(1, LONGEST / Math.max(shot.width, shot.height));
  const W = Math.round(shot.width * scale);
  const H = Math.round(shot.height * scale);
  const base = document.createElement('canvas');
  base.width = W;
  base.height = H;
  base.getContext('2d')!.drawImage(shot, 0, 0, W, H);

  const overlay = document.createElement('div');
  overlay.dataset.report = '';
  overlay.className = 'report';
  const title = document.createElement('h2');
  title.textContent = 'REPORT';
  const hint = document.createElement('p');
  hint.className = 'report-hint';
  hint.textContent = 'DRAW ON THE PICTURE TO SHOW WHERE';

  // the picture, drawn on with the pointer (a finger, a mouse, a pen)
  const canvas = document.createElement('canvas');
  canvas.className = 'report-picture';
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const strokes: Stroke[] = [];
  let pen = PENS[0];
  const redraw = () => {
    ctx.drawImage(base, 0, 0);
    drawStrokes(ctx, strokes);
  };
  redraw();
  const at = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  let drawing: Stroke | undefined;
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    // (a line about as thick on any screen: 4 px of the picture as shown)
    const shown = canvas.getBoundingClientRect().width || W;
    drawing = { color: pen, width: Math.max(3, (5 * W) / shown), points: [at(e)] };
    strokes.push(drawing);
    redraw();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    drawing.points.push(at(e));
    redraw();
  });
  const lift = () => (drawing = undefined);
  canvas.addEventListener('pointerup', lift);
  canvas.addEventListener('pointercancel', lift);

  // the pens, and undo and clear
  const tools = document.createElement('div');
  tools.className = 'report-tools';
  const swatches = PENS.map((c) => {
    const s = button('', () => {
      pen = c;
      swatches.forEach((x) => x.classList.toggle('on', x === s));
    }, 'report-pen');
    s.style.background = c;
    s.setAttribute('aria-label', `pen ${c}`);
    return s;
  });
  swatches[0].classList.add('on');
  const undo = button('UNDO', () => {
    strokes.pop();
    redraw();
  }, 'menu-button report-small');
  const clear = button('CLEAR', () => {
    strokes.length = 0;
    redraw();
  }, 'menu-button report-small');
  tools.append(...swatches, undo, clear);

  const text = document.createElement('textarea');
  text.className = 'report-text';
  text.maxLength = REPORT_TEXT_MAX;
  text.rows = 3;
  text.placeholder = 'WHAT HAPPENED?';

  const status = document.createElement('p');
  status.className = 'report-status';
  const actions = document.createElement('div');
  actions.className = 'report-actions';
  let offBack = () => {};
  const close = () => {
    offBack();
    overlay.remove();
    open = false;
    busy = false;
    done?.();
  };
  const cancel = button('CANCEL', close);
  const send = button('SEND', () => void sendIt());
  actions.append(cancel, send);
  overlay.append(title, hint, canvas, tools, text, actions, status);
  document.body.append(overlay);
  offBack = onBack(() => {
    close();
    return true;
  });

  const sendIt = async () => {
    if (!online()) {
      status.textContent = "REPORTS AREN'T SET UP IN THIS BUILD";
      return;
    }
    send.disabled = true;
    status.textContent = 'SENDING…';
    const picture = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    const path = reportPath(new Date(), randomId());
    // (the picture first; the words go even if it doesn't)
    const sentPicture = picture ? await upload('reports', path, picture) : 'refused';
    const row = reportRow({
      player: playerId(), platform: Capacitor.isNativePlatform() ? 'android' : 'web', version: version(), about,
      screen: `${window.innerWidth}x${window.innerHeight}`, text: text.value, image: sentPicture === 'ok' ? path : undefined, picture: pictureOf(canvas),
    });
    let sent = await insert('reports', [row]);
    // (refused: a project whose schema is older than the picture's column takes it without)
    if (sent === 'refused' && row.picture) sent = await insert('reports', [{ ...row, picture: undefined }]);
    if (sent === 'ok') {
      status.textContent = 'SENT · THANK YOU!';
      setTimeout(close, 1200);
    } else {
      status.textContent = sent === 'offline' ? "COULDN'T SEND: NO CONNECTION. TRY AGAIN" : "COULDN'T SEND. TRY AGAIN";
      send.disabled = false;
    }
  };
}
