import { expect, test } from '@playwright/test';
import { joinByCode, joinByUrl, openHost, screen, tid, url, watchErrors } from './helpers';

test('Beitritt: Host, Client per URL, Client per Code, Reload', async ({ context }) => {
  const errors: string[] = [];
  const host = await openHost(context, 'Karim', errors);
  const c1 = await joinByUrl(context, host.code, 'Anna', errors);
  const c2 = await joinByCode(context, host.code, 'Anna', errors);
  const pages = [host.page, c1, c2];

  for (const p of pages) await expect(tid(p, 'player')).toHaveCount(3);
  await expect(tid(host.page, 'player')).toContainText(['Karim', 'Anna', 'Anna 2']);
  await expect(tid(c2, 'player')).toContainText(['Karim', 'Anna', 'Anna 2']);
  await expect(tid(host.page, 'qr')).toBeVisible();
  await expect(tid(host.page, 'player').first()).toHaveAttribute('data-pid', /.+/);
  await expect(tid(host.page, 'player').first()).toHaveAttribute('data-online', 'true');

  await c1.addInitScript(() => {
    new MutationObserver(() => {
      if (document.querySelector('[data-screen=name]')) (window as unknown as { sawName: boolean }).sawName = true;
    }).observe(document, { subtree: true, childList: true });
  });
  await c1.reload();
  await expect(screen(c1, 'lobby')).toBeVisible();
  for (const p of pages) await expect(tid(p, 'player')).toHaveCount(3);
  expect(await c1.evaluate(() => (window as unknown as { sawName?: boolean }).sawName ?? false)).toBe(false);
  await expect(tid(host.page, 'player')).toContainText(['Karim', 'Anna', 'Anna 2']);
  expect(errors).toEqual([]);
});

test('Leerlauf-Party läuft bis zum Podium, Clients ohne Host-Knöpfe', async ({ context }) => {
  const errors: string[] = [];
  const host = await openHost(context, 'Karim', errors);
  const c1 = await joinByUrl(context, host.code, 'Anna', errors);
  const c2 = await joinByCode(context, host.code, 'Ben', errors);
  const clients = [c1, c2];
  const pages = [host.page, ...clients];

  for (const p of clients) {
    await expect(tid(p, 'btn-start')).toHaveCount(0);
    await expect(tid(p, 'rounds-3')).toHaveCount(0);
  }
  await tid(host.page, 'rounds-3').click();
  await expect(tid(host.page, 'rounds-3')).toHaveAttribute('aria-pressed', 'true');

  const sel: Record<string, string> = {
    intro: '[data-screen=intro][data-game] [data-testid=countdown]',
    game: '[data-screen=game][data-game][data-state]',
    result: '[data-screen=result] [data-testid=result-row][data-pid][data-points]',
    podium: '[data-screen=podium] [data-testid=podium-row][data-pid][data-total]',
  };
  const seen = pages.flatMap((p) =>
    Object.values(sel).map((s) => p.waitForFunction((q) => !!document.querySelector(q), s, { timeout: 60_000 })),
  );
  await tid(host.page, 'btn-start').click();
  await Promise.all(seen);

  for (const p of pages) await expect(tid(p, 'podium-row')).toHaveCount(3);
  for (const p of clients) {
    await expect(tid(p, 'btn-again')).toHaveCount(0);
    await expect(tid(p, 'btn-new')).toHaveCount(0);
    await expect(tid(p, 'btn-next')).toHaveCount(0);
  }
  await expect(tid(host.page, 'btn-again')).toBeVisible();
  await expect(tid(host.page, 'btn-new')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Name: leer oder nur Leerzeichen zeigt name-error', async ({ page }) => {
  await page.goto(url());
  await tid(page, 'btn-host').click();
  await expect(tid(page, 'name-error')).toHaveCount(0);
  await tid(page, 'input-name').fill('   ');
  await tid(page, 'btn-name-go').click();
  await expect(tid(page, 'name-error')).toBeVisible();
  await expect(screen(page, 'name')).toBeVisible();
  await expect(tid(page, 'input-name')).toHaveAttribute('maxlength', '12');
});

test('Beitritt nach dem Start zeigt rejected mit Weg zurück', async ({ context }) => {
  const errors: string[] = [];
  const host = await openHost(context, 'Karim', errors);
  await tid(host.page, 'btn-start').click();
  await expect(screen(host.page, 'intro')).toBeVisible();

  const late = await context.newPage();
  watchErrors(late, errors);
  await late.goto(url(`#/j/${host.code}`));
  await tid(late, 'input-name').fill('Spät');
  await tid(late, 'btn-name-go').click();
  await expect(screen(late, 'rejected')).toBeVisible();
  await tid(late, 'btn-home').click();
  await expect(screen(late, 'start')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Unbekannter Raum endet nach höchstens 10 s auf lost', async ({ page }) => {
  test.setTimeout(40_000);
  await page.goto(url('#/j/ZZZZ'));
  await tid(page, 'input-name').fill('Anna');
  await tid(page, 'btn-name-go').click();
  await expect(screen(page, 'lost')).toBeVisible({ timeout: 20_000 });
  await expect(tid(page, 'btn-rejoin')).toBeVisible();
  await tid(page, 'btn-home').click();
  await expect(screen(page, 'start')).toBeVisible();
});
