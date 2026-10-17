import { describe, expect, it } from 'vitest';
import { EB_REVEAL, EB_SKIP, EB_TURN, scale } from '../../engine/durations';
import { ringNext, turnOrder } from '../common';
import { erklaerbaer, type EbState, type EbView } from './logic';
import { TERMS, type Term } from './terms';

const NOW = 5000;
const players = (n: number) => Array.from({ length: n }, (_, i) => ({ pid: `p${i}`, name: `P${i}`, color: i }));
const pidsOf = (n: number) => players(n).map((p) => p.pid);
const make = (n = 3, seed = 3, speed = 1): EbState => erklaerbaer.init(players(n), seed, NOW, { speed, drinking: false });
const everyone = (n: number) => new Set(pidsOf(n));
const send = (s: EbState, pid: string, raw: unknown, now = NOW): EbState => {
  const i = erklaerbaer.parseInput(raw);
  if (i === null) throw new Error(`ungueltig: ${JSON.stringify(raw)}`);
  return erklaerbaer.input(s, pid, i, now);
};
const view = (s: EbState, pid: string): EbView => erklaerbaer.view(s, pid, NOW);
const keys = (v: unknown): string[] => Object.keys(v as object).sort();
const nextPhase = (s: EbState, n: number): EbState => erklaerbaer.tick(s, s.endsAt, everyone(n));

const explainer = (s: EbState): string => s.explainers[s.k] as string;
const guardOf = (s: EbState): string | null => (s.pids.length >= 3 ? (ringNext(s.order, explainer(s)) ?? null) : null);
const ratersOf = (s: EbState): string[] => s.pids.filter((p) => p !== explainer(s) && p !== guardOf(s));
const card = (s: EbState, at = s.pos): Term => TERMS[s.deck[at] as number] as Term;
const at = (s: EbState) => ({ k: s.k, c: s.pos });

const hit = (s: EbState, to: string | undefined = ratersOf(s)[0], now = NOW): EbState =>
  send(s, explainer(s), { a: 'hit', ...at(s), ...(to === undefined ? {} : { to }) }, now);
const skip = (s: EbState, now = NOW): EbState => send(s, explainer(s), { a: 'skip', ...at(s) }, now);
const taboo = (s: EbState, now = NOW): EbState => send(s, guardOf(s) ?? explainer(s), { a: 'taboo', ...at(s) }, now);
const drain = (s: EbState, n = 12): EbState => Array.from({ length: n }).reduce<EbState>((q) => skip(q), s);

const pts = (s: EbState, pid: string) => erklaerbaer.result(s).get(pid);
const mimeIdx = TERMS.findIndex((x) => x.mime === true);
const plainIdx = TERMS.findIndex((x) => x.mime !== true);
const withDeck = (s: EbState, first: number[]): EbState => ({ ...s, deck: [...first, ...s.deck.filter((i) => !first.includes(i))] });

describe('erklaerbaer init', () => {
  it('Erklaerer sind die ersten min(2, n) aus turnOrder: n=1 einer, n=2 beide, ab 3 zwei', () => {
    for (let seed = 0; seed < 30; seed++)
      for (const n of [1, 2, 3, 5, 8]) {
        const s = make(n, seed);
        expect(s.order).toEqual(turnOrder(seed, pidsOf(n)));
        expect(s.explainers).toEqual(s.order.slice(0, Math.min(2, n)));
        expect(s.explainers).toHaveLength(Math.min(2, n));
      }
    expect(new Set(make(2, 5).explainers)).toEqual(new Set(['p0', 'p1']));
  });

  it('das Deck ist die seed-gemischte ganze Bank, deterministisch und seedabhaengig', () => {
    const s = make(3, 4);
    expect([...s.deck].sort((a, b) => a - b)).toEqual(TERMS.map((_, i) => i));
    expect(s.pos).toBe(0);
    expect(make(3, 4).deck).toEqual(s.deck);
    expect(make(3, 5).deck).not.toEqual(s.deck);
    expect(s.deck.slice(0, 20)).not.toEqual(TERMS.slice(0, 20).map((_, i) => i));
  });

  for (const speed of [1, 10])
    it(`Dauern laufen durch scale, keine GRACE je Phase (speed ${speed})`, () => {
      const s = make(3, 3, speed);
      expect(s.phase).toBe('explain');
      expect(s.k).toBe(0);
      expect(s.durs).toEqual({ turn: scale(EB_TURN, speed), skip: scale(EB_SKIP, speed), reveal: scale(EB_REVEAL, speed) });
      expect(s.endsAt).toBe(NOW + s.durs.turn);
      expect(s.dur).toBe(s.durs.turn);
      let q = s;
      let t = NOW;
      for (const [phase, k, dur] of [['reveal', 0, s.durs.reveal], ['explain', 1, s.durs.turn], ['reveal', 1, s.durs.reveal]] as const) {
        expect(erklaerbaer.done(q, t)).toBe(false);
        t = q.endsAt;
        q = erklaerbaer.tick(q, t, everyone(3));
        expect(q).toMatchObject({ phase, k, dur, endsAt: t + dur });
      }
      expect(t - NOW).toBe(2 * s.durs.turn + s.durs.reveal);
      expect(erklaerbaer.done(q, q.endsAt - 1)).toBe(false);
      expect(erklaerbaer.done(q, q.endsAt)).toBe(true);
    });

  it('n=1: ein Zug, dann Aufloesung, dann fertig', () => {
    const s = make(1, 2);
    const r = nextPhase(s, 1);
    expect(r).toMatchObject({ phase: 'reveal', k: 0 });
    expect(erklaerbaer.done(r, r.endsAt)).toBe(true);
    expect(nextPhase(r, 1)).toBe(r);
  });
});

describe('erklaerbaer parseInput', () => {
  it('nimmt hit, skip und taboo mit k und Kartenposition an, hit mit optionalem Rater', () => {
    expect(erklaerbaer.parseInput({ a: 'hit', k: 0, c: 0 })).not.toBeNull();
    expect(erklaerbaer.parseInput({ a: 'hit', k: 1, c: 7, to: 'p2' })).not.toBeNull();
    expect(erklaerbaer.parseInput({ a: 'skip', k: 0, c: 3 })).not.toBeNull();
    expect(erklaerbaer.parseInput({ a: 'taboo', k: 1, c: 0 })).not.toBeNull();
  });

  it('lehnt Ungueltiges ab', () => {
    for (const bad of [
      { a: 'hit', k: 2, c: 0 },
      { a: 'hit', k: -1, c: 0 },
      { a: 'hit', k: 0, c: -1 },
      { a: 'hit', k: 0, c: 1.5 },
      { a: 'hit', k: '0', c: 0 },
      { a: 'hit', k: 0 },
      { a: 'hit', c: 0 },
      { a: 'hit', k: 0, c: 0, to: 5 },
      { a: 'hit', k: 0, c: 0, to: '' },
      { a: 'skip', k: 0 },
      { a: 'taboo', c: 0 },
      { a: 'boom', k: 0, c: 0 },
      { k: 0, c: 0 },
    ])
      expect(erklaerbaer.parseInput(bad), JSON.stringify(bad)).toBeNull();
  });
});

describe('erklaerbaer Sichten', () => {
  it('Rollen ab 3 Spielern: ein Erklaerer, ein Waechter (ringNext), alle anderen Rater; Rollen wechseln mit dem Zug', () => {
    for (const n of [3, 5, 8]) {
      let s = make(n, 6);
      for (let k = 0; k < 2; k++) {
        const roles = pidsOf(n).map((p) => (view(s, p) as { role: string }).role);
        expect(roles.filter((r) => r === 'explainer')).toHaveLength(1);
        expect(roles.filter((r) => r === 'guard')).toHaveLength(1);
        expect(roles.filter((r) => r === 'guesser')).toHaveLength(n - 2);
        expect((view(s, explainer(s)) as { role: string }).role).toBe('explainer');
        expect((view(s, guardOf(s) as string) as { role: string }).role).toBe('guard');
        s = nextPhase(nextPhase(s, n), n);
      }
    }
  });

  it('Erklaerer-Sicht: genaue Schluesselmenge, Begriff, Tabus, Waechter und gueltige Rater', () => {
    const s = make(5, 6);
    const v = view(s, explainer(s)) as Extract<EbView, { role: 'explainer'; phase: 'explain' }>;
    expect(keys(v)).toEqual(['c', 'dur', 'endsAt', 'guard', 'hits', 'k', 'mime', 'of', 'phase', 'raters', 'role', 'taboo', 'taboos', 'term', 'who']);
    const c = card(s);
    expect(v).toMatchObject({
      phase: 'explain',
      role: 'explainer',
      k: 0,
      of: 2,
      who: explainer(s),
      c: 0,
      hits: 0,
      taboos: 0,
      term: c.term,
      guard: guardOf(s),
      endsAt: s.endsAt,
      dur: s.dur,
    });
    expect(v.raters).toEqual(ratersOf(s));
    expect(v.raters).not.toContain(guardOf(s));
    expect(v.raters).not.toContain(explainer(s));
    expect(v.mime).toBe(c.mime === true);
    expect(v.taboo).toEqual(c.mime === true ? [] : c.taboo);
  });

  it('Waechter-Sicht: dieselbe Karte wie der Erklaerer, aber ohne Guard- und Rater-Felder', () => {
    const s = make(4, 6);
    const e = view(s, explainer(s)) as { term: string; taboo: string[]; c: number; mime: boolean };
    const g = view(s, guardOf(s) as string) as Extract<EbView, { role: 'guard'; phase: 'explain' }>;
    expect(keys(g)).toEqual(['c', 'dur', 'endsAt', 'hits', 'k', 'mime', 'of', 'phase', 'role', 'taboo', 'taboos', 'term', 'who']);
    expect(g).toMatchObject({ term: e.term, taboo: e.taboo, c: e.c, mime: e.mime, who: explainer(s) });
  });

  it('Rater-Sicht: genaue Schluesselmenge, kein Begriff, keine Tabus', () => {
    const s = make(4, 6);
    const r = ratersOf(s)[0] as string;
    const v = view(s, r);
    expect(keys(v)).toEqual(['dur', 'endsAt', 'hits', 'k', 'of', 'phase', 'role', 'taboos', 'who']);
    expect(v).toMatchObject({ phase: 'explain', role: 'guesser', who: explainer(s), hits: 0, taboos: 0 });
    const json = JSON.stringify(v);
    expect(json).not.toContain(card(s).term);
    for (const w of card(s).taboo) expect(json).not.toContain(`"${w}"`);
    expect(keys(view(s, 'zz'))).toEqual(keys(v));
  });

  it('zu zweit: kein Waechter, genau ein Rater, guard null', () => {
    const s = make(2, 6);
    const v = view(s, explainer(s)) as { guard: unknown; raters: string[] };
    expect(v.guard).toBeNull();
    expect(v.raters).toEqual(pidsOf(2).filter((p) => p !== explainer(s)));
    expect((view(s, v.raters[0] as string) as { role: string }).role).toBe('guesser');
  });

  it('n=1: Erklaerer ohne Waechter und ohne Rater', () => {
    const s = make(1, 6);
    expect(view(s, 'p0')).toMatchObject({ role: 'explainer', guard: null, raters: [] });
  });

  it('Pantomime-Karte: mime true und keine Tabuwoerter in der Sicht', () => {
    const s = withDeck(make(3, 6), [mimeIdx]);
    const e = view(s, explainer(s)) as { mime: boolean; taboo: string[]; term: string };
    expect(e).toMatchObject({ mime: true, taboo: [], term: (TERMS[mimeIdx] as Term).term });
    expect(JSON.stringify(view(s, guardOf(s) as string))).not.toContain(`"${(TERMS[mimeIdx] as Term).taboo[0]}"`);
    const p = withDeck(make(3, 6), [plainIdx]);
    expect(view(p, explainer(p))).toMatchObject({ mime: false, taboo: (TERMS[plainIdx] as Term).taboo });
  });

  it('Begriff und Tabus stehen nur bei Erklaerer und Waechter; die naechsten Karten bei niemandem', () => {
    for (let seed = 0; seed < 20; seed++)
      for (const n of [2, 3, 5, 8]) {
        let s = make(n, seed);
        s = hit(s);
        const now = card(s);
        const own = new Set([now.term, ...now.taboo]);
        const future = Array.from({ length: 6 }, (_, i) => card(s, s.pos + 1 + i)).flatMap((c) => [c.term, ...c.taboo]).filter((w) => !own.has(w));
        for (const pid of pidsOf(n)) {
          const json = JSON.stringify(view(s, pid));
          for (const w of future) expect(json, `seed ${seed} n ${n} ${pid}: ${w}`).not.toContain(`"${w}"`);
          const sees = pid === explainer(s) || pid === guardOf(s);
          if (!sees) {
            expect(json).not.toContain(`"${now.term}"`);
            expect(json).not.toContain('"term"');
          }
          expect(json).not.toContain('"deck"');
        }
      }
  });

  it('Treffer und Tabus in der Sicht stammen aus dem Host-Zustand und gelten fuer alle Rollen', () => {
    let s = hit(make(5, 6));
    s = hit(s);
    s = taboo(s);
    for (const pid of pidsOf(5)) expect(view(s, pid)).toMatchObject({ hits: 2, taboos: 1 });
    expect((view(s, explainer(s)) as { c: number }).c).toBe(3);
  });
});

describe('erklaerbaer Treffer', () => {
  it('Treffer mit gueltigem Rater: Erklaerer +2, Rater +1, naechste Karte, Waechter unbeteiligt', () => {
    const s = make(4, 6);
    const r = ratersOf(s)[0] as string;
    const a = hit(s, r);
    expect(pts(a, explainer(s))).toBe(2);
    expect(pts(a, r)).toBe(1);
    expect(erklaerbaer.result(a).has(guardOf(s) as string)).toBe(false);
    expect(a.pos).toBe(1);
    expect(a.endsAt).toBe(s.endsAt);
    expect((view(a, explainer(s)) as { term: string }).term).toBe(card(s, 1).term);
    expect(erklaerbaer.label(a, explainer(s))).toBe('2 Pkt');
    expect(erklaerbaer.label(a, r)).toBe('1 Pkt');
  });

  it('ungueltige Rater werden ignoriert: Erklaerer, Waechter, Unbekannte, kein Rater', () => {
    const s = make(5, 6);
    expect(send(s, explainer(s), { a: 'hit', ...at(s), to: explainer(s) })).toBe(s);
    expect(send(s, explainer(s), { a: 'hit', ...at(s), to: guardOf(s) })).toBe(s);
    expect(send(s, explainer(s), { a: 'hit', ...at(s), to: 'zz' })).toBe(s);
    expect(send(s, explainer(s), { a: 'hit', ...at(s) })).toBe(s);
    expect(send(s, explainer(s), { a: 'hit', ...at(s), to: ratersOf(s)[1] })).not.toBe(s);
  });

  it('nur der Erklaerer des aktuellen Zugs darf einen Treffer melden', () => {
    const s = make(4, 6);
    const r = ratersOf(s)[0] as string;
    for (const pid of [guardOf(s) as string, r, 'zz', s.explainers[1] as string])
      expect(send(s, pid, { a: 'hit', ...at(s), to: r })).toBe(s);
  });

  it('veraltete Eingaben werden ignoriert: falsche Kartenposition oder falscher Zug', () => {
    const s = make(4, 6);
    const r = ratersOf(s)[0] as string;
    const a = hit(s, r);
    expect(send(a, explainer(a), { a: 'hit', k: 0, c: 0, to: r })).toBe(a);
    expect(send(a, explainer(a), { a: 'hit', k: 0, c: 2, to: r })).toBe(a);
    expect(send(a, explainer(a), { a: 'hit', k: 1, c: 1, to: r })).toBe(a);
    expect(send(a, explainer(a), { a: 'skip', k: 0, c: 0 })).toBe(a);
    const staleTaboo = send(a, guardOf(a) as string, { a: 'taboo', k: 0, c: 0 });
    expect(staleTaboo).toBe(a);
  });

  it('zu zweit: Treffer nennt den anderen Spieler, der Erklaerer allein ist kein gueltiger Rater', () => {
    const s = make(2, 6);
    const other = pidsOf(2).find((p) => p !== explainer(s)) as string;
    expect(send(s, explainer(s), { a: 'hit', ...at(s) })).toBe(s);
    const a = hit(s, other);
    expect([pts(a, explainer(s)), pts(a, other)]).toEqual([2, 1]);
  });

  it('n=1: Treffer ohne Rater gibt +2', () => {
    const s = make(1, 6);
    const a = send(s, 'p0', { a: 'hit', ...at(s) });
    expect(pts(a, 'p0')).toBe(2);
    expect(a.pos).toBe(1);
    expect(erklaerbaer.label(a, 'p0')).toBe('2 Pkt');
  });

  it('der gutgeschriebene Rater bekommt einen result-Eintrag, ein anderer Rater ohne Gutschrift nicht', () => {
    const s = make(5, 6);
    const [r1, r2] = ratersOf(s) as [string, string];
    const a = hit(s, r1);
    expect(erklaerbaer.result(a).has(r1)).toBe(true);
    expect(erklaerbaer.result(a).has(r2)).toBe(false);
    expect(erklaerbaer.label(a, r2)).toBe('–');
    expect(erklaerbaer.result(s).size).toBe(0);
  });
});

describe('erklaerbaer Skip', () => {
  it('Skip verschiebt endsAt um scale(3 s), dur bleibt, naechste Karte, ohne Punkte', () => {
    for (const speed of [1, 10]) {
      const s = make(3, 6, speed);
      const a = skip(s);
      expect(a.endsAt).toBe(s.endsAt - scale(EB_SKIP, speed));
      expect(a.dur).toBe(s.dur);
      expect(a.pos).toBe(1);
      expect(pts(a, explainer(s))).toBe(0);
      expect(erklaerbaer.label(a, explainer(s))).toBe('0 Pkt');
      expect(view(a, explainer(s))).toMatchObject({ endsAt: a.endsAt, dur: s.dur, hits: 0, taboos: 0 });
    }
  });

  it('nur der Erklaerer darf skippen', () => {
    const s = make(4, 6);
    for (const pid of [guardOf(s) as string, ratersOf(s)[0] as string, 'zz']) expect(send(s, pid, { a: 'skip', ...at(s) })).toBe(s);
  });

  it('zwoelf Skips verbrauchen die Zeit: der naechste Tick beendet den Zug, elf nicht', () => {
    for (const speed of [1, 10]) {
      const s = make(3, 6, speed);
      expect(erklaerbaer.tick(drain(s, 11), NOW + 1, everyone(3)).phase).toBe('explain');
      const done = drain(s, 12);
      expect(done.endsAt).toBeLessThanOrEqual(NOW);
      const r = erklaerbaer.tick(done, NOW + 1, everyone(3));
      expect(r.phase).toBe('reveal');
      expect(r.endsAt).toBe(NOW + 1 + s.durs.reveal);
    }
  });

  it('ohne Aktion bleibt der Zug stehen (No-op-Tick), nach der Zeit folgt die Aufloesung', () => {
    const s = make(3, 6);
    expect(erklaerbaer.tick(s, s.endsAt - 1, everyone(3))).toBe(s);
    expect(nextPhase(s, 3).phase).toBe('reveal');
  });
});

describe('erklaerbaer Tabu', () => {
  it('ab 3 Spielern nur vom Waechter: -1 fuer den Erklaerer, naechste Karte; der Erklaerer selbst darf nicht', () => {
    const s = make(4, 6);
    expect(send(s, explainer(s), { a: 'taboo', ...at(s) })).toBe(s);
    expect(send(s, ratersOf(s)[0] as string, { a: 'taboo', ...at(s) })).toBe(s);
    const a = taboo(s);
    expect(pts(a, explainer(s))).toBe(-1);
    expect(erklaerbaer.label(a, explainer(s))).toBe('−1 Pkt');
    expect(a.pos).toBe(1);
    expect(erklaerbaer.result(a).has(guardOf(s) as string)).toBe(true);
    expect(erklaerbaer.label(a, guardOf(s) as string)).toBe('0 Pkt');
    expect(view(a, ratersOf(s)[0] as string)).toMatchObject({ taboos: 1, hits: 0 });
  });

  it('zu zweit und allein nur vom Erklaerer selbst', () => {
    const s = make(2, 6);
    const other = pidsOf(2).find((p) => p !== explainer(s)) as string;
    expect(send(s, other, { a: 'taboo', ...at(s) })).toBe(s);
    expect(pts(taboo(s), explainer(s))).toBe(-1);
    const one = make(1, 6);
    expect(pts(taboo(one), 'p0')).toBe(-1);
  });

  it('Treffer, dann Tabu auf der naechsten Karte: Erklaerer netto +1', () => {
    const s = make(3, 6);
    const a = taboo(hit(s));
    expect(pts(a, explainer(s))).toBe(1);
    expect(a.pos).toBe(2);
    expect(view(a, explainer(s))).toMatchObject({ hits: 1, taboos: 1 });
  });

  it('Waechter und Erklaerer auf derselben Karte: nur die erste Eingabe gilt', () => {
    const s = make(3, 6);
    const a = hit(s);
    expect(send(a, guardOf(s) as string, { a: 'taboo', k: 0, c: 0 })).toBe(a);
    const b = taboo(s);
    expect(send(b, explainer(s), { a: 'hit', k: 0, c: 0, to: ratersOf(s)[0] })).toBe(b);
  });
});

describe('erklaerbaer Zugwechsel und Deck', () => {
  it('der zweite Erklaerer macht dort weiter, wo der erste aufgehoert hat; Log und Zaehler beginnen neu', () => {
    let s = make(3, 6);
    const first = explainer(s);
    s = hit(s);
    s = skip(s);
    s = taboo(s);
    expect(s.pos).toBe(3);
    const r = nextPhase(s, 3);
    expect(r.phase).toBe('reveal');
    const t = nextPhase(r, 3);
    expect(t).toMatchObject({ phase: 'explain', k: 1, pos: 3, dur: s.durs.turn });
    expect(explainer(t)).not.toBe(first);
    expect(view(t, explainer(t))).toMatchObject({ hits: 0, taboos: 0, c: 3, k: 1, term: card(t, 3).term });
    expect(t.log).toEqual([]);
  });

  it('die Punkte beider Zuege summieren sich, jeder Beteiligte hat ein Label', () => {
    let s = make(3, 6);
    const [e0, e1] = s.explainers as [string, string];
    s = hit(s);
    s = taboo(s);
    s = nextPhase(nextPhase(s, 3), 3);
    s = hit(s);
    s = taboo(s);
    const third = pidsOf(3).find((p) => p !== e0 && p !== e1) as string;
    expect(pts(s, e0)).toBe(1 + 1);
    expect(pts(s, e1)).toBe(1);
    expect(pts(s, third)).toBe(1);
    for (const p of pidsOf(3)) expect(erklaerbaer.label(s, p)).toMatch(/^[−]?\d+ Pkt$/);
  });

  it('leeres Deck beendet den Zug ohne Wurf; die Sicht wirft nicht', () => {
    const s = { ...make(3, 6), deck: [] as number[] };
    for (const p of [...pidsOf(3), 'zz']) expect(() => view(s, p)).not.toThrow();
    const r = erklaerbaer.tick(s, NOW + 1, everyone(3));
    expect(r.phase).toBe('reveal');
    expect(() => view(r, 'p0')).not.toThrow();
    const e = nextPhase(r, 3);
    expect(e).toMatchObject({ phase: 'explain', k: 1 });
    expect(erklaerbaer.tick(e, NOW + 2, everyone(3)).phase).toBe('reveal');
  });

  it('das Deck wird im Spiel leer: nach der letzten Karte endet der Zug beim naechsten Tick', () => {
    let s = { ...make(3, 6), deck: make(3, 6).deck.slice(0, 2) };
    s = hit(s);
    expect(erklaerbaer.tick(s, NOW + 1, everyone(3))).toBe(s);
    s = hit(s);
    expect(erklaerbaer.tick(s, NOW + 1, everyone(3)).phase).toBe('reveal');
  });

  it('Eingaben ausserhalb der Erklaerphase werden ignoriert', () => {
    const s = make(3, 6);
    const r = nextPhase(s, 3);
    expect(send(r, explainer(s), { a: 'skip', k: 0, c: 0 })).toBe(r);
    expect(send(r, explainer(s), { a: 'hit', k: 0, c: 0, to: ratersOf(s)[0] })).toBe(r);
  });
});

describe('erklaerbaer Aufloesung', () => {
  it('Sicht: genaue Schluesselmenge, Begriffe dieses Zugs mit Ergebnis, offene Karte als open', () => {
    let s = make(3, 6);
    const c0 = card(s, 0);
    const c1 = card(s, 1);
    const c2 = card(s, 2);
    s = hit(s);
    s = skip(s);
    const r = nextPhase(s, 3);
    for (const p of pidsOf(3)) {
      const v = view(r, p) as Extract<EbView, { phase: 'reveal' }>;
      expect(keys(v)).toEqual(['dur', 'endsAt', 'hits', 'k', 'log', 'of', 'phase', 'role', 'taboos', 'who']);
      expect(v).toMatchObject({ phase: 'reveal', k: 0, hits: 1, taboos: 0, dur: s.durs.reveal, who: explainer(s) });
      expect(v.log).toEqual([
        { term: c0.term, res: 'hit' },
        { term: c1.term, res: 'skip' },
        { term: c2.term, res: 'open' },
      ]);
    }
    expect((view(r, explainer(s)) as { role: string }).role).toBe('explainer');
    expect((view(r, guardOf(s) as string) as { role: string }).role).toBe('guard');
  });

  it('Tabu steht mit Ergebnis taboo im Log; ohne Aktion nur die offene Karte', () => {
    const t = nextPhase(taboo(make(3, 6)), 3);
    expect((view(t, 'p0') as { log: unknown[] }).log[0]).toMatchObject({ res: 'taboo' });
    const idle = nextPhase(make(3, 6), 3);
    expect((view(idle, 'p0') as { log: unknown[] }).log).toHaveLength(1);
  });

  it('Spieler ohne Eingabe: kein result-Eintrag und Label "–"', () => {
    const idle = nextPhase(nextPhase(nextPhase(make(4, 6), 4), 4), 4);
    expect(erklaerbaer.result(idle).size).toBe(0);
    for (const p of pidsOf(4)) expect(erklaerbaer.label(idle, p)).toBe('–');
  });
});
