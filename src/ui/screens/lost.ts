import type { RejectReason } from '../../net/protocol';
import { button, screenFrame, wifiOffIcon } from '../components';
import { createScope, h } from '../dom';
import type { Unmount } from './types';

export interface LostProps {
  onRejoin?: () => void;
  onHome(): void;
}

export interface RejectedProps {
  reason: RejectReason;
  onHome(): void;
}

const REASONS: Record<RejectReason, string> = {
  full: 'Party ist voll (8/8)',
  started: 'Party läuft schon',
  badname: 'Name nicht erlaubt',
};

function mountNotice(slot: HTMLElement, screen: string, title: string, icon: boolean, buttons: HTMLElement[], sc: ReturnType<typeof createScope>): Unmount {
  const frame = screenFrame({
    screen,
    main: [h('div', { class: 'notice' }, icon ? wifiOffIcon() : null, h('h2', {}, title))],
    foot: buttons,
  });
  slot.append(frame.root);
  return {
    destroy() {
      sc.dispose();
      frame.root.remove();
    },
  };
}

export function mountLost(slot: HTMLElement, p: LostProps): Unmount {
  const sc = createScope();
  const buttons: HTMLElement[] = [];
  const { onRejoin } = p;
  if (onRejoin) {
    const rejoin = button('NEU BEITRETEN', { size: 'l', testid: 'btn-rejoin' });
    sc.on(rejoin, 'click', onRejoin);
    buttons.push(rejoin);
  }
  const home = button('ZUM START', { size: 'l', variant: 'ghost', testid: 'btn-home' });
  sc.on(home, 'click', p.onHome);
  buttons.push(home);
  return mountNotice(slot, 'lost', 'VERBINDUNG ZUM HOST VERLOREN', true, buttons, sc);
}

export function mountRejected(slot: HTMLElement, p: RejectedProps): Unmount {
  const sc = createScope();
  const home = button('ZUM START', { size: 'l', testid: 'btn-home' });
  sc.on(home, 'click', p.onHome);
  return mountNotice(slot, 'rejected', REASONS[p.reason], false, [home], sc);
}
