import { choicePad, counter, type Block } from '../../ui/blocks';
import { button, playerBadge } from '../../ui/components';
import { h } from '../../ui/dom';
import type { PlayerInfo, Render } from '../types';
import type { PfInput, PfRow, PfView } from './logic';

type Of<P extends PfView['phase']> = Extract<PfView, { phase: P }>;

const unknown = (pid: string): PlayerInfo => ({ pid, name: '?', color: 0, online: true });
const countText = (g: Of<'guess'>): string => `${g.voted}/${g.total} getippt`;
const sigOf = (g: PfView): string => JSON.stringify([g.phase, 'done' in g ? g.done : null, 'mine' in g ? g.mine : null]);

export const renderPokerface: Render<PfView, PfInput> = (root, v, send, ctx) => {
  const stage = h('div', { class: 'pf-stage', 'aria-live': 'polite' });
  let sig = '';
  let tally: Block<[string]> | undefined;

  const who = (pid: string): PlayerInfo => ctx.players().find((p) => p.pid === pid) ?? unknown(pid);
  const topicCard = (g: Of<'mission'> | Of<'talk'>): HTMLElement =>
    h('div', { class: 'pf-topic' }, h('p', { class: 'pf-label' }, 'GESPRÄCHSTHEMA'), h('p', { class: 'pf-topic-text display', testid: 'pf-topic' }, g.topic));
  const missionCard = (g: Of<'mission'> | Of<'talk'>, big: boolean): HTMLElement =>
    h(
      'div',
      { class: 'pf-card', 'data-big': String(big) },
      h('p', { class: 'pf-label' }, 'DEINE GEHEIME MISSION'),
      h('p', { class: 'pf-mission display', testid: 'pf-mission' }, g.mission),
      h('p', { class: 'pf-hide' }, 'Handy nicht zeigen'),
    );
  const watch = (g: Of<'mission'> | Of<'talk'>): HTMLElement =>
    h('p', { class: 'pf-watch' }, g.target === null ? 'Erfülle deine Mission, ohne dass es auffällt.' : `Beobachte ${who(g.target).name}: Was ist die geheime Mission?`);

  const showMission = (g: Of<'mission'>): void => {
    ctx.setState('mission');
    stage.replaceChildren(topicCard(g), missionCard(g, true), watch(g));
  };

  const showTalk = (g: Of<'talk'>): void => {
    ctx.setState('talk');
    const done = button('ERLEDIGT', { size: 'l', variant: 'hot', testid: 'btn-done-mission' });
    done.addEventListener('click', () => {
      send({ a: 'done' });
      showTalk({ ...g, done: true });
    });
    stage.replaceChildren(
      topicCard(g),
      missionCard(g, false),
      watch(g),
      g.done ? h('p', { class: 'pf-done display', testid: 'pf-done' }, '✓ ERLEDIGT') : done,
    );
  };

  const showGuess = (g: Of<'guess'>): void => {
    tally = counter(ctx, countText(g));
    const pad = choicePad(ctx, g.opts, {
      cols: 1,
      onPick: (i) => {
        send({ a: 'tip', i });
        ctx.setState('sent');
      },
    });
    if (g.mine !== null) pad.set(g.opts, g.mine);
    ctx.setState(g.mine === null ? 'guess' : 'sent');
    stage.replaceChildren(h('p', { class: 'pf-ask' }, `Welche Mission hatte ${who(g.target).name}?`), pad.el, tally.el);
  };

  const rowEl = (r: PfRow): HTMLElement => {
    const marks = [
      r.done ? '✓ erledigt' : '✗ nicht erledigt',
      r.cracked === null ? null : r.cracked ? 'erraten' : 'unentdeckt',
      r.tip === null ? null : r.tip ? 'Tipp richtig' : 'Tipp falsch',
    ].filter((m): m is string => m !== null);
    return h(
      'li',
      { class: 'pf-row', testid: 'pf-row', 'data-pid': r.pid, 'data-done': String(r.done), 'data-me': r.pid === ctx.me ? 'true' : null },
      h('span', { class: 'pf-row-head' }, playerBadge(who(r.pid), { size: 's', me: r.pid === ctx.me }), h('span', { class: 'pf-row-name' }, who(r.pid).name)),
      h('span', { class: 'pf-row-text' }, r.mission),
      h('span', { class: 'pf-row-marks' }, marks.join(' · ')),
    );
  };

  const showReveal = (g: Of<'reveal'>): void => {
    tally = undefined;
    ctx.setState('reveal');
    stage.replaceChildren(h('p', { class: 'pf-ask' }, 'Auflösung'), h('ul', { class: 'pf-rows', testid: 'pf-rows' }, ...g.rows.map(rowEl)));
    const mine = g.rows.find((r) => r.pid === ctx.me);
    if (mine && mine.tip !== null) ctx.sfx.play(mine.tip ? 'ok' : 'bad');
  };

  const show = (g: PfView): void => {
    const next = sigOf(g);
    if (next === sig) {
      if (g.phase === 'guess') tally?.set(countText(g));
      return;
    }
    sig = next;
    if (g.phase === 'mission') showMission(g);
    else if (g.phase === 'talk') showTalk(g);
    else if (g.phase === 'guess') showGuess(g);
    else showReveal(g);
  };

  root.append(stage);
  show(v);

  return {
    update: show,
    destroy: () => stage.remove(),
  };
};
