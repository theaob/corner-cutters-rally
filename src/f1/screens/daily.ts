// The Daily Challenge's screen: today's challenge (its circuit and weather,
// and when the next one comes), your best today and your streak, the day's
// online board (the top ten, and your place), your initials for it, and PLAY.
// Touch, or keys: up/down moves, left/right changes a letter, A or START picks,
// SELECT goes back.

import type { Button } from '../../engine/controls';
import { holdTouches } from '../../engine/deck';
import type { Services } from '../../engine/services';
import { onBack } from '../../engine/backButton';
import { online } from '../../engine/backend';
import { menuButton } from '../circuitSelect';
import { menuPick, menuTick } from '../sounds';
import { distance } from '../timeAttack';
import { fetchBoard, loadDaily, sendPending, streakOn, untilNext, type Board, type Challenge } from '../daily';
import { INITIALS, initials, playerId, setInitials } from '../profile';
import { reportOpen } from '../report';
import { sendLaps } from '../boards';

/** `ms` as hours and minutes: 5H 12M. */
const hm = (ms: number) => `${Math.floor(ms / 3600000)}H ${Math.floor((ms % 3600000) / 60000)}M`;

/** A run's distance, and its time to the last checkpoint. */
export const runText = (score: number, time: number) => `${distance(score)} · ${time.toFixed(1)} S`;

/** The board as a table: place, initials, how far, how soon; you in gold, after a ··· if you're further down. */
function boardTable(b: Board): HTMLTableElement {
  const cell = (tag: 'td' | 'th', text: string, right = false) => {
    const c = document.createElement(tag);
    c.textContent = text;
    Object.assign(c.style, { padding: '2px 4px', textAlign: right ? 'right' : 'left', fontWeight: 'normal', whiteSpace: 'nowrap' });
    return c;
  };
  const table = document.createElement('table');
  Object.assign(table.style, { width: '100%', borderCollapse: 'collapse', font: '12px var(--pixel)', color: 'var(--text)' });
  const head = document.createElement('tr');
  head.style.color = 'var(--muted)';
  head.append(cell('th', '', true), cell('th', 'NAME'), cell('th', 'REACHED'), cell('th', 'TIME', true));
  table.append(head);
  const row = (e: Board['top'][number], k: number) => {
    const r = document.createElement('tr');
    if (e.you) r.style.color = 'var(--gold)';
    r.style.animation = `row-in 0.35s ease-out ${(0.1 + k * 0.05).toFixed(2)}s both`;
    r.append(cell('td', `${e.place}`, true), cell('td', e.name), cell('td', distance(e.score)), cell('td', `${e.time.toFixed(1)}`, true));
    return r;
  };
  b.top.forEach((e, k) => table.append(row(e, k)));
  if (b.you && !b.top.some((e) => e.you)) {
    const gap = document.createElement('tr');
    gap.append(cell('td', ''), cell('td', '···'));
    gap.style.color = 'var(--muted)';
    table.append(gap, row({ ...b.you, you: true }, b.top.length + 1));
  }
  return table;
}

/** Show today's challenge `c` in `host` until the player picks PLAY or BACK. */
export function showDaily(host: HTMLElement, services: Services, c: Challenge, closed?: AbortSignal): Promise<'play' | 'back'> {
  const { controls, hud } = services;
  const screen = document.createElement('div');
  screen.className = 'circuit-menu';
  const title = document.createElement('h1');
  title.textContent = 'DAILY CHALLENGE';
  const line = (text: string, color = 'var(--muted)') => {
    const p = document.createElement('p');
    p.textContent = text;
    Object.assign(p.style, { margin: '0', color, textAlign: 'center', font: '11px var(--pixel)' });
    return p;
  };
  const log = loadDaily();
  const best = log.best[c.day];
  const streak = streakOn(log, c.day);
  const when = line(`${c.day} · THE NEXT ONE IN ${hm(untilNext())}`);
  screen.append(
    title,
    line(c.layout.name.toUpperCase(), 'var(--gold)'),
    line(`TIME ATTACK · NORMAL · ${c.weather.name} · THE SAME FOR EVERYONE TODAY`, 'var(--accent-b)'),
    when,
    line(best ? `YOUR BEST TODAY: ${runText(best.score, best.time)}` : 'NO RUN YET TODAY: AS MANY AS YOU LIKE, YOUR BEST COUNTS', best ? 'var(--text)' : 'var(--muted)'),
    ...(streak ? [line(`STREAK: ${streak} DAY${streak === 1 ? '' : 'S'} ▲`, 'var(--gold)')] : []),
  );
  // the board: loading, then the day's (or why there isn't one)
  const board = document.createElement('div');
  Object.assign(board.style, { width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' });
  const say = (text: string) => board.replaceChildren(line(text));
  // (a build without the online board, as YouTube's: your best today is the board, and no initials asked for)
  const boards = online();
  if (boards) screen.append(board);
  if (boards) {
    say('LOADING THE BOARD…');
    const player = playerId();
    void (async () => {
      const name = initials();
      if (name) await sendPending(log, player, name);
      // (and any Time Trial lap records waiting for the world boards)
      if (name) void sendLaps(player, name, typeof __APP_VERSION__ === 'string' ? __APP_VERSION__.slice(0, 40) : undefined);
      const b = await fetchBoard(c.day, player, 10);
      if (closed?.aborted) return;
      if (!b) say("OFFLINE · YOUR BEST GOES ON THE BOARD WHEN YOU'RE BACK");
      else if (!b.entries) say('NO ONE ON THE BOARD YET TODAY: BE THE FIRST');
      else board.replaceChildren(line(`${b.entries} DRIVER${b.entries === 1 ? '' : 'S'} TODAY${b.you ? ` · YOU: #${b.you.place}` : ''}`, 'var(--gold)'), boardTable(b));
    })();
  }
  // your initials for the board: three letters or digits, typed (the phone's keyboard comes up), as on an arcade
  // board; shown until picked once, CHANGE brings the field back
  const naming$ = document.createElement('label');
  naming$.className = 'initials';
  const nameLabel = document.createElement('span');
  nameLabel.textContent = 'YOUR NAME ON THE BOARD';
  const field = document.createElement('input');
  Object.assign(field, { id: 'daily-initials', type: 'text', maxLength: 3, autocomplete: 'off', spellcheck: false, value: initials() ?? '' });
  field.setAttribute('autocapitalize', 'characters');
  field.setAttribute('enterkeyhint', 'done');
  field.setAttribute('aria-label', 'Your three initials');
  field.placeholder = 'ABC';
  const nameHint = document.createElement('span');
  nameHint.textContent = 'THREE LETTERS OR DIGITS';
  naming$.append(nameLabel, field, nameHint);
  // (capitals, letters and digits only, three at most)
  field.addEventListener('input', () => {
    const clean = field.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
    if (clean !== field.value) field.value = clean;
    nameHint.style.color = '';
  });
  const nameNow = () => field.value;
  const options = naming$;
  let naming = boards && !initials();
  /** Lay the screen out (the letters while naming, else the name and CHANGE); set below */
  let layOut = () => {};
  const nameButton = menuButton('', () => {
    naming = true;
    layOut();
    field.focus();
    field.select();
  });
  if (boards) screen.append(options);

  return new Promise((resolve) => {
    let done = false;
    const offBack = onBack(() => (finish('back'), true));
    const finish = (a: 'play' | 'back') => {
      if (done) return;
      done = true;
      if (a === 'play' && naming && !INITIALS.test(nameNow())) {
        // (not three yet: said, and back to the field)
        nameHint.style.color = 'var(--gold)';
        field.focus();
        done = false;
        return;
      }
      if (INITIALS.test(nameNow())) setInitials(nameNow());
      offBack();
      menuPick();
      screen.remove();
      resolve(a);
    };
    const playButton = menuButton('PLAY ▶', () => finish('play'));
    playButton.classList.add('race-button');
    const backButton = menuButton('BACK', () => finish('back'));
    screen.append(nameButton, playButton, backButton);
    let places: { el: HTMLElement; pick?: () => void; step?: (by: number) => void }[] = [];
    let focus = 0;
    const show = () => places.forEach((p, i) => p.el.classList.toggle('focused', i === focus));
    layOut = () => {
      options.style.display = naming ? '' : 'none';
      nameButton.style.display = naming || !boards ? 'none' : '';
      nameButton.textContent = `ON THE BOARD AS ${initials() ?? nameNow()} · CHANGE`;
      places = [
        ...(naming ? [{ el: options as HTMLElement, pick: () => field.focus() }] : boards ? [{ el: nameButton as HTMLElement, pick: () => nameButton.click() }] : []),
        { el: playButton, pick: () => finish('play') },
        { el: backButton, pick: () => finish('back') },
      ];
      focus = places.findIndex((p) => p.el === playButton);
      show();
    };
    layOut();
    // (the field: done or Enter leaves it; the deck's own keys are its letters while it's being typed in)
    field.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') field.blur();
    });
    field.addEventListener('focus', () => {
      focus = places.findIndex((p) => p.el === options);
      show();
    });
    holdTouches(screen);
    host.append(screen);
    hud.setPosition('');
    hud.setLap('');
    hud.setLabel('a', 'OK');
    hud.setLabel('b', '');
    // (the countdown to the next challenge, by the minute)
    const clock = setInterval(() => (when.textContent = `${c.day} · THE NEXT ONE IN ${hm(untilNext())}`), 30000);
    closed?.addEventListener('abort', () => {
      done = true;
      offBack();
      screen.remove();
    });
    const seen = new Map<Button, number>();
    const pressed = (b: Button) => {
      const n = controls.presses(b);
      const edge = n > (seen.get(b) ?? n);
      seen.set(b, n);
      return edge;
    };
    const tick = () => {
      if (done) {
        clearInterval(clock);
        return;
      }
      // (a report being made: its, not this screen's)
      const [down, up, left, right, a, start, select] = (['down', 'up', 'left', 'right', 'a', 'start', 'select'] as const).map((k) => pressed(k) && !reportOpen());
      const move = (down ? 1 : 0) - (up ? 1 : 0);
      if (move) {
        focus = (focus + move + places.length) % places.length;
        menuTick();
        show();
      }
      const at = places[focus];
      if ((left || right) && at.step) at.step(right ? 1 : -1);
      if ((a || start) && at.pick) at.pick();
      if (select) finish('back');
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
