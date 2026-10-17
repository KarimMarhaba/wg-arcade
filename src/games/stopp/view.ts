import { counter, type Block } from '../../ui/blocks';
import { playerBadge } from '../../ui/components';
import { h } from '../../ui/dom';
import { resumeStopp } from '../resume';
import type { Render } from '../types';
import { duoLine, fmtSec, type StoppInput, type StoppView } from './logic';
import { createStoppRun, type StoppEvent, type StoppRun } from './play';

type Run = Extract<StoppView, { phase: 'run' }>;
type Reveal = Extract<StoppView, { phase: 'reveal' }>;

const STAMP_TOLERANCE = 1000;
const CLOCK_EVERY = 50;
const GOOD_MS = 300;
const MIN_RANGE = 1000;
const MARGIN = 0.9;
const TEXT = {
  ready: 'GLEICH GEHT’S LOS',
  run: 'DIE UHR LÄUFT',
  blind: 'BLIND – STOPP NACH GEFÜHL',
  sent: 'ABGEGEBEN',
  late: 'ZU SPÄT – KEIN TIPP',
} as const;

const count = (a: Run): string => `${a.got}/${a.total} abgegeben`;
const signed = (ms: number): string => `${ms < 0 ? '−' : '+'}${fmtSec(ms)} s`;

export const renderStopp: Render<StoppView, StoppInput> = (root, v, send, ctx) => {
  const stage = h('div', { class: 'stopp-stage' });
  let key = '';
  let run: StoppRun | undefined;
  let stopClock: (() => void) | undefined;
  let tally: Block<[string]> | undefined;

  const halt = (): void => {
    run?.stop();
    stopClock?.();
    run = stopClock = tally = undefined;
  };

  const showRun = (a: Run): void => {
    halt();
    const r = resumeStopp(a, ctx.clock.now(), ctx.toLocal);
    const clock = h('p', { class: 'stopp-clock display', testid: 'stopp-clock' }, fmtSec(0));
    const ring = h('div', { class: 'stopp-ring', testid: 'stopp-ring' }, clock);
    const status = h('p', { class: 'game-status', role: 'status', 'aria-live': 'polite' });
    const btn = h('button', { class: 'stopp-btn', type: 'button', testid: 'btn-stop', 'data-silent': 'true' }, 'STOPP');
    tally = counter(ctx, count(a));
    const paintClock = (): void => void (clock.textContent = fmtSec(Math.max(0, ctx.clock.now() - r.start)));

    const onPhase = (e: StoppEvent): void => {
      ctx.setState(e.phase, { step: e.k });
      btn.setAttribute('data-state', e.phase);
      status.textContent = TEXT[e.phase];
      stopClock?.();
      stopClock = undefined;
      if (e.phase === 'run') {
        ctx.sfx.play('go');
        paintClock();
        stopClock = ctx.clock.every(CLOCK_EVERY, paintClock);
      }
    };

    run = createStoppRun({
      k: a.k,
      target: a.target,
      start: r.start,
      blind: a.blind,
      late: a.endsAt - a.startAt - a.target,
      sent: r.sent,
      clock: ctx.clock,
      send,
      onPhase,
    });
    const mine = run;
    btn.addEventListener('pointerdown', (e) => {
      const now = ctx.clock.now();
      if (mine.tap(Math.abs(e.timeStamp - now) <= STAMP_TOLERANCE ? e.timeStamp : now) !== 'hit') return;
      ctx.sfx.play('tap');
      ctx.sfx.buzz(20);
      ctx.punch();
    });

    stage.replaceChildren(
      h('p', { class: 'stopp-top' }, h('span', {}, `VERSUCH ${a.k + 1}/${a.of}`), h('span', { testid: 'stopp-target' }, `ZIEL ${fmtSec(a.target)} s`)),
      h('div', { class: 'stopp-face' }, ring),
      h('p', { class: 'stopp-hint' }, 'Ablenken erlaubt, Anfassen nicht.'),
      status,
      tally.el,
      btn,
    );
  };

  const showReveal = (a: Reveal): void => {
    halt();
    ctx.setState('reveal', { step: a.k });
    const players = ctx.players();
    const name = (pid: string): string => players.find((p) => p.pid === pid)?.name ?? '?';
    const range = Math.max(MIN_RANGE, ...a.rows.map((x) => Math.abs(x.dev ?? 0)));
    const lanes = a.rows.map((x) => {
      const p = players.find((q) => q.pid === x.pid) ?? { pid: x.pid, name: '?', color: 0, online: true };
      const dot =
        x.dev === null
          ? null
          : h('span', { class: 'lane-dot', style: `--x:${0.5 + (MARGIN / 2) * (x.dev / range)}` }, playerBadge(p, { size: 's', me: x.pid === ctx.me }));
      return h(
        'li',
        { class: 'stopp-lane', testid: 'stopp-lane', 'data-pid': x.pid, 'data-me': x.pid === ctx.me ? 'true' : null },
        h('span', { class: 'lane-track' }, dot),
        h('span', { class: 'lane-val' }, x.dev === null ? '–' : signed(x.dev)),
      );
    });
    const other = a.rows.find((x) => x.pid !== ctx.me);
    stage.replaceChildren(
      h('p', { class: 'stopp-top' }, h('span', {}, `VERSUCH ${a.k + 1}/${a.of}`), h('span', {}, `ZIEL ${fmtSec(a.target)} s`)),
      h('ul', { class: 'stopp-scale', testid: 'stopp-scale', 'aria-label': 'Abweichung vom Ziel' }, ...lanes),
      ...(a.rows.length === 2 && other
        ? [h('p', { class: 'stopp-duo', testid: 'stopp-duo', 'aria-live': 'polite' }, duoLine(a.mine, other.dev, name(other.pid)))]
        : []),
    );
    if (a.mine !== null) ctx.sfx.play(Math.abs(a.mine) <= GOOD_MS ? 'ok' : 'bad');
  };

  const show = (g: StoppView): void => {
    const next = `${g.phase}${g.k}`;
    if (next === key) {
      if (g.phase === 'run') tally?.set(count(g));
      return;
    }
    key = next;
    if (g.phase === 'run') showRun(g);
    else showReveal(g);
  };

  root.append(stage);
  show(v);

  return {
    update: show,
    destroy() {
      halt();
      stage.remove();
    },
  };
};
