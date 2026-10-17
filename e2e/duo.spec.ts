import { expect, test, type Page } from '@playwright/test';
import { gameGone, playRound } from './bots';
import { ACCENT, CONTRACT, LABEL, type Id } from './contract';
import { audit, cssColor, joinByCode, openHost, screen, tid } from './helpers';
import { rec as readRec, WATCH_GAMES, type Rec } from './watch';

const SEED = 20261017;
const GUESS = { host: 50, guest: 5000 };
const IDS = Object.keys(LABEL) as Id[];

const relErr = (guess: number, answer: number): number => Math.abs(guess - answer) / answer;

for (const id of IDS)
  test(`${id}: Duo mit Host und einem Gast, eine Runde`, async ({ context }) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    await context.addInitScript(WATCH_GAMES);
    const run = { only: id, rounds: 1, seed: SEED };
    const host = await openHost(context, 'Karim', errors, run);
    const guest = await joinByCode(context, host.code, 'Anna', errors, run);
    const pages = [host.page, guest];
    await host.page.getByTestId('btn-start').click();

    const [hostPlayed, guestPlayed] = await Promise.all([
      playRound(host.page, { guess: GUESS.host, bias: 0 }),
      playRound(guest, { guess: GUESS.guest, bias: 1 }),
    ]);
    await Promise.all(pages.map(async (p) => (await gameGone(p), await screen(p, 'podium').waitFor({ timeout: 30_000 }))));
    const [h, g] = (await Promise.all(pages.map(readRec))) as [Rec, Rec];

    for (const [who, r] of [['Host', h], ['Gast', g]] as const) {
      const rows = r.results[0] ?? [];
      expect(r.results, who).toHaveLength(1);
      expect(rows, who).toHaveLength(2);
      expect(new Set(rows.map((x) => x.pid)).size, who).toBe(2);
      const pts = rows.map((x) => Number(x.points));
      expect(pts, who).toEqual(pts[0] === pts[1] ? [5, 5] : [5, 3]);
      for (const row of rows) {
        expect(row.total, who).toBe(Number(row.points));
        expect(row.label, who).toMatch(LABEL[id]);
      }
      expect(r.podiums[0], who).toHaveLength(2);

      const states = new Set(r.rounds.flatMap((x) => x.states));
      const need = id === 'blitz' ? CONTRACT.blitz.filter((s) => s !== 'early') : CONTRACT[id];
      for (const s of need) expect(states.has(s), `${who} Zustand ${s}`).toBe(true);
    }
    expect(g.results[0]).toEqual(h.results[0]);

    for (const [p, r] of [[host.page, h], [guest, g]] as const) {
      const tint = r.rounds[0]?.tint;
      expect(tint?.tint).toBe(ACCENT[id]);
      expect(tint?.fill).toBe(await cssColor(p, `--${ACCENT[id]}`));
    }

    if (id === 'gleichklang') expect(h.results[0]?.[0]?.label, 'beide gleich').toBe(h.results[0]?.[1]?.label);

    if (id === 'werwuerde') {
      const rows = h.results[0] ?? [];
      expect(rows.find((x) => x.name === 'Karim')?.points).toBe('5');
      expect(rows.find((x) => x.name === 'Anna')?.points).toBe('3');
    }

    if (id === 'luegenbaron') {
      for (const row of h.results[0] ?? []) expect(row.label, 'beide lügen, beide tippen WAHR').toBe('1 Pkt');
      expect((h.results[0] ?? []).map((x) => x.points)).toEqual(['5', '5']);
    }

    if (id === 'verraeter') {
      expect(typeof hostPlayed.same).toBe('boolean');
      expect(guestPlayed.same).toBe(hostPlayed.same);
      const win = hostPlayed.same ? 'Karim' : 'Anna';
      const rows = h.results[0] ?? [];
      expect(rows.find((x) => x.name === win)?.points).toBe('5');
      expect(rows.find((x) => x.name === win)?.label).toBe('2 Pkt');
      expect(rows.find((x) => x.name !== win)?.points).toBe('3');
      expect(rows.find((x) => x.name !== win)?.label).toBe('0 Pkt');
    }

    if (id === 'schaetzfuchs') {
      const answer = Number(h.rounds[0]?.answer);
      const hostErr = relErr(GUESS.host, answer);
      const guestErr = relErr(GUESS.guest, answer);
      expect(hostErr).not.toBe(guestErr);
      const best = (hostErr < guestErr ? 'Karim' : 'Anna');
      const rows = h.results[0] ?? [];
      expect(rows.find((x) => x.name === best)?.points).toBe('5');
      expect(rows.find((x) => x.name !== best)?.points).toBe('3');
    }
    expect(errors).toEqual([]);
  });

const LOOK = {
  gleichklang: { asking: 'ask', pick: 'choice', pad: '.choice-pad' },
  werwuerde: { asking: 'vote', pick: 'pick', pad: '.name-picker' },
} as const;

const clipped = (page: Page): Promise<number> =>
  page.evaluate(
    () => [...document.querySelectorAll('.choice-text, .pick-name')].filter((e) => e.scrollWidth > e.clientWidth).length,
  );

const tapFirst = (page: Page, id: string): Promise<{ chosen: string[]; others: string[] }> =>
  page.evaluate((t) => {
    const find = () => [...document.querySelectorAll<HTMLElement>(`[data-testid=${t}]`)];
    find()[0]?.click();
    const all = find();
    const img = (b: HTMLElement) => getComputedStyle(b).backgroundImage;
    return {
      chosen: all.filter((b) => b.getAttribute('aria-pressed') === 'true').map(img),
      others: all.filter((b) => b.getAttribute('aria-pressed') !== 'true').map(img),
    };
  }, id);

test.describe('Layout ohne fast, zwei Seiten', () => {
  for (const id of ['gleichklang', 'werwuerde'] as const)
    test(`${id}: Frage und Auflösung bestehen audit auf beiden Seiten`, async ({ context }) => {
      test.setTimeout(90_000);
      const errors: string[] = [];
      const look = LOOK[id];
      const run = { only: id, rounds: 1, seed: SEED, fast: false };
      const host = await openHost(context, 'Karim', errors, run);
      const guest = await joinByCode(context, host.code, 'Anna', errors, run);
      const pages = [host.page, guest];
      await host.page.getByTestId('btn-start').click();

      for (const p of pages) {
        await screen(p, 'game').waitFor({ timeout: 15_000 });
        await expect(screen(p, 'game')).toHaveAttribute('data-state', look.asking);
        await expect(tid(p, look.pick).first()).toBeVisible();
      }
      for (const [k, p] of pages.entries()) await audit(p, 'game', `duo-${id}-${look.asking}-${k}`);
      for (const p of pages) expect(await clipped(p), 'abgeschnittener Text').toBe(0);
      if (id === 'gleichklang') for (const p of pages) await expect(p.locator(look.pad)).toHaveAttribute('data-cols', '1');

      for (const p of pages) {
        const f = await tapFirst(p, look.pick);
        expect(f.chosen, 'gewählter Knopf ohne Streifen').toEqual(['none']);
        expect(f.others.length).toBeGreaterThan(0);
        for (const o of f.others) expect(o, 'andere Knöpfe mit Streifen').toContain('repeating-linear-gradient');
      }

      for (const p of pages) await expect(screen(p, 'game')).toHaveAttribute('data-state', 'reveal');
      await Promise.all(pages.map((p, k) => audit(p, 'game', `duo-${id}-reveal-${k}`)));
      expect(errors).toEqual([]);
    });

  test('bombe: Pumpphase und Zustand nach dem Kassieren des Gasts bestehen audit, die Leiste verrät keine Zahl', async ({ context }) => {
    test.setTimeout(90_000);
    const errors: string[] = [];
    const run = { only: 'bombe', rounds: 1, seed: SEED, fast: false };
    const host = await openHost(context, 'Karim', errors, run);
    const guest = await joinByCode(context, host.code, 'Anna', errors, run);
    const pages = [host.page, guest];
    await host.page.getByTestId('btn-start').click();

    for (const p of pages) {
      await screen(p, 'game').waitFor({ timeout: 15_000 });
      await expect(screen(p, 'game')).toHaveAttribute('data-state', 'pump');
      await expect(tid(p, 'btn-pump')).toBeVisible();
      await expect(tid(p, 'btn-cash')).toBeVisible();
      await expect(tid(p, 'balloon')).toBeVisible();
      await expect(tid(p, 'bombe-live')).toBeVisible();
    }
    await Promise.all(pages.map((p, k) => audit(p, 'game', `duo-bombe-pump-${k}`)));

    await tid(guest, 'btn-pump').click();
    await tid(guest, 'btn-cash').click();
    await expect(host.page.locator('[data-testid=bombe-live] [data-s=kassiert]')).toHaveCount(1);
    await expect(tid(host.page, 'bombe-live')).not.toHaveText(/\d/);
    await expect(tid(guest, 'bombe-live')).not.toHaveText(/\d/);
    await Promise.all(pages.map((p, k) => audit(p, 'game', `duo-bombe-cashed-${k}`)));
    expect(errors).toEqual([]);
  });

  test('stopp: blind, abgegeben und Auflösung bestehen audit, Uhr und Balken sind in der Blendung unsichtbar', async ({ context }) => {
    test.setTimeout(90_000);
    const errors: string[] = [];
    const run = { only: 'stopp', rounds: 1, seed: SEED, fast: false };
    const host = await openHost(context, 'Karim', errors, run);
    const guest = await joinByCode(context, host.code, 'Anna', errors, run);
    const pages = [host.page, guest];
    await host.page.getByTestId('btn-start').click();

    await Promise.all(
      pages.map(async (p) => {
        await screen(p, 'game').waitFor({ timeout: 15_000 });
        await expect(screen(p, 'game')).toHaveAttribute('data-state', 'ready');
      }),
    );
    for (const p of pages) await expect(screen(p, 'game')).toHaveAttribute('data-state', 'blind', { timeout: 15_000 });
    for (const p of pages) {
      await expect(tid(p, 'btn-stop')).toBeVisible();
      await expect(tid(p, 'stopp-clock')).toBeHidden();
      await expect(p.locator('.game-bar')).toHaveCSS('visibility', 'hidden');
      await expect(p.locator('.timer-fill')).toBeHidden();
    }
    await Promise.all(pages.map((p, k) => audit(p, 'game', `duo-stopp-blind-${k}`)));

    await tid(host.page, 'btn-stop').click();
    await expect(screen(host.page, 'game')).toHaveAttribute('data-state', 'sent');
    await expect(tid(host.page, 'btn-stop')).toBeHidden();
    await audit(host.page, 'game', 'duo-stopp-sent-0');

    await tid(guest, 'btn-stop').click();
    for (const p of pages) {
      await expect(screen(p, 'game')).toHaveAttribute('data-state', 'reveal');
      await expect(tid(p, 'stopp-scale')).toBeVisible();
      await expect(tid(p, 'stopp-duo')).toBeVisible();
      await expect(p.locator('.game-bar')).toHaveCSS('visibility', 'visible');
    }
    await Promise.all(pages.map((p, k) => audit(p, 'game', `duo-stopp-reveal-${k}`)));
    expect(errors).toEqual([]);
  });
  test('luegenbaron: Karte, Tausch, Wahl, Tippphase vor und nach dem Tippen und Auflösung bestehen audit', async ({ context }) => {
    test.setTimeout(90_000);
    const errors: string[] = [];
    const run = { only: 'luegenbaron', rounds: 1, seed: SEED, fast: false };
    const host = await openHost(context, 'Karim', errors, run);
    const guest = await joinByCode(context, host.code, 'Anna', errors, run);
    const pages = [host.page, guest];
    await host.page.getByTestId('btn-start').click();

    for (const p of pages) {
      await screen(p, 'game').waitFor({ timeout: 15_000 });
      await expect(screen(p, 'game')).toHaveAttribute('data-state', 'card');
    }
    const roles = await Promise.all(pages.map((p) => screen(p, 'game').getAttribute('data-role')));
    expect([...roles].sort()).toEqual(['listener', 'narrator']);
    const nar = pages[roles.indexOf('narrator')] as Page;
    const lis = pages[roles.indexOf('listener')] as Page;

    await expect(tid(nar, 'btn-swap')).toBeVisible();
    await expect(tid(nar, 'btn-truth')).toBeVisible();
    await expect(tid(nar, 'btn-lie')).toBeVisible();
    await expect(tid(lis, 'btn-lie')).toHaveCount(0);
    await expect(tid(lis, 'lb-topic')).toBeVisible();
    await Promise.all(pages.map((p, k) => audit(p, 'game', `duo-luegenbaron-card-${k}`)));

    const before = await tid(nar, 'lb-topic').textContent();
    await tid(nar, 'btn-swap').click();
    await expect(tid(nar, 'btn-swap')).toHaveCount(0);
    await expect(tid(nar, 'lb-topic')).not.toHaveText(before ?? '');
    await expect(tid(lis, 'lb-topic')).toHaveText((await tid(nar, 'lb-topic').textContent()) ?? '');
    await audit(nar, 'game', 'duo-luegenbaron-swapped');

    await tid(nar, 'btn-lie').click();
    await expect(tid(nar, 'btn-lie')).toHaveAttribute('aria-pressed', 'true');
    await expect(tid(nar, 'btn-truth')).toBeDisabled();
    await audit(nar, 'game', 'duo-luegenbaron-chosen');

    for (const p of pages) await expect(screen(p, 'game')).toHaveAttribute('data-state', 'tell', { timeout: 15_000 });
    await expect(tid(nar, 'btn-done')).toBeVisible();
    await expect(tid(lis, 'btn-done')).toHaveCount(0);
    await tid(nar, 'btn-done').click();
    for (const p of pages) await expect(screen(p, 'game')).toHaveAttribute('data-state', 'vote');
    await expect(tid(lis, 'choice').first()).toBeVisible();
    await Promise.all(pages.map((p, k) => audit(p, 'game', `duo-luegenbaron-vote-${k}`)));

    await tid(lis, 'choice').first().click();
    await expect(screen(lis, 'game')).toHaveAttribute('data-state', 'sent');
    await audit(lis, 'game', 'duo-luegenbaron-sent');

    for (const p of pages) await expect(screen(p, 'game')).toHaveAttribute('data-state', 'reveal');
    await expect(tid(nar, 'lb-truth')).toHaveAttribute('data-truth', 'false');
    await Promise.all(pages.map((p, k) => audit(p, 'game', `duo-luegenbaron-reveal-${k}`)));
    expect(errors).toEqual([]);
  });

  test('verraeter: Wort, Zug, Tipp-Phase vor und nach dem Tippen und Auflösung bestehen audit', async ({ context }) => {
    test.setTimeout(90_000);
    const errors: string[] = [];
    const run = { only: 'verraeter', rounds: 1, seed: SEED, fast: false };
    const host = await openHost(context, 'Karim', errors, run);
    const guest = await joinByCode(context, host.code, 'Anna', errors, run);
    const pages = [host.page, guest];
    await host.page.getByTestId('btn-start').click();

    for (const p of pages) {
      await screen(p, 'game').waitFor({ timeout: 15_000 });
      await expect(screen(p, 'game')).toHaveAttribute('data-state', 'word');
      await expect(tid(p, 'vr-word')).toBeVisible();
    }
    await Promise.all(pages.map((p, k) => audit(p, 'game', `duo-verraeter-word-${k}`)));

    for (const p of pages) await expect(screen(p, 'game')).toHaveAttribute('data-state', 'round', { timeout: 15_000 });
    const active = async (): Promise<Page> => {
      for (;;) {
        for (const p of pages) if ((await tid(p, 'btn-done').count()) > 0) return p;
        await pages[0]?.waitForTimeout(50);
      }
    };
    const first = await active();
    await expect(tid(first, 'btn-done')).toBeVisible();
    await Promise.all(pages.map((p, k) => audit(p, 'game', `duo-verraeter-turn-${k}`)));

    for (let turn = 0; turn < 4; turn++) {
      const who = await active();
      await tid(who, 'btn-done').click({ timeout: 2000 }).catch(() => undefined);
      await expect(screen(who, 'game')).not.toHaveAttribute('data-step', String(turn), { timeout: 10_000 });
    }
    for (const p of pages) await expect(screen(p, 'game')).toHaveAttribute('data-state', 'vote');
    for (const p of pages) {
      await expect(tid(p, 'btn-same')).toBeVisible();
      await expect(tid(p, 'btn-diff')).toBeVisible();
    }
    await Promise.all(pages.map((p, k) => audit(p, 'game', `duo-verraeter-vote-${k}`)));

    await tid(host.page, 'btn-same').click();
    await expect(screen(host.page, 'game')).toHaveAttribute('data-state', 'sent');
    await audit(host.page, 'game', 'duo-verraeter-sent');
    await tid(guest, 'btn-diff').click();

    for (const p of pages) await expect(screen(p, 'game')).toHaveAttribute('data-state', 'reveal');
    await expect(tid(host.page, 'vr-reveal')).toHaveAttribute('data-same', /^(true|false)$/);
    await Promise.all(pages.map((p, k) => audit(p, 'game', `duo-verraeter-reveal-${k}`)));
    expect(errors).toEqual([]);
  });
});

test('verraeter: drei Spieler, Rollen vor dem Start gelesen, die Crew stimmt gegen den Verräter', async ({ context }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  await context.addInitScript(WATCH_GAMES);
  const run = { only: 'verraeter', rounds: 1, seed: SEED };
  const host = await openHost(context, 'Karim', errors, run);
  const a = await joinByCode(context, host.code, 'Anna', errors, run);
  const b = await joinByCode(context, host.code, 'Ben', errors, run);
  const pages = [host.page, a, b];
  const names = ['Karim', 'Anna', 'Ben'];
  await tid(host.page, 'btn-start').click();

  const seen = await Promise.all(
    pages.map(async (p) => {
      await screen(p, 'game').waitFor({ timeout: 15_000 });
      await p.waitForFunction(() => document.querySelector('[data-screen=game]')?.hasAttribute('data-role'));
      return p.evaluate(() => ({
        role: document.querySelector('[data-screen=game]')?.getAttribute('data-role') ?? '',
        word: document.querySelector('[data-testid=vr-word]')?.textContent ?? null,
      }));
    }),
  );
  const roles = seen.map((x) => x.role);
  expect(roles.filter((r) => r === 'traitor')).toHaveLength(1);
  expect(roles.filter((r) => r === 'crew')).toHaveLength(2);
  const traitor = roles.indexOf('traitor');
  const crew = seen.filter((_, k) => k !== traitor);
  expect(crew[0]?.word).toBeTruthy();
  expect(crew[0]?.word).toBe(crew[1]?.word);
  expect(seen[traitor]?.word).toBeNull();

  const played = await Promise.all(pages.map((p) => playRound(p, { accuse: names[traitor] })));
  await Promise.all(pages.map(async (p) => (await gameGone(p), await screen(p, 'podium').waitFor({ timeout: 30_000 }))));
  const recs = (await Promise.all(pages.map(readRec))) as Rec[];

  const right = played[traitor]?.right;
  expect(typeof right).toBe('boolean');
  for (const [k, r] of recs.entries()) {
    const states = new Set(r.rounds.flatMap((x) => x.states));
    for (const s of [...CONTRACT.verraeter, 'talk', 'guess']) expect(states.has(s), `Seite ${k} Zustand ${s}`).toBe(true);
    const rows = r.results[0] ?? [];
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      const who = names.indexOf(row.name);
      expect(row.label, row.name).toBe(who === traitor ? (right ? '2 Pkt' : '0 Pkt') : '2 Pkt');
    }
  }
  expect(recs[1]?.results[0]).toEqual(recs[0]?.results[0]);
  expect(errors).toEqual([]);
});
