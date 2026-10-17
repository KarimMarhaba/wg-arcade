import { expect, type BrowserContext, type Locator, type Page } from '@playwright/test';

export interface Run {
  fast?: boolean;
  only?: string;
}

export const query = ({ fast = true, only }: Run = {}): string =>
  `?net=local&dev=1${fast ? '&fast=1' : ''}${only ? `&only=${only}` : ''}`;
export const url = (hash = '#/', run: Run = {}): string => `./${query(run)}${hash}`;

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
  run: Run = {},
): Promise<{ page: Page; code: string }> {
  const page = await context.newPage();
  watchErrors(page, errors);
  await page.goto(url('#/', run));
  await tid(page, 'btn-host').click();
  await enterName(page, name);
  await expect(screen(page, 'lobby')).toBeVisible();
  return { page, code: await readCode(page) };
}

export async function joinByUrl(
  context: BrowserContext,
  code: string,
  name: string,
  errors: string[] = [],
  run: Run = {},
): Promise<Page> {
  const page = await context.newPage();
  watchErrors(page, errors);
  await page.goto(url(`#/j/${code}`, run));
  await enterName(page, name);
  await expect(screen(page, 'lobby')).toBeVisible();
  return page;
}

export async function joinByCode(
  context: BrowserContext,
  code: string,
  name: string,
  errors: string[] = [],
  run: Run = {},
): Promise<Page> {
  const page = await context.newPage();
  watchErrors(page, errors);
  await page.goto(url('#/', run));
  await tid(page, 'btn-join').click();
  await tid(page, 'input-code').fill(code);
  await tid(page, 'btn-join-go').click();
  await enterName(page, name);
  await expect(screen(page, 'lobby')).toBeVisible();
  return page;
}

const SHOTS = 'test-results/screens';

export async function audit(page: Page, name: string, shot: string = name): Promise<void> {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const r = await page.evaluate((n) => {
    const root = document.querySelector<HTMLElement>(`[data-screen=${n}]`);
    const small = [...document.querySelectorAll('button')]
      .filter((b) => {
        const box = b.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && getComputedStyle(b).visibility !== 'hidden';
      })
      .filter((b) => b.getBoundingClientRect().height < 55.5)
      .map((b) => b.dataset.testid ?? b.textContent ?? '?');
    return {
      screens: document.querySelectorAll('[data-screen]').length,
      found: root !== null,
      docOver: document.documentElement.scrollWidth - window.innerWidth,
      rootOver: root ? root.scrollWidth - root.clientWidth : 0,
      rootScroll: root && n === 'game' ? root.scrollHeight - root.clientHeight : 0,
      small,
    };
  }, name);
  expect(r, `Screen ${shot}`).toEqual({ screens: 1, found: true, docOver: 0, rootOver: 0, rootScroll: 0, small: [] });
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => Number(a.effect?.getTiming().duration) <= 1_000 && a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ).then(() => undefined),
  );
  await page.screenshot({ path: `${SHOTS}/${shot}.png` });
}
