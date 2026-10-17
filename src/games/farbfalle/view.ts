import { h } from '../../ui/dom';
import { FF_COLORS } from '../colors';
import { resumeFarbfalle } from '../resume';
import type { Render } from '../types';
import type { FarbfalleInput, FarbfalleView } from './logic';
import { createFarbfalleRun, fmtScore } from './play';

export const renderFarbfalle: Render<FarbfalleView, FarbfalleInput> = (root, v, send, ctx) => {
  const r = resumeFarbfalle(v, ctx.clock.now(), ctx.toLocal);
  let score = r.score;
  let next = r.next;
  const scoreEl = h('span', { class: 'ff-score', testid: 'ff-score' }, fmtScore(score));
  const word = h('p', { class: 'ff-word display', testid: 'ff-word' });
  const status = h('p', { class: 'game-status', role: 'status' });
  const buttons = FF_COLORS.map((c) =>
    h('button', { class: 'ff-btn', type: 'button', testid: `ff-${c.id}`, 'data-ff': c.id, 'data-silent': 'true' }, c.word),
  );

  const showWord = (): void => {
    const item = v.seq[next];
    if (!item) return;
    word.textContent = FF_COLORS[item[0]]?.word ?? '';
    word.setAttribute('data-ink', FF_COLORS[item[1]]?.id ?? '');
  };

  const run = createFarbfalleRun({
    seq: v.seq,
    from: { next, score },
    end: r.end,
    clock: ctx.clock,
    send,
    onStep({ s }) {
      next = s.next;
      score = s.score;
      scoreEl.textContent = fmtScore(score);
      showWord();
    },
    onDone() {
      ctx.setState('done');
      word.removeAttribute('data-ink');
      word.textContent = 'FERTIG';
      status.textContent = `FERTIG · ${fmtScore(score)}`;
    },
  });

  buttons.forEach((b, k) =>
    b.addEventListener('pointerdown', () => {
      const ok = run.answer(k);
      if (ok === null) return;
      ctx.sfx.play(ok ? 'ok' : 'bad');
      ctx.sfx.buzz(ok ? 10 : [30, 40, 30]);
      ctx.fx.flash(ok ? 'ok' : 'bad');
    }),
  );

  ctx.setState('play');
  showWord();
  root.append(h('p', { class: 'ff-top' }, h('span', {}, 'PUNKTE'), scoreEl), word, status, h('div', { class: 'ff-grid' }, ...buttons));
  return {
    update() {},
    destroy() {
      run.stop();
      root.replaceChildren();
    },
  };
};
