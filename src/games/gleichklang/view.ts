import { panel, playerBadge } from '../../ui/components';
import { h } from '../../ui/dom';
import { choicePad, counter, type Block } from '../../ui/blocks';
import type { Render } from '../types';
import type { GleichklangInput, GleichklangView } from './logic';

type Ask = Extract<GleichklangView, { phase: 'ask' }>;
type Reveal = Extract<GleichklangView, { phase: 'reveal' }>;

const count = (a: Ask): string => `${a.answered}/${a.total} abgegeben`;

export const renderGleichklang: Render<GleichklangView, GleichklangInput> = (root, v, send, ctx) => {
  const qText = h('p', { class: 'q-text' });
  const stage = h('div', { class: 'gk-stage', 'aria-live': 'polite' });
  const q = panel(qText);
  let key = '';
  let tally: Block<[string]> | undefined;

  const showAsk = (a: Ask): void => {
    const shownAt = ctx.clock.now();
    const pad = choicePad(ctx, a.opts, {
      cols: 1,
      onPick: (i) => {
        send({ k: a.k, i, ms: Math.round(ctx.clock.now() - shownAt) });
        ctx.setState('sent', { step: a.k });
      },
    });
    tally = counter(ctx, count(a));
    if (a.mine !== null) pad.set(a.opts, a.mine);
    ctx.setState(a.mine === null ? 'ask' : 'sent', { step: a.k });
    stage.replaceChildren(pad.el, tally.el);
  };

  const showReveal = (r: Reveal): void => {
    tally = undefined;
    ctx.setState('reveal', { step: r.k });
    const players = ctx.players();
    const groups = r.groups.map((g) =>
      h(
        'div',
        {
          class: 'gk-group',
          testid: 'gk-group',
          'data-i': g.i,
          'data-main': String(r.main.includes(g.i)),
          'data-me': r.mine === g.i ? 'true' : null,
        },
        h(
          'p',
          { class: 'gk-head' },
          h('span', { class: 'gk-opt' }, r.opts[g.i] ?? '?'),
          r.main.includes(g.i) ? h('span', { class: 'gk-tag' }, 'HAUPTSTROM') : null,
        ),
        h(
          'p',
          { class: 'gk-who' },
          ...g.pids.map((pid) => {
            const p = players.find((x) => x.pid === pid) ?? { pid, name: '?', color: 0, online: true };
            return h('span', { class: 'gk-chip' }, playerBadge(p, { size: 's', me: pid === ctx.me }), h('span', { class: 'name' }, p.name));
          }),
        ),
      ),
    );
    const names = r.none.map((pid) => players.find((x) => x.pid === pid)?.name ?? '?');
    const team =
      r.k === r.of - 1
        ? `Ihr wart ${r.team.hit}/${r.of} im Gleichklang`
        : `Bisher ${r.team.hit}/${r.team.asked} im Gleichklang`;
    stage.replaceChildren(
      h('div', { class: 'gk-groups', testid: 'gk-groups' }, ...groups),
      ...(names.length > 0 ? [h('p', { class: 'gk-none' }, `Nichts getippt: ${names.join(', ')}`)] : []),
      h('p', { class: 'gk-team', testid: 'gk-team' }, team),
    );
    if (r.mine !== null) {
      const hit = r.groups.some((g) => g.i === r.mine && g.pids.length >= 2);
      ctx.sfx.play(hit ? 'ok' : 'bad');
    }
  };

  const show = (g: GleichklangView): void => {
    const next = `${g.phase}${g.k}`;
    if (next === key) {
      if (g.phase === 'ask') tally?.set(count(g));
      return;
    }
    key = next;
    qText.textContent = g.q;
    if (g.phase === 'ask') showAsk(g);
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
