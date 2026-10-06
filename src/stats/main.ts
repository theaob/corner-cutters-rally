// The play-stats dashboard (stats.html): the totals from the game's Supabase project (game_stats(), supabase/schema.sql)
// and today's Daily Challenge board, read with the public key the game uses, every minute.

import { online, rpc } from '../engine/backend';
import { challengeOn, dayOf, type Board } from '../f1/daily';
import { LAYOUTS } from '../f1/layouts';
import { TEAMS } from '../f1/teams';
import { distance } from '../f1/timeAttack';

/** What game_stats() gives. */
interface Stats {
  players: number;
  players_today: number;
  players_7d: number;
  launches: number;
  launches_today: number;
  races_started: number;
  races_finished: number;
  km: number;
  shares: number;
  /** REPORTs sent, all time and today (read them in Supabase: the reports table and bucket) */
  reports?: number;
  reports_today?: number;
  /** errors nothing caught in the game, all time and today (their messages: errors_list, with the code) */
  errors?: number;
  errors_today?: number;
  median_session_secs?: number;
  mean_session_secs?: number;
  hours_played?: number;
  returning_players?: number;
  races_per_player?: number;
  by_team?: Record<string, number>;
  by_driver?: Record<string, number>;
  daily_players_today: number;
  by_platform: Record<string, number>;
  by_mode: Record<string, number>;
  by_circuit: Record<string, number>;
  daily_players: { day: string; players: number }[];
  daily_launches?: { day: string; launches: number }[];
  daily_seconds?: { day: string; seconds: number }[];
  /** each circuit's sessions started, races finished, km and minutes on it, all of it and by mode (the most played first) */
  circuits?: CircuitStats[];
}

interface Played {
  plays: number;
  finishes?: number;
  km: number;
  minutes: number;
}
interface CircuitStats extends Played {
  circuit: string;
  modes: Record<string, Played>;
}

const $ = (id: string) => document.getElementById(id)!;
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const MODE_NAMES: Record<string, string> = {
  race: 'Quick Race', championship: 'Championship', timeattack: 'Time Attack', timetrial: 'Time Trial', daily: 'Daily Challenge', qualifying: 'Qualifying', tutorial: 'Controls lap',
};
/** the menu screens a report can come from */
const MENU_NAMES: Record<string, string> = { menu: 'the menu', championship: 'the Championship screen', daily: 'the Daily Challenge screen', shop: 'the Championship shop' };
const PLATFORM_NAMES: Record<string, string> = { web: 'Web (itch.io)', android: 'Android app' };
const circuitName = (id: string) => LAYOUTS.find((l) => l.id === id)?.name ?? id;

function status(text: string, state: 'on' | 'off' | '') {
  $('status').textContent = text;
  $('dot').className = `dot ${state}`;
}

function tile(k: string, v: string, s = '') {
  const el = document.createElement('div');
  el.className = 'tile';
  el.innerHTML = '<span class="k"></span><span class="v"></span><span class="s"></span>';
  (el.children[0] as HTMLElement).textContent = k;
  (el.children[1] as HTMLElement).textContent = v;
  (el.children[2] as HTMLElement).textContent = s;
  return el;
}

function tiles(s: Stats) {
  const finishRate = s.races_started ? Math.round((s.races_finished / s.races_started) * 100) : 0;
  $('tiles').replaceChildren(
    tile('PLAYERS', fmt(s.players), `${fmt(s.players_7d)} in the last 7 days`),
    tile('PLAYING TODAY', fmt(s.players_today), `${fmt(s.launches_today)} launches today`),
    tile('LAUNCHES', fmt(s.launches), 'all time'),
    tile('RACES', fmt(s.races_finished), `of ${fmt(s.races_started)} started · ${finishRate}% finished · ${s.races_per_player ?? 0} per player`),
    tile('KM DRIVEN', fmt(s.km), `${fmt(s.km * 0.621371)} miles`),
    tile('TIME PER VISIT', clock(s.median_session_secs ?? 0), `median · mean ${clock(s.mean_session_secs ?? 0)}`),
    tile('HOURS PLAYED', (s.hours_played ?? 0).toLocaleString('en-US'), 'in the game, all players'),
    tile('RETURNING', `${s.players ? Math.round(((s.returning_players ?? 0) / s.players) * 100) : 0}%`, `${fmt(s.returning_players ?? 0)} came back another day`),
    tile('SHARED', fmt(s.shares), `result cards shared · ${fmt(s.reports ?? 0)} report${s.reports === 1 ? '' : 's'} sent (${fmt(s.reports_today ?? 0)} today)`),
    tile('DAILY TODAY', fmt(s.daily_players_today), 'on the challenge board'),
  );
}

/** s as minutes and seconds: 7:05 (or hours: 1:02:05). */
const clock = (secs: number) => {
  const t = Math.round(secs);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const ss = String(t % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
};

/** One bar per entry, longest first: the name (with its colour, if it has one), the bar to scale, the count. `all`: every
 * key there could be, so the ones never picked show too (at 0). */
function bars(id: string, data: Record<string, number>, name: (k: string) => string, all?: string[], color?: (k: string) => string | undefined) {
  const counts = { ...Object.fromEntries((all ?? []).map((k) => [k, 0])), ...data };
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1] || name(a[0]).localeCompare(name(b[0])));
  const list = $(id);
  if (!rows.length) {
    list.innerHTML = '<li class="empty">Nothing yet.</li>';
    return;
  }
  const max = Math.max(1, rows[0][1]);
  list.replaceChildren(...rows.map(([k, n]) => {
    const li = document.createElement('li');
    li.title = `${name(k)}: ${fmt(n)}`;
    if (!n) li.className = 'zero';
    li.innerHTML = '<span class="name"></span><span class="track"><span class="fill"></span></span><span class="n"></span>';
    const label = li.querySelector('.name') as HTMLElement;
    const c = color?.(k);
    if (c) {
      const sw = document.createElement('i');
      sw.className = 'swatch';
      sw.style.background = c;
      label.append(sw);
    }
    label.append(name(k));
    const fill = li.querySelector('.fill') as HTMLElement;
    fill.style.width = `${(n / max) * 100}%`;
    if (!n) fill.style.minWidth = '0';
    (li.querySelector('.n') as HTMLElement).textContent = fmt(n);
    return li;
  }));
}

/** What a chart counts: its name in the tooltip (after the value), what it says with no data, and how a value reads. */
interface Measure {
  what: string;
  empty: string;
  /** a day's value as the tooltip says it (default: the number) */
  says?: (n: number) => string;
}

/** The charts on the page (the box, the days, the measure), redrawn to a new width. */
const charts = new Map<string, [{ day: string; n: number }[], Measure]>();

/** The last 30 days of something: an area under a line, a nice y scale, a crosshair and tooltip on hover. */
function chart(id: string, days: { day: string; n: number }[], m: Measure) {
  charts.set(id, [days, m]);
  const box = $(id);
  // (every one of the last 30 days, the quiet ones at 0)
  const byDay = new Map(days.map((d) => [d.day, d.n]));
  const today = Date.parse(`${dayOf()}T00:00:00Z`);
  const series = Array.from({ length: 30 }, (_, k) => {
    const day = dayOf(new Date(today - (29 - k) * 86400000));
    return { day, n: byDay.get(day) ?? 0 };
  });
  if (!series.some((d) => d.n)) {
    box.innerHTML = '<p class="empty"></p>';
    (box.firstChild as HTMLElement).textContent = m.empty;
    return;
  }
  // (drawn at the box's own width, so its type stays the same size on a phone)
  const W = Math.max(320, Math.round(box.clientWidth - 24));
  const H = W < 600 ? 200 : 240;
  const pad = { l: 40, r: 14, t: 12, b: 26 };
  const peak = Math.max(...series.map((d) => d.n));
  const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000].find((s) => peak / s <= 5) ?? Math.ceil(peak / 5);
  const top = Math.max(step, Math.ceil(peak / step) * step);
  const x = (k: number) => pad.l + (k / 29) * (W - pad.l - pad.r);
  const y = (n: number) => pad.t + (1 - n / top) * (H - pad.t - pad.b);
  const ns = 'http://www.w3.org/2000/svg';
  const el = (tag: string, attrs: Record<string, string | number>, text?: string) => {
    const e = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `${m.what} per day over the last 30 days, peaking at ${peak}` });
  const css = getComputedStyle(document.documentElement);
  const tok = (n: string) => css.getPropertyValue(n).trim();
  for (let v = 0; v <= top; v += step) {
    svg.append(el('line', { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v), stroke: tok('--edge'), 'stroke-width': 1 }));
    svg.append(el('text', { x: pad.l - 8, y: y(v) + 4, 'text-anchor': 'end', fill: tok('--muted'), 'font-size': 11, 'font-family': 'ui-monospace, monospace' }, String(v)));
  }
  // (a date every week, and today)
  series.forEach((d, k) => {
    if (k % (W < 600 ? 14 : 7) !== 1 && k !== 29) return;
    svg.append(el('text', { x: x(k), y: H - 6, 'text-anchor': k === 29 ? 'end' : 'middle', fill: tok('--muted'), 'font-size': 11, 'font-family': 'ui-monospace, monospace' }, k === 29 ? 'today' : d.day.slice(5)));
  });
  const line = series.map((d, k) => `${k ? 'L' : 'M'}${x(k).toFixed(1)},${y(d.n).toFixed(1)}`).join('');
  svg.append(el('path', { d: `${line}L${x(29)},${y(0)}L${x(0)},${y(0)}Z`, fill: tok('--cyan'), 'fill-opacity': 0.14 }));
  svg.append(el('path', { d: line, fill: 'none', stroke: tok('--cyan'), 'stroke-width': 2, 'stroke-linejoin': 'round' }));
  // (today's point, emphasised)
  svg.append(el('circle', { cx: x(29), cy: y(series[29].n), r: 4.5, fill: tok('--cyan'), stroke: tok('--panel'), 'stroke-width': 2 }));
  const cross = el('line', { y1: pad.t, y2: H - pad.b, stroke: tok('--muted'), 'stroke-width': 1, 'stroke-dasharray': '3 3', visibility: 'hidden' });
  const mark = el('circle', { r: 4.5, fill: tok('--amber'), stroke: tok('--panel'), 'stroke-width': 2, visibility: 'hidden' });
  svg.append(cross, mark);
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.hidden = true;
  const hit = el('rect', { x: pad.l, y: 0, width: W - pad.l - pad.r, height: H, fill: 'transparent' });
  svg.append(hit);
  const move = (e: PointerEvent) => {
    const r = svg.getBoundingClientRect();
    const sx = ((e.clientX - r.left) / r.width) * W;
    const k = Math.max(0, Math.min(29, Math.round(((sx - pad.l) / (W - pad.l - pad.r)) * 29)));
    const d = series[k];
    for (const [node, attrs] of [[cross, { x1: x(k), x2: x(k) }], [mark, { cx: x(k), cy: y(d.n) }]] as const) {
      for (const [a, v] of Object.entries(attrs)) node.setAttribute(a, String(v));
      node.setAttribute('visibility', 'visible');
    }
    tip.hidden = false;
    tip.innerHTML = `<b></b> ${m.what.toLowerCase()} · <span></span>`;
    (tip.children[0] as HTMLElement).textContent = m.says ? m.says(d.n) : fmt(d.n);
    (tip.children[1] as HTMLElement).textContent = d.day;
    const bx = box.getBoundingClientRect();
    tip.style.left = `${Math.min(bx.width - 70, Math.max(70, (x(k) / W) * r.width + (r.left - bx.left)))}px`;
    tip.style.top = `${(y(d.n) / H) * r.height + (r.top - bx.top)}px`;
  };
  hit.addEventListener('pointermove', move as EventListener);
  hit.addEventListener('pointerdown', move as EventListener);
  hit.addEventListener('pointerleave', () => {
    cross.setAttribute('visibility', 'hidden');
    mark.setAttribute('visibility', 'hidden');
    tip.hidden = true;
  });
  box.replaceChildren(svg, tip);
}

/** The teams and drivers picked: the most and least of each (ties named together), then every one of them. */
const teamName = (id: string) => TEAMS.find((t) => t.id === id)?.name ?? id;
const teamColor = (id: string) => TEAMS.find((t) => t.id === id)?.body;
const driverTeam = (code: string) => TEAMS.find((t) => t.drivers.includes(code));
function picks(s: Stats) {
  const teams = { ...Object.fromEntries(TEAMS.map((t) => [t.id, 0])), ...(s.by_team ?? {}) };
  const drivers = { ...Object.fromEntries(TEAMS.flatMap((t) => t.drivers.map((d) => [d, 0]))), ...(s.by_driver ?? {}) };
  const total = Object.values(teams).reduce((a, b) => a + b, 0);
  const ends = (counts: Record<string, number>, name: (k: string) => string) => {
    const vals = Object.values(counts);
    const at = (n: number) => Object.keys(counts).filter((k) => counts[k] === n).map(name);
    const most = Math.max(...vals);
    const least = Math.min(...vals);
    const list = (names: string[]) => (names.length > 3 ? `${names.slice(0, 3).join(', ')} +${names.length - 3}` : names.join(', '));
    const share = (n: number) => (total ? `${fmt(n)} · ${Math.round((n / total) * 100)}% of sessions` : 'no picks yet');
    return { most: [list(at(most)), share(most)], least: [list(at(least)), share(least)] };
  };
  const t = ends(teams, teamName);
  const d = ends(drivers, (k) => `${k} (${driverTeam(k)?.code ?? '?'})`);
  const callout = (k: string, [v, sub]: string[]) => {
    const el = document.createElement('div');
    el.className = 'callout';
    el.innerHTML = '<span class="k"></span><span class="v"></span><span class="s"></span>';
    (el.children[0] as HTMLElement).textContent = k;
    (el.children[1] as HTMLElement).textContent = total ? v : '–';
    (el.children[2] as HTMLElement).textContent = sub;
    return el;
  };
  $('callouts').replaceChildren(callout('MOST PICKED TEAM', t.most), callout('LEAST PICKED TEAM', t.least), callout('MOST PICKED DRIVER', d.most), callout('LEAST PICKED DRIVER', d.least));
  bars('teams', s.by_team ?? {}, teamName, TEAMS.map((x) => x.id), teamColor);
  bars('drivers', s.by_driver ?? {}, (k) => `${k} · ${driverTeam(k)?.code ?? ''}`, TEAMS.flatMap((x) => x.drivers), (k) => driverTeam(k)?.body);
}

/** Each circuit: times played (sessions started), races finished, km and minutes on it; under it, the same by mode. Every circuit listed, the unplayed faint. */
function circuitsTable(list: CircuitStats[]) {
  const known = new Map(list.map((c) => [c.circuit, c]));
  const rows: CircuitStats[] = [...list, ...LAYOUTS.filter((l) => !known.has(l.id)).map((l) => ({ circuit: l.id, plays: 0, finishes: 0, km: 0, minutes: 0, modes: {} }))];
  const table = document.createElement('table');
  table.innerHTML = '<thead><tr><th>CIRCUIT · MODE</th><th class="r">PLAYED</th><th class="r">FINISHED</th><th class="r">KM</th><th class="r">MIN</th></tr></thead>';
  const body = document.createElement('tbody');
  const row = (cls: string, name: string, cells: string[]) => {
    const tr = document.createElement('tr');
    tr.className = cls;
    for (const [k, text] of [name, ...cells].entries()) {
      const td = document.createElement('td');
      if (k) td.className = 'r';
      td.textContent = text;
      tr.append(td);
    }
    body.append(tr);
  };
  const km = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  for (const c of rows) {
    row(`circuit${c.plays || c.minutes ? '' : ' zero'}`, circuitName(c.circuit), [fmt(c.plays), fmt(c.finishes ?? 0), km(c.km), km(c.minutes)]);
    const modes = Object.entries(c.modes).sort(([, a], [, b]) => b.plays - a.plays || b.minutes - a.minutes);
    for (const [mode, m] of modes) row('mode', MODE_NAMES[mode] ?? mode, [fmt(m.plays), fmt(m.finishes ?? 0), km(m.km), km(m.minutes)]);
  }
  table.append(body);
  $('circuits').replaceChildren(table);
}

function board(b: Board | undefined) {
  const c = challengeOn(dayOf());
  $('board-title').textContent = `TODAY'S DAILY CHALLENGE · ${c.layout.name.toUpperCase()} · ${c.weather.name}`;
  const el = $('board');
  if (!b) {
    el.innerHTML = '<p class="empty">The board could not be read.</p>';
    return;
  }
  if (!b.entries) {
    el.innerHTML = '<p class="empty">No one has run today\'s challenge yet.</p>';
    return;
  }
  const table = document.createElement('table');
  table.innerHTML = '<thead><tr><th class="r">#</th><th>NAME</th><th>REACHED</th><th class="r">TIME</th></tr></thead>';
  const body = document.createElement('tbody');
  for (const e of b.top) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td class="r"></td><td class="name"></td><td></td><td class="r"></td>';
    const cells = tr.children as HTMLCollectionOf<HTMLElement>;
    cells[0].textContent = String(e.place);
    cells[1].textContent = e.name;
    cells[2].textContent = distance(e.score);
    cells[3].textContent = `${e.time.toFixed(1)} s`;
    body.append(tr);
  }
  table.append(body);
  const count = document.createElement('p');
  count.className = 'empty';
  count.textContent = `${fmt(b.entries)} driver${b.entries === 1 ? '' : 's'} on the board today. The top ten shown.`;
  el.replaceChildren(table, count);
}

async function load() {
  if (!online()) {
    status('NOT SET UP', 'off');
    const n = $('notice');
    n.hidden = false;
    n.innerHTML = 'This build has no Supabase project. Set <code>SUPABASE_URL</code> and <code>SUPABASE_ANON_KEY</code> as GitHub Actions variables (see <code>supabase/README.md</code>) and run the stats workflow again.';
    return;
  }
  status('READING…', '');
  const [s, b] = await Promise.all([rpc<Stats>('game_stats', {}), rpc<Board>('daily_board', { p_day: dayOf(), p_player: '00000000-0000-4000-8000-000000000000', p_top: 10 })]);
  const n = $('notice');
  if (!s) {
    status('NO CONNECTION', 'off');
    n.hidden = false;
    n.textContent = "The stats could not be read. Check that supabase/schema.sql has been run in the project, then press Refresh.";
    return;
  }
  n.hidden = true;
  tiles(s);
  chart('chart', (s.daily_players ?? []).map((d) => ({ day: d.day, n: d.players })), { what: 'Players', empty: 'No players in the last 30 days yet.' });
  chart('chart-launches', (s.daily_launches ?? []).map((d) => ({ day: d.day, n: d.launches })), { what: 'Launches', empty: 'No launches in the last 30 days yet.' });
  // (the time: in minutes, or in hours once a day's had a few)
  const secs = s.daily_seconds ?? [];
  const inHours = Math.max(0, ...secs.map((d) => d.seconds)) >= 3 * 3600;
  chart('chart-time', secs.map((d) => ({ day: d.day, n: d.seconds / (inHours ? 3600 : 60) })), {
    what: inHours ? 'Hours played' : 'Minutes played', empty: 'No time in the game recorded in the last 30 days yet.',
    says: (n) => clock(n * (inHours ? 3600 : 60)),
  });
  $('time-title').textContent = `TIME PLAYED PER DAY (${inHours ? 'HOURS' : 'MINUTES'}) · LAST 30 DAYS (UTC)`;
  bars('platform', s.by_platform ?? {}, (k) => PLATFORM_NAMES[k] ?? k);
  bars('mode', s.by_mode ?? {}, (k) => MODE_NAMES[k] ?? k);
  bars('circuit', s.by_circuit ?? {}, circuitName);
  circuitsTable(s.circuits ?? []);
  picks(s);
  board(b);
  $('errors-title').textContent = `ERRORS · CAUGHT IN THE GAME · ${fmt(s.errors ?? 0)} (${fmt(s.errors_today ?? 0)} TODAY)`;
  const at = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  status(`LIVE · ${at}`, 'on');
  $('footer').textContent = `Anonymous counts from the game (a random id per device), read at ${at}. Refreshes every minute.`;
}

// ---------------------------------------------------------------- the reports (private: read with your code)

/** A report as reports_list() gives it. */
interface Report {
  id: number;
  at: string;
  platform?: string;
  version?: string;
  circuit?: string;
  mode?: string;
  screen?: string;
  text?: string;
  /** the screenshot's path in the 'reports' bucket, and the dashboard's copy of it (a data URL) */
  image?: string;
  picture?: string;
}
interface ReportsPage {
  ok: boolean;
  why?: string;
  total?: number;
  reports?: Report[];
}

/** where the code is kept on this browser, once it's opened the reports (LOCK forgets it) */
const CODE_KEY = 'cc-stats:reports-code';
const savedCode = (): string => {
  try {
    return localStorage.getItem(CODE_KEY) ?? '';
  } catch {
    return '';
  }
};
const keepCode = (code: string | undefined) => {
  try {
    if (code) localStorage.setItem(CODE_KEY, code);
    else localStorage.removeItem(CODE_KEY);
  } catch {
    // (not kept: asked for again next time)
  }
};
const REPORTS_PAGE = 20;
let reportsCode = '';
let oldest: number | undefined;
let shown = 0;

/** One report: its picture (tapped: full size), what was written, and when, where and on what. */
function reportCard(r: Report): HTMLElement {
  const card = document.createElement('article');
  card.className = 'report';
  if (r.picture) {
    const img = document.createElement('img');
    img.className = 'shot';
    img.src = r.picture;
    img.alt = `Screenshot sent with report ${r.id}`;
    img.loading = 'lazy';
    img.addEventListener('click', () => {
      ($('lightbox-img') as HTMLImageElement).src = r.picture!;
      $('lightbox').hidden = false;
    });
    card.append(img);
  } else {
    const none = document.createElement('div');
    none.className = 'noshot';
    none.textContent = r.image ? 'Picture in Supabase Storage only' : 'No picture';
    card.append(none);
  }
  const body = document.createElement('div');
  body.className = 'body';
  const words = document.createElement('p');
  words.className = `words${r.text ? '' : ' none'}`;
  words.textContent = r.text || 'No words, just the picture.';
  const meta = document.createElement('p');
  meta.className = 'meta';
  const when = new Date(r.at).toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const where = r.circuit ? `${circuitName(r.circuit)}${r.mode ? ` · ${MODE_NAMES[r.mode] ?? r.mode}` : ''}` : `From ${MENU_NAMES[r.mode ?? ''] ?? 'the menu'}`;
  meta.textContent = [`#${r.id} · ${when}`, where, [PLATFORM_NAMES[r.platform ?? ''] ?? r.platform, r.version && `v${r.version}`, r.screen].filter(Boolean).join(' · ')].join('\n');
  body.append(words, meta);
  if (r.image) {
    const path = document.createElement('p');
    path.className = 'path';
    path.textContent = `Storage: reports/${r.image}`;
    body.append(path);
  }
  card.append(body);
  return card;
}

/** Open the reports with `code` (`more`: the next page after the ones shown). */
async function openReports(code: string, more = false) {
  const note = $('reports-note');
  if (!online()) {
    note.textContent = 'This build has no Supabase project.';
    return;
  }
  note.textContent = 'Opening…';
  const page = await rpc<ReportsPage>('reports_list', { p_code: code, p_before: more ? oldest ?? null : null, p_limit: REPORTS_PAGE });
  if (!page) {
    note.textContent = 'The reports could not be read. Check that supabase/schema.sql has been run again since reports were added.';
    return;
  }
  if (!page.ok) {
    keepCode(undefined);
    note.textContent = page.why === 'no code set'
      ? "No reports code is set yet. In Supabase's SQL Editor run: select public.set_reports_code('your code');"
      : "That isn't the reports code.";
    $('reports-lock').hidden = false;
    return;
  }
  reportsCode = code;
  keepCode(code);
  if (!more) void openErrors(code);
  note.textContent = '';
  $('reports-lock').hidden = true;
  $('reports-head').hidden = false;
  const list = $('reports-list');
  const reports = page.reports ?? [];
  if (!more) {
    list.replaceChildren();
    shown = 0;
  }
  if (!reports.length && !shown) list.innerHTML = '<p class="empty">No reports yet.</p>';
  list.append(...reports.map(reportCard));
  shown += reports.length;
  oldest = reports.length ? reports[reports.length - 1].id : oldest;
  const total = page.total ?? shown;
  $('reports-count').textContent = `${fmt(total)} REPORT${total === 1 ? '' : 'S'} · ${fmt(shown)} SHOWN`;
  $('reports-more').hidden = shown >= total || !reports.length;
}

// ---------------------------------------------------------------- the errors (private: with the reports' code)

/** An error as errors_list() gives it: the same one (message, where) together. */
interface ErrorGroup {
  message: string;
  where: string;
  kind: string;
  count: number;
  players: number;
  first: string;
  last: string;
  versions: (string | null)[];
  platforms: (string | null)[];
  screens: (string | null)[];
  stack?: string;
}
interface ErrorsPage {
  ok: boolean;
  why?: string;
  errors?: ErrorGroup[];
}

/** One error: its message, how often and for how many, when, on what, and its stack (folded). */
function errorCard(e: ErrorGroup): HTMLElement {
  const card = document.createElement('article');
  card.className = 'error';
  const what = document.createElement('p');
  what.className = 'what';
  const count = document.createElement('span');
  count.className = 'count';
  count.textContent = `×${fmt(e.count)} `;
  what.append(count, e.kind === 'rejection' ? `(promise) ${e.message}` : e.message);
  const meta = document.createElement('p');
  meta.className = 'meta';
  const day = (at: string) => new Date(at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const list = (xs: (string | null)[], name: (x: string) => string = (x) => x) => xs.filter((x): x is string => !!x).map(name).join(', ');
  meta.textContent = [
    e.where || 'where: not known',
    `${fmt(e.players)} player${e.players === 1 ? '' : 's'} · last ${day(e.last)} · first ${day(e.first)}`,
    [list(e.platforms, (p) => PLATFORM_NAMES[p] ?? p), list(e.versions, (v) => `v${v}`), list(e.screens, (x) => (x === 'race' ? 'in a race' : MENU_NAMES[x] ?? x))].filter(Boolean).join(' · '),
  ].join('\n');
  card.append(what, meta);
  if (e.stack) {
    const fold = document.createElement('details');
    const sum = document.createElement('summary');
    sum.textContent = 'stack';
    const pre = document.createElement('pre');
    pre.textContent = e.stack;
    fold.append(sum, pre);
    card.append(fold);
  }
  return card;
}

/** Show the errors with the reports' `code` (`undefined`: locked again). */
async function openErrors(code: string | undefined) {
  const note = $('errors-note');
  const list = $('errors-list');
  list.replaceChildren();
  if (!code) {
    note.hidden = false;
    note.textContent = 'Errors are private: open the reports above with your code to see them.';
    return;
  }
  const page = await rpc<ErrorsPage>('errors_list', { p_code: code });
  note.hidden = !!page?.ok && !!page.errors?.length;
  if (!page) note.textContent = 'The errors could not be read. Check that supabase/schema.sql has been run again since errors were added.';
  else if (!page.ok) note.textContent = "That code doesn't open the errors.";
  else if (!page.errors?.length) note.textContent = 'No errors in the last 30 days.';
  else list.append(...page.errors.map(errorCard));
}

$('reports-lock').addEventListener('submit', (e) => {
  e.preventDefault();
  const code = ($('reports-code') as HTMLInputElement).value.trim();
  if (code) void openReports(code);
});
$('reports-more').addEventListener('click', () => void openReports(reportsCode, true));
$('reports-lockup').addEventListener('click', () => {
  keepCode(undefined);
  reportsCode = '';
  oldest = undefined;
  shown = 0;
  $('reports-list').replaceChildren();
  $('reports-head').hidden = true;
  $('reports-more').hidden = true;
  $('reports-lock').hidden = false;
  ($('reports-code') as HTMLInputElement).value = '';
  void openErrors(undefined);
});
$('lightbox').addEventListener('click', () => ($('lightbox').hidden = true));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') $('lightbox').hidden = true;
});
// (opened already on this browser: straight to them)
if (savedCode()) void openReports(savedCode());

$('refresh').addEventListener('click', () => void load());
// (redrawn to the new width)
let resized: ReturnType<typeof setTimeout> | undefined;
window.addEventListener('resize', () => {
  clearTimeout(resized);
  resized = setTimeout(() => charts.forEach(([days, m], id) => chart(id, days, m)), 150);
});
void load();
setInterval(() => {
  if (!document.hidden) void load();
}, 60000);
