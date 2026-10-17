import type { Page } from '@playwright/test';

export interface EbCard {
  c: number;
  term: string | null;
}

export interface EbSeen {
  k: number;
  role: string;
  hasTaboo: boolean;
  cards: EbCard[];
  picks: string[];
}

export interface Played {
  game: string;
  seen?: EbSeen[];
  early?: boolean;
  taps?: number;
  wrong?: number;
  same?: boolean;
  exposed?: boolean;
  right?: boolean;
}

export interface RoundOpts {
  early?: boolean;
  enter?: boolean;
  guess?: number;
  round?: number;
  bias?: number;
  accuse?: string;
  aim?: string;
  avoid?: string;
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

export interface Tuple {
  state: string;
  step?: string;
  role?: string;
}

const keyOf = (t: Tuple): string => `${t.state}|${t.step ?? ''}|${t.role ?? ''}`;

export async function drive(page: Page, act: (t: Tuple) => Promise<void>): Promise<void> {
  const seen = new Set<string>();
  const gone = (): Promise<boolean> =>
    page.evaluate(() => !document.querySelector('[data-screen=game]')).catch(() => true);
  for (;;) {
    const next = await page.waitForFunction(
      (done) => {
        const root = document.querySelector('[data-screen=game]');
        if (!root) return 'gone';
        const t = {
          state: root.getAttribute('data-state') ?? '',
          step: root.getAttribute('data-step') ?? undefined,
          role: root.getAttribute('data-role') ?? undefined,
        };
        return done.includes(`${t.state}|${t.step ?? ''}|${t.role ?? ''}`) ? false : t;
      },
      [...seen],
      { polling: 'raf', timeout: 30_000 },
    );
    const t = (await next.jsonValue()) as Tuple | 'gone';
    if (t === 'gone') return;
    seen.add(keyOf(t));
    try {
      await act(t);
    } catch (e) {
      if (await gone()) return;
      throw e;
    }
  }
}

export async function playSchaetzfuchs(page: Page, o: { enter?: boolean; guess?: number } = {}): Promise<Played> {
  await drive(page, async (t) => {
    if (t.state !== 'ask') return;
    const input = page.getByTestId('sf-input');
    await input.fill(String(o.guess ?? 100));
    if (o.enter) await input.press('Enter');
    else await page.getByTestId('sf-submit').click();
  });
  return { game: 'schaetzfuchs' };
}

const firstBox = (page: Page, testid: string): Promise<{ x: number; y: number } | null> =>
  center(page, testid).catch(() => null);

async function pickFirst(page: Page, state: string, testid: string): Promise<void> {
  await drive(page, async (t) => {
    if (t.state !== state) return;
    const at = await firstBox(page, testid);
    if (at) await page.mouse.click(at.x, at.y);
  });
}

export async function playGleichklang(page: Page): Promise<Played> {
  await pickFirst(page, 'ask', 'choice');
  return { game: 'gleichklang' };
}

export async function playWerwuerde(page: Page): Promise<Played> {
  await pickFirst(page, 'vote', 'pick');
  return { game: 'werwuerde' };
}

const stateAt = (page: Page): Promise<{ state: string; step: string } | null> =>
  page.evaluate(() => {
    const root = document.querySelector('[data-screen=game]');
    return root ? { state: root.getAttribute('data-state') ?? '', step: root.getAttribute('data-step') ?? '' } : null;
  });

const MAX_PUMPS = 45;

export async function playBombe(page: Page): Promise<Played> {
  let taps = 0;
  await drive(page, async (t) => {
    if (t.state !== 'pump') return;
    const click = async (testid: string): Promise<void> => {
      const at = await firstBox(page, testid);
      if (at) await page.mouse.click(at.x, at.y);
      taps++;
    };
    if (t.step === '0') {
      for (let i = 0; i < MAX_PUMPS; i++) {
        const now = await stateAt(page);
        if (now?.state !== 'pump' || now.step !== '0') break;
        await click('btn-pump');
      }
      return;
    }
    await click('btn-pump');
    await click('btn-pump');
    await click('btn-cash');
  });
  return { game: 'bombe', taps };
}

export async function playStopp(page: Page): Promise<Played> {
  let taps = 0;
  await drive(page, async (t) => {
    if (t.state !== 'blind') return;
    const at = await firstBox(page, 'btn-stop');
    if (at) await page.mouse.click(at.x, at.y);
    taps++;
  });
  return { game: 'stopp', taps };
}

async function clickFirst(page: Page, testid: string): Promise<boolean> {
  const at = await firstBox(page, testid);
  if (at) await page.mouse.click(at.x, at.y);
  return at !== null;
}

export async function playLuegenbaron(page: Page): Promise<Played> {
  await drive(page, async (t) => {
    if (t.role === 'narrator' && t.state === 'card') await clickFirst(page, 'btn-lie');
    if (t.role === 'narrator' && t.state === 'tell') await clickFirst(page, 'btn-done');
    if (t.role === 'listener' && t.state === 'vote') await clickFirst(page, 'choice');
  });
  return { game: 'luegenbaron' };
}

const pickAt = (page: Page, name: string | null): Promise<{ x: number; y: number } | null> =>
  page.evaluate((who) => {
    const all = [...document.querySelectorAll<HTMLElement>('[data-testid=pick]')];
    const hit = all.find((e) => e.querySelector('.pick-name')?.textContent === who) ?? all[0];
    const box = hit?.getBoundingClientRect();
    return box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : null;
  }, name);

export async function playVerraeter(page: Page, o: { bias?: number; accuse?: string } = {}): Promise<Played> {
  const out: Played = { game: 'verraeter' };
  await drive(page, async (t) => {
    if (t.state === 'round') await clickFirst(page, 'btn-done');
    if (t.state === 'guess') await clickFirst(page, 'choice');
    if (t.state === 'vote') {
      if (await firstBox(page, 'btn-same')) await clickFirst(page, o.bias === 1 ? 'btn-diff' : 'btn-same');
      else {
        const at = await pickAt(page, o.accuse ?? null);
        if (at) await page.mouse.click(at.x, at.y);
      }
    }
    if (t.state === 'reveal') {
      const r = await page.evaluate(() => {
        const el = document.querySelector('[data-testid=vr-reveal]');
        const attr = (k: string): boolean | undefined => {
          const v = el?.getAttribute(k);
          return v === 'true' ? true : v === 'false' ? false : undefined;
        };
        return { same: attr('data-same'), exposed: attr('data-exposed'), right: attr('data-right') };
      });
      Object.assign(out, r);
    }
  });
  return out;
}

const choiceAt = (page: Page, aim?: string, avoid?: string): Promise<{ x: number; y: number } | null> =>
  page.evaluate(
    ([want, not]) => {
      const all = [...document.querySelectorAll<HTMLElement>('[data-testid=choice]')];
      const text = (b: HTMLElement): string => b.querySelector('.choice-text')?.textContent ?? '';
      const hit = all.find((b) => want !== null && text(b) === want) ?? all.find((b) => not === null || text(b) !== not) ?? all[0];
      const box = hit?.getBoundingClientRect();
      return box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : null;
    },
    [aim ?? null, avoid ?? null] as const,
  );

export async function playPokerface(page: Page, o: { aim?: string; avoid?: string } = {}): Promise<Played> {
  await drive(page, async (t) => {
    if (t.state === 'talk') await clickFirst(page, 'btn-done-mission');
    if (t.state === 'guess') {
      const at = await choiceAt(page, o.aim, o.avoid);
      if (at) await page.mouse.click(at.x, at.y);
    }
  });
  return { game: 'pokerface' };
}

const sampleCard = (page: Page): Promise<EbCard> =>
  page.evaluate(() => {
    const el = document.querySelector('[data-testid=eb-term]');
    return { c: Number(el?.getAttribute('data-c') ?? -1), term: el?.textContent ?? null };
  });

const pickNames = (page: Page): Promise<string[]> =>
  page.evaluate(() => [...document.querySelectorAll('[data-testid=pick] .pick-name')].map((e) => e.textContent ?? ''));

async function untilHits(page: Page, step: string, need: number): Promise<boolean> {
  const r = await page.waitForFunction(
    ([k, n]) => {
      const root = document.querySelector('[data-screen=game]');
      if (!root || root.getAttribute('data-state') !== 'explain' || root.getAttribute('data-step') !== k) return 'over';
      return Number(document.querySelector('[data-testid=eb-count]')?.getAttribute('data-hits') ?? 0) >= Number(n) ? 'hit' : false;
    },
    [step, String(need)] as const,
    { polling: 'raf', timeout: 15_000 },
  );
  return (await r.jsonValue()) === 'hit';
}

export async function playErklaerbaer(page: Page, o: { bias?: number } = {}): Promise<Played> {
  const seen: EbSeen[] = [];
  await drive(page, async (t) => {
    if (t.state !== 'explain') return;
    const row: EbSeen = {
      k: Number(t.step),
      role: t.role ?? '',
      hasTaboo: (await firstBox(page, 'btn-taboo')) !== null,
      cards: [await sampleCard(page)],
      picks: [],
    };
    seen.push(row);
    const step = t.step ?? '';
    if (t.role === 'explainer') {
      await clickFirst(page, 'btn-hit');
      row.picks = await pickNames(page);
      if (row.picks.length > 0) {
        const at = await pickAt(page, null);
        if (at) await page.mouse.click(at.x, at.y);
      }
      if (!(await untilHits(page, step, 1))) return;
      row.cards.push(await sampleCard(page));
      if (row.hasTaboo) await clickFirst(page, o.bias === 1 ? 'btn-taboo' : 'btn-hit');
    } else if (t.role === 'guard' && (await untilHits(page, step, 1))) {
      row.cards.push(await sampleCard(page));
      await clickFirst(page, 'btn-taboo');
    }
  });
  return { game: 'erklaerbaer', seen };
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
    case 'gleichklang':
      return playGleichklang(page);
    case 'werwuerde':
      return playWerwuerde(page);
    case 'bombe':
      return playBombe(page);
    case 'stopp':
      return playStopp(page);
    case 'luegenbaron':
      return playLuegenbaron(page);
    case 'verraeter':
      return playVerraeter(page, o);
    case 'pokerface':
      return playPokerface(page, o);
    case 'erklaerbaer':
      return playErklaerbaer(page, o);
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
