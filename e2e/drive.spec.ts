import { expect, test, type Page } from '@playwright/test';
import { drive, type Tuple } from './bots';

const ROOT = (a: Tuple): string =>
  `<main data-screen="game" data-state="${a.state}"${a.step === undefined ? '' : ` data-step="${a.step}"`}${
    a.role === undefined ? '' : ` data-role="${a.role}"`
  }></main>`;

async function set(page: Page, t: Tuple | null): Promise<void> {
  await page.evaluate((html) => {
    document.body.innerHTML = html;
  }, t ? ROOT(t) : '');
}

test('drive: ein act je (state, step, role), Wiederkehr löst nicht erneut aus, Ende ohne Root', async ({ page }) => {
  await page.setContent(ROOT({ state: 'a', step: '1', role: 'narrator' }));
  const seen: Tuple[] = [];
  const done = drive(page, async (t) => {
    seen.push(t);
    const next: Record<string, Tuple | null> = {
      'a|1|narrator': { state: 'a', step: '2', role: 'narrator' },
      'a|2|narrator': { state: 'a', step: '2', role: 'listener' },
      'a|2|listener': { state: 'b' },
      'b||': { state: 'a', step: '1', role: 'narrator' },
    };
    const n = next[`${t.state}|${t.step ?? ''}|${t.role ?? ''}`];
    if (n === undefined) throw new Error('unerwartet');
    await set(page, n);
    if (t.state === 'b') {
      await page.waitForTimeout(150);
      await set(page, null);
    }
  });
  await done;
  expect(seen).toEqual([
    { state: 'a', step: '1', role: 'narrator' },
    { state: 'a', step: '2', role: 'narrator' },
    { state: 'a', step: '2', role: 'listener' },
    { state: 'b' },
  ]);
});

test('drive: kehrt sofort zurück, wenn kein Game-Root da ist', async ({ page }) => {
  await page.setContent('<main data-screen="lobby"></main>');
  let calls = 0;
  await drive(page, async () => {
    calls++;
  });
  expect(calls).toBe(0);
});

test('drive: ein Fehler in act nach dem Entfernen des Roots wird geschluckt', async ({ page }) => {
  await page.setContent(ROOT({ state: 'x' }));
  let calls = 0;
  await drive(page, async () => {
    calls++;
    await set(page, null);
    throw new Error('Execution context was destroyed');
  });
  expect(calls).toBe(1);
});

test('drive: ein Fehler in act bei vorhandenem Root wird weitergeworfen', async ({ page }) => {
  await page.setContent(ROOT({ state: 'x' }));
  await expect(
    drive(page, async () => {
      throw new Error('kaputt');
    }),
  ).rejects.toThrow('kaputt');
});
