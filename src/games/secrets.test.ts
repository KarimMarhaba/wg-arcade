import { describe, expect, it } from 'vitest';
import { bombe, type BombeState } from './bombe/logic';
import { erklaerbaer, type EbState } from './erklaerbaer/logic';
import { ringNext } from './common';
import { gleichklang } from './gleichklang/logic';
import { luegenbaron, type LbState } from './luegenbaron/logic';
import { pokerface, type PfState } from './pokerface/logic';
import { MISSIONS } from './pokerface/missions';
import { TERMS, type Term } from './erklaerbaer/terms';
import { stopp } from './stopp/logic';
import { verraeter, type VrState } from './verraeter/logic';
import type { GameDef } from './types';
import { werwuerde } from './werwuerde/logic';

interface SecretCase<S = any> {
  name?: string;
  def: GameDef<S, any, any>;
  setup(n: number): S;
  secrets(s: S, owner: string): string[];
  from?(s: S, owner: string): string[];
}

const NOW = 10_000;
const pidsOf = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);

function leaks<S>(c: SecretCase<S>, n: number): string[] {
  const s = c.setup(n);
  const found: string[] = [];
  for (const owner of pidsOf(n)) {
    const secrets = c.secrets(s, owner);
    if (secrets.length === 0) found.push(`${owner}: keine Geheimnisse deklariert`);
    for (const x of c.from ? c.from(s, owner) : pidsOf(n).filter((p) => p !== owner)) {
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

const TEAM = ['p0', 'p1'];

function teamFixture(leakOutside: boolean, withFrom: boolean): SecretCase<FixState> {
  const base = fixture(false);
  const def: GameDef<FixState, never, unknown> = {
    ...base.def,
    view: (s, pid) => ({
      words: Object.fromEntries(
        Object.entries(s.words).filter(([p]) => leakOutside || (TEAM.includes(pid) && TEAM.includes(p)) || p === pid),
      ),
    }),
  };
  return {
    def,
    setup: base.setup,
    secrets: base.secrets,
    ...(withFrom
      ? { from: (_s: FixState, owner: string) => pidsOf(5).filter((p) => p !== owner && !(TEAM.includes(owner) && TEAM.includes(p))) }
      : {}),
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

const tipOf = (i: number): boolean => i % 2 === 0;
const tickAll = <S>(def: GameDef<S, any, any>, s: S, at: number, n: number): S => def.tick(s, at, new Set(pidsOf(n)));

function luegenbaronAt(n: number, phase: 'tell' | 'vote', explicit: boolean): LbState {
  let s = start(luegenbaron, n);
  const nar = s.narrators[0] as string;
  if (explicit) {
    const i = luegenbaron.parseInput({ a: 'mode', k: 0, truth: true });
    if (i === null) throw new Error('ungueltig');
    s = luegenbaron.input(s, nar, i, NOW);
  }
  s = tickAll(luegenbaron, s, s.endsAt, n);
  if (phase === 'tell') return s;
  s = tickAll(luegenbaron, s, s.endsAt, n);
  return pidsOf(n)
    .filter((pid) => pid !== nar)
    .reduce((q, pid, i) => {
      const t = luegenbaron.parseInput({ a: 'tip', k: 0, truth: tipOf(i) });
      if (t === null) throw new Error('ungueltig');
      return luegenbaron.input(q, pid, t, NOW);
    }, s);
}

const SECRET_WORD = 'GEHEIMWORT';

function verraeterAt(n: number, phase: 'word' | 'vote', same = false): VrState {
  let s = start(verraeter, n);
  for (let seed = 11; n === 2 && s.same !== same; seed++) s = verraeter.init(players(n), seed, NOW, { speed: 1, drinking: false });
  s =
    n === 2
      ? { ...s, words: same ? { p0: 'EINWORT', p1: 'EINWORT' } : { p0: 'WORTEINS', p1: 'WORTZWEI' } }
      : { ...s, words: Object.fromEntries(s.pids.filter((p) => p !== s.traitor).map((p) => [p, SECRET_WORD])) };
  if (phase === 'word') return s;
  while (s.phase !== 'vote') s = tickAll(verraeter, s, s.endsAt, n);
  return pidsOf(n).reduce((q, pid, i) => {
    const raw = n === 2 ? { a: 'tip', same: tipOf(i) } : { a: 'vote', to: pidsOf(n)[(i + 1) % n] };
    const x = verraeter.parseInput(raw);
    if (x === null) throw new Error('ungueltig');
    return verraeter.input(q, pid, x, NOW);
  }, s);
}

const vrOthers = (s: VrState, owner: string): string[] =>
  s.mode === 'duo' || owner === s.traitor ? s.pids.filter((p) => p !== owner) : [s.traitor as string];

const vrWordSecrets = (s: VrState, owner: string): string[] =>
  s.mode === 'duo'
    ? ['"same', '"pair', '"words', ...(s.same ? [] : [s.words[owner] as string])]
    : owner === s.traitor
      ? ['"traitor', '"cat"', '"pair', '"decoys', '"role', 'Kategorie']
      : [SECRET_WORD];

type PfAt = 'mission' | 'talk' | 'guess';

const pfDone = (i: number): boolean => i % 2 === 0;
const pfTip = (i: number): number => i % 4;
const pfText = (s: PfState, pid: string): string => (MISSIONS[s.missions[pid] as number] as { mission: string }).mission;
const pfRater = (s: PfState, pid: string): string => s.order[(s.order.indexOf(pid) + s.order.length - 1) % s.order.length] as string;

function pokerfaceAt(n: number, phase: PfAt): PfState {
  let s = start(pokerface, n);
  if (phase === 'mission') return s;
  s = tickAll(pokerface, s, s.endsAt, n);
  s = pidsOf(n).reduce((q, pid, i) => {
    if (!pfDone(i)) return q;
    const x = pokerface.parseInput({ a: 'done' });
    if (x === null) throw new Error('ungueltig');
    return pokerface.input(q, pid, x, NOW);
  }, s);
  if (phase === 'talk') return s;
  s = tickAll(pokerface, s, s.endsAt, n);
  return pidsOf(n).reduce((q, pid, i) => {
    const x = pokerface.parseInput({ a: 'tip', i: pfTip(i) });
    if (x === null) throw new Error('ungueltig');
    return pokerface.input(q, pid, x, NOW);
  }, s);
}

const pfRaw = ['"missions"', '"answer"'];

const ebStart = (n: number): EbState => {
  const s = start(erklaerbaer, n);
  const to = s.pids.find((p) => p !== s.explainers[0] && p !== (n >= 3 ? ringNext(s.order, s.explainers[0] as string) : null));
  const i = erklaerbaer.parseInput({ a: 'hit', k: 0, c: 0, ...(to === undefined ? {} : { to }) });
  if (i === null) throw new Error('ungueltig');
  return erklaerbaer.input(s, s.explainers[0] as string, i, NOW);
};

const ebGuard = (s: EbState): string | null => (s.pids.length >= 3 ? (ringNext(s.order, s.explainers[s.k] as string) ?? null) : null);
const ebGuessers = (s: EbState): string[] => s.pids.filter((p) => p !== s.explainers[s.k] && p !== ebGuard(s));
const ebWords = (c: Term): string[] => [c.term, ...c.taboo].map((w) => `"${w}"`);
const ebCard = (s: EbState, at: number): Term => TERMS[s.deck[at] as number] as Term;

const SECRET_CASES: SecretCase[] = [
  {
    name: 'luegenbaron Tippphase (Wahrheitsfeld, Seed-Standard, Tipp-Map)',
    def: luegenbaron,
    setup: (n) => luegenbaronAt(n, 'vote', true),
    secrets: (s: LbState, owner) =>
      owner === s.narrators[0]
        ? ['"truth":', `"truth":[${s.truth[0]}`, '"dflt"', '"mode"']
        : ['"tips"', `${quoted(owner)}:[${tipOf(s.pids.filter((p) => p !== s.narrators[0]).indexOf(owner))}`],
  },
  {
    name: 'luegenbaron Erzaehlen mit vom Seed gewaehltem Modus',
    def: luegenbaron,
    setup: (n) => luegenbaronAt(n, 'tell', false),
    secrets: (s: LbState, owner) =>
      owner === s.narrators[0] ? ['"truth":', `"truth":[${s.truth[0]}`, '"dflt"', '"mode"'] : ['"tips"'],
  },
  {
    name: 'verraeter Wortphase (Wort nur vor dem Verraeter verborgen, Rolle und Koeder)',
    def: verraeter,
    setup: (n) => verraeterAt(n, 'word'),
    secrets: vrWordSecrets,
    from: vrOthers,
  },
  {
    name: 'verraeter Wortphase, zu zweit mit gleichem Wort ist das Wort kein Geheimnis',
    def: verraeter,
    setup: (n) => verraeterAt(n, 'word', true),
    secrets: vrWordSecrets,
    from: vrOthers,
  },
  {
    name: 'verraeter Abstimmung (Wort vor dem Verraeter)',
    def: verraeter,
    setup: (n) => verraeterAt(n, 'vote'),
    secrets: vrWordSecrets,
    from: vrOthers,
  },
  {
    name: 'verraeter Abstimmung (Stimmen und Tipps der anderen)',
    def: verraeter,
    setup: (n) => verraeterAt(n, 'vote'),
    secrets: (s: VrState, owner) => {
      const i = s.pids.indexOf(owner);
      return s.mode === 'duo'
        ? ['"tips"', `${quoted(owner)}:${tipOf(i)}`]
        : ['"votes"', `${quoted(owner)}:${quoted(s.pids[(i + 1) % s.pids.length] as string)}`];
    },
  },
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
  {
    name: 'pokerface Mission (Missionstext, Rohzustand)',
    def: pokerface,
    setup: (n) => pokerfaceAt(n, 'mission'),
    secrets: (s: PfState, owner) => [pfText(s, owner), ...pfRaw],
  },
  {
    name: 'pokerface Gespraech (Missionstext, ERLEDIGT-Status, Rohzustand)',
    def: pokerface,
    setup: (n) => pokerfaceAt(n, 'talk'),
    secrets: (s: PfState, owner) => [pfText(s, owner), `${quoted(owner)}:true`, '"done":{', ...pfRaw],
  },
  {
    name: 'pokerface Raten (Missionstext ausser beim Rater des Besitzers)',
    def: pokerface,
    setup: (n) => pokerfaceAt(n, 'guess'),
    secrets: (s: PfState, owner) => [pfText(s, owner), ...pfRaw],
    from: (s: PfState, owner) => s.pids.filter((p) => p !== owner && p !== pfRater(s, owner)),
  },
  {
    name: 'pokerface Raten (Tipps und ERLEDIGT-Status gegen alle anderen)',
    def: pokerface,
    setup: (n) => pokerfaceAt(n, 'guess'),
    secrets: (s: PfState, owner) => [`${quoted(owner)}:${pfTip(s.pids.indexOf(owner))}`, `${quoted(owner)}:true`, '"tips"', '"done":{'],
  },
  {
    name: 'erklaerbaer Zug (Begriff und Tabus nur bei Erklaerer und Waechter, gegen die Rater)',
    def: erklaerbaer,
    setup: ebStart,
    secrets: (s: EbState) => [...ebWords(ebCard(s, s.pos)), '"deck"', '"pos"'],
    from: ebGuessers,
  },
  {
    name: 'erklaerbaer Zug (die naechsten Karten bei niemandem)',
    def: erklaerbaer,
    setup: ebStart,
    secrets: (s: EbState) => {
      const now = new Set(ebWords(ebCard(s, s.pos)));
      return [1, 2, 3, 4].flatMap((d) => ebWords(ebCard(s, s.pos + d))).filter((w) => !now.has(w));
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

  it('from: ohne from meldet ein Team-Fixture das legitim geteilte Geheimnis, mit from nichts', () => {
    expect(leaks(teamFixture(false, false), 5).length).toBeGreaterThan(0);
    expect(leaks(teamFixture(false, true), 5)).toEqual([]);
  });

  it('from: ein Leck ausserhalb des erlaubten Kreises faellt trotz from auf', () => {
    const found = leaks(teamFixture(true, true), 5);
    expect(found.length).toBeGreaterThan(0);
    expect(found).toContain('p3 sieht "GEHEIM_P0" von p0');
    expect(found.every((f) => !f.startsWith('p1 sieht "GEHEIM_P0"'))).toBe(true);
  });

  it('from darf nur eine Teilmenge pruefen: ein Spieler ausserhalb der Liste wird nicht gemeldet', () => {
    const c = teamFixture(true, true);
    expect(leaks(c, 5)).not.toContain('p1 sieht "GEHEIM_P0" von p0');
    expect(leaks({ ...c, from: () => [] }, 5).filter((f) => f.includes('sieht'))).toEqual([]);
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
