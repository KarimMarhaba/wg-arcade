import type { Page } from '@playwright/test';

declare global {
  interface Window {
    rec: Rec;
  }
}

export interface RoundRec {
  game: string;
  states: string[];
  shown: string | null;
  firstShown: string | null;
  answer: string | null;
}
export interface Row {
  pid: string;
  place: number;
  points: string | null;
  total: number;
  label: string;
  name: string;
  color: string;
}
export interface PodiumRow {
  pid: string;
  place: number;
  total: number;
  name: string;
  color: string;
}
export interface Rec {
  rounds: RoundRec[];
  results: Row[][];
  podiums: PodiumRow[][];
  intros: { head: string; game: string }[];
  flashes: number;
  punches: number;
}


export const WATCH_GAMES = (): void => {
  const rec: Rec = { rounds: [], results: [], podiums: [], intros: [], flashes: 0, punches: 0 };
  window.rec = rec;
  const ids = new WeakMap<Element, number>();
  const seenResults = new WeakSet<Element>();
  const seenPodiums = new WeakSet<Element>();
  const seenIntros = new WeakSet<Element>();
  const num = (el: Element | null | undefined): number => Number(el?.textContent ?? '');
  const nameOf = (row: Element): string => row.querySelector('.who > .name')?.firstChild?.textContent ?? '';
  const colorOf = (row: Element): string => row.querySelector('.badge')?.getAttribute('data-color') ?? '';
  const roundOf = (root: HTMLElement): RoundRec => {
    let i = ids.get(root);
    if (i === undefined) {
      i = rec.rounds.length;
      ids.set(root, i);
      rec.rounds.push({ game: root.dataset.game ?? '', states: [], shown: null, firstShown: null, answer: null });
    }
    return rec.rounds[i] as RoundRec;
  };
  const push = (round: RoundRec, s: string | null): void => {
    if (s !== null && round.states.at(-1) !== s) round.states.push(s);
  };
  new MutationObserver((records) => {
    for (const r of records) {
      const t = r.target;
      if (r.type === 'attributes' && r.attributeName === 'data-state' && t instanceof HTMLElement && t.dataset.screen === 'game')
        push(roundOf(t), r.oldValue);
      if (r.type === 'attributes' && r.attributeName === 'class' && t instanceof Element) {
        const was = (r.oldValue ?? '').split(' ').includes('punch');
        if (!was && t.classList.contains('punch')) rec.punches++;
      }
      for (const n of r.addedNodes) if (n instanceof Element && n.classList.contains('flash')) rec.flashes++;
    }
    const root = document.querySelector<HTMLElement>('[data-screen=game]');
    if (root) {
      const round = roundOf(root);
      push(round, root.dataset.state ?? null);
      const text = (id: string): string | null => root.querySelector(`[data-testid=${id}]`)?.textContent ?? null;
      const shown = text('hammer-count') ?? text('ff-score') ?? text('sf-answer');
      if (shown !== null) {
        round.shown = shown;
        if (root.dataset.state === 'reveal' && round.firstShown === null) round.firstShown = shown;
      }
      round.answer = root.querySelector('[data-testid=sf-reveal]')?.getAttribute('data-answer') ?? round.answer;
    }
    for (const res of document.querySelectorAll('[data-screen=result]')) {
      if (seenResults.has(res)) continue;
      seenResults.add(res);
      rec.results.push(
        [...res.querySelectorAll('[data-testid=result-row]')].map((row) => ({
          pid: row.getAttribute('data-pid') ?? '',
          place: num(row.querySelector('.place')),
          points: row.getAttribute('data-points'),
          total: num(row.querySelector('.total')),
          label: row.querySelector('.label')?.textContent ?? '',
          name: nameOf(row),
          color: colorOf(row),
        })),
      );
    }
    for (const pod of document.querySelectorAll('[data-screen=podium]')) {
      if (seenPodiums.has(pod)) continue;
      seenPodiums.add(pod);
      rec.podiums.push(
        [...pod.querySelectorAll('[data-testid=podium-row]')].map((row) => ({
          pid: row.getAttribute('data-pid') ?? '',
          place: num(row.querySelector('.place')),
          total: Number(row.getAttribute('data-total')),
          name: nameOf(row),
          color: colorOf(row),
        })),
      );
    }
    for (const intro of document.querySelectorAll<HTMLElement>('[data-screen=intro]')) {
      if (seenIntros.has(intro)) continue;
      seenIntros.add(intro);
      rec.intros.push({ head: intro.querySelector('.frame-head > span')?.textContent ?? '', game: intro.dataset.game ?? '' });
    }
  }).observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeOldValue: true,
    characterData: true,
  });
};

export const rec = (page: Page): Promise<Rec> => page.evaluate(() => window.rec);
