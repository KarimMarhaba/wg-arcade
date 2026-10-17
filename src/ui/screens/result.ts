import type { View } from '../../engine/view';
import { GAMES } from '../../games/index';
import type { Mounted } from '../../games/types';
import { button, playerBadge, scoreRow, screenFrame, syncOnline, timerBar } from '../components';
import { createScope, h } from '../dom';
import type { Env } from './types';

type ResultView = Extract<View, { s: 'result' }>;

export function mountResult(slot: HTMLElement, first: ResultView, env: Env): Mounted<View> {
  const sc = createScope();
  const { sfx, fx } = env.ctx;
  const control = first.isHost ? env.control : undefined;
  const list = h('ol', { class: 'scores', 'aria-live': 'polite' });
  const head = h('span', {});
  const foot: HTMLElement[] = [];
  if (control) {
    const next = button('WEITER', { size: 'l', testid: 'btn-next' });
    sc.on(next, 'click', () => control({ a: 'next' }));
    foot.push(next);
  }
  const frame = screenFrame({
    screen: 'result',
    head: [head, h('span', { class: 'code-small' }, first.code)],
    main: [list, timerBar(first.until, undefined, env.ctx)],
    foot: foot.length ? foot : undefined,
  });
  let shown: string | undefined;

  function update(v: View): void {
    if (v.s !== 'result') return;
    syncOnline(list, v.players);
    head.textContent = `RUNDE ${v.r + 1}/${v.n} · ${GAMES[v.game].title}`;
    const key = JSON.stringify([v.rows, v.players.map((p) => [p.pid, p.name, p.color])]);
    if (key === shown) return;
    const fresh = shown === undefined;
    shown = key;
    list.replaceChildren(
      ...v.rows.map((r, index) => {
        const player = v.players.find((p) => p.pid === r.pid);
        const me = r.pid === v.me;
        const row = scoreRow({
          pid: r.pid,
          place: r.place,
          badge: playerBadge({ pid: r.pid, name: player?.name ?? '?', color: player?.color ?? 0, online: player?.online }, { size: 's', me }),
          name: player?.name ?? '?',
          me,
          total: r.total,
          label: r.label,
          points: r.points,
          index,
          testid: 'result-row',
          enter: fresh,
        });
        if (fresh && r.points > 0) fx.floatText(row.querySelector('.pts') ?? row, `+${r.points}`);
        return row;
      }),
    );
    if (!fresh) return;
    const mine = v.rows.find((r) => r.pid === v.me);
    if (!mine) return;
    sfx.play(mine.points > 0 ? 'ok' : 'bad');
    fx.flash(mine.points > 0 ? 'ok' : 'bad');
    if (mine.points > 0) fx.punch(frame.root);
  }

  update(first);
  slot.append(frame.root);
  return {
    update,
    destroy() {
      sc.dispose();
      frame.root.remove();
    },
  };
}
