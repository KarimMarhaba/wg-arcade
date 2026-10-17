import type { Mounted } from '../../games/types';
import type { View } from '../../engine/view';
import { createScope, h } from '../dom';
import type { Env } from './types';

type PodiumView = Extract<View, { s: 'podium' }>;

export function mountPodium(slot: HTMLElement, first: PodiumView, env: Env): Mounted<View> {
  const sc = createScope();
  const control = first.isHost ? env.control : undefined;
  const list = h('ol', { testid: 'podium' });
  const kids: HTMLElement[] = [h('h2', {}, 'SIEGER'), list];
  if (control) {
    const again = h('button', { type: 'button', testid: 'btn-again' }, 'NOCHMAL');
    const fresh = h('button', { type: 'button', testid: 'btn-new' }, 'NEUE PARTY');
    sc.on(again, 'click', () => control({ a: 'again' }));
    sc.on(fresh, 'click', () => control({ a: 'lobby' }));
    kids.push(again, fresh);
  } else {
    kids.push(h('p', {}, 'Warte auf den Host …'));
  }
  const el = h('main', { 'data-screen': 'podium' }, ...kids);

  function update(v: View): void {
    if (v.s !== 'podium') return;
    const name = (pid: string) => v.players.find((p) => p.pid === pid)?.name ?? '?';
    list.replaceChildren(
      ...v.rows.map((r) =>
        h(
          'li',
          { testid: 'podium-row', 'data-pid': r.pid, 'data-total': r.total },
          `${r.place}. ${name(r.pid)}${r.pid === v.me ? ' (du)' : ''} · ${r.total}`,
        ),
      ),
    );
  }

  update(first);
  slot.append(el);
  return {
    update,
    destroy() {
      sc.dispose();
      el.remove();
    },
  };
}
