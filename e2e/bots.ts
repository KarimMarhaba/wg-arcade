import type { Page } from '@playwright/test';

export interface Played {
  game: string;
  early?: boolean;
  taps?: number;
  wrong?: number;
}

export interface RoundOpts {
  early?: boolean;
  enter?: boolean;
  guess?: number;
  round?: number;
}

const INKS = ['rot', 'blau', 'gelb', 'weiss'] as const;
const WRONG_EVERY = 7;

const gameState = (page: Page): Promise<string | null> =>
  page.evaluate(() => document.querySelector('[data-screen=game]')?.getAttribute('data-state') ?? null);

async function center(page: Page, testid: string): Promise<{ x: number; y: number }> {
  const at = await page.evaluate((id) => {
    const box = document.querySelector(`[data-testid=${id}]`)?.getBoundingClientRect();
    return box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : null;
  }, testid);
  if (!at) throw new Error(`keine Box: ${testid}`);
  return at;
}

export async function playBlitz(page: Page, o: { early?: boolean } = {}): Promise<Played> {
  const at = await center(page, 'blitz-pad');
  for (let i = 0; i < 3; i++) {
    if (i === 0 && o.early) {
      await page.waitForFunction(() => document.querySelector('[data-screen=game]')?.getAttribute('data-state') === 'wait');
      await page.mouse.click(at.x, at.y);
      continue;
    }
    const seen = await page.waitForFunction(() => {
      const root = document.querySelector('[data-screen=game]');
      return root ? root.getAttribute('data-state') === 'go' || false : 'gone';
    });
    if ((await seen.jsonValue()) === 'gone') break;
    await page.mouse.click(at.x, at.y);
  }
  return { game: 'blitz', early: o.early ?? false };
}

export async function playHammer(page: Page): Promise<Played> {
  const at = await center(page, 'btn-hammer');
  let taps = 0;
  while ((await gameState(page)) === 'play') {
    await page.mouse.click(at.x, at.y);
    taps++;
  }
  return { game: 'hammer', taps };
}

export async function playFarbfalle(page: Page): Promise<Played> {
  const spots = await Promise.all(INKS.map((ink) => center(page, `ff-${ink}`)));
  let n = 0;
  let wrong = 0;
  for (;;) {
    const cur = await page.evaluate(() => {
      const root = document.querySelector('[data-screen=game]');
      return root?.getAttribute('data-state') === 'play'
        ? (root.querySelector('[data-testid=ff-word]')?.getAttribute('data-ink') ?? null)
        : null;
    });
    if (cur === null) break;
    const ink = INKS.indexOf(cur as (typeof INKS)[number]);
    const bad = n === 1 || n % WRONG_EVERY === WRONG_EVERY - 1;
    const spot = spots[bad ? (ink + 1) % INKS.length : ink];
    if (!spot) break;
    await page.mouse.click(spot.x, spot.y);
    if (bad) wrong++;
    n++;
  }
  return { game: 'farbfalle', taps: n, wrong };
}

export async function playSchaetzfuchs(page: Page, o: { enter?: boolean; guess?: number } = {}): Promise<Played> {
  const asking = await page.waitForFunction(() => {
    const root = document.querySelector('[data-screen=game]');
    if (!root) return 'gone';
    const state = root.getAttribute('data-state');
    if (state === 'ask' && root.querySelector('[data-testid=sf-input]')) return 'ask';
    return state === 'sent' || state === 'reveal' ? 'late' : false;
  });
  if ((await asking.jsonValue()) !== 'ask') return { game: 'schaetzfuchs' };
  const input = page.getByTestId('sf-input');
  await input.fill(String(o.guess ?? 100));
  if (o.enter) await input.press('Enter');
  else await page.getByTestId('sf-submit').click();
  return { game: 'schaetzfuchs' };
}

export async function playRound(page: Page, o: RoundOpts = {}): Promise<Played> {
  await page.waitForFunction(
    (head) => {
      const root = document.querySelector('[data-screen=game]');
      return root !== null && (head === null || (root.querySelector('.frame-head')?.textContent ?? '').includes(head));
    },
    o.round === undefined ? null : `RUNDE ${o.round}/`,
    { timeout: 30_000 },
  );
  const game = await page.evaluate(() => document.querySelector('[data-screen=game]')?.getAttribute('data-game'));
  switch (game) {
    case 'blitz':
      return playBlitz(page, o);
    case 'hammer':
      return playHammer(page);
    case 'farbfalle':
      return playFarbfalle(page);
    case 'schaetzfuchs':
      return playSchaetzfuchs(page, o);
    default:
      throw new Error(`unbekanntes Spiel: ${game}`);
  }
}

export const gameGone = (page: Page): Promise<unknown> =>
  page.waitForFunction(() => !document.querySelector('[data-screen=game]'), null, { timeout: 30_000 });

export async function playToPodium(page: Page, o: RoundOpts = {}): Promise<number> {
  let n = 0;
  for (;;) {
    const seen = await page.waitForFunction(
      () => (document.querySelector('[data-screen=podium]') ? 'podium' : document.querySelector('[data-screen=game]') ? 'game' : false),
      null,
      { timeout: 60_000 },
    );
    if ((await seen.jsonValue()) === 'podium') return n;
    try {
      await playRound(page, o);
    } catch (e) {
      if (!(await page.evaluate(() => !document.querySelector('[data-screen=game]')))) throw e;
    }
    await gameGone(page);
    n++;
  }
}

export async function answerFarbfalle(page: Page, n: number): Promise<void> {
  const spots = await Promise.all(INKS.map((ink) => center(page, `ff-${ink}`)));
  for (let i = 0; i < n; i++) {
    const ink = await page.evaluate(() => document.querySelector('[data-testid=ff-word]')?.getAttribute('data-ink') ?? null);
    const spot = spots[INKS.indexOf(ink as (typeof INKS)[number])];
    if (!spot) throw new Error(`keine Tinte: ${ink}`);
    await page.mouse.click(spot.x, spot.y);
  }
}
