import type { View } from '../../engine/view';
import { GAMES } from '../../games/index';
import type { Mounted } from '../../games/types';
import { renderFor } from '../../games/views';
import { screenFrame } from '../components';
import { h } from '../dom';
import type { Env } from './types';

type GameView = Extract<View, { s: 'game' }>;

export function mountGame(slot: HTMLElement, first: GameView, env: Env): Mounted<View> {
  const frame = screenFrame({
    screen: 'game',
    attrs: { 'data-game': first.game, 'data-state': 'play' },
    head: [h('span', {}, `RUNDE ${first.r + 1}/${first.n} · ${GAMES[first.game].title}`), h('span', { class: 'code-small' }, first.code)],
    main: [],
  });
  const round = first.r;
  const inner = renderFor(first.game)(frame.body, first.g, (payload) => env.send(round, payload), env.ctx);
  slot.append(frame.root);
  return {
    update(v) {
      if (v.s === 'game') inner.update(v.g);
    },
    destroy() {
      inner.destroy();
      frame.root.remove();
    },
  };
}
