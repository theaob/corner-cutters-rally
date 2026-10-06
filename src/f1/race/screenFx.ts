// The race's effects drawn over the picture, each on a canvas of its own: the
// rush of speed (pale streaks flowing past the screen's edges near top speed
// and in a tow, the way the car's going), the rain (streaks falling at a slant),
// and your chequered flag (a big waving one for a few seconds as you cross the
// line).

import { style } from './dom';

/** The rush of speed: streaks round the edges of the screen (none in the middle, where the racing is). */
export function createStreaks() {
  const el = document.createElement('canvas');
  style(el, { position: 'absolute', inset: '0', width: '100%', height: '100%', zIndex: '1', pointerEvents: 'none' });
  const ctx = el.getContext('2d')!;
  const streakAt = () => ({ x: Math.random(), y: Math.random(), len: 0.05 + Math.random() * 0.07, v: 1.4 + Math.random() * 1.4 });
  const list = Array.from({ length: 28 }, streakAt);
  /** Draw the streaks for `rush` (0…1), flowing back from the way the car's going on the screen (`dx`, `dy`, a unit vector). */
  const draw = (dt: number, rush: number, dx: number, dy: number) => {
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (el.width !== w || el.height !== h) [el.width, el.height] = [w, h];
    ctx.clearRect(0, 0, w, h);
    if (rush < 0.02) return;
    ctx.strokeStyle = `rgba(244,242,250,${(0.5 * rush).toFixed(3)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const st of list) {
      st.x -= dx * st.v * rush * dt;
      st.y -= dy * st.v * rush * dt;
      if (st.x < -0.1 || st.x > 1.1 || st.y < -0.1 || st.y > 1.1) Object.assign(st, streakAt());
      // (only round the edges: outside an oval over the middle)
      const ox = (st.x - 0.5) / 0.5;
      const oy = (st.y - 0.5) / 0.5;
      if (ox * ox + oy * oy < 0.55) continue;
      const len = st.len * h * (0.5 + rush);
      ctx.moveTo(Math.round(st.x * w), Math.round(st.y * h));
      ctx.lineTo(Math.round(st.x * w - dx * len), Math.round(st.y * h - dy * len));
    }
    ctx.stroke();
  };
  return { el, draw };
}

/** Rain over the picture: streaks falling at a slant, under the readouts. */
export function createRain() {
  const el = document.createElement('canvas');
  style(el, { position: 'absolute', inset: '0', width: '100%', height: '100%', zIndex: '1', pointerEvents: 'none', display: 'none' });
  const ctx = el.getContext('2d')!;
  // (as many drops as the heaviest rain has: as many of them drawn as it's raining now)
  const drops = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random(), v: 0.9 + Math.random() * 0.6 }));
  /** Draw the rain for `rain` (0…1: how hard it's raining). */
  const draw = (dt: number, rain: number) => {
    const falling = Math.round(drops.length * rain);
    el.style.display = falling > 0 ? 'block' : 'none';
    if (falling <= 0) return;
    const w = (el.width = el.clientWidth);
    const h = (el.height = el.clientHeight);
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(210,220,236,.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const d of drops.slice(0, falling)) {
      d.y += d.v * dt * 1.6;
      d.x -= d.v * dt * 0.25;
      if (d.y > 1) Object.assign(d, { y: d.y - 1, x: Math.random() + 0.1 });
      if (d.x < 0) d.x += 1.1;
      const px = d.x * w;
      const py = d.y * h;
      ctx.moveTo(px, py);
      ctx.lineTo(px + 4, py - 16);
    }
    ctx.stroke();
  };
  return { el, draw };
}

/** Your chequered flag: a big waving one over the picture for a few seconds as you cross the line. */
export function createFlagOverlay() {
  const el = document.createElement('canvas');
  el.width = 168;
  el.height = 112;
  style(el, { position: 'absolute', left: '50%', top: 'calc(30% + 34px)', transform: 'translateX(-50%)', width: '168px', height: '112px', zIndex: '3', pointerEvents: 'none', display: 'none', imageRendering: 'pixelated' });
  const ctx = el.getContext('2d')!;
  /** Draw the waving flag at `t` s: a pole, and 8 × 5 squares, each column lifted and shaded by a wave running along it. */
  const draw = (t: number) => {
    ctx.clearRect(0, 0, 168, 112);
    ctx.fillStyle = '#c9ccd4';
    ctx.fillRect(8, 6, 4, 104);
    const cell = 18;
    for (let c = 0; c < 8; c++) {
      const phase = c * 0.8 - t * 9;
      const lift = Math.sin(phase) * 5 * ((c + 1) / 8);
      const light = 0.78 + 0.22 * Math.cos(phase);
      for (let r = 0; r < 5; r++) {
        const white = (c + r) % 2 === 0;
        const v = Math.round((white ? 244 : 21) * light);
        ctx.fillStyle = `rgb(${v},${v},${white ? Math.round(248 * light) : Math.round(31 * light)})`;
        ctx.fillRect(12 + c * cell, 8 + r * cell + lift, cell, cell);
      }
    }
  };
  return { el, draw };
}
