import { describe, expect, it } from 'vitest';
import { GRACE, TICK } from '../engine/durations';
import { DRINK_CAP, type DrinkPlan, type RawDrinks } from '../engine/drinks';
import { isRecord } from './common';
import { blitz } from './blitz/logic';
import { bombe } from './bombe/logic';
import { farbfalle } from './farbfalle/logic';
import { gleichklang } from './gleichklang/logic';
import { hammer } from './hammer/logic';
import { luegenbaron, type LbState } from './luegenbaron/logic';
import { schaetzfuchs } from './schaetzfuchs/logic';
import { stopp } from './stopp/logic';
import { verraeter, type VrState } from './verraeter/logic';
import { werwuerde } from './werwuerde/logic';
import type { GameDef } from './types';

interface Case {
  def: GameDef<any, any, any>;
  first(s: any, pid: string): unknown;
  finish(s: any, pid: string): unknown[];
  prep?(s: any, now: number): { s: any; now: number };
}

const blitzInputs = [0, 1, 2].map((i) => ({ i, ms: 300 + i }));

function fastForward<S extends { phase: string }>(
  def: GameDef<S, any, any>,
  s: S,
  now: number,
  found: (q: S) => boolean,
): { s: S; now: number } {
  const online = new Set((s as unknown as { pids: string[] }).pids);
  let q = s;
  let t = now;
  while (!def.done(q, t) && t < now + 130_000) {
    t += TICK;
    q = def.tick(q, t, online);
    if (found(q)) return { s: q, now: t };
  }
  return { s, now };
}

const lbCase: Case = {
  def: luegenbaron,
  first: (s: LbState) => ({ a: 'tip', k: s.k, truth: true }),
  finish: (s: LbState) => [{ a: 'tip', k: s.k, truth: true }],
  prep: (s: LbState, now) =>
    fastForward(luegenbaron, s, now, (q) => q.phase === 'vote' && !['p0', 'p1'].includes(q.narrators[q.k] as string)),
};

const vote = (pid: string) => ({ a: 'vote', to: pid === 'p0' ? 'p1' : 'p0' });
const vrCase: Case = {
  def: verraeter,
  first: (s: VrState, pid) => (s.mode === 'duo' ? { a: 'tip', same: true } : vote(pid)),
  finish: (s: VrState, pid) => [s.mode === 'duo' ? { a: 'tip', same: true } : vote(pid)],
  prep: (s: VrState, now) => fastForward(verraeter, s, now, (q) => q.phase === 'vote'),
};

const CASES: Case[] = [
  { def: blitz, first: () => blitzInputs[0], finish: () => blitzInputs },
  { def: hammer, first: () => ({ n: 12, final: true }), finish: () => [{ n: 12, final: true }] },
  { def: farbfalle, first: () => ({ i: 0, c: 1 }), finish: () => [{ i: 0, c: 1 }, { done: true }] },
  { def: schaetzfuchs, first: () => ({ guess: 123456 }), finish: () => [{ guess: 123456 }] },
  { def: gleichklang, first: () => ({ k: 0, i: 0, ms: 300 }), finish: () => [{ k: 0, i: 0, ms: 300 }] },
  { def: werwuerde, first: () => ({ k: 0, to: 'p0' }), finish: () => [{ k: 0, to: 'p0' }] },
  {
    def: bombe,
    first: () => ({ b: 0, n: 2, cash: false }),
    finish: () => [0, 1, 2].map((b) => ({ b, n: 2, cash: true })),
  },
  { def: stopp, first: () => ({ k: 0, devMs: 300 }), finish: () => [{ k: 0, devMs: 300 }] },
  lbCase,
  vrCase,
];

const GARBAGE: unknown[] = [
  null,
  undefined,
  0,
  1,
  'x',
  '',
  true,
  [],
  [1, 2],
  {},
  { x: 1 },
  { n: null },
  Number.NaN,
  Infinity,
  { guess: 'abc' },
  { __proto__: null },
  Object.create(null),
];

const players = (n: number) => Array.from({ length: n }, (_, i) => ({ pid: `p${i}`, name: `P${i}`, color: i }));
const pidsOf = (n: number) => players(n).map((p) => p.pid);
const NOW = 10_000;
const SPEEDS = [1, 10];
const NS = [1, 2, 3, 8];
const maxMs = (speed: number) => 120_000 / speed + GRACE;

const parsed = (def: Case['def'], raw: unknown) => {
  const i = def.parseInput(raw);
  if (i === null) throw new Error(`${def.id}: Eingabe abgelehnt`);
  return i;
};
const begin = (c: Case, n: number, speed: number): { s: any; now: number } => {
  const s = c.def.init(players(n), 77, NOW, { speed, drinking: false });
  return c.prep ? c.prep(s, NOW) : { s, now: NOW };
};
const feed = (c: Case, s: unknown, pid: string, now = NOW) =>
  c.finish(s, pid).reduce((q, raw) => c.def.input(q, pid, parsed(c.def, raw), now), s);

function runToEnd(def: Case['def'], s0: unknown, t0: number, online: ReadonlySet<string>, limit: number) {
  let s = s0;
  let t = t0;
  while (!def.done(s, t) && t < limit) {
    t += TICK;
    s = def.tick(s, t, online);
  }
  return { s, t, done: def.done(s, t) };
}

const isPlan = (x: RawDrinks): x is DrinkPlan => isRecord(x.rows) && typeof x.cheers === 'boolean';

function badDrinks(raw: RawDrinks, known: readonly string[]): string[] {
  const rows = isPlan(raw) ? raw.rows : raw;
  const bad: string[] = [];
  for (const [pid, d] of Object.entries(rows as Record<string, { take: unknown; give: unknown }>)) {
    if (!known.includes(pid)) bad.push(`unbekannte pid ${pid}`);
    for (const k of ['take', 'give'] as const) {
      const v = d[k];
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) bad.push(`${pid}.${k} = ${String(v)}`);
    }
  }
  return bad;
}

for (const c of CASES)
  for (const speed of SPEEDS)
    describe(`${c.def.id} (speed ${speed}) erfuellt den GameDef-Vertrag`, () => {
      const init = (n = 3) => begin(c, n, speed);

      it('parseInput wirft nie und lehnt Muell ab', () => {
        for (const g of GARBAGE) {
          expect(() => c.def.parseInput(g)).not.toThrow();
          expect(c.def.parseInput(g)).toBeNull();
        }
        const { s } = init();
        for (const raw of c.finish(s, 'p0')) expect(c.def.parseInput(raw)).not.toBeNull();
      });

      it('init wirft fuer 1 bis 8 Spieler nicht', () => {
        for (let n = 1; n <= 8; n++) expect(() => begin(c, n, speed), `n=${n}`).not.toThrow();
      });

      it('ignorierte Eingaben und No-op-tick liefern dieselbe Referenz', () => {
        const { s: s0, now } = init();
        const online = new Set(pidsOf(3));
        const first = parsed(c.def, c.first(s0, 'p0'));
        expect(c.def.input(s0, 'zz', first, now)).toBe(s0);
        expect(c.def.tick(s0, now + 1, online)).toBe(s0);
        const s1 = c.def.input(s0, 'p0', first, now);
        expect(s1).not.toBe(s0);
        expect(c.def.input(s1, 'p0', first, now)).toBe(s1);
        expect(c.def.tick(s1, now + 1, online)).toBe(s1);
      });

      it('input und tick veraendern den Eingangs-State nicht', () => {
        const { s: s0, now } = init();
        const before = structuredClone(s0);
        const s1 = c.def.input(s0, 'p0', parsed(c.def, c.first(s0, 'p0')), now);
        expect(s0).toEqual(before);
        const done = feed(c, feed(c, s0, 'p0', now), 'p1', now);
        const clone = structuredClone(done);
        const ticked = c.def.tick(done, now + 1, new Set(['p0', 'p1']));
        expect(done).toEqual(clone);
        expect(ticked).not.toBe(done);
        expect(c.def.done(s1, now + 1)).toBe(false);
      });

      it('view ist bei gleichem State und anderem now JSON-gleich', () => {
        const { s: s0, now } = init();
        const s = feed(c, s0, 'p0', now);
        for (const pid of ['p0', 'p1', 'zz'])
          expect(JSON.stringify(c.def.view(s, pid, now))).toBe(JSON.stringify(c.def.view(s, pid, now + 777)));
      });

      it('view und label werfen nicht fuer eine unbekannte pid', () => {
        const { s, now } = init();
        expect(() => c.def.view(s, 'zz', now)).not.toThrow();
        expect(c.def.label(s, 'zz')).toBe('–');
      });

      it('die erste Eingabe allein erzeugt einen result-Eintrag (D-P2-5)', () => {
        const { s: s0, now } = init();
        const s = c.def.input(s0, 'p0', parsed(c.def, c.first(s0, 'p0')), now);
        expect(c.def.result(s).has('p0')).toBe(true);
        expect(c.def.result(s).has('p1')).toBe(false);
        expect(c.def.label(s, 'p0')).not.toBe('–');
      });

      it('Spieler ohne Eingabe: kein result-Eintrag, Label "–"', () => {
        const { s: s0, now } = init();
        const s = feed(c, s0, 'p0', now);
        expect(c.def.result(s).has('p0')).toBe(true);
        expect(c.def.result(s).has('p1')).toBe(false);
        expect(c.def.label(s, 'p1')).toBe('–');
        expect(c.def.result(s0).size).toBe(0);
      });

      it('Sicht mit 8 Teilnehmern bleibt unter 6000 Zeichen, vor und nach der Aufloesung', () => {
        const { s: s0, now } = init(8);
        let s = s0;
        for (const p of players(8)) s = feed(c, s, p.pid, now);
        const all = new Set(pidsOf(8));
        const sizes = (q: unknown) => pidsOf(8).map((pid) => JSON.stringify(c.def.view(q, pid, now)).length);
        expect(Math.max(...sizes(s))).toBeLessThan(6000);
        const end = runToEnd(c.def, s, now, all, now + maxMs(speed));
        expect(end.done).toBe(true);
        expect(Math.max(...sizes(end.s))).toBeLessThan(6000);
      });

      for (const n of NS)
        it(`ohne jede Eingabe endet das Spiel mit ${n} Spieler(n) spaetestens nach maxMs`, () => {
          const { s, now } = begin(c, n, speed);
          const end = runToEnd(c.def, s, now, new Set(pidsOf(n)), NOW + maxMs(speed));
          expect(end.done, `n=${n} nicht fertig bis ${maxMs(speed)} ms`).toBe(true);
          expect(end.t).toBeLessThanOrEqual(NOW + maxMs(speed));
          expect(c.def.result(end.s).size).toBe(0);
        });

      it('drinks (falls vorhanden) liefert nur bekannte pids und ganzzahlige Werte >= 0', () => {
        if (!c.def.drinks) return;
        const { s, now } = begin(c, 4, speed);
        const end = runToEnd(c.def, feed(c, s, 'p0', now), now, new Set(pidsOf(4)), NOW + maxMs(speed));
        expect(badDrinks(c.def.drinks(end.s), pidsOf(4))).toEqual([]);
      });
    });

describe('Rollenspiele: prep spult bis in eine Tipp- bzw. Abstimmungsphase, in der p0 und p1 eingeben duerfen', () => {
  for (const c of [lbCase, vrCase])
    for (const speed of SPEEDS)
      it(`${c.def.id} findet die Phase fuer 3 Spieler (speed ${speed})`, () => {
        const { s } = begin(c, 3, speed);
        expect(s.phase).toBe('vote');
        if (c === lbCase) expect(['p0', 'p1']).not.toContain(s.narrators[s.k]);
        const v = c.def.view(s, 'p0', NOW) as { phase: string };
        expect(v.phase).toBe('vote');
        expect(() => parsed(c.def, c.first(s, 'p0'))).not.toThrow();
        expect(c.def.input(s, 'p0', parsed(c.def, c.first(s, 'p0')), NOW)).not.toBe(s);
        expect(c.def.input(s, 'p1', parsed(c.def, c.first(s, 'p1')), NOW)).not.toBe(s);
      });

  it('verraeter zu zweit: prep landet in der Tipp-Phase', () => {
    const { s } = begin(vrCase, 2, 1);
    expect(s.phase).toBe('vote');
    expect(s.mode).toBe('duo');
  });

  it('ohne passende Phase (luegenbaron n=2, verraeter n=1) bleibt der Zustand unveraendert', () => {
    const a = begin(lbCase, 2, 1);
    expect(a.s.phase).toBe('card');
    const b = begin(vrCase, 1, 1);
    expect(b.s.phase).toBe('word');
    expect(b.now).toBe(NOW);
  });
});

describe('Pruefung (c) badDrinks erkennt Verstoesse', () => {
  const known = ['a', 'b'];

  it('sauber: Record und DrinkPlan ohne Befund', () => {
    expect(badDrinks({ a: { take: 1, give: 0 } }, known)).toEqual([]);
    expect(badDrinks({ rows: { a: { take: 3, give: 2 } }, cheers: false }, known)).toEqual([]);
    expect(badDrinks({ rows: {}, cheers: true }, known)).toEqual([]);
    expect(DRINK_CAP).toBe(3);
  });

  it('die Plan-Erkennung folgt isPlan: rows als Objekt und cheers als Boolean', () => {
    expect(badDrinks({ rows: { a: { take: 1, give: 0 } }, cheers: 'ja' } as unknown as RawDrinks, known).length).toBeGreaterThan(0);
    expect(badDrinks({ rows: { a: { take: 1, give: 0 } } } as unknown as RawDrinks, known)).toContain('unbekannte pid rows');
    expect(badDrinks({ rows: { take: 1, give: 0 } } as unknown as RawDrinks, known)).toHaveLength(1);
  });

  it('keine Obergrenze: ein roher Wert ueber DRINK_CAP ist kein Befund (die Engine kappt)', () => {
    expect(badDrinks({ a: { take: DRINK_CAP + 1, give: 9 } }, known)).toEqual([]);
  });

  it('Befund bei unbekannter pid, Bruch, negativ, NaN', () => {
    expect(badDrinks({ x: { take: 1, give: 0 } }, known)).toHaveLength(1);
    expect(badDrinks({ a: { take: 1.5, give: -1 } }, known)).toHaveLength(2);
    expect(badDrinks({ rows: { a: { take: Number.NaN, give: 0 } }, cheers: false }, known)).toHaveLength(1);
  });
});
