import { playerBadge } from '../../ui/components';
import { h } from '../../ui/dom';
import { resumeBlitz } from '../resume';
import type { Render } from '../types';
import type { BlitzView } from './logic';
import { createBlitzRun, type BlitzEvent, type BlitzSend } from './play';

const TRIES = 3;
const STAMP_TOLERANCE = 1000;

export const renderBlitz: Render<BlitzView, BlitzSend> = (root, v, send, ctx) => {
  const r = resumeBlitz(v, ctx.clock.now(), ctx.toLocal);
  const results: (number | null)[] = [...v.mine];
  const tryEl = h('span', { class: 'pad-try' });
  const label = h('span', { class: 'pad-label', 'aria-live': 'polite' });
  const unit = h('span', { class: 'pad-unit' });
  const pad = h('button', { class: 'pad', type: 'button', testid: 'blitz-pad', 'data-silent': 'true' }, tryEl, label, unit);
  const chips = h('ul', { class: 'chips', 'aria-label': 'Versuche' });
  const strip = h('ul', { class: 'strip', 'aria-label': 'Fortschritt' });
  let progress = v.progress;
  let stripKey = '';

  const drawChips = (): void =>
    chips.replaceChildren(...results.map((ms) => h('li', { class: 'chip' }, ms === null ? '–' : String(ms))));

  const drawStrip = (): void => {
    const taken = results.filter((x) => x !== null).length;
    const list = ctx.players();
    const key = JSON.stringify([list.map((p) => [p.pid, p.name, p.color, p.online]), progress, taken]);
    if (key === stripKey) return;
    stripKey = key;
    strip.replaceChildren(
      ...list.map((p) =>
        h(
          'li',
          { class: 'strip-item', 'data-pid': p.pid },
          playerBadge(p, { size: 's', me: p.pid === ctx.me }),
          h('span', { class: 'strip-n' }, `${p.pid === ctx.me ? Math.max(taken, progress[p.pid] ?? 0) : (progress[p.pid] ?? 0)}/${TRIES}`),
        ),
      ),
    );
  };

  const onPhase = (e: BlitzEvent): void => {
    const shown = e.phase === 'show' || e.phase === 'done';
    if (e.ms !== null) results[e.i] = e.ms;
    pad.setAttribute('data-state', e.phase);
    ctx.setState(e.phase);
    tryEl.textContent = `VERSUCH ${e.i + 1}/${TRIES}`;
    label.textContent =
      e.phase === 'go' ? 'JETZT!' : e.phase === 'early' ? 'ZU FRÜH!' : shown && e.ms !== null ? String(e.ms) : e.phase === 'wait' ? 'WARTE …' : 'FERTIG';
    unit.textContent = e.phase === 'early' ? `${e.ms} ms` : shown && e.ms !== null ? (e.phase === 'done' ? 'ms · FERTIG' : 'ms') : '';
    if (e.phase === 'go') ctx.sfx.play('go');
    drawChips();
    drawStrip();
  };

  const run = createBlitzRun({
    waits: v.waits,
    show: v.show,
    max: v.max,
    next: r.next,
    end: r.end,
    clock: ctx.clock,
    send,
    onPhase,
  });

  pad.addEventListener('pointerdown', (e) => {
    const now = ctx.clock.now();
    const out = run.tap(Math.abs(e.timeStamp - now) <= STAMP_TOLERANCE ? e.timeStamp : now);
    if (out === 'hit') {
      ctx.sfx.play('tap');
      ctx.sfx.buzz(10);
      ctx.punch();
    } else if (out === 'early') {
      ctx.sfx.play('bad');
      ctx.sfx.buzz([30, 40, 30]);
      ctx.fx.flash('bad');
    }
  });

  root.append(pad, chips, strip);
  return {
    update(next) {
      progress = next.progress;
      drawStrip();
    },
    destroy() {
      run.stop();
      pad.remove();
      chips.remove();
      strip.remove();
    },
  };
};
