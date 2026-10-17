import type { View } from '../../engine/view';
import type { Mounted } from '../../games/types';
import { button, playerBadge, scoreRow, screenFrame, syncOnline, waitDots } from '../components';
import { startConfetti } from '../confetti';
import { createScope, h } from '../dom';
import type { Env } from './types';

type PodiumView = Extract<View, { s: 'podium' }>;

const STAGE_ORDER = [1, 0, 2];
const STAGE_SIZE = 3;

function colorsOf(players: readonly { color: number }[]): string[] {
  const cs = getComputedStyle(document.documentElement);
  return players.map((p) => cs.getPropertyValue(`--p${((p.color % 8) + 8) % 8}`).trim()).filter(Boolean);
}

export function mountPodium(slot: HTMLElement, first: PodiumView, env: Env): Mounted<View> {
  const sc = createScope();
  const { sfx, fx } = env.ctx;
  const control = first.isHost ? env.control : undefined;
  const stage = h('div', { class: 'podium-stage' });
  const list = h('ol', { class: 'scores', testid: 'podium', 'aria-live': 'polite' });
  const foot: HTMLElement[] = [];
  if (control) {
    const again = button('NOCHMAL', { size: 'l', testid: 'btn-again' });
    const fresh = button('NEUE PARTY', { size: 'l', variant: 'ghost', testid: 'btn-new' });
    sc.on(again, 'click', () => control({ a: 'again' }));
    sc.on(fresh, 'click', () => control({ a: 'lobby' }));
    foot.push(again, fresh);
  } else {
    foot.push(h('p', { class: 'note' }, 'Warte auf den Host …', waitDots()));
  }
  const frame = screenFrame({ screen: 'podium', main: [h('h2', {}, 'SIEGER'), stage, list], foot });
  let shown: string | undefined;

  function update(v: View): void {
    if (v.s !== 'podium') return;
    syncOnline(frame.root, v.players);
    const key = JSON.stringify([v.rows, v.players.map((p) => [p.pid, p.name, p.color])]);
    if (key === shown) return;
    const fresh = shown === undefined;
    shown = key;
    const player = (pid: string) => v.players.find((p) => p.pid === pid);
    const top = v.rows.slice(0, STAGE_SIZE);
    stage.replaceChildren(
      ...STAGE_ORDER.filter((rank) => rank < top.length).map((rank, i) => {
        const r = top[rank] as (typeof top)[number];
        const p = player(r.pid);
        const col = h(
          'div',
          { class: 'podium-col', 'data-color': p?.color ?? 0 },
          h(
            'div',
            { class: 'podium-who' },
            playerBadge({ pid: r.pid, name: p?.name ?? '?', color: p?.color ?? 0, online: p?.online }, { size: 's', me: r.pid === v.me }),
            h('span', { class: 'name' }, p?.name ?? '?'),
            h('span', { class: 'total' }, String(r.total)),
          ),
          h('div', { class: 'podium-block', 'data-rank': rank }, String(r.place)),
        );
        col.style.setProperty('--i', String(i));
        return col;
      }),
    );
    list.replaceChildren(
      ...v.rows.map((r, index) => {
        const p = player(r.pid);
        return scoreRow({
          pid: r.pid,
          place: r.place,
          badge: playerBadge({ pid: r.pid, name: p?.name ?? '?', color: p?.color ?? 0, online: p?.online }, { size: 's', me: r.pid === v.me }),
          name: p?.name ?? '?',
          me: r.pid === v.me,
          total: r.total,
          index,
          testid: 'podium-row',
          enter: fresh,
        });
      }),
    );
  }

  update(first);
  slot.append(frame.root);
  sfx.play('win');
  const confetti = fx.reducedMotion() ? undefined : startConfetti(frame.root, colorsOf(first.players));
  return {
    update,
    destroy() {
      confetti?.destroy();
      sc.dispose();
      frame.root.remove();
    },
  };
}
