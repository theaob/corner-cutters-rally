// The rally's screen. With no rally under way: the rallies to pick from (each
// one's surface, its stages and your best there). With one under way: where
// you stand (the standings after the stages run so far), the stage up next and
// your car's state (repaired at the service park), and START SS…; once it's
// over, the final standings. Touch, or keys: up/down moves, A or START picks,
// SELECT goes back.

import type { Button } from '../../engine/controls';
import { holdTouches } from '../../engine/deck';
import type { Services } from '../../engine/services';
import { onBack } from '../../engine/backButton';
import { menuButton } from '../circuitSelect';
import { menuPick, menuTick } from '../sounds';
import { formatTime as fmt } from '../records';
import { layoutById } from '../layouts';
import { weatherById } from '../weather';
import {
  RALLIES, crewName, crewTeam, gapText, loadBests, nextStage, rallyEvent, rallyOver, serviceAfter, standings, yourPlace, type Rally, type RallyEvent,
} from '../rally';
import { reportOpen } from '../report';

export type RallyAction = 'stage' | 'abandon' | 'back' | { start: RallyEvent };

const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'ST' : n % 10 === 2 && n % 100 !== 12 ? 'ND' : n % 10 === 3 && n % 100 !== 13 ? 'RD' : 'TH'}`;

/** The standings as a table: place, crew, team, total or gap; you in gold. */
function standingsTable(r: Rally): HTMLTableElement {
  const cell = (text: string, right = false) => {
    const c = document.createElement('td');
    c.textContent = text;
    Object.assign(c.style, { padding: '2px 4px', textAlign: right ? 'right' : 'left', whiteSpace: 'nowrap' });
    return c;
  };
  const table = document.createElement('table');
  Object.assign(table.style, { width: '100%', maxWidth: '360px', borderCollapse: 'collapse', font: '12px var(--pixel)', color: 'var(--text)' });
  standings(r).forEach((s, k) => {
    const row = document.createElement('tr');
    if (s.crew === r.you) row.style.color = 'var(--gold)';
    row.style.animation = `row-in 0.35s ease-out ${(0.1 + k * 0.05).toFixed(2)}s both`;
    const crew = r.crews[s.crew];
    row.append(cell(`${k + 1}`, true), cell(crew === r.crews[r.you] ? 'YOU' : crewName(crew)), cell(crewTeam(crew).code), cell(k === 0 ? fmt(s.total) : gapText(s.gap), true));
    table.append(row);
  });
  return table;
}

/** Show the rally screen in `host` (the rally under way, if any) until the player picks. */
export function showRally(host: HTMLElement, services: Services, rally: Rally | undefined, closed?: AbortSignal): Promise<RallyAction> {
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
      offBack();
      menuPick();
      screen.remove();
      resolve(a);
    };
    const offBack = onBack(() => (finish('back'), true));
    const buttons: { el: HTMLElement; pick: () => void }[] = [];
    const button = (text: string, pick: () => void, main = false) => {
      const b = menuButton(text, pick);
      if (main) b.classList.add('race-button');
      buttons.push({ el: b, pick });
      return b;
    };
    if (!rally) {
      // the rallies to pick from
      title.textContent = 'RALLY';
      screen.append(line('PICK A RALLY: STAGE BY STAGE AGAINST THE CLOCK, THE LEAST TIME OVERALL WINS', 'var(--accent-b)'));
      const bests = loadBests();
      for (const e of RALLIES) {
        const best = bests[e.id];
        const b = button(`${e.name} · ${e.surface}`, () => finish({ start: e }));
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
    screen.append(button('BACK', () => finish('back')));
    holdTouches(screen);
    host.append(screen);
    hud.setPosition('');
    hud.setLap('');
    hud.setLabel('a', 'OK');
    hud.setLabel('b', '');
    closed?.addEventListener('abort', () => {
      done = true;
      offBack();
      screen.remove();
    });
    let focus = 0;
    const show = () => buttons.forEach((b, i) => b.el.classList.toggle('focused', i === focus));
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
      const [down, up, a, start, select] = (['down', 'up', 'a', 'start', 'select'] as const).map((k) => pressed(k) && !reportOpen());
      const move = (down ? 1 : 0) - (up ? 1 : 0);
      if (move) {
        focus = (focus + move + buttons.length) % buttons.length;
        menuTick();
        show();
      }
      if (a || start) buttons[focus].pick();
      if (select) finish('back');
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
