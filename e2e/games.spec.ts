import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { gameGone, playRound, type Played } from './bots';
import { audit, openHost, screen, tid, type Run } from './helpers';

type Id = 'blitz' | 'hammer' | 'farbfalle' | 'schaetzfuchs';
const IDS: Id[] = ['blitz', 'hammer', 'farbfalle', 'schaetzfuchs'];

interface RoundRec {
  game: string;
  states: string[];
  shown: string | null;
  firstShown: string | null;
  answer: string | null;
}
interface Rec {
  rounds: RoundRec[];
  results: { points: string | null; label: string }[][];
  flashes: number;
  punches: number;
}

declare global {
  interface Window {
    rec: Rec;
  }
}

const WATCH_GAMES = (): void => {
  const rec: Rec = { rounds: [], results: [], flashes: 0, punches: 0 };
  window.rec = rec;
  const ids = new WeakMap<Element, number>();
  const seenResults = new WeakSet<Element>();
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
          points: row.getAttribute('data-points'),
          label: row.querySelector('.label')?.textContent ?? '',
        })),
      );
    }
  }).observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeOldValue: true,
    characterData: true,
  });
};

const LABEL: Record<Id, RegExp> = {
  blitz: /^\d+ ms$/,
  hammer: /^\d+ Taps?$/,
  farbfalle: /^[+−]?\d+$/,
  schaetzfuchs: /^±\d+ %$/,
};

const CONTRACT: Record<Id, string[]> = {
  blitz: ['done', 'early', 'go', 'show', 'wait'],
  hammer: ['done', 'play'],
  farbfalle: ['done', 'play'],
  schaetzfuchs: ['ask', 'reveal', 'sent'],
};

const digits = (s: string | null): string => (s ?? '').replace(/\D/g, '');

async function start(context: BrowserContext, errors: string[], run: Run): Promise<Page> {
  const { page } = await openHost(context, 'Karim', errors, run);
  await tid(page, 'rounds-3').click();
  await tid(page, 'btn-start').click();
  return page;
}

for (const id of IDS) {
  test(`${id}: drei Runden mit Bot bis zum Podium`, async ({ context }) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    await context.addInitScript(WATCH_GAMES);
    const page = await start(context, errors, { only: id });

    const played: Played[] = [];
    for (let r = 0; r < 3; r++) {
      played.push(await playRound(page, { early: id === 'blitz' && r === 1, enter: r === 1 }));
      await gameGone(page);
    }
    await screen(page, 'podium').waitFor({ timeout: 30_000 });
    const rec = await page.evaluate(() => window.rec);

    expect(rec.rounds).toHaveLength(3);
    expect(rec.results).toHaveLength(3);
    expect([...new Set(rec.rounds.flatMap((r) => r.states))].sort()).toEqual(CONTRACT[id]);

    rec.results.forEach((rows, r) => {
      const round = rec.rounds[r] as RoundRec;
      const bot = played[r] as Played;
      expect(rows, `Runde ${r + 1}`).toHaveLength(1);
      const row = rows[0] as { points: string | null; label: string };
      expect(row.points).toBe('5');
      expect(row.label).toMatch(LABEL[id]);
      switch (id) {
        case 'blitz': {
          const ms = Number(digits(row.label));
          if (bot.early) expect(ms).toBeGreaterThanOrEqual(1000);
          else expect(ms).toBeLessThan(3000);
          break;
        }
        case 'hammer':
          expect(Number(digits(row.label))).toBeGreaterThanOrEqual(1);
          expect(Number(digits(row.label))).toBe(Number(round.shown));
          break;
        case 'farbfalle':
          expect(bot.wrong).toBeGreaterThanOrEqual(1);
          expect(row.label).toBe(round.shown);
          break;
        case 'schaetzfuchs':
          expect(digits(round.shown)).toBe(round.answer);
          break;
      }
    });
    if (id === 'blitz') expect(rec.punches).toBeGreaterThan(0);
    if (id === 'farbfalle') expect(rec.flashes).toBeGreaterThan(0);
    await expect(tid(page, 'podium-row')).toHaveCount(1);
    expect(errors).toEqual([]);
  });
}

test.describe('Reduced Motion', () => {
  test.use({ reducedMotion: 'reduce' });

  for (const id of ['blitz', 'farbfalle'] as const)
    test(`${id}: kein Punch und kein Flash`, async ({ context }) => {
      test.setTimeout(60_000);
      const errors: string[] = [];
      await context.addInitScript(WATCH_GAMES);
      const page = await start(context, errors, { only: id });
      await playRound(page, { early: id === 'blitz' });
      await screen(page, 'result').waitFor({ timeout: 30_000 });
      const rec = await page.evaluate(() => window.rec);
      expect(rec.results).toHaveLength(1);
      expect({ punches: rec.punches, flashes: rec.flashes }).toEqual({ punches: 0, flashes: 0 });
      expect(errors).toEqual([]);
    });

  test('schaetzfuchs: die Antwort steht sofort da, ohne Hochzählen', async ({ context }) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    await context.addInitScript(WATCH_GAMES);
    const page = await start(context, errors, { only: 'schaetzfuchs' });
    await playRound(page);
    await screen(page, 'result').waitFor({ timeout: 30_000 });
    const rec = await page.evaluate(() => window.rec);
    const round = rec.rounds[0] as RoundRec;
    expect(round.answer).not.toBeNull();
    expect(digits(round.firstShown)).toBe(round.answer);
    expect(errors).toEqual([]);
  });
});

test('Hammer zählt schon beim pointerdown (mouse.down ohne up)', async ({ context }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  const page = await start(context, errors, { fast: false, only: 'hammer' });
  await screen(page, 'game').waitFor({ timeout: 15_000 });
  await expect(tid(page, 'btn-hammer')).toHaveAttribute('data-silent', /.*/);
  const box = await tid(page, 'btn-hammer').boundingBox();
  if (!box) throw new Error('keine Box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  expect(await tid(page, 'hammer-count').textContent()).toBe('1');
  await page.mouse.up();
  expect(errors).toEqual([]);
});

test.describe('Layout ohne fast', () => {
  for (const id of IDS)
    test(`${id}: 390x844, kein Überlauf, kein Scrollen, Knöpfe >= 56 px`, async ({ context }) => {
      test.setTimeout(90_000);
      const errors: string[] = [];
      const page = await start(context, errors, { fast: false, only: id });
      await screen(page, 'game').waitFor({ timeout: 15_000 });
      await expect(screen(page, 'game')).toHaveAttribute('data-game', id);
      await audit(page, 'game', `game-${id}`);

      const silent = { blitz: ['blitz-pad'], hammer: ['btn-hammer'], farbfalle: ['ff-rot', 'ff-blau', 'ff-gelb', 'ff-weiss'], schaetzfuchs: [] }[id];
      for (const t of silent) await expect(tid(page, t)).toHaveAttribute('data-silent', /.*/);

      if (id === 'hammer') {
        const box = await tid(page, 'btn-hammer').boundingBox();
        expect((box?.y ?? 0) + (box?.height ?? 0) / 2).toBeGreaterThan(844 / 2);
        const w = box?.width ?? 0;
        expect(Math.abs(w - (box?.height ?? 0))).toBeLessThan(1);
      }
      if (id === 'farbfalle') {
        await expect(tid(page, 'ff-word')).toHaveAttribute('data-ink', /^(rot|blau|gelb|weiss)$/);
        await expect(tid(page, 'ff-rot')).toContainText('ROT');
      }
      if (id === 'schaetzfuchs') {
        await expect(tid(page, 'sf-input')).toHaveAttribute('inputmode', 'numeric');
        await expect(tid(page, 'sf-submit')).not.toHaveAttribute('data-silent', /.*/);
        await tid(page, 'sf-input').fill('100');
        await tid(page, 'sf-submit').click();
        await tid(page, 'sf-reveal').waitFor();
        await page.waitForFunction(() => {
          const a = document.querySelector('[data-testid=sf-answer]')?.textContent ?? '';
          return a.replace(/\D/g, '') === document.querySelector('[data-testid=sf-reveal]')?.getAttribute('data-answer');
        });
        await expect(screen(page, 'game')).toHaveAttribute('data-state', 'reveal');
        await audit(page, 'game', 'game-schaetzfuchs-reveal');
      }
      expect(errors).toEqual([]);
    });
});

