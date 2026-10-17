import { clampInt, isRecord } from '../games/common';

export const DRINK_CAP = 3;

export interface Drink {
  take: number;
  give: number;
}

export interface DrinkPlan {
  rows: Record<string, Drink>;
  cheers: boolean;
}

export type RawDrinks = DrinkPlan | Record<string, Drink>;

const empty = (cheers = false): DrinkPlan => ({ rows: {}, cheers });

export function placeDrinks(places: Readonly<Record<string, number>>, online: ReadonlySet<string>): DrinkPlan {
  const here = Object.entries(places).filter(([pid]) => online.has(pid));
  const n = here.length;
  if (n <= 1) return empty();
  const values = here.map(([, place]) => place);
  const last = Math.max(...values);
  if (values.every((v) => v === last)) return empty(true);
  const next = Math.max(...values.filter((v) => v < last && v > 1), 0);
  const rows: Record<string, Drink> = {};
  for (const [pid, place] of here) {
    const take = place === last ? (n === 2 ? 1 : 2) : n >= 5 && next > 0 && place === next ? 1 : 0;
    const give = place === 1 && n >= 3 ? (n >= 5 ? 2 : 1) : 0;
    if (take > 0 || give > 0) rows[pid] = { take, give };
  }
  return { rows, cheers: false };
}

const isPlan = (x: RawDrinks): x is DrinkPlan => isRecord(x.rows) && typeof x.cheers === 'boolean';

export function capDrinks(raw: RawDrinks, online: ReadonlySet<string>): DrinkPlan {
  const plan = isPlan(raw) ? raw : { rows: raw, cheers: false };
  const rows: Record<string, Drink> = {};
  for (const [pid, d] of Object.entries(plan.rows)) {
    if (!online.has(pid) || !isRecord(d)) continue;
    const take = clampInt(d.take as number, 0, DRINK_CAP);
    const give = clampInt(d.give as number, 0, DRINK_CAP);
    if (take > 0 || give > 0) rows[pid] = { take, give };
  }
  return { rows, cheers: plan.cheers && Object.values(rows).every((d) => d.take === 0) };
}
