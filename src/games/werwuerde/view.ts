import { namePicker, counter, voteBars, type Block } from '../../ui/blocks';
import { panel } from '../../ui/components';
import { h } from '../../ui/dom';
import type { Render } from '../types';
import type { WerwuerdeInput, WerwuerdeView } from './logic';

type Vote = Extract<WerwuerdeView, { phase: 'vote' }>;
type Reveal = Extract<WerwuerdeView, { phase: 'reveal' }>;

const count = (v: Vote): string => `${v.voted}/${v.total} abgestimmt`;

export const renderWerwuerde: Render<WerwuerdeView, WerwuerdeInput> = (root, v, send, ctx) => {
  const qText = h('p', { class: 'q-text' });
  const stage = h('div', { class: 'ww-stage', 'aria-live': 'polite' });
  const q = panel(qText);
  let key = '';
  let tally: Block<[string]> | undefined;

  const showVote = (a: Vote): void => {
    const picker = namePicker(ctx, ctx.players(), {
      self: true,
      onPick: (to) => {
        send({ k: a.k, to });
        picker.set(to, true);
        ctx.setState('sent', { step: a.k });
      },
    });
    tally = counter(ctx, count(a));
    if (a.mine !== null) picker.set(a.mine, true);
    ctx.setState(a.mine === null ? 'vote' : 'sent', { step: a.k });
    stage.replaceChildren(picker.el, tally.el);
  };

  const showReveal = (r: Reveal): void => {
    tally = undefined;
    ctx.setState('reveal', { step: r.k });
    const players = ctx.players();
    const name = (pid: string): string => players.find((p) => p.pid === pid)?.name ?? '?';
    const bars = voteBars(
      ctx,
      r.rows.map((x) => ({ key: x.pid, label: name(x.pid), count: x.count, mine: x.pid === r.mine, top: r.top.includes(x.pid) })),
    );
    const top = r.top.length > 0 ? `Meiste Stimmen: ${r.top.map(name).join(', ')}` : 'Keine Stimmen';
    const duo = r.agree === null ? null : r.agree ? 'Einig – ihr beide punktet' : 'Uneinig – keine Punkte';
    stage.replaceChildren(
      bars.el,
      h('p', { class: 'ww-top', testid: 'ww-top' }, top),
      ...(duo === null ? [] : [h('p', { class: 'ww-duo', testid: 'ww-duo', 'data-agree': String(r.agree) }, duo)]),
    );
    if (r.mine !== null) ctx.sfx.play(r.top.includes(r.mine) ? 'ok' : 'bad');
  };

  const show = (g: WerwuerdeView): void => {
    const next = `${g.phase}${g.k}`;
    if (next === key) {
      if (g.phase === 'vote') tally?.set(count(g));
      return;
    }
    key = next;
    qText.textContent = g.text;
    if (g.phase === 'vote') showVote(g);
    else showReveal(g);
  };

  root.append(q, stage);
  show(v);

  return {
    update: show,
    destroy() {
      q.remove();
      stage.remove();
    },
  };
};
