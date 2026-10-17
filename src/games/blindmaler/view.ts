import { choicePad, counter, type Block } from '../../ui/blocks';
import { button, playerBadge } from '../../ui/components';
import { h } from '../../ui/dom';
import { strokeCanvas, strokePad, type StrokePad } from '../../ui/strokeCanvas';
import type { PlayerInfo, Render } from '../types';
import type { BmInput, BmView } from './logic';

type Of<P extends BmView['phase']> = Extract<BmView, { phase: P }>;

const unknown = (pid: string): PlayerInfo => ({ pid, name: '?', color: 0, online: true });
const readyText = (g: Of<'draw'>): string => `${g.ready}/${g.total} fertig`;
const tippedText = (g: Of<'show'>): string => `${g.tipped}/${g.viewers} getippt`;
const sigOf = (g: BmView): string => {
  const at = g.phase === 'draw' ? g.slot : g.phase === 'show' || g.phase === 'reveal' ? g.j : null;
  return JSON.stringify([g.phase, at, 'role' in g ? g.role : null, 'mine' in g ? g.mine : null]);
};

export const renderBlindmaler: Render<BmView, BmInput> = (root, v, send, ctx) => {
  const stage = h('div', { class: 'bm-stage', 'aria-live': 'polite' });
  let sig = '';
  let tally: Block<[string]> | undefined;
  let drawPad: StrokePad | undefined;
  let stopTimer: (() => void) | undefined;

  const who = (pid: string): PlayerInfo => ctx.players().find((p) => p.pid === pid) ?? unknown(pid);
  const release = (): void => {
    stopTimer?.();
    stopTimer = undefined;
    drawPad?.destroy();
    drawPad = undefined;
    tally = undefined;
  };
  const head = (text: string): HTMLElement => h('p', { class: 'bm-head' }, text);

  const showDraw = (g: Of<'draw'>): void => {
    release();
    const pad = strokePad({ onStroke: (strokes) => send({ a: 'draw', k: g.slot, strokes, fin: false }) });
    const count = counter(ctx, readyText(g));
    const bottom = h('div', { class: 'bm-bottom' });
    let finished = false;
    const settle = (): void => {
      finished = true;
      stopTimer?.();
      stopTimer = undefined;
      pad.lock();
      ctx.setState('drawn', { step: g.slot });
      bottom.replaceChildren(h('p', { class: 'bm-wait display', testid: 'bm-wait' }, '✓ FERTIG'), count.el);
    };
    const finish = (): void => {
      if (finished) return;
      settle();
      send({ a: 'draw', k: g.slot, strokes: pad.strokes(), fin: true });
    };
    const done = button('FERTIG', { size: 'l', variant: 'hot', testid: 'btn-done' });
    done.addEventListener('click', finish);
    drawPad = pad;
    tally = count;
    bottom.append(done, count.el);
    stage.replaceChildren(
      head(g.slots > 1 ? `BILD ${g.slot + 1}/${g.slots} · DEIN BEGRIFF` : 'DEIN BEGRIFF'),
      h('p', { class: 'bm-word display', testid: 'bm-word' }, g.word),
      pad.el,
      h('p', { class: 'bm-hint' }, 'Du siehst deinen Strich nicht. Nur der Punkt zeigt, wo dein Finger ist.'),
      bottom,
    );
    ctx.setState('draw', { step: g.slot });
    if (g.fin) return settle();
    stopTimer = ctx.clock.after(Math.max(0, ctx.toLocal(g.endsAt) - ctx.clock.now()), finish);
  };

  const showShow = (g: Of<'show'>): void => {
    release();
    const canvas = strokeCanvas(g.strokes);
    tally = counter(ctx, tippedText(g));
    if (g.role === 'drawer') {
      stage.replaceChildren(
        head(`BILD ${g.j + 1}/${g.of}`),
        canvas,
        h('p', { class: 'bm-own display', testid: 'bm-own' }, 'Dein Kunstwerk'),
        tally.el,
      );
      ctx.setState('gallery', { step: g.j, role: 'drawer' });
      return;
    }
    const choices = choicePad(ctx, g.opts, {
      cols: 2,
      onPick: (i) => {
        send({ a: 'tip', j: g.j, i });
        ctx.setState('sent', { step: g.j, role: 'viewer' });
      },
    });
    if (g.mine !== null) choices.set(g.opts, g.mine);
    stage.replaceChildren(head(`BILD ${g.j + 1}/${g.of} · WAS HAT ${who(g.drawer).name.toUpperCase()} GEMALT?`), canvas, choices.el, tally.el);
    ctx.setState(g.mine === null ? 'gallery' : 'sent', { step: g.j, role: 'viewer' });
  };

  const showReveal = (g: Of<'reveal'>): void => {
    release();
    const canvas = strokeCanvas(g.strokes);
    const names =
      g.winners.length === 0
        ? h('p', { class: 'bm-none' }, 'Niemand hat’s erkannt.')
        : h(
            'ul',
            { class: 'bm-winners', testid: 'bm-winners' },
            ...g.winners.map((pid) =>
              h('li', { class: 'bm-winner', 'data-pid': pid }, playerBadge(who(pid), { size: 's', me: pid === ctx.me }), h('span', {}, who(pid).name)),
            ),
          );
    stage.replaceChildren(
      head(`BILD ${g.j + 1}/${g.of}`),
      canvas,
      h('p', { class: 'bm-answer display', testid: 'bm-answer' }, g.word),
      names,
      ...(g.gain > 0 ? [h('p', { class: 'bm-gain display', testid: 'bm-gain' }, `+${g.gain}`)] : []),
    );
    ctx.setState('reveal', { step: g.j, role: g.role });
    if (g.hit !== null) ctx.sfx.play(g.hit ? 'ok' : 'bad');
    else if (g.gain > 0) ctx.sfx.play('ok');
  };

  const show = (g: BmView): void => {
    const next = sigOf(g);
    if (next === sig) {
      if (g.phase === 'draw') tally?.set(readyText(g));
      else if (g.phase === 'show') tally?.set(tippedText(g));
      return;
    }
    sig = next;
    if (g.phase === 'draw') showDraw(g);
    else if (g.phase === 'show') showShow(g);
    else if (g.phase === 'reveal') showReveal(g);
    else release();
  };

  root.append(stage);
  show(v);

  return {
    update: show,
    destroy() {
      release();
      stage.remove();
    },
  };
};
