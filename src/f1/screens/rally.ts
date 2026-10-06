// The rally's screen: the game's home. With no rally under way: your car's
// paint (CAR), the rallies to pick from (each one's surface, its stages and
// your best there), and SETTINGS. With one under way: where you stand (the
// standings after the stages run so far), the stage up next and your car's
// state (repaired at the service park), and START SS…; once it's over, the
// final standings (a trophy and confetti for a win). Touch, or keys: up/down
// moves, left/right changes CAR, A or START picks.

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
import { confetti, trophy } from './celebrate';

export type RallyAction = 'stage' | 'abandon' | 'settings' | { start: RallyEvent; scheme: Scheme };

const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'ST' : n % 10 === 2 && n % 100 !== 12 ? 'ND' : n % 10 === 3 && n % 100 !== 13 ? 'RD' : 'TH'}`;

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

/**
 * Show the rally screen in `host` (the rally under way, if any; your car's paint `scheme` for a new one) until the
 * player picks.
 */
export function showRally(host: HTMLElement, services: Services, rally: Rally | undefined, scheme: Scheme, closed?: AbortSignal): Promise<RallyAction> {
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
    /** the places up/down moves through: each picked with A, and a row also changed with left/right */
    const places: { el: HTMLElement; pick?: () => void; step?: (by: number) => void }[] = [];
    const button = (text: string, pick: () => void, main = false) => {
      const b = menuButton(text, pick);
      if (main) b.classList.add('race-button');
      places.push({ el: b, pick });
      return b;
    };
    if (!rally) {
      // a new rally: your car's paint, then the rallies to pick from
      title.textContent = 'CORNER CUTTERS RALLY';
      screen.append(line('STAGE BY STAGE AGAINST THE CLOCK, THE CO-DRIVER CALLING THE BENDS: THE LEAST TIME OVERALL WINS', 'var(--accent-b)'));
      const car = optionRow('CAR', SCHEMES, scheme, (s) => ({ name: s.name, about: 'your paint · #1 on the roof', colors: [s.body, s.trim, ...(s.accent ? [s.accent] : [])] }));
      places.push({ el: car.el, step: car.step });
      screen.append(car.el);
      const bests = loadBests();
      for (const e of RALLIES) {
        const best = bests[e.id];
        const b = button(`${e.name} · ${e.surface}`, () => finish({ start: e, scheme: car.value() }));
        const sub = document.createElement('span');
        sub.textContent = `${e.stages.length} STAGES · ${e.about.toUpperCase()}${best ? ` · BEST: ${ordinal(best.place)}` : ''}`;
        Object.assign(sub.style, { display: 'block', fontSize: '9px', color: best?.place === 1 ? 'var(--gold)' : 'var(--muted)', marginTop: '3px' });
        b.append(sub);
        screen.append(b);
      }
    } else {
      const e = rallyEvent(rally);
      title.textContent = e.name;
      const k = nextStage(rally);
      if (rallyOver(rally)) {
        const place = yourPlace(rally);
        if (place === 1) {
          const cup = trophy(64);
          Object.assign(cup.style, { display: 'block', margin: '0 auto' });
          screen.append(cup);
          requestAnimationFrame(() => confetti(host));
        }
        screen.append(
          line(place === 1 ? 'RALLY WINNER!' : `YOU FINISHED ${ordinal(place)}`, place === 1 ? 'var(--gold)' : 'var(--text)'),
          line(`${e.surface} · ${e.stages.length} STAGES · FINAL STANDINGS`),
          standingsTable(rally),
        );
        screen.append(button('NEW RALLY ▶', () => finish('abandon'), true));
      } else {
        const next = e.stages[k];
        const layout = layoutById(next.layout);
        const health = Math.round(rally.health * 100);
        screen.append(
          line(`SS${k + 1} OF ${e.stages.length} · ${layout?.name.toUpperCase() ?? ''}`, 'var(--gold)'),
          line(`${(layout?.about ?? '').toUpperCase()} · ${weatherById(next.weather)?.name ?? ''}`, 'var(--accent-b)'),
          line(`YOUR CAR: ${health}%${health < 100 ? ' · DAMAGED' : ''}${k > 0 && serviceAfter(rally, k - 1) ? ' · FRESH FROM SERVICE' : ''}`, health < 60 ? '#d8323c' : 'var(--text)'),
        );
        if (k > 0) screen.append(line(`STANDINGS AFTER SS${k}: YOU'RE ${ordinal(yourPlace(rally))}`), standingsTable(rally));
        else screen.append(line('THE CO-DRIVER CALLS EVERY BEND: ◀ 1 THE SLOWEST … 6 ▶ BARELY A LIFT'));
        screen.append(button(`START SS${k + 1} ▶`, () => finish('stage'), true));
        screen.append(button('RETIRE FROM THE RALLY', () => finish('abandon')));
      }
    }
    screen.append(button('SETTINGS', () => finish('settings')));
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
      if (move) {
        focus = (focus + move + places.length) % places.length;
        menuTick();
        show();
      }
      const at = places[focus];
      if ((left || right) && at.step) at.step(right ? 1 : -1);
      if ((a || start) && at.pick) at.pick();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
