import type { RejectReason } from '../../net/protocol';
import { createScope, h } from '../dom';
import type { Unmount } from './types';

export interface LostProps {
  onRejoin(): void;
  onHome(): void;
}

export interface RejectedProps {
  reason: RejectReason;
  onHome(): void;
}

function mountScreen(slot: HTMLElement, el: HTMLElement, sc: ReturnType<typeof createScope>): Unmount {
  slot.append(el);
  return {
    destroy() {
      sc.dispose();
      el.remove();
    },
  };
}

export function mountLost(slot: HTMLElement, p: LostProps): Unmount {
  const sc = createScope();
  const rejoin = h('button', { type: 'button', testid: 'btn-rejoin' }, 'NEU BEITRETEN');
  const home = h('button', { type: 'button', testid: 'btn-home' }, 'ZUM START');
  sc.on(rejoin, 'click', p.onRejoin);
  sc.on(home, 'click', p.onHome);
  return mountScreen(slot, h('main', { 'data-screen': 'lost' }, h('h2', {}, 'VERBINDUNG ZUM HOST VERLOREN'), rejoin, home), sc);
}

const REASONS: Record<RejectReason, string> = {
  full: 'Party ist voll (8/8)',
  started: 'Party läuft schon',
  badname: 'Name nicht erlaubt',
};

export function mountRejected(slot: HTMLElement, p: RejectedProps): Unmount {
  const sc = createScope();
  const home = h('button', { type: 'button', testid: 'btn-home' }, 'ZUM START');
  sc.on(home, 'click', p.onHome);
  return mountScreen(slot, h('main', { 'data-screen': 'rejected' }, h('h2', {}, REASONS[p.reason]), home), sc);
}
