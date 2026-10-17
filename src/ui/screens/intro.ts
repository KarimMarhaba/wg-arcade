import type { Mounted } from '../../games/types';
import type { View } from '../../engine/view';
import { createScope, h } from '../dom';
import type { Env } from './types';

type IntroView = Extract<View, { s: 'intro' }>;

const TICK_MS = 100;

export function mountIntro(slot: HTMLElement, first: IntroView, env: Env): Mounted<View> {
  const sc = createScope();
  let until = first.until;
  const countdown = h('p', { class: 'countdown', testid: 'countdown', 'aria-live': 'assertive' });
  const title = h('h2', {});
  const rule = h('p', {});
  const round = h('p', {});
  const el = h('main', { 'data-screen': 'intro', 'data-game': first.game }, round, title, rule, countdown);

  const tick = (): void => {
    const left = Math.max(0, Math.ceil((env.ctx.toLocal(until) - performance.now()) / 1000));
    const text = String(left);
    if (countdown.textContent !== text) countdown.textContent = text;
  };
  function update(v: View): void {
    if (v.s !== 'intro') return;
    until = v.until;
    round.textContent = `RUNDE ${v.r + 1}/${v.n}`;
    title.textContent = v.title;
    rule.textContent = v.rule;
    tick();
  }

  update(first);
  const id = setInterval(tick, TICK_MS);
  sc.add(() => clearInterval(id));
  slot.append(el);
  return {
    update,
    destroy() {
      sc.dispose();
      el.remove();
    },
  };
}
