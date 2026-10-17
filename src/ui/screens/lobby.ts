import type { Rounds } from '../../engine/types';
import type { PlayerView, View } from '../../engine/view';
import type { Mounted } from '../../games/types';
import { button, codeBoxes, panel, playerBadge, screenFrame, segmented, shapeSvg, waitDots, type Segmented } from '../components';
import { createScope, h } from '../dom';
import { paletteAt } from '../palette';
import { qrSvg } from '../qr';
import type { Env } from './types';

type LobbyView = Extract<View, { s: 'lobby' }>;

const ROUNDS = [3, 5, 8] as const;
const MAX_PLAYERS = 8;

function rowContent(p: PlayerView, me: string): Node[] {
  return [
    playerBadge(p, { size: 's', me: p.pid === me }),
    h('span', { class: 'name' }, p.name),
    p.host ? h('span', { class: 'tag' }, 'HOST') : null,
    p.online ? null : h('span', { class: 'tag' }, 'OFFLINE'),
  ].filter((n): n is HTMLElement => n !== null);
}

function syncOrder(list: HTMLElement, items: HTMLElement[]): void {
  items.forEach((li, i) => {
    if (list.children[i] !== li) list.insertBefore(li, list.children[i] ?? null);
  });
  while (list.children.length > items.length) list.lastElementChild?.remove();
}

export function mountLobby(slot: HTMLElement, first: LobbyView, env: Env): Mounted<View> {
  const sc = createScope();
  const control = first.isHost ? env.control : undefined;
  const { sfx } = env.ctx;
  let dead = false;
  let rendered = false;
  const items = new Map<string, HTMLElement>();
  const list = h('ul', { class: 'players' });
  const heading = h('p', { class: 'heading-row' });
  const waitText = h('span', {});
  const hint = h('p', { class: 'note', 'aria-live': 'polite' });
  let start: HTMLButtonElement | undefined;
  let rounds: Segmented<number> | undefined;
  let drink: HTMLButtonElement | undefined;
  let drinking = first.drinking;
  const status = h('p', { class: 'drink-status', testid: 'drink-status', 'aria-live': 'polite', hidden: true }, '🍻 Trinkmodus an');

  const main: HTMLElement[] = [];
  const foot: HTMLElement[] = [];
  if (control) {
    const joinUrl = env.joinUrl(first.code);
    const qr = h('div', { class: 'qr', testid: 'qr', 'data-url': joinUrl, role: 'img', 'aria-label': 'QR-Code zum Beitreten' });
    qrSvg(joinUrl).then(
      (svg) => {
        if (!dead) qr.innerHTML = svg;
      },
      () => {},
    );
    rounds = segmented<number>(ROUNDS, first.rounds, (n) => control({ a: 'rounds', n: n as Rounds }), {
      label: 'Runden',
      testid: (n) => `rounds-${n}`,
    });
    drink = button('🍻 TRINKMODUS', { variant: 'ghost', testid: 'btn-drink' });
    drink.classList.add('drink-toggle');
    sc.on(drink, 'click', () => control({ a: 'drinking', on: !drinking }));
    start = button("LOS GEHT'S", { size: 'l', testid: 'btn-start' });
    sc.on(start, 'click', () => control({ a: 'start' }));
    main.push(
      panel(qr, codeBoxes(first.code)),
      heading,
      list,
      h('p', { class: 'heading-row' }, 'RUNDEN'),
      rounds.el,
      drink,
      h('p', { class: 'note' }, 'Host-Handy anlassen'),
    );
    foot.push(hint, start);
  } else {
    const me = first.players.find((p) => p.pid === first.me);
    main.push(
      h(
        'div',
        { class: 'me-block', 'data-color': me?.color ?? 0 },
        shapeSvg(paletteAt(me?.color ?? 0).shape),
        h('p', { class: 'display t-l' }, 'DU BIST DRIN'),
        h('p', { class: 'name' }, me?.name ?? ''),
      ),
      heading,
      list,
      status,
      h('p', { class: 'note', 'aria-live': 'polite' }, waitText, waitDots()),
    );
  }

  const frame = screenFrame({
    screen: 'lobby',
    head: [h('span', {}, 'LOBBY')],
    main,
    foot: foot.length ? foot : undefined,
  });

  function update(v: View): void {
    if (v.s !== 'lobby') return;
    const live = new Set(v.players.map((p) => p.pid));
    for (const [pid, li] of items)
      if (!live.has(pid)) {
        li.remove();
        items.delete(pid);
      }
    let joined = false;
    const ordered = v.players.map((p) => {
      let li = items.get(p.pid);
      if (!li) {
        li = h('li', { testid: 'player', 'data-pid': p.pid });
        items.set(p.pid, li);
        if (rendered) {
          joined = true;
          li.classList.add('pop');
          li.addEventListener('animationend', () => li?.classList.remove('pop'), { once: true });
        }
      }
      li.setAttribute('data-online', String(p.online));
      li.setAttribute('data-color', String(p.color));
      li.replaceChildren(...rowContent(p, v.me));
      return li;
    });
    syncOrder(list, ordered);
    if (joined) sfx.play('join');
    rendered = true;

    heading.textContent = `SPIELER ${v.players.length}/${MAX_PLAYERS}`;
    rounds?.set(v.rounds);
    drinking = v.drinking;
    drink?.setAttribute('aria-pressed', String(v.drinking));
    status.hidden = !v.drinking;
    if (start) start.disabled = !v.canStart;
    hint.textContent = v.canStart ? '' : `Mindestens ${v.min} Spieler`;
    hint.hidden = v.canStart;
    waitText.textContent = `Warte auf ${v.players.find((p) => p.host)?.name ?? 'den Host'} …`;
  }

  update(first);
  slot.append(frame.root);
  return {
    update,
    destroy() {
      dead = true;
      sc.dispose();
      frame.root.remove();
    },
  };
}
