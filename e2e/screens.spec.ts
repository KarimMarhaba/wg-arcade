import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { joinByUrl, openHost, readCode, screen, tid, url, watchErrors, type Run } from './helpers';

const SHOTS = 'test-results/screens';
const LONG_NAME = 'WWWWWWWWWWWW';
const LONG_NAME_2 = 'MMMMMMMMMMMM';

declare global {
  interface Window {
    confetti: { added: number[]; removed: number[]; pe: string[]; inPodium: boolean[] };
    feel: { ctx: number; wl: number; rel: number };
    anims: { name: string; pid: string | undefined }[];
  }
}

async function audit(page: Page, name: string, shot: string = name): Promise<void> {
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
      small,
    };
  }, name);
  expect(r, `Screen ${shot}`).toEqual({ screens: 1, found: true, docOver: 0, rootOver: 0, small: [] });
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

const WATCH_CONFETTI = (): void => {
  window.confetti = { added: [], removed: [], pe: [], inPodium: [] };
  let present = false;
  new MutationObserver(() => {
    const c = document.querySelector('canvas');
    if (c && !present) {
      present = true;
      window.confetti.added.push(performance.now());
      window.confetti.pe.push(getComputedStyle(c).pointerEvents);
      window.confetti.inPodium.push(c.closest('[data-screen=podium]') !== null);
    } else if (!c && present) {
      present = false;
      window.confetti.removed.push(performance.now());
    }
  }).observe(document, { subtree: true, childList: true });
};

const FAKE_FEEL = (): void => {
  window.feel = { ctx: 0, wl: 0, rel: 0 };
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
  Object.defineProperty(window, 'AudioContext', {
    configurable: true,
    value: class {
      state = 'running';
      currentTime = 0;
      destination = {};
      constructor() {
        window.feel.ctx++;
      }
      createOscillator() {
        return { type: 'square', frequency: param(), connect() {}, start() {}, stop() {} };
      }
      createGain() {
        return { gain: param(), connect() {} };
      }
      resume() {
        return Promise.resolve();
      }
    },
  });
  Object.defineProperty(navigator, 'wakeLock', {
    configurable: true,
    value: {
      request: async () => {
        window.feel.wl++;
        const s = {
          released: false,
          release: async () => {
            s.released = true;
            window.feel.rel++;
          },
          addEventListener() {},
          removeEventListener() {},
        };
        return s;
      },
    },
  });
};

async function startParty(host: Page, rounds: 3 | 5 | 8 = 3): Promise<void> {
  await tid(host, `rounds-${rounds}`).click();
  await tid(host, 'btn-start').click();
}

async function lobbyOf(
  context: BrowserContext,
  hostName: string,
  clientName: string,
  errors: string[],
  run: Run,
): Promise<{ host: Page; client: Page; code: string }> {
  const h = await openHost(context, hostName, errors, run);
  const client = await joinByUrl(context, h.code, clientName, errors, run);
  await expect(tid(h.page, 'player')).toHaveCount(2);
  return { host: h.page, client, code: h.code };
}

test('Rundgang ohne fast: jeder Meta-Screen im Format 390x844', async ({ context }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  const run: Run = { fast: false, only: 'hammer' };

  const host = await context.newPage();
  watchErrors(host, errors);
  await host.goto(url('#/', run));
  await audit(host, 'start');
  await expect(host.locator('h1')).toHaveText('WG·ARCADE');
  await tid(host, 'btn-join').click();
  await tid(host, 'input-code').fill('abcd');
  await expect(tid(host, 'btn-join-go')).toBeEnabled();
  await audit(host, 'start', 'start-join');

  await tid(host, 'btn-host').click();
  await tid(host, 'input-name').fill(LONG_NAME);
  await audit(host, 'name');
  await tid(host, 'btn-name-go').click();
  await expect(screen(host, 'lobby')).toBeVisible();
  const code = await readCode(host);

  const client = await context.newPage();
  watchErrors(client, errors);
  await client.goto(url(`#/j/${code}`, run));
  await tid(client, 'input-name').fill(LONG_NAME_2);
  await tid(client, 'btn-name-go').click();
  await expect(screen(client, 'lobby')).toBeVisible();
  await expect(tid(host, 'player')).toHaveCount(2);
  await expect(tid(client, 'player')).toHaveCount(2);

  await expect(host.getByText('Host-Handy anlassen')).toBeVisible();
  await expect(tid(host, 'qr')).toBeVisible();
  await expect(tid(client, 'btn-start')).toHaveCount(0);
  await expect(client.getByText('Warte auf')).toBeVisible();
  await audit(host, 'lobby', 'lobby-host');
  await audit(client, 'lobby', 'lobby-client');

  await startParty(host);
  await screen(host, 'intro').waitFor();
  await expect(tid(host, 'countdown')).toHaveAttribute('aria-live', 'assertive');
  await expect(screen(host, 'intro')).toContainText('HAMMER');
  await audit(host, 'intro');

  await screen(host, 'game').waitFor();
  await expect(screen(host, 'game')).toContainText('RUNDE 1/3 · HAMMER');
  await audit(host, 'game');

  const late = await context.newPage();
  watchErrors(late, errors);
  await late.goto(url(`#/j/${code}`, run));
  await tid(late, 'input-name').fill('Spät');
  await tid(late, 'btn-name-go').click();
  await expect(screen(late, 'rejected')).toBeVisible();
  await expect(tid(late, 'btn-home')).toBeVisible();
  await expect(tid(late, 'btn-rejoin')).toHaveCount(0);
  await audit(late, 'rejected');

  await screen(host, 'result').waitFor({ timeout: 30_000 });
  await expect(tid(host, 'result-row')).toHaveCount(2);
  await expect(tid(host, 'btn-next')).toBeVisible();
  await expect(tid(host, 'result-row').first().locator('xpath=..')).toHaveAttribute('aria-live', 'polite');
  await audit(host, 'result');
  await screen(client, 'result').waitFor({ timeout: 30_000 });
  await expect(tid(client, 'btn-next')).toHaveCount(0);
  await expect(tid(client, 'result-row')).toHaveCount(2);
  await audit(client, 'result', 'result-client');

  await host.close();
  await expect(screen(client, 'lost')).toBeVisible({ timeout: 45_000 });
  await expect(tid(client, 'btn-rejoin')).toBeVisible();
  await expect(tid(client, 'btn-home')).toBeVisible();
  await audit(client, 'lost');
  expect(errors).toEqual([]);
});

test('Podium mit fast: Konfetti erscheint und verschwindet, Host-Knöpfe nur beim Host', async ({ context }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  await context.addInitScript(WATCH_CONFETTI);
  const { host, client } = await lobbyOf(context, 'Karim', LONG_NAME, errors, {});

  await startParty(host);
  await screen(host, 'podium').waitFor({ timeout: 90_000 });
  await screen(client, 'podium').waitFor({ timeout: 30_000 });

  await host.waitForFunction(() => window.confetti.added.length > 0);
  await host.waitForFunction(() => window.confetti.removed.length > 0, null, { timeout: 5_000 });
  const c = await host.evaluate(() => window.confetti);
  expect(c.pe[0]).toBe('none');
  expect(c.inPodium[0]).toBe(true);
  const life = (c.removed[0] ?? 0) - (c.added[0] ?? 0);
  expect(life).toBeGreaterThanOrEqual(2_000);
  expect(life).toBeLessThanOrEqual(5_000);
  await expect(host.locator('canvas')).toHaveCount(0);

  await expect(tid(host, 'podium-row')).toHaveCount(2);
  await expect(tid(host, 'podium')).toHaveAttribute('aria-live', 'polite');
  await expect(tid(host, 'btn-again')).toBeVisible();
  await expect(tid(host, 'btn-new')).toBeVisible();
  await expect(tid(client, 'btn-again')).toHaveCount(0);
  await expect(tid(client, 'btn-new')).toHaveCount(0);
  await expect(client.getByText('Warte auf den Host')).toBeVisible();
  await audit(host, 'podium');
  await audit(client, 'podium', 'podium-client');
  expect(errors).toEqual([]);
});

test.describe('Reduced Motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('kein Konfetti-Canvas, Zeitbalken läuft weiter', async ({ context }) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    await context.addInitScript(WATCH_CONFETTI);
    const { page } = await openHost(context, 'Karim', errors);

    const bar = page.waitForFunction(() => {
      const fill = document.querySelector('[data-screen=result] .timer-fill');
      const root = document.querySelector('[data-screen=result]');
      return fill && root
        ? { bar: getComputedStyle(fill).transitionDuration, root: getComputedStyle(root).animationDuration }
        : null;
    });
    await startParty(page);
    const seen = (await (await bar).jsonValue()) as { bar: string; root: string };
    expect(parseFloat(seen.bar)).toBeGreaterThan(0.1);
    expect(parseFloat(seen.root)).toBeLessThan(0.001);

    await screen(page, 'podium').waitFor({ timeout: 90_000 });
    await page.waitForTimeout(3_500);
    expect(await page.evaluate(() => window.confetti.added.length)).toBe(0);
    await expect(page.locator('canvas')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

test('Feel: Mute bleibt nach Reload, Unlock bei der ersten Geste, Wake Lock nur in der Party', async ({ context }) => {
  const errors: string[] = [];
  await context.addInitScript(FAKE_FEEL);

  const start = await context.newPage();
  watchErrors(start, errors);
  await start.goto(url());
  expect(await start.evaluate(() => window.feel.ctx)).toBe(0);
  const mute = tid(start, 'btn-mute');
  const box = await mute.boundingBox();
  expect(box?.width).toBeCloseTo(56, 0);
  expect(box?.height).toBeCloseTo(56, 0);
  await expect(mute).toHaveAttribute('aria-pressed', 'false');
  await mute.click();
  expect(await start.evaluate(() => window.feel.ctx)).toBe(1);
  await expect(mute).toHaveAttribute('aria-pressed', 'true');
  await start.reload();
  await expect(tid(start, 'btn-mute')).toHaveAttribute('aria-pressed', 'true');
  await tid(start, 'btn-mute').click();
  await expect(tid(start, 'btn-mute')).toHaveAttribute('aria-pressed', 'false');

  const { host, client } = await lobbyOf(context, 'Karim', 'Anna', errors, {});
  for (const p of [host, client]) {
    await expect.poll(() => p.evaluate(() => window.feel.wl)).toBeGreaterThan(0);
    expect(await p.evaluate(() => window.feel.rel)).toBe(0);
    await p.evaluate(() => {
      location.hash = '#/';
    });
    await expect(screen(p, 'start')).toBeVisible();
    await expect.poll(() => p.evaluate(() => window.feel.rel)).toBeGreaterThan(0);
  }
  expect(errors).toEqual([]);
});

test('Lobby: Pop nur für neu hinzugekommene Spieler', async ({ context }) => {
  const errors: string[] = [];
  await context.addInitScript(() => {
    window.anims = [];
    document.addEventListener(
      'animationstart',
      (e) => {
        const t = e.target;
        window.anims.push({ name: e.animationName, pid: t instanceof Element ? t.closest<HTMLElement>('[data-pid]')?.dataset.pid : undefined });
      },
      true,
    );
  });
  const h = await openHost(context, 'Karim', errors);
  const pops = () => h.page.evaluate(() => window.anims.filter((a) => a.name === 'pop').map((a) => a.pid));
  expect(await pops()).toEqual([]);

  const a = await joinByUrl(context, h.code, 'Anna', errors);
  await expect(tid(h.page, 'player')).toHaveCount(2);
  const annaPid = await tid(a, 'player').nth(1).getAttribute('data-pid');
  await expect.poll(pops).toEqual([annaPid]);

  await joinByUrl(context, h.code, 'Ben', errors);
  await expect(tid(h.page, 'player')).toHaveCount(3);
  const benPid = await tid(h.page, 'player').nth(2).getAttribute('data-pid');
  await expect.poll(pops).toEqual([annaPid, benPid]);
  expect(errors).toEqual([]);
});
