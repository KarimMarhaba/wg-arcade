import { expect, test } from '@playwright/test';
import { openHost, screen, tid, url } from './helpers';

test('Start lädt ohne Fehler', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.goto('./?net=local#/');
  await expect(page.locator('[data-screen=start]')).toBeVisible();
  await expect(page.locator('h1')).toContainText('WG·ARCADE');
  expect(errors).toEqual([]);
});

test('#/host direkt aufgerufen landet auf Start', async ({ page }) => {
  await page.goto(url('#/host'));
  await expect(screen(page, 'start')).toBeVisible();
  await expect(page).toHaveURL(/#\/$/);
});

test('Reload der Host-Lobby landet auf Start', async ({ context }) => {
  const host = await openHost(context);
  await host.page.reload();
  await expect(screen(host.page, 'start')).toBeVisible();
  await expect(tid(host.page, 'room-code')).toHaveCount(0);
});

test('ungültiger Code landet auf Start mit Banner', async ({ page }) => {
  await page.goto(url('#/j/xx'));
  await expect(screen(page, 'start')).toBeVisible();
  await expect(tid(page, 'banner')).toBeVisible();
});

test('Start-Screen erfüllt den Test-ID-Vertrag', async ({ page }) => {
  await page.goto(url());
  for (const id of ['btn-host', 'btn-join', 'btn-mute']) await expect(tid(page, id)).toBeVisible();
  await expect(tid(page, 'input-code')).toBeHidden();
  await tid(page, 'btn-join').click();
  await expect(tid(page, 'input-code')).toBeVisible();
  await expect(tid(page, 'btn-join-go')).toBeDisabled();
  await tid(page, 'input-code').fill('abcd');
  await expect(tid(page, 'btn-join-go')).toBeEnabled();
});
