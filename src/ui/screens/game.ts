import type { View } from '../../engine/view';
import { GAMES } from '../../games/index';
import type { Clock, Mounted, PlayCtx, PlayerInfo } from '../../games/types';
import { renderFor } from '../../games/views';
import { screenFrame, timerBar } from '../components';
import { h } from '../dom';
import type { Env } from './types';

type GameView = Extract<View, { s: 'game' }>;

const realClock: Clock = {
  now: () => performance.now(),
  after(ms, fn) {
    const id = setTimeout(fn, ms);
    return () => clearTimeout(id);
  },
  every(ms, fn) {
    const id = setInterval(fn, ms);
    return () => clearInterval(id);
  },
};

export function mountGame(slot: HTMLElement, first: GameView, env: Env): Mounted<View> {
  let players: readonly PlayerInfo[] = first.players;
  const bar = h('div', { class: 'game-bar' });
  const area = h('div', { class: 'game-area' });
  const frame = screenFrame({
    screen: 'game',
    attrs: { 'data-game': first.game, 'data-state': 'play' },
    head: [h('span', {}, `RUNDE ${first.r + 1}/${first.n} · ${GAMES[first.game].title}`), h('span', { class: 'code-small' }, first.code)],
    main: [bar, area],
  });
  const ctx: PlayCtx = {
    ...env.ctx,
    clock: realClock,
    players: () => players,
    setState: (state) => frame.root.setAttribute('data-state', state),
    punch: () => env.ctx.fx.punch(frame.root),
  };
  let barKey: number | undefined;

  const syncBar = (g: unknown): void => {
    const t = typeof g === 'object' && g !== null ? (g as { endsAt?: unknown; dur?: unknown }) : {};
    if (typeof t.endsAt !== 'number' || t.endsAt === barKey) return;
    barKey = t.endsAt;
    bar.replaceChildren(timerBar(t.endsAt, typeof t.dur === 'number' ? t.dur : undefined, ctx));
  };

  const round = first.r;
  syncBar(first.g);
  const inner = renderFor(first.game)(area, first.g, (payload) => env.send(round, payload), ctx);
  slot.append(frame.root);
  return {
    update(v) {
      if (v.s !== 'game') return;
      players = v.players;
      syncBar(v.g);
      inner.update(v.g);
    },
    destroy() {
      inner.destroy();
      frame.root.remove();
    },
  };
}
