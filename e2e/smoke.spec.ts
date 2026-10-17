import { expect, test } from '@playwright/test';

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
