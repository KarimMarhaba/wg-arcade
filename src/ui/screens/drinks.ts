import type { View } from '../../engine/view';
import { button, panel } from '../components';
import { h } from '../dom';

type ResultView = Extract<View, { s: 'result' }>;

const HINT_TEXT = 'Schluck = irgendein Getränk. Wasser zählt. Passen ist immer okay, ohne Kommentar. Niemand muss trinken. Mehr als 3 Schlücke pro Runde gibt es nicht.';

export function drinkHint(onOk: () => void): HTMLElement {
  const ok = button('VERSTANDEN', { size: 'l', testid: 'btn-drink-ok' });
  ok.addEventListener('click', onOk);
  const root = h(
    'div',
    { class: 'drink-hint', testid: 'drink-hint', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'drink-hint-title' },
    panel(
      h('p', { class: 'display t-l', id: 'drink-hint-title' }, '🍻 TRINKMODUS'),
      h('p', { class: 'drink-hint-text' }, HINT_TEXT),
      ok,
    ),
  );
  queueMicrotask(() => ok.focus());
  return root;
}

function chipText(name: string, take: number, give: number): string {
  const parts = [take > 0 ? `${name} ${take}` : null, give > 0 ? `${take > 0 ? '' : `${name} `}verteilt ${give}` : null];
  return parts.filter((x): x is string => x !== null).join(' + ');
}

export function drinkStrip(d: NonNullable<ResultView['drinks']>, v: ResultView): HTMLElement {
  const mine = d.rows.find((r) => r.pid === v.me);
  const kind = mine ? (mine.take > 0 && mine.give > 0 ? 'both' : mine.take > 0 ? 'take' : 'give') : d.cheers ? 'cheers' : 'out';
  const me = h('p', { class: 'drink-me display t-l', testid: 'drink-me', 'data-kind': kind });
  if (mine) {
    if (mine.take > 0) me.append(h('span', { class: 'take' }, `TRINK ${mine.take}`));
    if (mine.take > 0 && mine.give > 0) me.append(' · ');
    if (mine.give > 0) me.append(h('span', { class: 'give' }, `VERTEIL ${mine.give}`));
  } else me.textContent = d.cheers ? '🍻 Anstoßen – ohne Pflicht' : 'Du bist raus aus der Nummer 😎';

  const line = h('p', { class: 'drink-line', testid: 'drink-line', 'aria-live': 'polite' });
  if (d.rows.length > 0) {
    line.append('🍻 ');
    d.rows.forEach((r, i) => {
      const name = v.players.find((p) => p.pid === r.pid)?.name ?? '?';
      if (i > 0) line.append(' · ');
      line.append(
        h('span', { class: 'drink-chip', testid: 'drink-chip', 'data-pid': r.pid, 'data-take': r.take, 'data-give': r.give }, chipText(name, r.take, r.give)),
      );
    });
  } else if (d.cheers) line.textContent = '🍻 Alle stoßen an';
  else line.hidden = true;

  return h('section', { class: 'panel drink-strip', testid: 'drink-strip', 'data-cheers': String(d.cheers) }, me, line);
}
