import type { View } from '../../engine/view';
import type { Mounted } from '../../games/types';
import { countdown, screenFrame } from '../components';
import { h } from '../dom';
import type { Env } from './types';

type IntroView = Extract<View, { s: 'intro' }>;

export function mountIntro(slot: HTMLElement, first: IntroView, env: Env): Mounted<View> {
  const cd = countdown(env.ctx, first.until);
  const round = h('span', {});
  const title = h('h2', {});
  const rule = h('p', { class: 'rule' });
  const frame = screenFrame({
    screen: 'intro',
    accent: first.accent,
    attrs: { 'data-game': first.game },
    head: [round, h('span', { class: 'code-small' }, first.code)],
    main: [title, rule, cd.el],
  });
  frame.body.classList.add('intro-main');

  function update(v: View): void {
    if (v.s !== 'intro') return;
    round.textContent = `RUNDE ${v.r + 1}/${v.n}`;
    title.textContent = v.title;
    rule.textContent = v.rule;
    cd.set(v.until);
  }

  update(first);
  env.ctx.sfx.play(first.r === 0 ? 'start' : 'whoosh');
  slot.append(frame.root);
  return {
    update,
    destroy() {
      cd.destroy();
      frame.root.remove();
    },
  };
}
