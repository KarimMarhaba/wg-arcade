import { expect, test, type Page } from '@playwright/test';
import { answerFarbfalle, playToPodium } from './bots';
import { joinByCode, joinByUrl, openHost, screen, tid } from './helpers';
import { rec as readRec, WATCH_GAMES } from './watch';

const SAW_NAME = (): void => {
  new MutationObserver(() => {
    if (document.querySelector('[data-screen=name]')) (window as unknown as { sawName: boolean }).sawName = true;
  }).observe(document, { subtree: true, childList: true });
};
const sawName = (page: Page): Promise<boolean> =>
  page.evaluate(() => (window as unknown as { sawName?: boolean }).sawName ?? false);

const badge = (pid: string, online: boolean): string => `.badge[data-pid="${pid}"][data-online=${online}]`;
const hasBadge = (page: Page, sel: string, timeout: number): Promise<unknown> =>
  page.waitForFunction((q) => !!document.querySelector(q), sel, { timeout });

async function who(page: Page, name: string): Promise<{ pid: string; color: string }> {
  const li = tid(page, 'player').filter({ hasText: name });
  return { pid: (await li.getAttribute('data-pid')) ?? '', color: (await li.getAttribute('data-color')) ?? '' };
}

test('Reload mitten im Spiel (fast): Rejoin ohne Duplikat, Name und Farbe bleiben, weiterspielen bis zum Podium', async ({ context }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  await context.addInitScript(WATCH_GAMES);
  const run = { only: 'farbfalle' };
  const host = await openHost(context, 'Karim', errors, run);
  const client = await joinByUrl(context, host.code, 'Anna', errors, run);
  const me = await who(host.page, 'Anna');
  expect(me.pid).not.toBe('');

  await client.addInitScript(SAW_NAME);
  await tid(host.page, 'rounds-5').click();
  await tid(host.page, 'btn-start').click();
  const hostBot = playToPodium(host.page);
  hostBot.catch(() => undefined);

  await client.waitForFunction(() => document.querySelector('[data-screen=game][data-state=play]'), null, { timeout: 30_000 });
  await answerFarbfalle(client, 2);
  const before = (await readRec(host.page)).results.length;
  await client.reload();
  await client.waitForFunction(
    () => document.querySelector('[data-screen=game],[data-screen=intro],[data-screen=result],[data-screen=podium]'),
    null,
    { timeout: 30_000 },
  );
  expect(await sawName(client)).toBe(false);
  await expect(screen(client, 'lobby')).toHaveCount(0);

  await playToPodium(client);
  await hostBot;
  await screen(client, 'podium').waitFor();
  await expect(tid(client, 'podium-row')).toHaveCount(2);

  const rec = await readRec(host.page);
  expect(rec.results).toHaveLength(5);
  for (const rows of rec.results) {
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((x) => x.pid)).size).toBe(2);
    const mine = rows.find((x) => x.pid === me.pid);
    expect(mine?.name).toBe('Anna');
    expect(mine?.color).toBe(me.color);
  }
  const podium = rec.podiums.at(-1) ?? [];
  expect(podium).toHaveLength(2);
  expect(new Set(podium.map((x) => x.pid)).size).toBe(2);
  expect(podium.find((x) => x.pid === me.pid)).toMatchObject({ name: 'Anna', color: me.color });
  const after = rec.results.slice(before).map((rows) => Number(rows.find((x) => x.pid === me.pid)?.points));
  expect(after.some((x) => x > 0)).toBe(true);
  expect(errors).toEqual([]);
});

test('Reload nach dem Tipp (Schätzfuchs, ohne fast): sent mit Tipp, danach Reveal mit 2 Tipps', async ({ context }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  const run = { fast: false, only: 'schaetzfuchs' };
  const host = await openHost(context, 'Karim', errors, run);
  const client = await joinByUrl(context, host.code, 'Anna', errors, run);
  await client.addInitScript(SAW_NAME);
  await tid(host.page, 'rounds-3').click();
  await tid(host.page, 'btn-start').click();

  await tid(client, 'sf-input').fill('77', { timeout: 30_000 });
  await tid(client, 'sf-submit').click();
  await expect(screen(client, 'game')).toHaveAttribute('data-state', 'sent');
  await client.reload();
  await expect(screen(client, 'game')).toHaveAttribute('data-state', 'sent');
  await expect(tid(client, 'sf-sent')).toContainText('77');
  expect(await sawName(client)).toBe(false);

  await tid(host.page, 'sf-input').fill('1000', { timeout: 30_000 });
  await tid(host.page, 'sf-submit').click();
  for (const p of [host.page, client]) {
    await expect(tid(p, 'sf-reveal')).toBeVisible();
    await expect(tid(p, 'sf-guess')).toHaveCount(2);
    await expect(tid(p, 'sf-guess').locator('.sf-guess-val')).not.toContainText(['kein Tipp']);
  }
  expect(errors).toEqual([]);
});

test('Offline: B schließt im Spiel, Party läuft bis zum Podium, Online-Wechsel am Podium in place', async ({ context }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  await context.addInitScript(WATCH_GAMES);
  const run = { only: 'hammer' };
  const host = await openHost(context, 'Karim', errors, run);
  const a = await joinByUrl(context, host.code, 'Anna', errors, run);
  const b = await joinByCode(context, host.code, 'Ben', errors, run);
  const pidA = (await who(host.page, 'Anna')).pid;
  const pidB = (await who(host.page, 'Ben')).pid;

  await tid(host.page, 'rounds-8').click();
  await tid(host.page, 'btn-start').click();
  const bots = Promise.all([playToPodium(host.page), playToPodium(a)]);
  bots.catch(() => undefined);

  await b.waitForFunction(() => document.querySelector('[data-screen=game]'), null, { timeout: 30_000 });
  await b.close();
  await hasBadge(host.page, badge(pidB, false), 8_000);
  const seen = (await readRec(host.page)).results.length;
  await bots;

  const rec = await readRec(host.page);
  expect(rec.results).toHaveLength(8);
  const late = rec.results.slice(seen + 1);
  expect(late.length).toBeGreaterThanOrEqual(1);
  for (const rows of late) {
    const row = rows.find((x) => x.pid === pidB);
    expect(row?.place).toBe(3);
    expect(row?.points).toBe('0');
  }

  await screen(host.page, 'podium').waitFor();
  expect(await host.page.locator(`[data-testid=podium-row] ${badge(pidB, false)}`).count()).toBe(1);
  expect(await host.page.locator(`[data-testid=podium-row] ${badge(pidA, true)}`).count()).toBe(1);
  await host.page.evaluate((pid) => {
    const w = window as unknown as { adds: number };
    w.adds = 0;
    const row = document.querySelector(`[data-testid=podium-row][data-pid="${pid}"]`);
    row?.setAttribute('data-mark', '1');
    row?.querySelector('.badge')?.setAttribute('data-mark', '1');
    const root = document.querySelector('[data-screen=podium]');
    if (root)
      new MutationObserver((rs) => {
        for (const r of rs) w.adds += r.addedNodes.length + r.removedNodes.length;
      }).observe(root, { childList: true, subtree: true });
  }, pidA);

  await a.close();
  await hasBadge(host.page, badge(pidA, false), 8_000);
  const kept = await host.page.evaluate((pid) => {
    const row = document.querySelector(`[data-testid=podium-row][data-pid="${pid}"]`);
    return {
      row: row?.getAttribute('data-mark') ?? null,
      badge: row?.querySelector('.badge')?.getAttribute('data-mark') ?? null,
      online: row?.querySelector('.badge')?.getAttribute('data-online') ?? null,
      adds: (window as unknown as { adds: number }).adds,
    };
  }, pidA);
  expect(kept).toEqual({ row: '1', badge: '1', online: 'false', adds: 0 });

  await tid(host.page, 'btn-new').click();
  await expect(screen(host.page, 'lobby')).toBeVisible();
  await expect(tid(host.page, 'player')).toHaveCount(1);
  await expect(tid(host.page, 'player')).toContainText('Karim');
  expect(errors).toEqual([]);
});
