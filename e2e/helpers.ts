import { expect, type BrowserContext, type Locator, type Page } from '@playwright/test';

export const Q = '?net=local&dev=1&fast=1';
export const url = (hash = '#/'): string => `./${Q}${hash}`;

export const screen = (page: Page, name: string): Locator => page.locator(`[data-screen=${name}]`);
export const tid = (page: Page, id: string): Locator => page.getByTestId(id);

export function watchErrors(page: Page, errors: string[]): void {
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
}

export async function readCode(page: Page): Promise<string> {
  await expect(tid(page, 'room-code')).toHaveText(/^[A-Z]{4}$/);
  return ((await tid(page, 'room-code').textContent()) ?? '').trim();
}

async function enterName(page: Page, name: string): Promise<void> {
  await expect(screen(page, 'name')).toBeVisible();
  await tid(page, 'input-name').fill(name);
  await tid(page, 'btn-name-go').click();
}

export async function openHost(
  context: BrowserContext,
  name = 'Karim',
  errors: string[] = [],
): Promise<{ page: Page; code: string }> {
  const page = await context.newPage();
  watchErrors(page, errors);
  await page.goto(url());
  await tid(page, 'btn-host').click();
  await enterName(page, name);
  await expect(screen(page, 'lobby')).toBeVisible();
  return { page, code: await readCode(page) };
}

export async function joinByUrl(context: BrowserContext, code: string, name: string, errors: string[] = []): Promise<Page> {
  const page = await context.newPage();
  watchErrors(page, errors);
  await page.goto(url(`#/j/${code}`));
  await enterName(page, name);
  await expect(screen(page, 'lobby')).toBeVisible();
  return page;
}

export async function joinByCode(context: BrowserContext, code: string, name: string, errors: string[] = []): Promise<Page> {
  const page = await context.newPage();
  watchErrors(page, errors);
  await page.goto(url());
  await tid(page, 'btn-join').click();
  await tid(page, 'input-code').fill(code);
  await tid(page, 'btn-join-go').click();
  await enterName(page, name);
  await expect(screen(page, 'lobby')).toBeVisible();
  return page;
}
