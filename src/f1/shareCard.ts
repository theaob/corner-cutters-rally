// The result card to share: a square picture of how you did (your place, or a
// Time Attack's distance, in words, between two cups in its medal's colour), the circuit (its map), the mode, your team
// in its colours and a few numbers, under the game's name; and the line of text
// that goes with it. Everything on the card is centred. The card's content is
// worked out engine-free (`raceCard`, `attackCard`, `shareText`); `drawCard`
// paints it.

import { MEDAL_COLOR, MEDAL_NAME, type Medal } from './medals';

/** Where the game is played (on the card and in the text). */
export const SHARE_URL = (import.meta.env?.VITE_SHARE_URL as string | undefined) || 'theaob.itch.io/corner-cutters';

export interface ShareCard {
  circuit: string;
  /** the mode and how it was run (QUICK RACE · NORMAL · DRY) */
  mode: string;
  /** big in the middle (P1, 5 LAPS + 1 SECTOR: on two lines, split before the +), in `color` */
  headline: string;
  color: string;
  /** under it (WINNER, PODIUM, +3.21 S, GOLD MEDAL) */
  sub: string;
  medal?: Medal;
  /** your team: its name and colours */
  team: { name: string; body: string; trim: string };
  /** a few numbers, side by side (label, value) */
  stats: [string, string][];
  /** the day (YYYY-MM-DD) */
  date: string;
  /** a Championship's card (its text says so): the season over, or after how many of its rounds */
  season?: { over: boolean; round: number; rounds: number };
}

const PLACE_COLOR = ['#f2c14e', '#c9ccd6', '#c8803a'];

/** A race's card: finishing `place` of `field` (undefined: DNF), from grid slot `grid`. */
export function raceCard(r: {
  circuit: string; mode: string; place?: number; field: number; grid: number; gap?: number; best?: string; fastest: boolean;
  team: ShareCard['team']; date: string;
}): ShareCard {
  const p = r.place;
  const moved = p === undefined ? 0 : r.grid - p;
  return {
    circuit: r.circuit, mode: r.mode, team: r.team, date: r.date,
    headline: p === undefined ? 'DNF' : `P${p}`,
    color: p === undefined ? '#d8323c' : PLACE_COLOR[p - 1] ?? '#f4f4f8',
    sub: p === undefined ? 'OUT OF THE RACE' : p === 1 ? 'WINNER' : p <= 3 ? `PODIUM · +${(r.gap ?? 0).toFixed(2)} S` : `+${(r.gap ?? 0).toFixed(2)} S`,
    stats: [
      ['GRID', `P${r.grid}`],
      ['PLACES', p === undefined ? '–' : moved > 0 ? `▲${moved}` : moved < 0 ? `▼${-moved}` : '–'],
      [r.fastest ? 'FASTEST LAP' : 'BEST LAP', r.best ?? '–'],
    ],
  };
}

/** A Time Attack's card: `distance` reached (in words: 5 LAPS + 1 SECTOR), the medal, and whether it's a record. */
export function attackCard(a: {
  circuit: string; mode: string; distance: string; medal?: Medal; record: boolean; best?: string; place?: string; team: ShareCard['team']; date: string;
}): ShareCard {
  return {
    circuit: a.circuit, mode: a.mode, team: a.team, date: a.date, medal: a.medal,
    headline: a.distance, color: a.medal ? MEDAL_COLOR[a.medal] : '#f4f4f8',
    sub: a.medal ? `${MEDAL_NAME[a.medal]} MEDAL${a.record ? ' · NEW RECORD' : ''}` : a.record ? 'NEW RECORD' : 'TIME UP',
    stats: [['REACHED', a.distance], ['BEST', a.best ?? a.distance], ...(a.place ? [['TODAY', a.place] as [string, string]] : [])],
  };
}

/**
 * A Championship's card: your place in the standings (`place`, of `field`) with your points, wins and podiums; the
 * season over (the title, or the podium, between cups in its colour) or after `round` of its `rounds`.
 */
export function seasonCard(s: {
  mode: string; place: number; field: number; points: number; wins: number; podiums: number; round: number; rounds: number; over: boolean;
  team: ShareCard['team']; date: string;
}): ShareCard {
  const medal: Medal | undefined = s.over ? (['gold', 'silver', 'bronze'] as const)[s.place - 1] : undefined;
  return {
    circuit: 'CHAMPIONSHIP', mode: s.mode, team: s.team, date: s.date, medal, season: { over: s.over, round: s.round, rounds: s.rounds },
    headline: `P${s.place}`, color: PLACE_COLOR[s.place - 1] ?? '#f4f4f8',
    sub: s.over ? (s.place === 1 ? 'CHAMPION' : `P${s.place} OF ${s.field} IN THE STANDINGS`) : `AFTER ROUND ${s.round} OF ${s.rounds}`,
    stats: [['POINTS', String(s.points)], ['WINS', String(s.wins)], ['PODIUMS', String(s.podiums)]],
  };
}

/** The text that goes with the card. */
export function shareText(c: ShareCard): string {
  if (c.season) {
    const how = c.season.over
      ? c.sub === 'CHAMPION' ? 'won the championship 🏆' : `finished the championship ${c.headline}`
      : `am ${c.headline} in the championship after round ${c.season.round} of ${c.season.rounds}`;
    return `I ${how} in Corner Cutters 🏁 Can you beat it? https://${SHARE_URL}`;
  }
  const how = c.headline === 'DNF' ? 'crashed out' : /^P\d+$/.test(c.headline) ? `finished ${c.headline}` : `reached ${c.headline.toLowerCase()}`;
  return `I ${how} at ${titleCase(c.circuit)} in Corner Cutters 🏁 ${c.sub === 'WINNER' ? '🏆 ' : ''}Can you beat it? https://${SHARE_URL}`;
}
const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());

/** The card's file name. */
export const cardFile = (c: ShareCard) => `corner-cutters-${c.circuit.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${c.date}.png`;

/** px: the card's size (square, for any feed) */
export const CARD = 1080;

/** Paint `c` on `ctx` (CARD × CARD), the circuit's `map` in the middle when given. */
export function drawCard(ctx: CanvasRenderingContext2D, c: ShareCard, map?: CanvasImageSource & { width: number; height: number }): void {
  const W = CARD;
  const mid = W / 2;
  const font = (px: number) => `${px}px Silkscreen, monospace`;
  const text = (s: string, y: number, px: number, color: string, maxW = W - 120) => {
    let size = px;
    ctx.font = font(size);
    while (size > 16 && ctx.measureText(s).width > maxW) ctx.font = font((size -= 2));
    ctx.fillStyle = color;
    ctx.fillText(s, mid, y);
  };
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.imageSmoothingEnabled = false;
  // the night-blue ground, a band of your team's colours across the top and the bottom, a frame round it all
  ctx.fillStyle = '#0e0d16';
  ctx.fillRect(0, 0, W, W);
  for (const [y, h] of [[0, 28], [W - 28, 28]] as const) {
    ctx.fillStyle = c.team.body;
    ctx.fillRect(0, y, W, h);
    ctx.fillStyle = c.team.trim;
    ctx.fillRect(0, y === 0 ? 28 : W - 36, W, 8);
  }
  ctx.strokeStyle = '#2a2840';
  ctx.lineWidth = 4;
  ctx.strokeRect(36, 60, W - 72, W - 120);
  // the chequers either side of the game's name
  const chequer = (x: number) => {
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) {
      ctx.fillStyle = (i + j) % 2 ? '#f4f4f8' : '#1b1b26';
      ctx.fillRect(x + i * 14, 102 + j * 14, 14, 14);
    }
  };
  ctx.font = font(48);
  const nameW = ctx.measureText('CORNER CUTTERS').width;
  chequer(mid - nameW / 2 - 84);
  chequer(mid + nameW / 2 + 28);
  text('CORNER CUTTERS', 116, 48, '#f2c14e');
  text(c.circuit, 200, 56, '#f4f4f8');
  text(c.mode, 258, 26, '#9d9ab8');
  // the circuit's map, faint, behind your result
  if (map && map.width && map.height) {
    const fit = Math.min(560 / map.width, 360 / map.height);
    const w = map.width * fit;
    const h = map.height * fit;
    ctx.globalAlpha = 0.45;
    ctx.drawImage(map, mid - w / 2, 470 - h / 2, w, h);
    ctx.globalAlpha = 1;
  }
  // your result, big (a distance with a sector in it on two lines), between two cups in its medal's colour
  const lines = splitDistance(c.headline);
  const place = /^P\d+$/.test(c.headline) || c.headline === 'DNF';
  const cupW = 96;
  // (the room left between the cups)
  const room = c.medal ? W - 120 - 2 * (cupW + 48) : W - 120;
  let size = place ? 200 : lines.length > 1 ? 104 : 132;
  ctx.font = font(size);
  while (size > 24 && Math.max(...lines.map((l) => ctx.measureText(l).width)) > room) ctx.font = font((size -= 2));
  const lineH = size * 1.1;
  const top = 470 - ((lines.length - 1) * lineH) / 2;
  lines.forEach((l, k) => {
    ctx.fillStyle = '#1b1b26';
    ctx.fillText(l, mid, top + k * lineH + 8);
    ctx.fillStyle = c.color;
    ctx.fillText(l, mid, top + k * lineH);
  });
  if (c.medal) {
    const half = Math.max(...lines.map((l) => ctx.measureText(l).width)) / 2;
    for (const x of [mid - half - 48 - cupW, mid + half + 48]) cup(ctx, x, 470 - (cupW * 7) / 12 + 8, cupW, MEDAL_COLOR[c.medal]);
  }
  text(c.sub, 680, 40, c.color);
  // the numbers, in boxes side by side
  const n = c.stats.length;
  const boxW = 280;
  const gap = 24;
  const left = mid - (n * boxW + (n - 1) * gap) / 2;
  c.stats.forEach(([label, value], k) => {
    const x = left + k * (boxW + gap);
    ctx.fillStyle = '#1b1a2b';
    ctx.fillRect(x, 750, boxW, 120);
    ctx.fillStyle = c.team.body;
    ctx.fillRect(x, 750, boxW, 6);
    const cx = x + boxW / 2;
    ctx.font = font(22);
    ctx.fillStyle = '#9d9ab8';
    ctx.fillText(label, cx, 792);
    // (a distance with a sector in it on two lines, smaller)
    const parts = splitDistance(value);
    let size = parts.length > 1 ? 28 : 38;
    ctx.font = font(size);
    while (size > 16 && Math.max(...parts.map((v) => ctx.measureText(v).width)) > boxW - 24) ctx.font = font((size -= 2));
    ctx.fillStyle = '#f4f4f8';
    parts.forEach((v, i) => ctx.fillText(v, cx, 836 + (i - (parts.length - 1) / 2) * (size + 4)));
  });
  text(c.team.name.toUpperCase(), 925, 28, '#f4f4f8');
  text(`${c.date} · ${SHARE_URL.toUpperCase()}`, 975, 22, '#6c6a88');
}

/** A distance's lines on the card: '5 LAPS + 1 SECTOR' on two, split before the +; anything else on one. */
export const splitDistance = (s: string): string[] => s.split(/ (?=\+ )/);

/** A cup, `w` px across (and 7/6 of that high), its top left at (x, y), in `color`: a pixel trophy, handles either side. */
function cup(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, color: string): void {
  // (12 × 14 pixels: the bowl with its rim and handles, the stem, the base)
  const art = [
    '.##########.',
    '############',
    '##.######.##',
    '#..######..#',
    '#..######..#',
    '##.######.##',
    '.##########.',
    '...######...',
    '....####....',
    '.....##.....',
    '.....##.....',
    '....####....',
    '...######...',
    '..########..',
  ];
  const px = w / 12;
  // (its shadow first, a little down)
  for (const [shade, dy] of [['#1b1b26', px], [color, 0]] as const) {
    ctx.fillStyle = shade;
    art.forEach((row, j) => [...row].forEach((ch, i) => ch === '#' && ctx.fillRect(Math.round(x + i * px), Math.round(y + j * px + dy), Math.ceil(px), Math.ceil(px))));
  }
  // (a shine on the bowl)
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillRect(Math.round(x + 4 * px), Math.round(y + 2 * px), Math.ceil(px), Math.ceil(3 * px));
}

/** The card as a PNG. */
export async function cardPng(c: ShareCard, map?: CanvasImageSource & { width: number; height: number }): Promise<Blob> {
  // (the pixel font, before drawing with it)
  try {
    await document.fonts?.load('48px Silkscreen');
  } catch {
    // (the fallback font then)
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = CARD;
  drawCard(canvas.getContext('2d')!, c, map);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('no picture'))), 'image/png'));
}
