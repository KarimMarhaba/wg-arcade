import type { Sfx } from '../../games/types';
import { ALPHABET, normalizeCode } from '../../net/code';
import { banner, button, logo, muteToggle, screenFrame } from '../components';
import { createScope, h } from '../dom';
import type { Unmount } from './types';

export interface StartProps {
  banner?: string;
  sfx: Pick<Sfx, 'muted' | 'setMuted'>;
  onHost(): void;
  onJoin(code: string): void;
}

export function mountStart(slot: HTMLElement, p: StartProps): Unmount {
  const sc = createScope();
  const host = button('PARTY STARTEN', { size: 'l', testid: 'btn-host' });
  const join = button('BEITRETEN', { size: 'l', variant: 'ghost', testid: 'btn-join' });
  const input = h('input', {
    class: 'code-input',
    testid: 'input-code',
    maxlength: 4,
    autocapitalize: 'characters',
    autocomplete: 'off',
    inputmode: 'text',
    'aria-label': 'Raumcode',
    placeholder: 'CODE',
  });
  const go = button('REIN', { type: 'submit', testid: 'btn-join-go', disabled: true });
  const form = h('form', { class: 'join-form', hidden: true }, input, go);
  const frame = screenFrame({
    screen: 'start',
    head: [muteToggle(p.sfx)],
    main: [
      logo(),
      h('p', { class: 'sub' }, 'Partyspiele nur mit Handys.'),
      p.banner ? banner(p.banner, 'bad', { testid: 'banner', role: 'alert' }) : null,
    ],
    foot: [host, join, form],
  });
  frame.body.classList.add('start-main');

  const clean = (): string => [...input.value.toUpperCase()].filter((c) => ALPHABET.includes(c)).join('').slice(0, 4);
  sc.on(host, 'click', p.onHost);
  sc.on(join, 'click', () => {
    form.hidden = false;
    input.focus();
  });
  sc.on(input, 'input', () => {
    input.value = clean();
    go.disabled = normalizeCode(input.value) === null;
  });
  sc.on(form, 'submit', (e) => {
    e.preventDefault();
    const code = normalizeCode(input.value);
    if (code) p.onJoin(code);
  });

  slot.append(frame.root);
  return {
    destroy() {
      sc.dispose();
      frame.root.remove();
    },
  };
}
