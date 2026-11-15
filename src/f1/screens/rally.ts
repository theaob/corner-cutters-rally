// The rally's screen: the game's home. With no rally under way: your car's
// paint (CAR), the rallies to pick from (a grid of tiles, as Corner Cutters' menu
// lays out its modes: each its surface's icon over its name, its stages and your
// best there), and SETTINGS in a row of its own under them. With one under way: where you stand (the
// standings after the stages run so far), the stage up next and your car's
// state (repaired at the service park), and START SS…; once it's over, the
// final standings (a trophy and confetti for a win). Touch, or keys: up/down
// moves (a row in the rallies' grid), left/right changes CAR (and moves across
// the grid), A or START picks.

import type { Button } from '../../engine/controls';
import { holdTouches } from '../../engine/deck';
import type { Services } from '../../engine/services';
import { menuButton, optionRow, framed, ownTabButton } from '../menu';
import { menuPick, menuTick } from '../sounds';
import { formatTime as fmt } from '../time';
import { layoutById } from '../layouts';
import { weatherById } from '../weather';
import { SCHEMES, type Scheme } from '../crews';
import {
  RALLIES, crewName, crewScheme, gapText, loadBests, nextStage, rallyEvent, rallyOver, serviceAfter, standings, yourPlace, type Rally, type RallyEvent,
} from '../rally';
import { reportOpen } from '../report';
import { gridStep, makeTile } from '../menuTiles';
import { confetti, trophy } from './celebrate';
import { COLOR, SURFACE_COLOR } from '../theme';
import { language, t, upper } from '../../engine/i18n';
import { ROUNDS, YOU, opensAt, roundOf, roundOpen, seasonOver, seasonPlace, seasonStandings, type Season } from '../season';

export type RallyAction = 'stage' | 'abandon' | 'settings' | 'new-season' | { start: RallyEvent; scheme: Scheme };

/** The season home shows (season.ts), and the time its calendar goes by. */
export interface SeasonView {
  season: Season;
  now: number;
}

/** A place as the language writes it: 1ST in English, 1. in German and Turkish, 1º, 1er, 1位. */
const ORDINAL: Record<string, (n: number) => string> = {
  en: (n) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'ST' : n % 10 === 2 && n % 100 !== 12 ? 'ND' : n % 10 === 3 && n % 100 !== 13 ? 'RD' : 'TH'}`,
  de: (n) => `${n}.`, tr: (n) => `${n}.`, es: (n) => `${n}º`, pt: (n) => `${n}º`, it: (n) => `${n}º`,
  fr: (n) => (n === 1 ? '1ER' : `${n}E`), ja: (n) => `${n}位`,
};
export const ordinal = (n: number) => (ORDINAL[language().code] ?? ORDINAL.en)(n);

/** The standings as a table: place, the crew's paint, crew, total or gap; you in gold. */
function standingsTable(r: Rally): HTMLTableElement {
  const cell = (text: string, right = false, color?: string) => {
    const c = document.createElement('td');
    c.textContent = text;
    Object.assign(c.style, { padding: '2px 4px', textAlign: right ? 'right' : 'left', whiteSpace: 'nowrap', ...(color ? { color } : {}) });
    return c;
  };
  const table = document.createElement('table');
  Object.assign(table.style, { width: '100%', maxWidth: '360px', borderCollapse: 'collapse', font: '12px var(--pixel)', color: 'var(--text)' });
  standings(r).forEach((s, k) => {
    const row = document.createElement('tr');
    if (s.crew === r.you) row.style.color = 'var(--gold)';
    row.style.animation = `row-in 0.35s ease-out ${(0.1 + k * 0.05).toFixed(2)}s both`;
    const crew = r.crews[s.crew];
    const scheme = crewScheme(crew);
    const chip = document.createElement('td');
    // (a swatch of the crew's paint: the body, edged in the second colour)
    Object.assign(chip.style, { width: '14px', padding: '0', background: scheme.body, boxShadow: `inset 0 0 0 3px ${scheme.trim}` });
    row.append(cell(`${k + 1}`, true), chip, cell(crewName(crew)), cell(k === 0 ? fmt(s.total) : gapText(s.gap), true));
    table.append(row);
  });
  return table;
}

/** The season's standings as a table: place, the crew's paint, crew, points; you in gold. */
function seasonTable(s: Season, scheme: Scheme): HTMLTableElement {
  const table = document.createElement('table');
  Object.assign(table.style, { width: '100%', maxWidth: '360px', borderCollapse: 'collapse', font: '12px var(--pixel)', color: 'var(--text)' });
  seasonStandings(s).forEach((c, k) => {
    const row = document.createElement('tr');
    if (c.key === YOU) row.style.color = 'var(--gold)';
    row.style.animation = `row-in 0.35s ease-out ${(0.1 + k * 0.05).toFixed(2)}s both`;
    const crew = c.key === YOU ? { scheme: scheme.id } : { crew: c.key };
    const paint = crewScheme(crew);
    const cell = (text: string, right = false) => {
      const d = document.createElement('td');
      d.textContent = text;
      Object.assign(d.style, { padding: '2px 4px', textAlign: right ? 'right' : 'left', whiteSpace: 'nowrap' });
      return d;
    };
    const chip = document.createElement('td');
    Object.assign(chip.style, { width: '14px', padding: '0', background: paint.body, boxShadow: `inset 0 0 0 3px ${paint.trim}` });
    row.append(cell(`${k + 1}`, true), chip, cell(crewName(crew)), cell(`${c.points} ${t('PTS')}`, true));
    table.append(row);
  });
  return table;
}

/** A date as the language writes it, short and upper case: 23 NOV, 23. NOV., 11月23日. */
const shortDate = (ms: number) => new Date(ms).toLocaleDateString(language().code, { day: 'numeric', month: 'short', timeZone: 'UTC' }).toUpperCase();

/** A dark panel holding `children` (small text over the forest backdrop is hard to read without one). */
function panel(...children: HTMLElement[]): HTMLElement {
  const d = document.createElement('div');
  d.className = 'info-panel';
  d.append(...children);
  return d;
}

/**
 * Rally `e` as a tile on `b` (its button), as Corner Cutters' modes are on its menu: its surface's icon (in its
 * surface's colour) over its name, and under that its stages and your best finish there; the rest for a screen reader
 * and a long press.
 */
export function rallyTile(e: RallyEvent, bestPlace: number | undefined, b: HTMLButtonElement, round?: { n: number; state: string; color?: string }): HTMLButtonElement {
  b.classList.add('rally-tile');
  b.style.setProperty('--surface', SURFACE_COLOR[e.surface]);
  const facts = document.createElement('span');
  facts.className = 'tile-sub';
  const best = document.createElement('span');
  best.textContent = bestPlace ? t('BEST {place}', { place: ordinal(bestPlace) }) : t('NOT RUN YET');
  if (bestPlace === 1) best.style.color = 'var(--gold)';
  if (round) {
    // (a round of the season: its number, and how it stands: driven, open, or when it opens)
    best.textContent = round.state;
    best.style.color = round.color ?? '';
    facts.append(`${t('ROUND {n}', { n: round.n })} · `, best);
  } else facts.append(`${t('{n} STAGES', { n: e.stages.length })} · `, best);
  makeTile(b, e.surface, t(e.name), `${round ? `${t('ROUND {n}', { n: round.n })} · ${round.state} · ` : ''}${t(e.surface)} · ${t(e.about)}${bestPlace ? ` · ${t('BEST {place}', { place: ordinal(bestPlace) })}` : ''}`, facts);
  return b;
}

/**
 * Show the rally screen in `host` (the rally under way, if any; your car's paint `scheme` for a new one) until the
 * player picks.
 */
export function showRally(host: HTMLElement, services: Services, rally: Rally | undefined, scheme: Scheme, closed?: AbortSignal, view?: SeasonView): Promise<RallyAction> {
  const { controls, hud } = services;
  const screen = document.createElement('div');
  screen.className = 'circuit-menu';
  const title = document.createElement('h1');
  const line = (text: string, color = 'var(--muted)') => {
    const p = document.createElement('p');
    p.textContent = text;
    Object.assign(p.style, { margin: '0', color, textAlign: 'center', font: '11px var(--pixel)' });
    return p;
  };
  screen.append(title);
  return new Promise((resolve) => {
    let done = false;
    const finish = (a: RallyAction) => {
      if (done) return;
      done = true;
      menuPick();
      screen.remove();
      resolve(a);
    };
    /** the places up/down moves through: each picked with A, and a row also changed with left/right; a rally's tile
     * also moved between with left/right, and up/down a row of the grid (`tile`: its place in the grid) */
    const places: { el: HTMLElement; pick?: () => void; step?: (by: number) => void; tile?: number }[] = [];
    const button = (text: string, pick: () => void, main = false) => {
      const b = menuButton(text, pick);
      if (main) b.classList.add('race-button');
      places.push({ el: b, pick });
      return b;
    };
    if (!rally) {
      // a new rally: your car's paint, then the rallies to pick from
      title.textContent = 'CORNER CUTTERS RALLY';
      screen.append(panel(line(view
        ? t('A SEASON OF {n} ROUNDS, A NEW ONE EACH WEEK: POINTS FOR THE TOP 10, BONUS POINTS ON EACH POWER STAGE', { n: ROUNDS.length })
        : t('STAGE BY STAGE AGAINST THE CLOCK, THE CO-DRIVER CALLING THE BENDS: THE LEAST TIME OVERALL WINS'), 'var(--accent-b)')));
      const car = optionRow('CAR', SCHEMES, scheme, (s) => ({ name: s.name, about: 'your paint · #1 on the roof', colors: [s.body, s.trim, ...(s.accent ? [s.accent] : [])] }));
      places.push({ el: car.el, step: car.step });
      screen.append(car.el);
      // (the rallies a grid of square tiles, as Corner Cutters' modes are)
      const bests = loadBests();
      const grid = document.createElement('div');
      grid.className = 'menu-tiles';
      if (view) {
        // the season's rounds: one driven shows how it went, one open is picked, one not open yet says when it opens
        const { season, now } = view;
        ROUNDS.forEach((e, k) => {
          const done = season.results[e.id];
          const open = roundOpen(k, now);
          const state = done
            ? { n: k + 1, state: `${ordinal(done.place)} · ${done.points[YOU] ?? 0} ${t('PTS')}`, color: done.place === 1 ? 'var(--gold)' : undefined }
            : open ? { n: k + 1, state: t('OPEN NOW'), color: 'var(--accent-b)' } : { n: k + 1, state: t('OPENS {date}', { date: shortDate(opensAt(k)) }) };
          const b = button('', () => !done && open && finish({ start: e, scheme: car.value() }));
          grid.append(rallyTile(e, bests[e.id]?.place, b, state));
          places[places.length - 1].tile = k;
          // (one driven, or not open yet: moved over, not picked, and not where the highlight starts)
          if (done || !open) {
            b.classList.add('tile-off');
            places[places.length - 1].pick = undefined;
          }
        });
        screen.append(grid);
        if (Object.keys(season.results).length) {
          const over = seasonOver(season);
          const place = seasonPlace(season);
          if (over && place === 1) {
            const cup = trophy(56);
            Object.assign(cup.style, { display: 'block', margin: '0 auto' });
            screen.append(cup);
            requestAnimationFrame(() => confetti(host));
          }
          screen.append(panel(
            line(over ? (place === 1 ? t('YOU ARE THE CHAMPION!') : t('YOU FINISHED THE SEASON {place}', { place: ordinal(place) })) : t('SEASON STANDINGS'), over && place === 1 ? 'var(--gold)' : 'var(--text)'),
            seasonTable(season, car.value()),
          ));
          if (over) screen.append(button(`${t('NEW SEASON')} ▶`, () => finish('new-season'), true));
        }
      } else {
        RALLIES.forEach((e, k) => {
          grid.append(rallyTile(e, bests[e.id]?.place, button('', () => finish({ start: e, scheme: car.value() }))));
          places[places.length - 1].tile = k;
        });
        screen.append(grid);
      }
    } else {
      const e = rallyEvent(rally);
      title.textContent = t(e.name);
      const k = nextStage(rally);
      if (rallyOver(rally)) {
        const place = yourPlace(rally);
        if (place === 1) {
          const cup = trophy(64);
          Object.assign(cup.style, { display: 'block', margin: '0 auto' });
          screen.append(cup);
          requestAnimationFrame(() => confetti(host));
        }
        screen.append(panel(
          line(place === 1 ? t('RALLY WINNER!') : t('YOU FINISHED {place}', { place: ordinal(place) }), place === 1 ? 'var(--gold)' : 'var(--text)'),
          line(`${t(e.surface)} · ${t('{n} STAGES', { n: e.stages.length })} · ${t('FINAL STANDINGS')}`),
          standingsTable(rally),
        ));
        const result = rally.season && view ? view.season.results[rally.event] : undefined;
        if (result) {
          const bonus = result.power[YOU];
          screen.append(panel(line(t('+{n} SEASON POINTS', { n: result.points[YOU] ?? 0 }), 'var(--gold)'),
            ...(bonus ? [line(`${t('POWER STAGE')} +${bonus}`, 'var(--accent-b)')] : [])));
        }
        screen.append(button(`${rally.season ? t('BACK TO THE SEASON') : t('NEW RALLY')} ▶`, () => finish('abandon'), true));
      } else {
        const next = e.stages[k];
        const layout = layoutById(next.layout);
        const health = Math.round(rally.health * 100);
        const round = rally.season ? roundOf(rally.event) : -1;
        const info = panel(
          ...(round >= 0 ? [line(t('ROUND {n} OF {total}', { n: round + 1, total: ROUNDS.length }), 'var(--muted)')] : []),
          line(`${t('SS{n} OF {total}', { n: k + 1, total: e.stages.length })} · ${layout?.name.toUpperCase() ?? ''}`, 'var(--gold)'),
          line(`${upper(t(layout?.about ?? ''))} · ${t(weatherById(next.weather)?.name ?? '')}`, 'var(--accent-b)'),
          line(`${t('YOUR CAR: {n}%', { n: health })}${health < 100 ? ` · ${t('DAMAGED')}` : ''}${k > 0 && serviceAfter(rally, k - 1) ? ` · ${t('FRESH FROM SERVICE')}` : ''}`, health < 60 ? COLOR.red : 'var(--text)'),
        );
        if (round >= 0 && k === e.stages.length - 1) info.append(line(t('POWER STAGE · BONUS POINTS FOR THE TOP 5'), 'var(--gold)'));
        if (k > 0) info.append(line(t("STANDINGS AFTER SS{n}: YOU'RE {place}", { n: k, place: ordinal(yourPlace(rally)) })), standingsTable(rally));
        else info.append(line(t('THE CO-DRIVER CALLS EVERY BEND: ◀ 1 THE SLOWEST … 6 ▶ BARELY A LIFT')));
        info.style.borderLeft = `6px solid ${SURFACE_COLOR[e.surface]}`;
        screen.append(info);
        screen.append(button(`${t('START SS{n}', { n: k + 1 })} ▶`, () => finish('stage'), true));
        screen.append(button(t('RETIRE FROM THE RALLY'), () => finish('abandon')));
      }
    }
    // (SETTINGS in a row of its own, set apart under the rest: not a rally itself)
    const utility = document.createElement('div');
    utility.className = 'menu-utility';
    const settings = button('', () => finish('settings'));
    makeTile(settings, 'settings', t('SETTINGS'), t('controls, the game, sound and accessibility'));
    utility.append(settings);
    screen.append(utility);
    // (framed in another page, as on itch.io, where the browser may hold it to 30 fps: a way to a tab of its own)
    if (framed()) screen.append(ownTabButton());
    holdTouches(screen);
    host.append(screen);
    hud.setPosition('');
    hud.setLap('');
    hud.setLabel('a', 'OK');
    hud.setLabel('b', '');
    closed?.addEventListener('abort', () => {
      done = true;
      screen.remove();
    });
    // (the first place that's picked, not the CAR row, highlighted to start with)
    let focus = Math.max(0, places.findIndex((p) => p.pick));
    const show = () => places.forEach((p, i) => p.el.classList.toggle('focused', i === focus));
    show();
    const seen = new Map<Button, number>();
    const pressed = (b: Button) => {
      const n = controls.presses(b);
      const edge = n > (seen.get(b) ?? n);
      seen.set(b, n);
      return edge;
    };
    const tick = () => {
      if (done) return;
      const [down, up, left, right, a, start] = (['down', 'up', 'left', 'right', 'a', 'start'] as const).map((k) => pressed(k) && !reportOpen());
      const move = (down ? 1 : 0) - (up ? 1 : 0);
      const here = places[focus];
      const tiles = places.filter((p) => p.tile !== undefined);
      if (here.tile !== undefined && (move || left || right)) {
        // (in the rallies' grid: a neighbour, a row up or down, or out of the grid off its top or bottom)
        const to = gridStep(here.tile, (right ? 1 : 0) - (left ? 1 : 0), move, tiles.length);
        const first = places.indexOf(tiles[0]);
        focus = (to >= 0 ? first + to : move < 0 ? first - 1 : first + tiles.length) % places.length;
        if (focus < 0) focus += places.length;
        menuTick();
        show();
      } else if (move) {
        focus = (focus + move + places.length) % places.length;
        menuTick();
        show();
      }
      if ((left || right) && here.step) here.step(right ? 1 : -1);
      const at = places[focus];
      if ((a || start) && at.pick) at.pick();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
