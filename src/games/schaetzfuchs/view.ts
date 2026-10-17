import { button, panel, playerBadge } from '../../ui/components';
import { h } from '../../ui/dom';
import { resumeSchaetzfuchs } from '../resume';
import type { Render } from '../types';
import type { SchaetzfuchsInput, SchaetzfuchsView } from './logic';
import { countAt, parseGuess } from './play';

type Ask = Extract<SchaetzfuchsView, { phase: 'ask' }>;
type Reveal = Extract<SchaetzfuchsView, { phase: 'reveal' }>;

const COUNT_MAX_MS = 1200;
const COUNT_SHARE = 0.5;
const MEGA_CHARS = 5;
const XXL_CHARS = 8;

const fmt = (n: number): string => n.toLocaleString('de-DE');

export const renderSchaetzfuchs: Render<SchaetzfuchsView, SchaetzfuchsInput> = (root, v, send, ctx) => {
  const stage = h('div', { class: 'sf-stage', 'aria-live': 'polite' });
  let guessed = v.phase === 'ask' ? v.guessed : 0;
  let total = v.phase === 'ask' ? v.total : 0;
  let sent = false;
  let revealed = false;
  let countEl: HTMLElement | undefined;
  let stopCount = (): void => {};
  let stopFocus = (): void => {};

  const showSent = (guess: number, unit: string): void => {
    ctx.setState('sent');
    countEl = h('p', { class: 'sf-count' });
    stage.replaceChildren(
      h(
        'div',
        { class: 'panel sf-sent', testid: 'sf-sent' },
        h('p', { class: 'sf-sent-title' }, 'Tipp gespeichert'),
        h('p', { class: 'sf-sent-guess' }, `${fmt(guess)} ${unit}`),
        countEl,
      ),
    );
    drawCount();
  };

  function drawCount(): void {
    if (countEl) countEl.textContent = `${Math.max(guessed, 1)}/${total} haben getippt`;
  }

  const showAsk = (unit: string): void => {
    ctx.setState('ask');
    const input = h('input', {
      class: 'sf-input',
      type: 'text',
      inputmode: 'numeric',
      autocomplete: 'off',
      enterkeyhint: 'send',
      placeholder: '?',
      'aria-label': 'Dein Tipp',
      testid: 'sf-input',
    });
    const error = h('p', { class: 'sf-error', role: 'alert' });
    const form = h(
      'form',
      { class: 'sf-form', novalidate: true },
      h('div', { class: 'sf-field' }, input, h('span', { class: 'sf-unit' }, unit)),
      error,
      button('TIPP ABGEBEN', { size: 'l', type: 'submit', testid: 'sf-submit' }),
    );
    input.addEventListener('input', () => {
      error.textContent = '';
      input.removeAttribute('aria-invalid');
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (sent) return;
      const guess = parseGuess(input.value);
      if (guess === null) {
        error.textContent = 'Bitte eine Zahl eingeben.';
        input.setAttribute('aria-invalid', 'true');
        ctx.sfx.play('bad');
        ctx.sfx.buzz([30, 40, 30]);
        return;
      }
      sent = true;
      send({ guess });
      ctx.sfx.play('ok');
      showSent(guess, unit);
    });
    stage.replaceChildren(form);
    stopFocus = ctx.clock.after(0, () => input.focus({ preventScroll: true }));
  };

  const showReveal = (r: Reveal): void => {
    revealed = true;
    stopFocus();
    ctx.setState('reveal');
    const text = fmt(r.answer);
    const answer = h('p', {
      class: 'sf-answer display',
      testid: 'sf-answer',
      'aria-hidden': 'true',
      'data-size': text.length <= MEGA_CHARS ? 'mega' : text.length <= XXL_CHARS ? 'xxl' : 'xl',
    });
    const players = ctx.players();
    const list = h(
      'ul',
      { class: 'sf-guesses' },
      ...r.guesses.map((g) => {
        const p = players.find((x) => x.pid === g.pid);
        return h(
          'li',
          { class: 'sf-guess', testid: 'sf-guess', 'data-pid': g.pid, 'data-color': ((p?.color ?? 0) % 8 + 8) % 8, 'data-me': g.pid === ctx.me ? 'true' : null },
          playerBadge({ pid: g.pid, name: p?.name ?? '?', color: p?.color ?? 0, online: p?.online }, { size: 's', me: g.pid === ctx.me }),
          h('span', { class: 'sf-guess-name name' }, p?.name ?? '?'),
          h('span', { class: 'sf-guess-val' }, g.guess === null ? 'kein Tipp' : fmt(g.guess)),
          h('span', { class: 'sf-err' }, g.errPct === null ? '–' : `±${g.errPct} %`),
        );
      }),
    );
    stage.replaceChildren(
      h(
        'div',
        { class: 'sf-reveal', testid: 'sf-reveal', 'data-answer': String(r.answer) },
        h('p', { class: 'sr-only' }, `Antwort: ${text} ${r.unit}`),
        h('div', { class: 'sf-answer-row' }, answer, h('span', { class: 'sf-unit-big' }, r.unit)),
        list,
      ),
    );
    const ms = Math.min(COUNT_MAX_MS, Math.max(0, (ctx.toLocal(r.endsAt) - ctx.clock.now()) * COUNT_SHARE));
    if (ctx.fx.reducedMotion() || ms < 1) {
      answer.textContent = text;
      return;
    }
    const t0 = ctx.clock.now();
    const set = (n: number): void => void (answer.textContent = fmt(n));
    let raf = 0;
    const step = (): void => {
      set(countAt(r.answer, (ctx.clock.now() - t0) / ms));
      if (ctx.clock.now() - t0 < ms) raf = requestAnimationFrame(step);
    };
    set(0);
    raf = requestAnimationFrame(step);
    const stopTimer = ctx.clock.after(ms, () => set(r.answer));
    stopCount = () => {
      cancelAnimationFrame(raf);
      stopTimer();
    };
  };

  const q = panel(h('p', { class: 'sf-q' }, v.q));
  root.append(q, stage);
  if (v.phase === 'reveal') showReveal(v);
  else {
    const r = resumeSchaetzfuchs(v, ctx.clock.now(), ctx.toLocal);
    if (r.guess === null) showAsk(v.unit);
    else {
      sent = true;
      showSent(r.guess, v.unit);
    }
  }

  return {
    update(next) {
      if (next.phase === 'ask') {
        guessed = next.guessed;
        total = next.total;
        drawCount();
      } else if (!revealed) showReveal(next);
    },
    destroy() {
      stopCount();
      stopFocus();
      q.remove();
      stage.remove();
    },
  };
};
