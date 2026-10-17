import type { Mounted } from '../../games/types';
import type { View } from '../../engine/view';
import { createScope, h } from '../dom';
import type { Env } from './types';

type ResultView = Extract<View, { s: 'result' }>;

export function mountResult(slot: HTMLElement, first: ResultView, env: Env): Mounted<View> {
  const sc = createScope();
  const control = first.isHost ? env.control : undefined;
  const head = h('p', {});
  const list = h('ol', { 'aria-live': 'polite' });
  const kids: (HTMLElement | null)[] = [head, list];
  if (control) {
    const next = h('button', { type: 'button', testid: 'btn-next' }, 'WEITER');
    sc.on(next, 'click', () => control({ a: 'next' }));
    kids.push(next);
  }
  const el = h('main', { 'data-screen': 'result' }, ...kids);

  function update(v: View): void {
    if (v.s !== 'result') return;
    const name = (pid: string) => v.players.find((p) => p.pid === pid)?.name ?? '?';
    head.textContent = `RUNDE ${v.r + 1}/${v.n} · ${v.game.toUpperCase()}`;
    list.replaceChildren(
      ...v.rows.map((r) =>
        h(
          'li',
          { testid: 'result-row', 'data-pid': r.pid, 'data-points': r.points },
          `${r.place}. ${name(r.pid)}${r.pid === v.me ? ' (du)' : ''} · ${r.label} · +${r.points} · ${r.total}`,
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
