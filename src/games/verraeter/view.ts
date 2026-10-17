import { choicePad, counter, namePicker, spotlight, voteBars, type Block } from '../../ui/blocks';
import { button } from '../../ui/components';
import { h } from '../../ui/dom';
import type { PlayerInfo, Render } from '../types';
import type { VrInput, VrView } from './logic';

type Of<P extends VrView['phase']> = Extract<VrView, { phase: P }>;
type Role = 'traitor' | 'crew';

const CREW_MIN = 3;
const unknown = (pid: string): PlayerInfo => ({ pid, name: '?', color: 0, online: true });
const sigOf = (g: VrView): string =>
  JSON.stringify([g.phase, 'turn' in g ? g.turn : null, 'mine' in g ? g.mine : null, 'culprit' in g ? g.culprit : null, 'same' in g ? g.same : null]);

export const renderVerraeter: Render<VrView, VrInput> = (root, v, send, ctx) => {
  const stage = h('div', { class: 'vr-stage', 'aria-live': 'polite' });
  let sig = '';
  let tally: Block<[string]> | undefined;

  const who = (pid: string): PlayerInfo => ctx.players().find((p) => p.pid === pid) ?? unknown(pid);
  const crewMode = (): boolean => ctx.players().length >= CREW_MIN;
  const roleOf = (g: VrView): Role | undefined => {
    if (!crewMode()) return undefined;
    if ('culprit' in g) return g.culprit === ctx.me ? 'traitor' : 'crew';
    return 'traitor' in g ? 'traitor' : 'crew';
  };
  const state = (name: string, g: VrView, step?: number): void => ctx.setState(name, { step, role: roleOf(g) });

  const card = (g: Extract<VrView, { word: string } | { traitor: true }>, big: boolean): HTMLElement =>
    'traitor' in g
      ? h(
          'div',
          { class: 'vr-card', 'data-role': 'traitor', 'data-big': String(big), testid: 'vr-word' },
          h('p', { class: 'vr-label' }, 'DU BIST DER VERRÄTER'),
          h('p', { class: 'vr-cat display' }, `Kategorie: ${g.cat}`),
          h('p', { class: 'vr-hide' }, 'Handy nicht zeigen'),
        )
      : h(
          'div',
          { class: 'vr-card', 'data-role': 'crew', 'data-big': String(big), testid: 'vr-word' },
          h('p', { class: 'vr-label' }, 'DEIN WORT'),
          h('p', { class: 'vr-word display', testid: 'vr-text' }, g.word),
          h('p', { class: 'vr-hide' }, 'Handy nicht zeigen'),
        );

  const showWord = (g: Of<'word'>): void => {
    state('word', g);
    stage.replaceChildren(card(g, true));
  };

  const showRound = (g: Of<'round'>): void => {
    state('round', g, g.turn);
    const mine = g.who === ctx.me;
    const spot = spotlight(ctx, who(g.who), mine, { onDone: () => send({ a: 'done', turn: g.turn }) });
    const hint = crewMode() ? 'Sag laut EIN passendes Wort.' : 'Beschreibe dein Wort, ohne es zu verraten.';
    stage.replaceChildren(
      h('p', { class: 'vr-top' }, h('span', {}, `ZUG ${g.turn + 1}/${g.of}`)),
      spot.el,
      h('p', { class: 'vr-hint' }, mine ? hint : 'Zuhören und merken.'),
      card(g, false),
    );
  };

  const showTalk = (g: Of<'talk'>): void => {
    state('talk', g);
    stage.replaceChildren(h('p', { class: 'vr-talk display' }, 'DISKUTIERT!'), h('p', { class: 'vr-hint' }, 'Wer redet komisch um das Wort herum?'), card(g, false));
  };

  const showVote = (g: Of<'vote'>): void => {
    if ('voted' in g) {
      tally = counter(ctx, `${g.voted}/${g.total} abgestimmt`);
      const picker = namePicker(ctx, ctx.players(), {
        self: false,
        onPick: (to) => {
          send({ a: 'vote', to });
          picker.set(to, true);
          state('sent', g);
        },
      });
      if (g.mine !== null) picker.set(g.mine, true);
      state(g.mine === null ? 'vote' : 'sent', g);
      stage.replaceChildren(h('p', { class: 'vr-hint' }, 'Wer ist der Verräter?'), picker.el, tally.el, card(g, false));
      return;
    }
    tally = undefined;
    const tip = (same: boolean): void => {
      send({ a: 'tip', same });
      state('sent', g);
      showVote({ ...g, mine: same });
    };
    const same = button('GLEICHES WORT', { size: 'l', testid: 'btn-same', disabled: g.mine !== null });
    const diff = button('VERSCHIEDEN', { size: 'l', variant: 'hot', testid: 'btn-diff', disabled: g.mine !== null });
    same.setAttribute('aria-pressed', String(g.mine === true));
    diff.setAttribute('aria-pressed', String(g.mine === false));
    same.addEventListener('click', () => tip(true));
    diff.addEventListener('click', () => tip(false));
    state(g.mine === null ? 'vote' : 'sent', g);
    stage.replaceChildren(h('p', { class: 'vr-hint' }, 'Haben beide dasselbe Wort?'), h('div', { class: 'vr-tips' }, same, diff), card(g, false));
  };

  const showGuess = (g: Of<'guess'>): void => {
    if ('opts' in g) {
      const pad = choicePad(ctx, g.opts, {
        cols: 2,
        onPick: (i) => {
          send({ a: 'guess', i });
          state('sent', g);
        },
      });
      if (g.mine !== null) pad.set(g.opts, g.mine);
      state(g.mine === null ? 'guess' : 'sent', g);
      stage.replaceChildren(h('p', { class: 'vr-hint' }, 'Enttarnt! Welches Wort war es?'), pad.el);
      return;
    }
    state('guess', g);
    stage.replaceChildren(h('p', { class: 'vr-talk display' }, 'ENTTARNT!'), h('p', { class: 'vr-hint' }, `${who(g.accused).name} rät jetzt das Wort …`), card(g, false));
  };

  const showReveal = (g: Of<'reveal'>): void => {
    tally = undefined;
    state('reveal', g);
    if ('same' in g) {
      const rows = g.rows.map((r) =>
        h(
          'li',
          { class: 'vr-duo-row', 'data-pid': r.pid, 'data-right': String(r.right), 'data-me': r.pid === ctx.me ? 'true' : null },
          h('span', { class: 'vr-duo-name' }, who(r.pid).name),
          h('span', { class: 'vr-duo-word display' }, r.word),
          h('span', { class: 'vr-duo-tip' }, r.tip === null ? '–' : r.tip ? 'gleich' : 'verschieden'),
        ),
      );
      stage.replaceChildren(
        h(
          'div',
          { class: 'vr-reveal', testid: 'vr-reveal', 'data-same': String(g.same) },
          h('p', { class: 'vr-talk display' }, g.same ? 'GLEICHES WORT!' : 'VERSCHIEDENE WÖRTER!'),
          h('ul', { class: 'vr-duo' }, ...rows),
        ),
      );
      const mine = g.rows.find((r) => r.pid === ctx.me);
      if (mine && mine.tip !== null) ctx.sfx.play(mine.right ? 'ok' : 'bad');
      return;
    }
    if (!('rows' in g)) {
      stage.replaceChildren(
        h('div', { class: 'vr-reveal', testid: 'vr-reveal' }, h('p', { class: 'vr-label' }, g.cat), h('p', { class: 'vr-word display' }, g.word)),
      );
      return;
    }
    const bars = voteBars(
      ctx,
      g.rows.map((r) => ({ key: r.pid, label: who(r.pid).name, count: r.count, mine: r.pid === ctx.me, top: r.pid === g.culprit })),
    );
    const verdict = !g.exposed ? 'UNENTDECKT!' : g.right ? 'ENTTARNT – WORT ERRATEN' : 'ENTTARNT!';
    stage.replaceChildren(
      h(
        'div',
        {
          class: 'vr-reveal',
          testid: 'vr-reveal',
          'data-exposed': String(g.exposed),
          'data-right': g.right === null ? null : String(g.right),
          'data-culprit': g.culprit,
        },
        h('p', { class: 'vr-talk display', testid: 'vr-verdict' }, verdict),
        h('p', { class: 'vr-label' }, `Verräter: ${who(g.culprit).name}`),
        h('p', { class: 'vr-label' }, `${g.cat}: ${g.word}`),
        ...(g.guessed === null ? [] : [h('p', { class: 'vr-hint' }, `Geraten: ${g.guessed}`)]),
      ),
      bars.el,
    );
    ctx.sfx.play(g.culprit === ctx.me ? (g.exposed ? 'bad' : 'ok') : g.exposed ? 'ok' : 'bad');
  };

  const show = (g: VrView): void => {
    const next = sigOf(g);
    if (next === sig) {
      if (g.phase === 'vote' && 'voted' in g) tally?.set(`${g.voted}/${g.total} abgestimmt`);
      return;
    }
    sig = next;
    switch (g.phase) {
      case 'word':
        return showWord(g);
      case 'round':
        return showRound(g);
      case 'talk':
        return showTalk(g);
      case 'vote':
        return showVote(g);
      case 'guess':
        return showGuess(g);
      case 'reveal':
        return showReveal(g);
    }
  };

  root.append(stage);
  show(v);

  return {
    update: show,
    destroy: () => stage.remove(),
  };
};
