// REPORT (the pause screen, the corner of every menu screen): a screenshot of the game as
// it was, to draw on (to show where) and say what happened under, sent to the
// game's backend: the picture to the 'reports' storage bucket, the words and
// where it was to the 'reports' table (supabase/schema.sql). The screenshot is
// the 3D picture (copied as it's drawn: engine/render/capture.ts) with the HUD
// over it (html-to-image, loaded only when a report is made).

import { platformName, type Platform } from '../engine/platform';
import { insert, online, upload } from '../engine/backend';
import { onBack } from '../engine/backButton';
import { device, latestFrames, lines, note, type Device, type FrameStats } from '../engine/logbook';
import { nextFrame } from '../engine/render/capture';
import { playerId } from './profile';
import { t } from '../engine/i18n';

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
/** What each pen is called, for a screen reader (the colour code means nothing read aloud). */
export const PEN_NAMES = ['red', 'amber', 'cyan', 'white'];

/** The most a report says, in characters (the database's limit too). */
export const REPORT_TEXT_MAX = 1000;

/** the page's fonts, made ready for a screenshot (the first report's work, kept for the rest) */
let fontEmbedCSS: string | undefined;

/** px: the longest side of the picture sent */
const LONGEST = 1280;

/** The build's version (package version and commit). */
const version = (): string => (typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev').slice(0, 40);

/** Where a report's picture goes in the bucket: by the day it was made (UTC), under a random name. */
export function reportPath(now: Date, id: string): string {
  return `${now.toISOString().slice(0, 10)}/${id}.jpg`;
}

/** A report's row in the 'reports' table: who (the device's random id), on what, where, what they said, and the picture's path (if it went). */
export function reportRow(r: { player: string; platform: Platform; version: string; about: ReportAbout; screen: string; text: string; image?: string; picture?: string; log?: ReportLog }) {
  return {
    player: r.player, platform: r.platform, version: r.version, circuit: r.about.circuit ?? null, mode: r.about.mode ?? null,
    screen: r.screen.slice(0, 20), text: r.text.trim().slice(0, REPORT_TEXT_MAX), image: r.image ?? null,
    picture: r.picture && r.picture.length <= PICTURE_MAX ? r.picture : null,
    ...(r.log ? { log: r.log } : {}),
  };
}

/** What a report carries of the logbook (engine/logbook.ts): the device, and the notes of what led up to it. */
export interface ReportLog {
  device: Device;
  notes: string[];
  /** how the frames were going just before (the latest 5 s judged) */
  frames?: FrameStats;
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
  // (straight away, before the work: a word that it's being taken, kept out of the picture; and a frame for it to show)
  const note = document.createElement('div');
  note.className = 'report-taking';
  note.dataset.report = '';
  note.textContent = t('TAKING A PICTURE…');
  document.body.append(note);
  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  const was = hide.map((el) => el.style.visibility);
  hide.forEach((el) => (el.style.visibility = 'hidden'));
  const frame = await nextFrame();
  const ratio = Math.min(window.devicePixelRatio || 1, LONGEST / Math.max(window.innerWidth, window.innerHeight));
  // (the 3D picture as a still in its canvas's place, as the page is drawn: the canvas itself can't be read now; made
  // the picture's size first, and a JPEG: a phone's full-size frame as a PNG is a long wait)
  let still: HTMLImageElement | undefined;
  let source: HTMLCanvasElement | undefined;
  if (frame) {
    source = frame.from;
    const r = source.getBoundingClientRect();
    const small = document.createElement('canvas');
    small.width = Math.max(1, Math.round(r.width * ratio));
    small.height = Math.max(1, Math.round(r.height * ratio));
    small.getContext('2d')?.drawImage(frame.copy, 0, 0, small.width, small.height);
    still = document.createElement('img');
    still.src = small.toDataURL('image/jpeg', 0.92);
    still.style.cssText = source.style.cssText;
    Object.assign(still.style, { width: `${r.width}px`, height: `${r.height}px` });
    await still.decode().catch(() => {});
    source.after(still);
    source.style.display = 'none';
  }
  let picture: HTMLCanvasElement | undefined;
  try {
    const { toCanvas, getFontEmbedCSS } = await import('html-to-image');
    // (only what's on the screen: the menus keep every screen of theirs in the page, hidden, and copying each part's
    // styles is most of the work; and the fonts made ready once, not each time)
    const shown = (n: Node) => !(n instanceof HTMLElement && (n.dataset.report !== undefined || getComputedStyle(n).display === 'none'));
    fontEmbedCSS ??= await getFontEmbedCSS(document.body).catch(() => '');
    picture = await toCanvas(document.body, { pixelRatio: ratio, width: window.innerWidth, height: window.innerHeight, filter: shown, fontEmbedCSS });
  } catch {
    // (the page couldn't be drawn: the 3D picture alone)
  }
  note.remove();
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
  // (the notes of what led up to it, as REPORT is pressed: not what's done in the report itself)
  note('report opened');
  const shotNotes = lines();
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
  title.textContent = t('REPORT');
  const hint = document.createElement('p');
  hint.className = 'report-hint';
  hint.textContent = t('DRAW ON THE PICTURE TO SHOW WHERE');

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
  const swatches = PENS.map((c, k) => {
    const s = button('', () => {
      pen = c;
      swatches.forEach((x) => x.classList.toggle('on', x === s));
    }, 'report-pen');
    s.style.background = c;
    s.setAttribute('aria-label', t('{colour} pen', { colour: t(PEN_NAMES[k]) }));
    s.title = t(PEN_NAMES[k]);
    return s;
  });
  swatches[0].classList.add('on');
  const undo = button(t('UNDO'), () => {
    strokes.pop();
    redraw();
  }, 'menu-button report-small');
  const clear = button(t('CLEAR'), () => {
    strokes.length = 0;
    redraw();
  }, 'menu-button report-small');
  tools.append(...swatches, undo, clear);

  const text = document.createElement('textarea');
  text.className = 'report-text';
  text.maxLength = REPORT_TEXT_MAX;
  text.rows = 3;
  text.placeholder = t('WHAT HAPPENED?');

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
  const cancel = button(t('CANCEL'), close);
  const send = button(t('SEND'), () => void sendIt());
  actions.append(cancel, send);
  overlay.append(title, hint, canvas, tools, text, actions, status);
  document.body.append(overlay);
  offBack = onBack(() => {
    close();
    return true;
  });

  const sendIt = async () => {
    if (!online()) {
      status.textContent = t("REPORTS AREN'T SET UP IN THIS BUILD");
      return;
    }
    send.disabled = true;
    status.textContent = t('SENDING…');
    const picture = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    const path = reportPath(new Date(), randomId());
    // (the picture first; the words go even if it doesn't)
    const sentPicture = picture ? await upload('reports', path, picture) : 'refused';
    const row = reportRow({
      player: playerId(), platform: platformName(), version: version(), about,
      screen: `${window.innerWidth}x${window.innerHeight}`, text: text.value, image: sentPicture === 'ok' ? path : undefined, picture: pictureOf(canvas),
      log: { device: device(), notes: shotNotes, frames: latestFrames() },
    });
    let sent = await insert('reports', [row]);
    // (refused: a project whose schema is older than the log's column, or the picture's, takes it without them)
    if (sent === 'refused') sent = await insert('reports', [{ ...row, log: undefined }]);
    if (sent === 'refused' && row.picture) sent = await insert('reports', [{ ...row, log: undefined, picture: undefined }]);
    if (sent === 'ok') {
      status.textContent = t('SENT · THANK YOU!');
      setTimeout(close, 1200);
    } else {
      status.textContent = t(sent === 'offline' ? "COULDN'T SEND: NO CONNECTION. TRY AGAIN" : "COULDN'T SEND. TRY AGAIN");
      send.disabled = false;
    }
  };
}
