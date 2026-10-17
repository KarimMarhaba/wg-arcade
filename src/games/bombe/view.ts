import { playerBadge } from '../../ui/components';
import { h } from '../../ui/dom';
import { resumeBombe } from '../resume';
import type { Render } from '../types';
import { BOMBE_BALLOONS, type BombeInput, type BombeLive, type BombeRes, type BombeView } from './logic';
import { createBombeRun, type BombeEvent } from './play';

const GROW_AT = 30;
const SYMBOL = { pumpt: '🎈', kassiert: '💰', geplatzt: '💥' } as const;
const WORD = { pumpt: 'pumpt', kassiert: 'kassiert', geplatzt: 'geplatzt' } as const;
const pts = (n: number): string => `${n} ${n === 1 ? 'PUNKT' : 'PUNKTE'}`;

export const renderBombe: Render<BombeView, BombeInput> = (root, v, send, ctx) => {
  const r = resumeBombe(v, ctx.clock.now(), ctx.toLocal);
  const results: (BombeRes | null)[] = Array.from({ length: BOMBE_BALLOONS }, (_, b) => v.mine.res[b] ?? null);
  let live: readonly BombeLive[] = v.live;
  let liveKey = '';

  const liveEl = h('ul', { class: 'bombe-live', testid: 'bombe-live', 'aria-label': 'Stand der anderen' });
  const score = h('p', { class: 'bombe-pts display', testid: 'bombe-pts' });
  const balloon = h('div', { class: 'balloon', testid: 'balloon', 'aria-hidden': 'true' });
  const stage = h('div', { class: 'bombe-stage' }, balloon);
  const chips = h('ul', { class: 'chips', 'aria-label': 'Ballons' });
  const status = h('p', { class: 'game-status', role: 'status', 'aria-live': 'polite' });
  const pumpBtn = h('button', { class: 'bombe-btn', type: 'button', 'data-kind': 'pump', testid: 'btn-pump', 'data-silent': 'true' }, 'PUMPEN');
  const cashBtn = h('button', { class: 'bombe-btn', type: 'button', 'data-kind': 'cash', testid: 'btn-cash', 'data-silent': 'true' }, 'KASSIEREN');
  const btns = h('div', { class: 'bombe-btns' }, pumpBtn, cashBtn);

  const drawLive = (): void => {
    const list = ctx.players();
    const key = JSON.stringify([list.map((p) => [p.pid, p.name, p.color, p.online]), live]);
    if (key === liveKey) return;
    liveKey = key;
    liveEl.replaceChildren(
      ...list.map((p) => {
        const mine = live.filter((e) => e.pid === p.pid);
        return h(
          'li',
          { class: 'live-item', 'data-pid': p.pid, 'aria-label': `${p.name}: ${WORD[mine.at(-1)?.s ?? 'pumpt']}` },
          playerBadge(p, { size: 's', me: p.pid === ctx.me }),
          h(
            'span',
            { class: 'live-syms', 'aria-hidden': 'true' },
            ...mine.map((e) => h('span', { class: 'live-sym', 'data-s': e.s, 'data-b': e.b }, SYMBOL[e.s])),
          ),
        );
      }),
    );
  };

  const drawChips = (): void =>
    chips.replaceChildren(
      ...results.map((x, b) =>
        h('li', { class: 'chip', 'data-b': b, 'data-s': x?.s ?? null }, x === null ? '–' : x.s === 'pop' ? '💥' : `💰 ${x.pts}`),
      ),
    );

  const onPhase = (e: BombeEvent): void => {
    const over = e.phase === 'done';
    ctx.setState(e.phase, { step: Math.min(e.b, BOMBE_BALLOONS - 1) });
    balloon.style.setProperty('--g', String(Math.min(1, e.n / GROW_AT)));
    balloon.setAttribute('data-state', e.phase);
    balloon.toggleAttribute('data-locked', e.locked);
    pumpBtn.disabled = cashBtn.disabled = e.locked;
    score.textContent = e.phase === 'popped' ? 'BUMM!' : pts(e.phase === 'cashed' ? e.pts : e.n * e.n);
    if (e.phase === 'popped' || e.phase === 'cashed') {
      results[e.b] = { s: e.phase === 'popped' ? 'pop' : 'cash', pts: e.pts };
      if (e.phase === 'popped') {
        ctx.sfx.play('bad');
        ctx.sfx.buzz([60, 40, 120]);
        ctx.fx.flash('bad');
      } else {
        ctx.sfx.play('ok');
        ctx.sfx.buzz(15);
        ctx.fx.flash('ok');
      }
    }
    status.textContent = over
      ? `FERTIG · ${pts(results.reduce((a, x) => a + (x?.pts ?? 0), 0))}`
      : e.phase === 'popped'
        ? 'GEPLATZT – 0 Punkte'
        : e.phase === 'cashed'
          ? 'KASSIERT'
          : e.locked
            ? 'WARTE AUFS URTEIL …'
            : `BALLON ${e.b + 1}/${BOMBE_BALLOONS}`;
    drawChips();
  };

  const run = createBombeRun({ b: r.b, n: r.n, end: r.end, show: v.show, clock: ctx.clock, send, onPhase });

  pumpBtn.addEventListener('pointerdown', () => {
    if (!run.pump()) return;
    ctx.sfx.play('tap');
    ctx.sfx.buzz(10);
  });
  cashBtn.addEventListener('click', () => void run.cash());

  drawLive();
  root.append(liveEl, score, stage, chips, status, btns);
  return {
    update(next) {
      live = next.live;
      drawLive();
      run.sync(next.mine);
    },
    destroy() {
      run.stop();
      for (const el of [liveEl, score, stage, chips, status, btns]) el.remove();
    },
  };
};
