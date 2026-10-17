import { expect, test, type Page } from '@playwright/test';
import { gameGone, playRound } from './bots';
import { joinByCode, joinByQr, openHost, screen, tid } from './helpers';
import { rec as readRec, WATCH_GAMES, type Rec, type Row } from './watch';

const POINTS = [5, 3, 2, 1];
const GUESSES = [50, 5000, 200];
const ROUNDS = 5;
const NORMAL = ['blitz', 'farbfalle', 'hammer', 'schaetzfuchs'];
const SEED = 20261017;

async function playParty(pages: Page[], first: number): Promise<void> {
  await Promise.all(
    pages.map(async (page, k) => {
      for (let r = 0; r < ROUNDS; r++) {
        await playRound(page, { round: r + 1, guess: GUESSES[k] });
        await gameGone(page);
      }
    }),
  );
  for (const page of pages) await screen(page, 'podium').waitFor({ timeout: 30_000 });
  const recs = await Promise.all(pages.map(readRec));
  for (const rec of recs) expect(rec.results).toHaveLength(first + ROUNDS);
}

function checkRows(rows: Row[], prev: Map<string, number>, label: string): void {
  expect(rows, label).toHaveLength(3);
  expect(new Set(rows.map((x) => x.pid)).size, label).toBe(3);
  rows.forEach((row, i) => {
    const before = rows[i - 1];
    const placed = i === 0 ? row.place === 1 : row.place === before?.place || row.place === i + 1;
    expect(placed, `${label} Platz ${row.place} an Position ${i}`).toBe(true);
    expect(Number(row.points), `${label} Punkte`).toBe(POINTS[row.place - 1]);
    expect(row.total, `${label} Total`).toBe((prev.get(row.pid) ?? 0) + Number(row.points));
  });
}

function checkParty(recs: Rec[], first: number): Map<string, number> {
  const totals = new Map<string, number>();
  for (let r = 0; r < ROUNDS; r++) {
    const perPage = recs.map((rec) => rec.results[first + r] as Row[]);
    perPage.forEach((rows, k) => checkRows(rows, totals, `Seite ${k} Runde ${r + 1}`));
    for (const rows of perPage) expect(rows).toEqual(perPage[0]);
    for (const row of perPage[0] as Row[]) totals.set(row.pid, row.total);
  }
  const games = (recs[0] as Rec).rounds.slice(first, first + ROUNDS).map((x) => x.game);
  expect(games).toHaveLength(ROUNDS);
  games.forEach((g, i) => {
    expect(NORMAL, `Spiel ${g} in Runde ${i + 1}`).toContain(g);
    if (i > 0) expect(g, `Wiederholung in Runde ${i + 1}`).not.toBe(games[i - 1]);
  });
  recs.forEach((rec, k) => {
    const rows = rec.podiums.at(-1) ?? [];
    expect(rows, `Podium Seite ${k}`).toHaveLength(3);
    expect(new Set(rows.map((x) => x.pid)).size).toBe(3);
    for (const row of rows) {
      expect(row.total, `Podium Total Seite ${k}`).toBe(totals.get(row.pid));
      expect(row.place).toBe(1 + rows.filter((x) => x.total > row.total).length);
    }
  });
  return totals;
}

test('Komplettparty: QR-Beitritt, 5 Runden, Podium, Nochmal, Neue Party, sauber', async ({ context, baseURL }) => {
  test.setTimeout(150_000);
  const base = new URL(baseURL ?? '');
  const errors: string[] = [];
  const foreign: string[] = [];
  context.on('request', (req) => {
    const u = req.url();
    if (u.startsWith('data:') || u.startsWith('blob:')) return;
    if (new URL(u).origin !== base.origin) foreign.push(u);
  });
  await context.addInitScript(WATCH_GAMES);

  const host = await openHost(context, 'Karim', errors, { seed: SEED });
  const dataUrl = (await tid(host.page, 'qr').getAttribute('data-url')) ?? '';
  const qr = new URL(dataUrl);
  expect(qr.origin).toBe(base.origin);
  expect(qr.pathname).toBe(base.pathname);
  expect([...qr.searchParams.keys()].sort()).toEqual(['dev', 'fast', 'net']);
  expect(qr.hash).toBe(`#/j/${host.code}`);

  const a = await joinByQr(context, dataUrl, 'Anna', errors);
  const b = await joinByCode(context, host.code, 'Ben', errors);
  const pages = [host.page, a, b];
  for (const p of pages) await expect(tid(p, 'player')).toHaveCount(3);

  await tid(host.page, 'rounds-5').click();
  await expect(tid(host.page, 'rounds-5')).toHaveAttribute('aria-pressed', 'true');
  await tid(host.page, 'btn-start').click();
  await playParty(pages, 0);
  for (const p of pages) await expect(tid(p, 'podium-row')).toHaveCount(3);
  const first = checkParty(await Promise.all(pages.map(readRec)), 0);
  expect(first.size).toBe(3);

  await tid(host.page, 'btn-again').click();
  for (const p of pages)
    await p.waitForFunction(() => document.querySelector('[data-screen=intro] .frame-head > span')?.textContent === 'RUNDE 1/5');
  for (const rec of await Promise.all(pages.map(readRec))) expect(rec.intros.at(-1)?.head).toBe('RUNDE 1/5');

  await playParty(pages, ROUNDS);
  for (const p of pages) await expect(tid(p, 'podium-row')).toHaveCount(3);
  checkParty(await Promise.all(pages.map(readRec)), ROUNDS);

  await tid(host.page, 'btn-new').click();
  for (const p of pages) {
    await expect(screen(p, 'lobby')).toBeVisible();
    await expect(tid(p, 'player')).toHaveCount(3);
  }
  expect(await tid(host.page, 'room-code').textContent()).toBe(host.code);
  for (const p of [a, b]) expect(await p.evaluate(() => sessionStorage.getItem('wgarcade.joined'))).toBe(host.code);

  expect(foreign).toEqual([]);
  expect(errors).toEqual([]);
});
