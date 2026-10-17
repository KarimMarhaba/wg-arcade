import { namePicker } from '../../ui/blocks';
import { button } from '../../ui/components';
import { h } from '../../ui/dom';
import type { PlayerInfo, Render } from '../types';
import type { EbEntry, EbInput, EbView } from './logic';

type Of<P extends EbView['phase']> = Extract<EbView, { phase: P }>;
type Card = Extract<EbView, { role: 'explainer' | 'guard'; phase: 'explain' }>;

const unknown = (pid: string): PlayerInfo => ({ pid, name: '?', color: 0, online: true });
const signed = (n: number): string => `${n < 0 ? '−' : '+'}${Math.abs(n)}`;
const countText = (g: EbView): string => `${g.hits} Treffer · ${g.taboos} TABU`;
const MARK: Record<EbEntry['res'], string> = { hit: '✓', skip: '↷', taboo: '✗ TABU', open: '…' };
const sigOf = (g: EbView): string => JSON.stringify([g.phase, g.k, g.role, 'c' in g ? g.c : null, g.hits, g.taboos]);

export const renderErklaerbaer: Render<EbView, EbInput> = (root, v, send, ctx) => {
  const stage = h('div', { class: 'eb-stage', 'aria-live': 'polite' });
  let sig = '';
  let last = { k: -1, hits: 0, taboos: 0 };

  const who = (pid: string): PlayerInfo => ctx.players().find((p) => p.pid === pid) ?? unknown(pid);
  const top = (g: EbView): HTMLElement =>
    h(
      'p',
      { class: 'eb-top' },
      h('span', {}, `ZUG ${g.k + 1}/${g.of}`),
      h('span', { class: 'eb-role', 'data-role': g.role }, g.role === 'explainer' ? 'DU ERKLÄRST' : g.role === 'guard' ? 'DU BIST WÄCHTER' : who(g.who).name.toUpperCase()),
    );
  const count = (g: EbView): HTMLElement =>
    h('p', { class: 'eb-count', testid: 'eb-count', 'data-hits': g.hits, 'data-taboos': g.taboos }, countText(g));
  const cardEl = (g: Card): HTMLElement =>
    h(
      'div',
      { class: 'eb-card', 'data-mime': String(g.mime) },
      h('p', { class: 'eb-term display', testid: 'eb-term', 'data-c': g.c }, g.term),
      g.mime
        ? h('p', { class: 'eb-mime', testid: 'eb-mime' }, '🤫 NUR PANTOMIME')
        : h('ul', { class: 'eb-taboo', testid: 'eb-taboo' }, ...g.taboo.map((w) => h('li', {}, w))),
    );

  const showPicker = (g: Extract<Card, { role: 'explainer' }>): void => {
    const picker = namePicker(
      ctx,
      ctx.players().filter((p) => g.raters.includes(p.pid)),
      {
        self: true,
        onPick: (to) => {
          send({ a: 'hit', k: g.k, c: g.c, to });
          picker.set(to, true);
        },
      },
    );
    const back = button('ZURÜCK', { variant: 'ghost', testid: 'btn-cancel' });
    back.addEventListener('click', () => showExplainer(g));
    stage.replaceChildren(top(g), cardEl(g), count(g), h('p', { class: 'eb-ask' }, 'Wer hat’s erraten?'), picker.el, back);
  };

  const showExplainer = (g: Extract<Card, { role: 'explainer' }>): void => {
    const hit = button('GESCHAFFT', { size: 'l', testid: 'btn-hit' });
    hit.addEventListener('click', () => {
      if (g.guard !== null) return showPicker(g);
      const to = g.raters[0];
      send({ a: 'hit', k: g.k, c: g.c, ...(to === undefined ? {} : { to }) });
    });
    const skip = button('SKIP −3 s', { variant: 'ghost', testid: 'btn-skip' });
    skip.addEventListener('click', () => send({ a: 'skip', k: g.k, c: g.c }));
    const buttons = [hit, skip];
    if (g.guard === null) {
      const taboo = button('TABU!', { variant: 'danger', testid: 'btn-taboo' });
      taboo.addEventListener('click', () => send({ a: 'taboo', k: g.k, c: g.c }));
      buttons.push(taboo);
    }
    stage.replaceChildren(top(g), cardEl(g), count(g), h('div', { class: 'eb-actions' }, ...buttons));
  };

  const showGuard = (g: Extract<Card, { role: 'guard' }>): void => {
    const taboo = button('TABU!', { size: 'l', variant: 'danger', testid: 'btn-taboo' });
    taboo.addEventListener('click', () => send({ a: 'taboo', k: g.k, c: g.c }));
    stage.replaceChildren(
      top(g),
      cardEl(g),
      count(g),
      h('p', { class: 'eb-wait' }, `${who(g.who).name} darf kein Tabuwort sagen. Hörst du eins, drück TABU!`),
      taboo,
    );
  };

  const showExplain = (g: Of<'explain'>): void => {
    ctx.setState('explain', { step: g.k, role: g.role });
    if (g.role === 'explainer') return showExplainer(g);
    if (g.role === 'guard') return showGuard(g);
    stage.replaceChildren(
      top(g),
      h('p', { class: 'eb-shout display' }, `${who(g.who).name} erklärt – ruft laut!`),
      count(g),
      h('p', { class: 'eb-wait' }, 'Den Begriff sieht nur, wer erklärt.'),
    );
  };

  const showReveal = (g: Of<'reveal'>): void => {
    ctx.setState('reveal', { step: g.k, role: g.role });
    const items = g.log.map((e) =>
      h('li', { class: 'eb-item', testid: 'eb-item', 'data-res': e.res }, h('span', { class: 'eb-item-term' }, e.term), h('span', { class: 'eb-item-mark' }, MARK[e.res])),
    );
    stage.replaceChildren(
      top(g),
      h('p', { class: 'eb-shout display', testid: 'eb-sum' }, `${who(g.who).name}: ${signed(2 * g.hits - g.taboos)} Pkt`),
      h('p', { class: 'eb-count' }, countText(g)),
      h('ul', { class: 'eb-log', testid: 'eb-log' }, ...items),
    );
  };

  const feedback = (g: EbView): void => {
    if (g.phase === 'explain' && g.k === last.k) {
      if (g.hits > last.hits) ctx.sfx.play('ok');
      if (g.taboos > last.taboos) {
        ctx.sfx.play('bad');
        ctx.sfx.buzz(60);
      }
    }
    last = { k: g.k, hits: g.hits, taboos: g.taboos };
  };

  const show = (g: EbView): void => {
    const next = sigOf(g);
    if (next === sig) return;
    sig = next;
    feedback(g);
    if (g.phase === 'explain') showExplain(g);
    else showReveal(g);
  };

  root.append(stage);
  show(v);

  return {
    update: show,
    destroy: () => stage.remove(),
  };
};
