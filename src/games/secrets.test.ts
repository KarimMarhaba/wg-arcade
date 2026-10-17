import { describe, expect, it } from 'vitest';
import { bombe, type BombeState } from './bombe/logic';
import { gleichklang } from './gleichklang/logic';
import { stopp } from './stopp/logic';
import type { GameDef } from './types';
import { werwuerde } from './werwuerde/logic';

interface SecretCase<S = any> {
  name?: string;
  def: GameDef<S, any, any>;
  setup(n: number): S;
  secrets(s: S, owner: string): string[];
}

const NOW = 10_000;
const pidsOf = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);

function leaks<S>(c: SecretCase<S>, n: number): string[] {
  const s = c.setup(n);
  const found: string[] = [];
  for (const owner of pidsOf(n)) {
    const secrets = c.secrets(s, owner);
    if (secrets.length === 0) found.push(`${owner}: keine Geheimnisse deklariert`);
    for (const x of pidsOf(n)) {
      if (x === owner) continue;
      const json = JSON.stringify(c.def.view(s, x, NOW));
      for (const secret of secrets) if (json.includes(secret)) found.push(`${x} sieht "${secret}" von ${owner}`);
    }
  }
  return found;
}

interface FixState {
  words: Record<string, string>;
}

function fixture(leak: boolean): SecretCase<FixState> {
  const def: GameDef<FixState, never, unknown> = {
    id: 'blitz',
    title: 'Fixture',
    rule: 'Fixture',
    accent: 'lime',
    init: () => ({ words: {} }),
    parseInput: () => null,
    input: (s) => s,
    tick: (s) => s,
    done: () => false,
    result: () => new Map(),
    label: () => '–',
    view: (s, pid) => (leak ? { words: s.words } : { word: s.words[pid] ?? null }),
  };
  return {
    def,
    setup: (n) => ({ words: Object.fromEntries(pidsOf(n).map((pid) => [pid, `GEHEIM_${pid.toUpperCase()}`])) }),
    secrets: (s, owner) => (s.words[owner] === undefined ? [] : [s.words[owner]]),
  };
}

const players = (n: number) => pidsOf(n).map((pid, i) => ({ pid, name: pid.toUpperCase(), color: i }));
const quoted = (pid: string) => `"${pid}"`;
const start = <S>(def: GameDef<S, any, any>, n: number): S => def.init(players(n), 11, NOW, { speed: 1, drinking: false });

function gleichklangQuestion(n: number) {
  return pidsOf(n).reduce((s, pid) => {
    const i = gleichklang.parseInput({ k: 0, i: 0, ms: 123 });
    if (i === null) throw new Error('ungueltig');
    return gleichklang.input(s, pid, i, NOW);
  }, start(gleichklang, n));
}

function werwuerdeVote(n: number) {
  return pidsOf(n).reduce((s, pid) => {
    const i = werwuerde.parseInput({ k: 0, to: pid });
    if (i === null) throw new Error('ungueltig');
    return werwuerde.input(s, pid, i, NOW);
  }, start(werwuerde, n));
}

const pumpOf = (i: number): number => (i % 3) + 1;
const devOf = (i: number): number => 4321 + 17 * i;
const indexOf = (pid: string): number => Number(pid.slice(1));

function bombePumping(n: number): BombeState {
  return pidsOf(n).reduce((s, pid, i) => {
    const input = bombe.parseInput({ b: 0, n: pumpOf(i), cash: false });
    if (input === null) throw new Error('ungueltig');
    return bombe.input(s, pid, input, NOW);
  }, start(bombe, n));
}

function stoppRun(n: number) {
  return pidsOf(n).reduce((s, pid, i) => {
    const input = stopp.parseInput({ k: 0, devMs: devOf(i) });
    if (input === null) throw new Error('ungueltig');
    return stopp.input(s, pid, input, NOW);
  }, start(stopp, n));
}

const SECRET_CASES: SecretCase[] = [
  {
    name: 'bombe Pumpphase (Platzpunkte roh, Pumpstand des Besitzers)',
    def: bombe,
    setup: bombePumping,
    secrets: (s: BombeState, owner) => [
      '"burst',
      `${quoted(owner)}:${JSON.stringify(s.burst[owner])}`,
      `${quoted(owner)}:${pumpOf(indexOf(owner))}`,
    ],
  },
  {
    name: 'stopp Laufphase (dev-Werte roh und als Zahl)',
    def: stopp,
    setup: stoppRun,
    secrets: (_s, owner) => {
      const dev = devOf(indexOf(owner));
      return ['"devs', `${quoted(owner)}:[${dev}`, `:${dev},`, `:${dev}}`, `[${dev},`, `[${dev}]`];
    },
  },
  { name: 'gleichklang Frage', def: gleichklang, setup: gleichklangQuestion, secrets: (_s, owner) => [quoted(owner)] },
  { name: 'werwuerde Abstimmung', def: werwuerde, setup: werwuerdeVote, secrets: (_s, owner) => [quoted(owner)] },
  {
    name: 'werwuerde Aufloesung',
    def: werwuerde,
    setup: (n) => {
      const s = werwuerdeVote(n);
      return werwuerde.tick(s, s.endsAt, new Set(pidsOf(n)));
    },
    secrets: (_s, owner) => [`${quoted(owner)}:${quoted(owner)}`],
  },
];

describe('leaks (Positiv- und Negativkontrolle)', () => {
  it('meldet für ein absichtlich leckendes Fixture Funde', () => {
    const found = leaks(fixture(true), 3);
    expect(found.length).toBeGreaterThan(0);
    expect(found).toContain('p1 sieht "GEHEIM_P0" von p0');
    expect(found).toHaveLength(6);
  });

  it('meldet für ein sauberes Fixture nichts, auch für 8 Spieler', () => {
    for (const n of [2, 3, 8]) expect(leaks(fixture(false), n)).toEqual([]);
  });

  it('ein Fixture ohne deklarierte Geheimnisse fällt auf statt still grün zu sein', () => {
    const empty: SecretCase<FixState> = { ...fixture(false), secrets: () => [] };
    expect(leaks(empty, 3).length).toBeGreaterThan(0);
  });

  it('der eigene Besitzer darf sein Geheimnis sehen', () => {
    const c = fixture(false);
    const json = JSON.stringify(c.def.view(c.setup(3), 'p1', NOW));
    expect(json).toContain('GEHEIM_P1');
  });
});

for (const c of SECRET_CASES)
  describe(`${c.name ?? c.def.id}: Geheimnisse bleiben in view beim Besitzer`, () => {
    for (const n of [2, 3, 5, 8])
      it(`keine fremden Geheimnisse (n=${n})`, () => {
        expect(leaks(c, n)).toEqual([]);
      });
  });
