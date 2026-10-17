import type { PlayerInfo, ViewCtx } from '../games/types';
import { button, playerBadge } from './components';
import { h } from './dom';

export type BlockCtx = Pick<ViewCtx, 'me' | 'sfx'>;

export interface Block<A extends unknown[]> {
  el: HTMLElement;
  set(...a: A): void;
  destroy(): void;
}

const GRID_AT = 5;
const feedback = (ctx: BlockCtx): void => {
  ctx.sfx.play('ok');
  ctx.sfx.buzz(10);
};
const silent = (b: HTMLButtonElement): HTMLButtonElement => (b.setAttribute('data-silent', 'true'), b);

export interface NamePickerOpts {
  self: boolean;
  onPick(pid: string): void;
  disabled?: boolean;
}

export function namePicker(
  ctx: BlockCtx,
  players: readonly PlayerInfo[],
  o: NamePickerOpts,
): Block<[picked: string | null, disabled?: boolean]> {
  const shown = players.filter((p) => o.self || p.pid !== ctx.me);
  const btns = new Map<string, HTMLButtonElement>();
  const el = h('div', { class: 'name-picker', role: 'group', 'data-cols': shown.length >= GRID_AT ? 2 : 1 });
  const set = (picked: string | null, disabled = false): void => {
    for (const [pid, b] of btns) {
      b.setAttribute('aria-pressed', String(pid === picked));
      b.disabled = disabled;
    }
  };
  for (const p of shown) {
    const b = silent(button('', { variant: 'ghost', testid: 'pick' }));
    b.setAttribute('data-pid', p.pid);
    b.append(playerBadge(p, { size: 's', me: p.pid === ctx.me }), h('span', { class: 'pick-name' }, p.name));
    b.addEventListener('click', () => {
      feedback(ctx);
      set(p.pid, o.disabled);
      o.onPick(p.pid);
    });
    btns.set(p.pid, b);
    el.append(b);
  }
  set(null, o.disabled);
  return { el, set, destroy: () => el.remove() };
}

export interface ChoicePadOpts {
  onPick(i: number): void;
  cols?: number;
}

export function choicePad(
  ctx: BlockCtx,
  options: readonly string[],
  o: ChoicePadOpts,
): Block<[options: readonly string[], picked?: number]> {
  const el = h('div', { class: 'choice-pad', role: 'group' });
  const set = (opts: readonly string[], picked?: number): void => {
    el.setAttribute('data-cols', String(o.cols ?? (opts.length > 3 ? 2 : 1)));
    el.replaceChildren(
      ...opts.map((text, i) => {
        const chosen = picked === i;
        const b = silent(button('', { variant: chosen ? 'primary' : 'ghost', testid: 'choice' }));
        b.setAttribute('data-i', String(i));
        b.setAttribute('aria-pressed', String(chosen));
        b.disabled = picked !== undefined;
        b.append(h('span', { class: 'choice-text' }, text));
        if (chosen) b.append(h('span', { class: 'choice-done' }, '✓ abgegeben'));
        b.addEventListener('click', () => {
          feedback(ctx);
          set(opts, i);
          o.onPick(i);
        });
        return b;
      }),
    );
  };
  set(options);
  return { el, set, destroy: () => el.remove() };
}

export interface TextEntryOpts {
  max: number;
  placeholder: string;
  onSubmit(text: string): void;
}

export function textEntry(ctx: BlockCtx, o: TextEntryOpts): Block<[state: { error?: string }]> {
  const input = h('input', {
    class: 'text-input',
    type: 'text',
    testid: 'text-input',
    enterkeyhint: 'send',
    autocapitalize: 'sentences',
    autocomplete: 'off',
    maxlength: o.max,
    placeholder: o.placeholder,
    'aria-label': o.placeholder,
  });
  const submit = silent(button('SENDEN', { type: 'submit', testid: 'text-submit' }));
  const error = h('p', { class: 'text-error', testid: 'text-error', role: 'alert' });
  const el = h('form', { class: 'text-entry', novalidate: true }, input, error, submit);
  el.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (text === '') return;
    feedback(ctx);
    o.onSubmit(text);
  });
  return {
    el,
    set(state) {
      error.textContent = state.error ?? '';
      if (state.error) ctx.sfx.play('bad');
    },
    destroy: () => el.remove(),
  };
}

export interface SpotlightOpts {
  onDone(): void;
}

export function spotlight(ctx: BlockCtx, who: PlayerInfo, mine: boolean, o: SpotlightOpts): Block<[who: PlayerInfo, mine: boolean]> {
  const el = h('section', { class: 'spotlight' });
  const set = (w: PlayerInfo, m: boolean): void => {
    const done = silent(button('FERTIG', { variant: 'hot', size: 'l', testid: 'btn-done' }));
    done.addEventListener('click', () => {
      feedback(ctx);
      o.onDone();
    });
    if (m) el.setAttribute('data-spot', 'me');
    else el.removeAttribute('data-spot');
    el.replaceChildren(
      playerBadge(w, { size: 'l', me: w.pid === ctx.me }),
      h('p', { class: 'spot-name' }, w.name),
      ...(m ? [done] : []),
    );
  };
  set(who, mine);
  return { el, set, destroy: () => el.remove() };
}

export function counter(ctx: BlockCtx, text: string): Block<[text: string]> {
  const el = h('p', { class: 'counter', testid: 'counter', 'aria-live': 'polite' }, text);
  return {
    el,
    set(next) {
      if (next === el.textContent) return;
      el.textContent = next;
      ctx.sfx.play('tick');
    },
    destroy: () => el.remove(),
  };
}

export interface VoteRow {
  key: string;
  label: string;
  count: number;
  mine?: boolean;
}

export function voteBars(ctx: BlockCtx, rows: readonly VoteRow[]): Block<[rows: readonly VoteRow[]]> {
  const el = h('ul', { class: 'vote-bars' });
  const set = (next: readonly VoteRow[]): void => {
    const max = Math.max(1, ...next.map((r) => r.count));
    el.replaceChildren(
      ...next.map((r) => {
        const fill = h('span', { class: 'vote-fill' });
        fill.style.setProperty('--share', String(r.count / max));
        return h(
          'li',
          { class: 'vote-bar', testid: 'vote-bar', 'data-key': r.key, 'data-count': r.count, 'data-me': r.mine ? 'true' : null },
          h('span', { class: 'vote-label' }, r.label),
          h('span', { class: 'vote-track' }, fill),
          h('span', { class: 'vote-count' }, String(r.count)),
        );
      }),
    );
  };
  set(rows);
  if (rows.length > 0) ctx.sfx.play('whoosh');
  return { el, set, destroy: () => el.remove() };
}
