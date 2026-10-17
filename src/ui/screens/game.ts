import type { Mounted } from '../../games/types';
import type { View } from '../../engine/view';
import { renderFor } from '../../games/views';
import { h } from '../dom';
import type { Env } from './types';

type GameView = Extract<View, { s: 'game' }>;

export function mountGame(slot: HTMLElement, first: GameView, env: Env): Mounted<View> {
  const header = h('p', {}, `RUNDE ${first.r + 1}/${first.n} · ${first.game.toUpperCase()}`);
  const el = h('main', { 'data-screen': 'game', 'data-game': first.game, 'data-state': 'play' }, header);
  const round = first.r;
  const inner = renderFor(first.game)(el, first.g, (payload) => env.send(round, payload), env.ctx);
  slot.append(el);
  return {
    update(v) {
      if (v.s === 'game') inner.update(v.g);
    },
    destroy() {
      inner.destroy();
      el.remove();
    },
  };
}
