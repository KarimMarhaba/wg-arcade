import { playerBadge } from '../../ui/components';
import { h } from '../../ui/dom';
import { resumeHammer } from '../resume';
import type { Render } from '../types';
import type { HammerInput, HammerView } from './logic';
import { createHammerRun } from './play';

interface Row {
  fill: HTMLElement;
  n: HTMLElement;
}

export const renderHammer: Render<HammerView, HammerInput> = (root, v, send, ctx) => {
  const r = resumeHammer(v, ctx.clock.now(), ctx.toLocal);
  let count = r.count;
  let others: Record<string, number> = Object.fromEntries(v.bars.map((b) => [b.pid, b.n]));
  const bars = h('ul', { class: 'bars', 'aria-label': 'Spielstand' });
  const counter = h('p', { class: 'hammer-count display', testid: 'hammer-count' }, String(count));
  const status = h('p', { class: 'game-status', role: 'status' });
  const btn = h('button', { class: 'hammer-btn', type: 'button', testid: 'btn-hammer', 'data-silent': 'true' }, 'HÄMMERN');
  const rows = new Map<string, Row>();
  let rowsKey = '';

  const sync = (): void => {
    const list = ctx.players();
    const key = JSON.stringify(list.map((p) => [p.pid, p.name, p.color, p.online]));
    if (key === rowsKey) return;
    rowsKey = key;
    rows.clear();
    bars.replaceChildren(
      ...list.map((p) => {
        const fill = h('div', { class: 'bar-fill' });
        const n = h('span', { class: 'bar-n' });
        rows.set(p.pid, { fill, n });
        return h(
          'li',
          { class: 'bar-row', 'data-pid': p.pid, 'data-color': ((p.color % 8) + 8) % 8 },
          playerBadge(p, { size: 's', me: p.pid === ctx.me }),
          h('div', { class: 'bar-track' }, fill),
          n,
        );
      }),
    );
  };

  const paint = (): void => {
    const list = ctx.players();
    const values = list.map((p) => (p.pid === ctx.me ? count : (others[p.pid] ?? 0)));
    const top = Math.max(1, ...values);
    list.forEach((p, k) => {
      const row = rows.get(p.pid);
      if (!row) return;
      row.fill.style.setProperty('--w', String((values[k] ?? 0) / top));
      row.n.textContent = String(values[k] ?? 0);
    });
  };

  const run = createHammerRun({
    from: r.count,
    end: r.end,
    clock: ctx.clock,
    send,
    onCount(n) {
      count = n;
      counter.textContent = String(n);
      paint();
    },
    onDone() {
      ctx.setState('done');
      btn.setAttribute('data-state', 'done');
      btn.textContent = 'FERTIG';
      status.textContent = `FERTIG · ${count} ${count === 1 ? 'Tap' : 'Taps'}`;
    },
  });

  btn.addEventListener('pointerdown', () => {
    if (!run.tap()) return;
    ctx.sfx.play('tap');
    ctx.sfx.buzz(10);
  });

  ctx.setState('play');
  sync();
  paint();
  root.append(bars, counter, status, btn);
  return {
    update(next) {
      others = Object.fromEntries(next.bars.map((b) => [b.pid, b.n]));
      sync();
      paint();
    },
    destroy() {
      run.stop();
      for (const el of [bars, counter, status, btn]) el.remove();
    },
  };
};
