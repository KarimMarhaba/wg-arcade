import { describe, expect, it } from 'vitest';
import { GRACE } from '../engine/durations';
import { blitz } from './blitz/logic';
import { farbfalle } from './farbfalle/logic';
import { hammer } from './hammer/logic';
import { schaetzfuchs } from './schaetzfuchs/logic';
import type { GameDef } from './types';

interface Case {
  def: GameDef<any, any, any>;
  finish: unknown[];
}

const CASES: Case[] = [
  { def: blitz, finish: [0, 1, 2].map((i) => ({ i, ms: 300 + i })) },
  { def: hammer, finish: [{ n: 12, final: true }] },
  { def: farbfalle, finish: [{ i: 0, c: 1 }, { done: true }] },
  { def: schaetzfuchs, finish: [{ guess: 123456 }] },
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
const NOW = 10_000;
const SPEEDS = [1, 10];
const parsed = (def: Case['def'], raw: unknown) => {
  const i = def.parseInput(raw);
  if (i === null) throw new Error(`${def.id}: Eingabe abgelehnt`);
  return i;
};
const feed = (c: Case, s: unknown, pid: string, now = NOW) =>
  c.finish.reduce((q, raw) => c.def.input(q, pid, parsed(c.def, raw), now), s);

for (const c of CASES)
  for (const speed of SPEEDS)
    describe(`${c.def.id} (speed ${speed}) erfuellt den GameDef-Vertrag`, () => {
      const init = (n = 3) => c.def.init(players(n), 77, NOW, { speed });

      it('parseInput wirft nie und lehnt Muell ab', () => {
        for (const g of GARBAGE) {
          expect(() => c.def.parseInput(g)).not.toThrow();
          expect(c.def.parseInput(g)).toBeNull();
        }
        for (const raw of c.finish) expect(c.def.parseInput(raw)).not.toBeNull();
      });

      it('ignorierte Eingaben und No-op-tick liefern dieselbe Referenz', () => {
        const s0 = init();
        const online = new Set(['p0', 'p1', 'p2']);
        const first = parsed(c.def, c.finish[0]);
        expect(c.def.input(s0, 'zz', first, NOW)).toBe(s0);
        expect(c.def.tick(s0, NOW + 1, online)).toBe(s0);
        const s1 = c.def.input(s0, 'p0', first, NOW);
        expect(s1).not.toBe(s0);
        expect(c.def.input(s1, 'p0', first, NOW)).toBe(s1);
        expect(c.def.tick(s1, NOW + 1, online)).toBe(s1);
      });

      it('input und tick veraendern den Eingangs-State nicht', () => {
        const s0 = init();
        const before = structuredClone(s0);
        const s1 = c.def.input(s0, 'p0', parsed(c.def, c.finish[0]), NOW);
        expect(s0).toEqual(before);
        const done = feed(c, feed(c, s0, 'p0'), 'p1');
        const clone = structuredClone(done);
        const ticked = c.def.tick(done, NOW + 1, new Set(['p0', 'p1']));
        expect(done).toEqual(clone);
        expect(c.def.done(ticked, NOW + 1)).toBe(true);
        expect(c.def.done(s1, NOW + 1)).toBe(false);
      });

      it('view ist bei gleichem State und anderem now JSON-gleich', () => {
        const s = feed(c, init(), 'p0');
        for (const pid of ['p0', 'p1', 'zz'])
          expect(JSON.stringify(c.def.view(s, pid, NOW))).toBe(JSON.stringify(c.def.view(s, pid, NOW + 777)));
      });

      it('view und label werfen nicht fuer eine unbekannte pid', () => {
        const s = init();
        expect(() => c.def.view(s, 'zz', NOW)).not.toThrow();
        expect(c.def.label(s, 'zz')).toBe('–');
      });

      it('Spieler ohne Eingabe: kein result-Eintrag, Label "–"', () => {
        const s = feed(c, init(), 'p0');
        expect(c.def.result(s).has('p0')).toBe(true);
        expect(c.def.result(s).has('p1')).toBe(false);
        expect(c.def.label(s, 'p1')).toBe('–');
        expect(c.def.result(init()).size).toBe(0);
      });

      it('Sicht mit 8 Teilnehmern bleibt unter 6000 Zeichen', () => {
        let s = init(8);
        for (const p of players(8)) s = feed(c, s, p.pid);
        const sizes = players(8).map((p) => JSON.stringify(c.def.view(s, p.pid, NOW)).length);
        expect(Math.max(...sizes)).toBeLessThan(6000);
        const revealed = c.def.tick(s, NOW + GRACE * 100, new Set(players(8).map((p) => p.pid)));
        for (const p of players(8)) expect(JSON.stringify(c.def.view(revealed, p.pid, NOW)).length).toBeLessThan(6000);
      });
    });
