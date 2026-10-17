import { createScope, h } from '../dom';
import type { Unmount } from './types';

export interface NameProps {
  initial: string;
  error?: string;
  onSubmit(name: string): void;
}

export const MAX_NAME = 12;

export function mountName(slot: HTMLElement, p: NameProps): Unmount {
  const sc = createScope();
  const input = h('input', {
    testid: 'input-name',
    maxlength: MAX_NAME,
    autocomplete: 'off',
    'aria-label': 'Name',
    value: p.initial.slice(0, MAX_NAME),
  });
  const count = h('span', {});
  const go = h('button', { type: 'submit', testid: 'btn-name-go' }, 'WEITER');
  const form = h('form', {}, input, count, go);
  const el = h('main', { 'data-screen': 'name' }, h('h2', {}, 'WIE HEISST DU?'), form);
  let err: HTMLElement | undefined;
  const showError = (msg: string): void => {
    if (!err) {
      err = h('p', { class: 'banner', role: 'alert', testid: 'name-error' });
      form.append(err);
    }
    err.textContent = msg;
  };
  const refresh = (): void => {
    count.textContent = `${input.value.length}/${MAX_NAME}`;
  };
  refresh();
  if (p.error) showError(p.error);

  sc.on(input, 'input', refresh);
  sc.on(form, 'submit', (e) => {
    e.preventDefault();
    const name = input.value.trim();
    if (name.length < 1 || name.length > MAX_NAME) showError(`Bitte einen Namen mit 1 bis ${MAX_NAME} Zeichen eingeben.`);
    else p.onSubmit(name);
  });

  slot.append(el);
  return {
    destroy() {
      sc.dispose();
      el.remove();
    },
  };
}
