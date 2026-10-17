import { choicePad, counter, spotlight, voteBars, type Block } from '../../ui/blocks';
import { button, panel } from '../../ui/components';
import { h } from '../../ui/dom';
import type { PlayerInfo, Render } from '../types';
import type { LbInput, LbView } from './logic';

type Of<P extends LbView['phase']> = Extract<LbView, { phase: P }>;

const OPTIONS = ['WAHR', 'GELOGEN'] as const;
const unknown = (pid: string): PlayerInfo => ({ pid, name: '?', color: 0, online: true });

const countText = (v: Of<'vote'>): string => `${v.voted}/${v.total} getippt`;
const sigOf = (g: LbView): string =>
  JSON.stringify([
    g.phase,
    g.k,
    g.role,
    g.topic,
    'mode' in g ? g.mode : null,
    'canSwap' in g ? g.canSwap : null,
    'mine' in g ? g.mine : null,
    'truth' in g ? g.truth : null,
  ]);

export const renderLuegenbaron: Render<LbView, LbInput> = (root, v, send, ctx) => {
  const stage = h('div', { class: 'lb-stage', 'aria-live': 'polite' });
  let sig = '';
  let tally: Block<[string]> | undefined;

  const who = (pid: string): PlayerInfo => ctx.players().find((p) => p.pid === pid) ?? unknown(pid);
  const topicCard = (g: LbView): HTMLElement => panel(h('p', { class: 'lb-topic display', testid: 'lb-topic' }, g.topic));
  const top = (g: LbView): HTMLElement =>
    h('p', { class: 'lb-top' }, h('span', {}, `ERZÄHLER ${g.k + 1}/${g.of}`), h('span', {}, g.role === 'narrator' ? 'DU' : who(g.who).name.toUpperCase()));

  const showCard = (g: Of<'card'>): void => {
    ctx.setState('card', { step: g.k, role: g.role });
    if (g.role === 'listener') {
      stage.replaceChildren(top(g), topicCard(g), h('p', { class: 'lb-wait' }, `${who(g.who).name} denkt sich was aus …`));
      return;
    }
    const pick = (truth: boolean): void => {
      send({ a: 'mode', k: g.k, truth });
      showCard({ ...g, mode: truth, canSwap: false });
    };
    const chosen = g.mode;
    const truthBtn = button('WAHR ERZÄHLEN', { size: 'l', testid: 'btn-truth', disabled: chosen !== null });
    const lieBtn = button('ERFINDEN', { size: 'l', variant: 'hot', testid: 'btn-lie', disabled: chosen !== null });
    truthBtn.setAttribute('aria-pressed', String(chosen === true));
    lieBtn.setAttribute('aria-pressed', String(chosen === false));
    truthBtn.addEventListener('click', () => pick(true));
    lieBtn.addEventListener('click', () => pick(false));
    const swap = button('ANDERE KARTE', { variant: 'ghost', testid: 'btn-swap' });
    swap.addEventListener('click', () => send({ a: 'swap', k: g.k }));
    stage.replaceChildren(
      top(g),
      topicCard(g),
      h('div', { class: 'lb-modes' }, truthBtn, lieBtn),
      ...(g.canSwap ? [swap] : [h('p', { class: 'lb-wait' }, chosen === null ? '' : 'Gewählt. Gleich geht’s los …')]),
    );
  };

  const showTell = (g: Of<'tell'>): void => {
    ctx.setState('tell', { step: g.k, role: g.role });
    const spot = spotlight(ctx, who(g.who), g.role === 'narrator', { onDone: () => send({ a: 'done', k: g.k }) });
    stage.replaceChildren(
      top(g),
      topicCard(g),
      g.role === 'narrator'
        ? h('p', { class: 'lb-mode', testid: 'lb-mode', 'data-mode': g.mode ? 'truth' : 'lie' }, g.mode ? 'DU ERZÄHLST WAHR' : 'DU ERFINDEST')
        : h('p', { class: 'lb-wait' }, 'Bohrt nach: wahr oder gelogen?'),
      spot.el,
    );
  };

  const showVote = (g: Of<'vote'>): void => {
    tally = counter(ctx, countText(g));
    if (g.role === 'narrator') {
      ctx.setState('vote', { step: g.k, role: g.role });
      stage.replaceChildren(top(g), topicCard(g), h('p', { class: 'lb-mode', testid: 'lb-mode', 'data-mode': g.mode ? 'truth' : 'lie' }, 'POKERFACE HALTEN'), tally.el);
      return;
    }
    const pad = choicePad(ctx, OPTIONS, {
      cols: 1,
      onPick: (i) => {
        send({ a: 'tip', k: g.k, truth: i === 0 });
        ctx.setState('sent', { step: g.k, role: g.role });
      },
    });
    if (g.mine !== null) pad.set(OPTIONS, g.mine ? 0 : 1);
    ctx.setState(g.mine === null ? 'vote' : 'sent', { step: g.k, role: g.role });
    stage.replaceChildren(top(g), topicCard(g), pad.el, tally.el);
  };

  const showReveal = (g: Of<'reveal'>): void => {
    tally = undefined;
    ctx.setState('reveal', { step: g.k, role: g.role });
    const count = (tip: boolean): number => g.rows.filter((r) => r.tip === tip).length;
    const bars = voteBars(ctx, [
      { key: 'wahr', label: 'WAHR getippt', count: count(true), top: g.truth },
      { key: 'luege', label: 'GELOGEN getippt', count: count(false), top: !g.truth },
    ]);
    const me = g.rows.find((r) => r.pid === ctx.me);
    stage.replaceChildren(
      top(g),
      topicCard(g),
      h('p', { class: 'lb-truth display', testid: 'lb-truth', 'data-truth': String(g.truth) }, g.truth ? 'WAHR!' : 'GELOGEN!'),
      bars.el,
      h('p', { class: 'lb-fooled', testid: 'lb-fooled' }, g.total === 0 ? '' : `${g.fooled} von ${g.total} reingelegt`),
    );
    if (me && me.tip !== null) ctx.sfx.play(me.right ? 'ok' : 'bad');
  };

  const show = (g: LbView): void => {
    const next = sigOf(g);
    if (next === sig) {
      if (g.phase === 'vote') tally?.set(countText(g));
      return;
    }
    sig = next;
    if (g.phase === 'card') showCard(g);
    else if (g.phase === 'tell') showTell(g);
    else if (g.phase === 'vote') showVote(g);
    else showReveal(g);
  };

  root.append(stage);
  show(v);

  return {
    update: show,
    destroy: () => stage.remove(),
  };
};
