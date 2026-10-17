import { expect, test } from '@playwright/test';
import { gameGone, playRound } from './bots';
import { ACCENT, CONTRACT, LABEL, type Id } from './contract';
import { cssColor, joinByCode, openHost, screen } from './helpers';
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

    await Promise.all([
      playRound(host.page, { guess: GUESS.host }),
      playRound(guest, { guess: GUESS.guest }),
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
