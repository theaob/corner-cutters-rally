// The Championship's shop (the Google Play build, until it's bought): what it
// brings (a season, ten rounds, every circuit), its price from Google Play,
// BUY, RESTORE PURCHASE and BACK. Touch, or keys: up/down moves, A or START
// picks, SELECT (or the phone's back button) goes back.

import type { Button } from '../../engine/controls';
import { onBack } from '../../engine/backButton';
import { holdTouches } from '../../engine/deck';
import type { Services } from '../../engine/services';
import { menuButton } from '../circuitSelect';
import { LAYOUTS } from '../layouts';
import { bought, type Shop } from '../purchase';
import { menuPick, menuTick } from '../sounds';
import { trophy } from './celebrate';
import { reportOpen } from '../report';

/** The Championship's shop in `host` until it's bought ('owned') or the player goes back. */
export function showShop(host: HTMLElement, services: Services, shop: Shop, closed?: AbortSignal): Promise<'owned' | 'back'> {
  const { controls, hud } = services;
  const screen = document.createElement('div');
  screen.className = 'circuit-menu';
  const title = document.createElement('h1');
  title.textContent = 'CHAMPIONSHIP';
  const line = (text: string, color = 'var(--muted)') => {
    const p = document.createElement('p');
    p.textContent = text;
    Object.assign(p.style, { margin: '0', color, textAlign: 'center', font: '11px var(--pixel)' });
    return p;
  };
  const status = line('', 'var(--accent-b)');
  screen.append(
    title,
    trophy(72),
    line(`A SEASON OF ${LAYOUTS.length} ROUNDS: F1 POINTS, STANDINGS, A TITLE TO WIN`, 'var(--text)'),
    line(`AND EVERY CIRCUIT (${LAYOUTS.length - 1} MORE), OPEN FOR QUICK RACE, TIME ATTACK AND TIME TRIAL AS THE SEASON REACHES THEM`),
    line('ONE PURCHASE, YOURS FOR GOOD'),
    status,
  );
  const buyButton = menuButton('', () => void buy());
  const restoreButton = menuButton('RESTORE PURCHASE', () => void restore());
  const backButton = menuButton('BACK', () => finish('back'));
  const buttons = [buyButton, restoreButton, backButton];
  screen.append(...buttons);
  let busy = false;
  const render = () => {
    const st = shop.state();
    buyButton.textContent = busy ? 'WITH GOOGLE PLAY…' : st.price ? `UNLOCK · ${st.price}` : st.error ? 'UNLOCK' : 'CONNECTING TO GOOGLE PLAY…';
    buyButton.disabled = busy || !st.ready;
    status.textContent = st.error ?? '';
  };
  render();
  holdTouches(screen);
  host.append(screen);
  hud.setPosition('');
  hud.setLap('');
  hud.setLabel('a', 'OK');
  hud.setLabel('b', '');

  let done = false;
  let resolveIt: (r: 'owned' | 'back') => void = () => {};
  const finish = (r: 'owned' | 'back') => {
    if (done) return;
    done = true;
    offBack();
    menuPick();
    screen.remove();
    resolveIt(r);
  };
  const offBack = onBack(() => (finish('back'), true));
  closed?.addEventListener('abort', () => finish('back'));
  shop.onChange(() => {
    if (done) return;
    if (bought()) finish('owned');
    else render();
  });
  async function buy() {
    if (busy) return;
    busy = true;
    render();
    const ok = await shop.buy();
    busy = false;
    if (ok || bought()) finish('owned');
    else render();
  }
  async function restore() {
    if (busy) return;
    busy = true;
    status.textContent = 'LOOKING FOR YOUR PURCHASE…';
    render();
    const ok = await shop.restore();
    busy = false;
    if (ok) finish('owned');
    else {
      render();
      status.textContent = shop.state().error ?? 'NO PURCHASE FOUND ON THIS GOOGLE ACCOUNT';
    }
  }

  return new Promise((resolve) => {
    resolveIt = resolve;
    let focus = 0;
    const show = () => buttons.forEach((b, i) => b.classList.toggle('focused', i === focus));
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
      // (a report being made: its, not this screen's)
      const [down, up, a, start, select] = (['down', 'up', 'a', 'start', 'select'] as const).map((k) => pressed(k) && !reportOpen());
      const move = (down ? 1 : 0) - (up ? 1 : 0);
      if (move) {
        focus = (focus + move + buttons.length) % buttons.length;
        menuTick();
        show();
      }
      if (a || start) buttons[focus].click();
      if (select) finish('back');
      if (!done) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
