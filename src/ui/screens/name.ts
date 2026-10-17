import { banner, button, screenFrame } from '../components';
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
    enterkeyhint: 'go',
    'aria-label': 'Name',
    value: p.initial.slice(0, MAX_NAME),
  });
  const count = h('span', { class: 'counter' });
  const go = button('WEITER', { size: 'l', testid: 'btn-name-go' });
  const frame = screenFrame({
    screen: 'name',
    main: [h('h2', {}, 'WIE HEISST DU?'), input, count],
    foot: [go],
  });
  let err: HTMLElement | undefined;
  const showError = (msg: string): void => {
    if (!err) {
      err = banner(msg, 'bad', { testid: 'name-error', role: 'alert' });
      frame.body.append(err);
    } else err.textContent = msg;
  };
  const refresh = (): void => {
    count.textContent = `${input.value.length}/${MAX_NAME}`;
  };
  const submit = (): void => {
    const name = input.value.trim();
    if (name.length < 1 || name.length > MAX_NAME) showError(`Bitte einen Namen mit 1 bis ${MAX_NAME} Zeichen eingeben.`);
    else p.onSubmit(name);
  };
  refresh();
  if (p.error) showError(p.error);

  sc.on(input, 'input', refresh);
  sc.on(input, 'keydown', (e) => {
    if ((e as KeyboardEvent).key !== 'Enter') return;
    e.preventDefault();
    submit();
  });
  sc.on(go, 'click', submit);

  slot.append(frame.root);
  return {
    destroy() {
      sc.dispose();
      frame.root.remove();
    },
  };
}
