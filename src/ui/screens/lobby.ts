import type { Mounted } from '../../games/types';
import type { PlayerView, View } from '../../engine/view';
import { createScope, h } from '../dom';
import { qrSvg } from '../qr';
import type { Env } from './types';

type LobbyView = Extract<View, { s: 'lobby' }>;

const ROUNDS = [3, 5, 8] as const;

function playerRow(p: PlayerView, me: string): HTMLElement {
  return h(
    'li',
    { testid: 'player', 'data-pid': p.pid, 'data-online': String(p.online), 'data-color': p.color },
    p.name,
    p.pid === me ? ' (du)' : null,
    p.host ? ' · HOST' : null,
    p.online ? null : ' · offline',
  );
}

export function mountLobby(slot: HTMLElement, first: LobbyView, env: Env): Mounted<View> {
  const sc = createScope();
  const control = first.isHost ? env.control : undefined;
  let dead = false;
  const list = h('ul', { class: 'players' });
  const heading = h('h2', {});
  const code = h('p', { class: 'code', testid: 'room-code', 'aria-label': 'Raumcode' });
  const kids: (HTMLElement | null)[] = [h('p', {}, 'RAUMCODE'), code];

  let qr: HTMLElement | undefined;
  if (control) {
    qr = h('div', { class: 'qr', testid: 'qr', role: 'img', 'aria-label': 'QR-Code zum Beitreten' });
    qrSvg(env.joinUrl(first.code)).then(
      (svg) => {
        if (!dead && qr) qr.innerHTML = svg;
      },
      () => {},
    );
    kids.push(qr);
  } else {
    kids.push(h('p', { class: 'me' }, `DU BIST DRIN, ${first.players.find((p) => p.pid === first.me)?.name ?? ''}`));
  }
  kids.push(heading, list);

  let start: HTMLButtonElement | undefined;
  const roundBtns = new Map<number, HTMLButtonElement>();
  const hint = h('p', {});
  const waiting = h('p', { 'aria-live': 'polite' });
  if (control) {
    const seg = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Runden' });
    for (const n of ROUNDS) {
      const b = h('button', { type: 'button', testid: `rounds-${n}` }, String(n));
      roundBtns.set(n, b);
      sc.on(b, 'click', () => control({ a: 'rounds', n }));
      seg.append(b);
    }
    start = h('button', { type: 'button', testid: 'btn-start' }, "LOS GEHT'S");
    sc.on(start, 'click', () => control({ a: 'start' }));
    kids.push(h('p', {}, 'RUNDEN'), seg, start, hint);
  } else {
    kids.push(waiting);
  }

  const el = h('main', { 'data-screen': 'lobby' }, ...kids);

  function update(v: View): void {
    if (v.s !== 'lobby') return;
    code.textContent = v.code;
    heading.textContent = `SPIELER ${v.players.length}/8`;
    list.replaceChildren(...v.players.map((p) => playerRow(p, v.me)));
    for (const [n, b] of roundBtns) b.setAttribute('aria-pressed', String(v.rounds === n));
    if (start) start.disabled = !v.canStart;
    hint.textContent = v.canStart ? '' : `Mindestens ${v.min} Spieler`;
    const hostName = v.players.find((p) => p.host)?.name ?? 'den Host';
    waiting.textContent = `Warte auf ${hostName} …`;
  }

  update(first);
  slot.append(el);
  return {
    update,
    destroy() {
      dead = true;
      sc.dispose();
      el.remove();
    },
  };
}
