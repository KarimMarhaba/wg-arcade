import type { Fx } from '../games/types';
import { h } from './dom';

const FALLBACK_MS = 3000;

export function prefersReducedMotion(): boolean {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function removeAfter(el: HTMLElement): void {
  el.addEventListener('animationend', () => el.remove(), { once: true });
  setTimeout(() => el.remove(), FALLBACK_MS);
}

export function createFx(reduced: () => boolean = prefersReducedMotion): Fx {
  return {
    reducedMotion: reduced,
    punch(el) {
      if (reduced()) return;
      el.classList.remove('punch');
      void el.offsetWidth;
      el.classList.add('punch');
      const done = (e: AnimationEvent): void => {
        if (e.target !== el) return;
        el.classList.remove('punch');
        el.removeEventListener('animationend', done);
      };
      el.addEventListener('animationend', done);
    },
    floatText(el, text) {
      if (reduced()) return;
      const f = h('span', { class: 'float', 'aria-hidden': 'true' }, text);
      el.append(f);
      removeAfter(f);
    },
    flash(kind) {
      if (reduced()) return;
      const f = h('div', { class: 'flash', 'data-kind': kind, 'aria-hidden': 'true' });
      document.body.append(f);
      removeAfter(f);
    },
  };
}
