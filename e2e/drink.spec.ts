import { expect, test, type Page } from '@playwright/test';
import { gameGone, playRound } from './bots';
import { cssColor, joinByCode, openHost, screen, tid } from './helpers';
import { rec as readRec, WATCH_GAMES, type Rec } from './watch';

const RUN = { only: 'hammer', rounds: 1, seed: 424242 };
const ME_TAKE = 'TRINK 1';
const ME_OUT = 'Du bist raus aus der Nummer 😎';

async function oneRound(host: Page, pages: Page[]): Promise<void> {
  await playRound(host);
  await gameGone(host);
  for (const p of pages) await screen(p, 'podium').waitFor({ timeout: 30_000 });
}

function checkAnnounce(host: Rec, guest: Rec, n: number): void {
  const h = host.drinks[n];
  const g = guest.drinks[n];
  expect(h, `Host Ansage ${n}`).not.toBeNull();
  expect(g, `Gast Ansage ${n}`).not.toBeNull();
  expect(g?.me).toBe(ME_TAKE);
  expect(h?.me).toBe(ME_OUT);
  expect(h?.cheers).toBe(false);
  expect(g?.chips).toHaveLength(1);
  expect(g?.chips[0]).toMatchObject({ take: 1, give: 0 });
  expect(g?.chips[0]?.pid).not.toBe('');
  expect(h?.chips).toEqual(g?.chips);
  expect(h?.line).toBe(g?.line);
  expect(g?.line).toContain('Anna');
}

test('Trinkmodus: Schalter, Hinweis einmal, Ansage auf beiden Handys, Spielakzent nur am Timer', async ({ context }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  await context.addInitScript(WATCH_GAMES);
  const host = await openHost(context, 'Karim', errors, RUN);
  const guest = await joinByCode(context, host.code, 'Anna', errors, RUN);
  const pages = [host.page, guest];

  await expect(tid(host.page, 'btn-drink')).toHaveAttribute('aria-pressed', 'false');
  await expect(tid(guest, 'btn-drink')).toHaveCount(0);
  await expect(tid(guest, 'drink-status')).toBeHidden();
  await expect(tid(host.page, 'drink-hint')).toHaveCount(0);

  await tid(host.page, 'btn-drink').click();
  await expect(tid(host.page, 'btn-drink')).toHaveAttribute('aria-pressed', 'true');
  await expect(tid(guest, 'drink-status')).toBeVisible();
  for (const p of pages) {
    await expect(tid(p, 'drink-hint')).toBeVisible();
    await expect(tid(p, 'drink-hint')).toHaveAttribute('role', 'dialog');
    await expect(tid(p, 'btn-drink-ok')).toBeFocused();
    expect(await tid(p, 'btn-drink-ok').boundingBox().then((b) => b?.height ?? 0)).toBeGreaterThanOrEqual(55.5);
  }
  for (const p of pages) {
    await tid(p, 'btn-drink-ok').click();
    await expect(tid(p, 'drink-hint')).toHaveCount(0);
  }

  await tid(host.page, 'btn-start').click();
  await oneRound(host.page, pages);

  const [h1, g1] = await Promise.all(pages.map(readRec));
  checkAnnounce(h1 as Rec, g1 as Rec, 0);
  for (const r of [h1, g1] as Rec[]) expect(r.hints).toBe(1);

  const hot = await cssColor(host.page, '--hot');
  const tint = (h1 as Rec).rounds[0]?.tint;
  expect(tint?.tint).toBe('hot');
  expect(tint?.fill).toBe(hot);
  expect(tint?.bg).not.toBe(hot);
  expect(tint?.bg).not.toBe(tint?.fill);

  await tid(host.page, 'btn-again').click();
  await oneRound(host.page, pages);
  const [h2, g2] = await Promise.all(pages.map(readRec));
  checkAnnounce(h2 as Rec, g2 as Rec, 1);
  for (const r of [h2, g2] as Rec[]) {
    expect(r.hints).toBe(1);
    expect(r.results).toHaveLength(2);
  }
  for (const p of pages) await expect(tid(p, 'drink-hint')).toHaveCount(0);

  expect(errors).toEqual([]);
});
