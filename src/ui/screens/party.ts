import type { View } from '../../engine/view';
import type { Mounted } from '../../games/types';
import type { ClientSession } from '../../net/client';
import { banner as bannerEl, neutralScreen } from '../components';
import { h } from '../dom';
import { mountGame } from './game';
import { mountIntro } from './intro';
import { mountLobby } from './lobby';
import { mountLost, mountRejected } from './lost';
import { mountPodium } from './podium';
import { mountResult } from './result';
import type { Env, Unmount } from './types';

export interface PartyProps {
  session: ClientSession;
  env: Env;
  onRejoin?: () => void;
  onHome(): void;
  onBadName(): void;
}

interface Current {
  key: string;
  update?: Mounted<View>['update'];
  destroy(): void;
}

const keyOf = (v: View): string => (v.s === 'lobby' || v.s === 'podium' ? v.s : `${v.s}:${v.r}`);

export function mountParty(slot: HTMLElement, p: PartyProps): Unmount {
  const wrap = h('div', { class: 'party' });
  const body = h('div', { class: 'party-body' });
  let banner: HTMLElement | undefined;
  let cur: Current | undefined;
  wrap.append(body);
  slot.append(wrap);

  const setBanner = (text: string | undefined): void => {
    if (!text) {
      banner?.remove();
      banner = undefined;
      return;
    }
    if (!banner) {
      banner = bannerEl(text, 'warn', { testid: 'banner', role: 'status', fixed: true });
      wrap.prepend(banner);
    } else banner.textContent = text;
  };

  const show = (key: string, make: () => Omit<Current, 'key'>): boolean => {
    if (cur?.key === key) return false;
    cur?.destroy();
    cur = { key, ...make() };
    return true;
  };

  const neutral = (text: string) =>
    show('wait', () => {
      const el = neutralScreen(text);
      body.append(el);
      return { destroy: () => el.remove() };
    });

  function dispatch(v: View): void {
    const fresh = show(keyOf(v), () => {
      switch (v.s) {
        case 'lobby':
          return mountLobby(body, v, p.env);
        case 'intro':
          return mountIntro(body, v, p.env);
        case 'game':
          return mountGame(body, v, p.env);
        case 'result':
          return mountResult(body, v, p.env);
        case 'podium':
          return mountPodium(body, v, p.env);
      }
    });
    if (!fresh) cur?.update?.(v);
  }

  const off = p.session.onState((st) => {
    switch (st.st) {
      case 'connecting':
        setBanner(undefined);
        neutral('Verbinde …');
        break;
      case 'joined':
        setBanner(undefined);
        if (st.view) dispatch(st.view);
        else neutral('Verbinde …');
        break;
      case 'reconnecting':
        setBanner('Verbindung wird wiederhergestellt …');
        if (st.view) dispatch(st.view);
        break;
      case 'rejected':
        setBanner(undefined);
        if (st.reason === 'badname') p.onBadName();
        else show('rejected', () => mountRejected(body, { reason: st.reason, onHome: p.onHome }));
        break;
      case 'lost':
        setBanner(undefined);
        show('lost', () => mountLost(body, { onRejoin: p.env.control ? undefined : p.onRejoin, onHome: p.onHome }));
        break;
    }
  });

  return {
    destroy() {
      off();
      cur?.destroy();
      cur = undefined;
      wrap.remove();
    },
  };
}
