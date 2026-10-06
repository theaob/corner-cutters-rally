// The world board on the circuit screen in a Time Trial: the circuit's best
// laps in the weather picked, from everyone (the top three) and your place
// among them, read as the card and the weather change (each read kept a
// minute). Without initials yet, a field for them: three letters or digits,
// and your record laps go on the boards (boards.ts).

import { online } from '../../engine/backend';
import { fetchLapBoard, isBoardWeather, sendLaps, type LapBoard, type LapEntry } from '../boards';
import { INITIALS, initials, playerId, setInitials } from '../profile';
import { formatTime } from '../records';

/** ms a board read is kept before it's read again */
const FRESH_MS = 60_000;

export interface WorldBoard {
  el: HTMLElement;
  /** Show `circuit`'s board in `weather` (none for a weather without one). */
  show(circuit: string, weather: string): void;
}

const version = (): string | undefined => (typeof __APP_VERSION__ === 'string' ? __APP_VERSION__.slice(0, 40) : undefined);

/** A line of the board: place, initials, time; you in gold. */
function entryRow(e: LapEntry): HTMLElement {
  const row = document.createElement('div');
  row.className = `world-row${e.you ? ' you' : ''}`;
  for (const [text, cls] of [[`${e.place}`, 'place'], [e.name, 'name'], [formatTime(e.time), 'time']] as const) {
    const c = document.createElement('span');
    c.className = cls;
    c.textContent = text;
    row.append(c);
  }
  return row;
}

export function worldBoard(): WorldBoard {
  const el = document.createElement('div');
  el.className = 'world-board';
  const reads = new Map<string, { at: number; board?: LapBoard }>();
  let showing = '';
  /** the laps waiting went (or there were none): once a screen, before the first read */
  let flushed: Promise<unknown> | undefined;

  const line = (text: string, cls = '') => {
    const p = document.createElement('p');
    p.className = `world-line${cls ? ` ${cls}` : ''}`;
    p.textContent = text;
    return p;
  };

  /** the field for your initials, until you have them */
  const nameField = (): HTMLElement => {
    const label = document.createElement('label');
    label.className = 'world-name';
    const say = document.createElement('span');
    say.textContent = 'YOUR NAME ON THE BOARDS';
    const field = document.createElement('input');
    Object.assign(field, { type: 'text', maxLength: 3, autocomplete: 'off', spellcheck: false, placeholder: 'ABC' });
    field.setAttribute('autocapitalize', 'characters');
    field.setAttribute('enterkeyhint', 'done');
    field.setAttribute('aria-label', 'Your three initials for the boards');
    field.addEventListener('input', () => {
      const clean = field.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
      if (clean !== field.value) field.value = clean;
      if (INITIALS.test(clean)) {
        setInitials(clean);
        field.blur();
        // (your laps waiting go on now, and the board's read again with you on it)
        flushed = sendLaps(playerId(), clean, version());
        reads.clear();
        const [circuit, weather] = showing.split('|');
        showing = '';
        show(circuit, weather);
      }
    });
    field.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') field.blur();
    });
    label.append(say, field);
    return label;
  };

  const render = (key: string, title: string, board: LapBoard | undefined | 'loading') => {
    if (key !== showing) return;
    const parts: HTMLElement[] = [line(title, 'world-title')];
    if (board === 'loading') parts.push(line('READING THE BOARD…'));
    else if (!board) parts.push(line("OFFLINE · YOUR RECORDS GO ON WHEN YOU'RE BACK"));
    else if (!board.entries) parts.push(line('NO LAPS HERE YET: SET THE FIRST'));
    else {
      const rows = board.top.map(entryRow);
      if (board.you && !board.top.some((e) => e.you)) rows.push(line('···', 'world-gap'), entryRow({ ...board.you, you: true }));
      parts.push(...rows, line(`${board.entries} DRIVER${board.entries === 1 ? '' : 'S'}${board.you ? ` · YOU #${board.you.place}` : ''}`, 'world-count'));
    }
    if (!initials()) parts.push(nameField());
    el.replaceChildren(...parts);
  };

  const show = (circuit: string, weather: string) => {
    el.hidden = !online() || !isBoardWeather(weather);
    if (el.hidden) return;
    const key = `${circuit}|${weather}`;
    if (key === showing) return;
    showing = key;
    const title = `WORLD BOARD · ${weather.toUpperCase()}`;
    const kept = reads.get(key);
    if (kept && Date.now() - kept.at < FRESH_MS) {
      render(key, title, kept.board);
      return;
    }
    render(key, title, 'loading');
    const name = initials();
    flushed ??= name ? sendLaps(playerId(), name, version()) : Promise.resolve();
    void flushed.then(() => fetchLapBoard(circuit, weather as Parameters<typeof fetchLapBoard>[1], playerId(), 3)).then((board) => {
      reads.set(key, { at: Date.now(), board });
      render(key, title, board);
    });
  };

  el.hidden = true;
  return { el, show };
}
