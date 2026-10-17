import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { gameGone, playRound, type Played } from './bots';
import { CONTRACT, LABEL, LEGACY } from './contract';
import { audit, openHost, screen, tid, type Run } from './helpers';
import { WATCH_GAMES, type RoundRec } from './watch';

const IDS = LEGACY;

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

test.describe('Reduced Motion: Ballon und Ring', () => {
  test.use({ reducedMotion: 'reduce' });

  const effective = (page: Page, testid: string): Promise<{ animation: number; transition: number }> =>
    page.evaluate((id) => {
      const el = document.querySelector(`[data-testid=${id}]`);
      if (!el) throw new Error(`kein Element: ${id}`);
      const longest = (list: string): number => Math.max(...list.split(',').map((x) => parseFloat(x)));
      const css = getComputedStyle(el);
      return { animation: longest(css.animationDuration), transition: longest(css.transitionDuration) };
    }, testid);

  for (const [id, state, testid] of [['bombe', 'pump', 'balloon'], ['stopp', 'blind', 'stopp-ring']] as const)
    test(`${id}: ${testid} hat keine wirksame Animation oder Transition`, async ({ context }) => {
      test.setTimeout(60_000);
      const errors: string[] = [];
      const page = await start(context, errors, { only: id });
      await expect(screen(page, 'game')).toHaveAttribute('data-state', state, { timeout: 20_000 });
      if (id === 'bombe') await tid(page, 'btn-pump').click();
      const e = await effective(page, testid);
      expect(e.animation).toBeLessThanOrEqual(0.001);
      expect(e.transition).toBeLessThanOrEqual(0.001);
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

