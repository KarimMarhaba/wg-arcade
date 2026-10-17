import { ALPHABET, normalizeCode } from '../../net/code';
import { createScope, h } from '../dom';
import type { Unmount } from './types';

export interface StartProps {
  banner?: string;
  onHost(): void;
  onJoin(code: string): void;
}

const MUTE_KEY = 'wgarcade.mute';

function isMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function setMuted(on: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, on ? '1' : '0');
  } catch {
    /* Speicher gesperrt */
  }
}

export function mountStart(slot: HTMLElement, p: StartProps): Unmount {
  const sc = createScope();
  const mute = h('button', { type: 'button', testid: 'btn-mute', 'aria-pressed': String(isMuted()) });
  const showMute = (): void => {
    mute.textContent = mute.getAttribute('aria-pressed') === 'true' ? 'TON AUS' : 'TON AN';
  };
  showMute();
  const host = h('button', { type: 'button', testid: 'btn-host' }, 'PARTY STARTEN');
  const join = h('button', { type: 'button', testid: 'btn-join' }, 'BEITRETEN');
  const input = h('input', {
    testid: 'input-code',
    maxlength: 4,
    autocapitalize: 'characters',
    autocomplete: 'off',
    inputmode: 'text',
    'aria-label': 'Raumcode',
    placeholder: 'CODE',
  });
  const go = h('button', { type: 'submit', testid: 'btn-join-go', disabled: true }, 'REIN');
  const form = h('form', { hidden: true }, input, go);
  const el = h(
    'main',
    { 'data-screen': 'start' },
    mute,
    h('h1', {}, 'WG·ARCADE'),
    h('p', {}, 'Partyspiele nur mit Handys.'),
    p.banner ? h('p', { class: 'banner', role: 'alert', testid: 'banner' }, p.banner) : null,
    host,
    join,
    form,
  );

  const clean = (): string => [...input.value.toUpperCase()].filter((c) => ALPHABET.includes(c)).join('').slice(0, 4);
  sc.on(mute, 'click', () => {
    const on = mute.getAttribute('aria-pressed') !== 'true';
    mute.setAttribute('aria-pressed', String(on));
    setMuted(on);
    showMute();
  });
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

  slot.append(el);
  return {
    destroy() {
      sc.dispose();
      el.remove();
    },
  };
}
