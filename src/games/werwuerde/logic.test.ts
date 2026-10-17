import { describe, expect, it } from 'vitest';
import { capDrinks, type DrinkPlan } from '../../engine/drinks';
import { scale } from '../../engine/durations';
import { werwuerde, WW_QUESTIONS, type WerwuerdeState, type WerwuerdeView } from './logic';
import { QUESTIONS, STEM, STEM_DUO } from './questions';

type Vote = Extract<WerwuerdeView, { phase: 'vote' }>;
type Reveal = Extract<WerwuerdeView, { phase: 'reveal' }>;

const NOW = 5000;
const players = (n: number) => Array.from({ length: n }, (_, i) => ({ pid: `p${i}`, name: `P${i}`, color: i }));
const pidsOf = (n: number) => players(n).map((p) => p.pid);
const make = (n = 3, seed = 3, speed = 1): WerwuerdeState => werwuerde.init(players(n), seed, NOW, { speed, drinking: false });
const cast = (s: WerwuerdeState, pid: string, k: number, to: string, now = NOW): WerwuerdeState => {
  const inp = werwuerde.parseInput({ k, to });
  if (inp === null) throw new Error('ungueltig');
  return werwuerde.input(s, pid, inp, now);
};
const view = (s: WerwuerdeState, pid = 'p0', now = NOW): WerwuerdeView => werwuerde.view(s, pid, now);
const vote = (s: WerwuerdeState, pid = 'p0') => view(s, pid) as Vote;
const reveal = (s: WerwuerdeState, pid = 'p0') => view(s, pid) as Reveal;
const everyone = (n: number) => new Set(pidsOf(n));
const toReveal = (s: WerwuerdeState, n: number): WerwuerdeState => werwuerde.tick(s, s.endsAt, everyone(n));
const nextVote = (s: WerwuerdeState, n: number): WerwuerdeState => {
  const r = toReveal(s, n);
  return werwuerde.tick(r, r.endsAt, everyone(n));
};
const round = (n: number, perQuestion: Record<string, string>[], seed = 3): WerwuerdeState => {
  let s = make(n, seed);
  perQuestion.forEach((votes, k) => {
    for (const [pid, to] of Object.entries(votes)) s = cast(s, pid, k, to);
    if (k < perQuestion.length - 1) s = nextVote(s, n);
  });
  return s;
};
const score = (s: WerwuerdeState, pid: string) => werwuerde.result(s).get(pid);
const rowsOf = (s: WerwuerdeState): Record<string, { take: number; give: number }> => {
  const d = werwuerde.drinks?.(s) as DrinkPlan;
  return d.rows;
};

function questionsOf(n: number, seed: number): string[] {
  let s = make(n, seed);
  const out: string[] = [];
  for (let k = 0; k < WW_QUESTIONS; k++) {
    out.push(vote(s).text);
    s = nextVote(s, n);
  }
  return out;
}

describe('werwuerde Fragen', () => {
  it('4 verschiedene Fragen je Runde, je Seed deterministisch', () => {
    expect(WW_QUESTIONS).toBe(4);
    for (let seed = 0; seed < 20; seed++) {
      const qs = questionsOf(3, seed);
      expect(new Set(qs).size).toBe(4);
      expect(questionsOf(3, seed)).toEqual(qs);
    }
  });

  it('ab 3 Spielern "Wer würde eher …", zu zweit nur duo-Fragen mit "Wer von uns beiden würde eher …"', () => {
    const duo = new Set(QUESTIONS.filter((x) => x.duo).map((x) => STEM_DUO + x.q));
    const group = new Set(QUESTIONS.map((x) => STEM + x.q));
    const nonDuoSeen = new Set<string>();
    for (let seed = 0; seed < 40; seed++) {
      for (const t of questionsOf(2, seed)) expect(duo.has(t), t).toBe(true);
      for (const t of questionsOf(3, seed)) {
        expect(group.has(t), t).toBe(true);
        nonDuoSeen.add(t);
      }
      for (const t of questionsOf(1, seed)) expect(group.has(t), t).toBe(true);
    }
    expect([...nonDuoSeen].some((t) => !QUESTIONS.find((x) => STEM + x.q === t)?.duo)).toBe(true);
  });
});

describe('werwuerde Ablauf', () => {
  for (const speed of [1, 10])
    it(`Abstimmung 10 s, Aufloesung 4 s, skaliert (speed ${speed})`, () => {
      const s = make(3, 3, speed);
      expect(vote(s)).toMatchObject({ phase: 'vote', k: 0, of: 4, dur: scale(10000, speed), endsAt: NOW + scale(10000, speed) });
      expect(werwuerde.tick(s, s.endsAt - 1, everyone(3))).toBe(s);
      const r = werwuerde.tick(s, s.endsAt, everyone(3));
      expect(reveal(r)).toMatchObject({ phase: 'reveal', k: 0, dur: scale(4000, speed), endsAt: s.endsAt + scale(4000, speed) });
      const a = werwuerde.tick(r, r.endsAt, everyone(3));
      expect(vote(a)).toMatchObject({ phase: 'vote', k: 1, endsAt: r.endsAt + scale(10000, speed) });
    });

  it('allDone beendet die Abstimmung sofort, Offline zaehlt nicht', () => {
    const s = cast(cast(make(3), 'p0', 0, 'p1'), 'p1', 0, 'p1');
    expect(werwuerde.tick(s, NOW + 5, everyone(3))).toBe(s);
    expect(reveal(werwuerde.tick(s, NOW + 5, new Set(['p0', 'p1'])))).toMatchObject({ phase: 'reveal', k: 0 });
    const idle = make(3);
    expect(werwuerde.tick(idle, NOW + 5, new Set())).toBe(idle);
  });

  it('done erst nach der Aufloesung der vierten Frage', () => {
    let s = make(3);
    for (let k = 0; k < WW_QUESTIONS; k++) {
      expect(werwuerde.done(s, s.endsAt + 1_000_000), `Frage ${k}`).toBe(false);
      s = toReveal(s, 3);
      expect(werwuerde.done(s, s.endsAt - 1)).toBe(false);
      if (k < WW_QUESTIONS - 1) s = werwuerde.tick(s, s.endsAt, everyone(3));
    }
    expect(werwuerde.done(s, s.endsAt)).toBe(true);
    expect(werwuerde.tick(s, s.endsAt + 5, everyone(3))).toBe(s);
  });
});

describe('werwuerde parseInput und input', () => {
  it('parseInput: k ganzzahlig >= 0, to nicht leerer String', () => {
    expect(werwuerde.parseInput({ k: 0, to: 'p1' })).toEqual({ k: 0, to: 'p1' });
    for (const bad of [{ k: '0', to: 'p1' }, { k: 0.5, to: 'p1' }, { k: -1, to: 'p1' }, { k: 0 }, { to: 'p1' }, { k: 0, to: '' }, { k: 0, to: 5 }, { k: 0, to: null }])
      expect(werwuerde.parseInput(bad)).toBeNull();
  });

  it('Selbstwahl erlaubt; Fremde, falsche Frage und Doppelstimme werden ignoriert, Stimme gesperrt', () => {
    const s = make(3);
    expect(cast(s, 'p0', 1, 'p1')).toBe(s);
    expect(cast(s, 'p0', 0, 'zz')).toBe(s);
    expect(cast(s, 'zz', 0, 'p1')).toBe(s);
    const a = cast(s, 'p0', 0, 'p0');
    expect(a).not.toBe(s);
    expect(vote(a, 'p0').mine).toBe('p0');
    expect(cast(a, 'p0', 0, 'p1')).toBe(a);
    const r = toReveal(a, 3);
    expect(cast(r, 'p1', 0, 'p1')).toBe(r);
  });
});

describe('werwuerde Sicht', () => {
  it('Abstimmungssicht: genau die erlaubten Schluessel, nur die eigene Stimme', () => {
    const s = cast(cast(make(3), 'p0', 0, 'p2'), 'p1', 0, 'p0');
    const v = vote(s, 'p0');
    expect(Object.keys(v).sort()).toEqual(['dur', 'endsAt', 'k', 'mine', 'of', 'phase', 'text', 'total', 'voted'].sort());
    expect(v).toMatchObject({ mine: 'p2', voted: 2, total: 3 });
    expect(vote(s, 'p2')).toMatchObject({ mine: null, voted: 2 });
    expect(vote(s, 'zz')).toMatchObject({ mine: null });
  });

  it('Aufloesung: Balken je Spieler, Spitzenreiter, keine Zuordnung Waehler -> Ziel', () => {
    const s = cast(cast(cast(make(4), 'p0', 0, 'p2'), 'p1', 0, 'p2'), 'p2', 0, 'p0');
    const v = reveal(toReveal(s, 4), 'p0');
    expect(Object.keys(v).sort()).toEqual(['agree', 'dur', 'endsAt', 'k', 'mine', 'of', 'phase', 'rows', 'text', 'top'].sort());
    expect(v.rows).toEqual([
      { pid: 'p0', count: 1 },
      { pid: 'p1', count: 0 },
      { pid: 'p2', count: 2 },
      { pid: 'p3', count: 0 },
    ]);
    expect(v.top).toEqual(['p2']);
    expect(v.mine).toBe('p2');
    expect(v.agree).toBeNull();
    expect(reveal(toReveal(s, 4), 'p3').mine).toBeNull();
    expect(JSON.stringify(v)).not.toMatch(/"p[0-9]":/);
  });

  it('Gleichstand: alle Spitzenreiter; ohne Stimmen keiner', () => {
    const s = cast(cast(make(3), 'p0', 0, 'p1'), 'p1', 0, 'p0');
    expect(reveal(toReveal(s, 3)).top).toEqual(['p0', 'p1']);
    expect(reveal(toReveal(make(3), 3)).top).toEqual([]);
  });

  it('Duo: agree sagt Einigkeit (nur bei zwei gleichen Stimmen)', () => {
    expect(reveal(toReveal(cast(cast(make(2), 'p0', 0, 'p1'), 'p1', 0, 'p1'), 2)).agree).toBe(true);
    expect(reveal(toReveal(cast(cast(make(2), 'p0', 0, 'p0'), 'p1', 0, 'p1'), 2)).agree).toBe(false);
    expect(reveal(toReveal(cast(make(2), 'p0', 0, 'p0'), 2)).agree).toBe(false);
  });
});

describe('werwuerde Wertung ab 3 Spielern', () => {
  it('+1 fuer die Stimme auf den Spitzenreiter, +1 als Spitzenreiter', () => {
    const s = round(3, [{ p0: 'p2', p1: 'p2', p2: 'p0' }]);
    expect([score(s, 'p0'), score(s, 'p1'), score(s, 'p2')]).toEqual([1, 1, 1]);
    expect(werwuerde.label(s, 'p2')).toBe('1 Pkt');
  });

  it('Gleichstand: alle Spitzenreiter zaehlen', () => {
    const s = round(3, [{ p0: 'p1', p1: 'p0', p2: 'p2' }]);
    expect([score(s, 'p0'), score(s, 'p1'), score(s, 'p2')]).toEqual([2, 2, 2]);
  });

  it('Summe ueber Fragen, Selbstwahl zaehlt wie jede Stimme', () => {
    const s = round(3, [{ p0: 'p0', p1: 'p0', p2: 'p1' }, { p0: 'p1', p1: 'p1', p2: 'p1' }]);
    expect([score(s, 'p0'), score(s, 'p1'), score(s, 'p2')]).toEqual([3, 3, 1]);
  });

  it('wer nie stimmt, hat keinen Eintrag und Label "–", auch wenn er gewaehlt wurde', () => {
    const s = round(3, [{ p0: 'p2', p1: 'p2' }]);
    expect(werwuerde.result(s).has('p2')).toBe(false);
    expect(werwuerde.label(s, 'p2')).toBe('–');
    expect(score(s, 'p0')).toBe(1);
  });
});

describe('werwuerde Wertung zu zweit (D-P2-6)', () => {
  it('Einigkeit: beide +1, der Gewaehlte +1', () => {
    const s = round(2, [{ p0: 'p1', p1: 'p1' }]);
    expect([score(s, 'p0'), score(s, 'p1')]).toEqual([1, 2]);
  });

  it('Uneinigkeit: 0 fuer beide, aber beide haben einen Eintrag', () => {
    const s = round(2, [{ p0: 'p0', p1: 'p1' }]);
    expect(werwuerde.result(s).get('p0')).toBe(0);
    expect(werwuerde.result(s).get('p1')).toBe(0);
    expect(werwuerde.label(s, 'p0')).toBe('0 Pkt');
  });

  it('Einzelstimme: 0 und nur der Abstimmende hat einen Eintrag', () => {
    const s = round(2, [{ p0: 'p1' }]);
    expect(werwuerde.result(s).get('p0')).toBe(0);
    expect(werwuerde.result(s).has('p1')).toBe(false);
  });

  it('Summe: Host gewinnt 5:3 wenn beide immer den Host waehlen', () => {
    const v = { p0: 'p0', p1: 'p0' };
    const s = round(2, [v, v, v, v]);
    expect([score(s, 'p0'), score(s, 'p1')]).toEqual([8, 4]);
  });
});

describe('werwuerde n=1', () => {
  it('Punkte = Zahl der abgegebenen Stimmen', () => {
    expect(werwuerde.result(make(1)).size).toBe(0);
    const s = round(1, [{ p0: 'p0' }, { p0: 'p0' }]);
    expect(score(s, 'p0')).toBe(2);
    expect(werwuerde.label(s, 'p0')).toBe('2 Pkt');
  });

  it('allDone beendet die Abstimmung', () => {
    const s = cast(make(1), 'p0', 0, 'p0');
    expect(reveal(werwuerde.tick(s, NOW + 5, everyone(1)))).toMatchObject({ phase: 'reveal' });
  });
});

describe('werwuerde drinks', () => {
  it('ab 3 Spielern: Spitzenreiter je Frage +1 take, roh summiert', () => {
    const s = round(3, [{ p0: 'p2', p1: 'p2', p2: 'p0' }, { p0: 'p2', p1: 'p1', p2: 'p2' }]);
    const d = werwuerde.drinks?.(s) as DrinkPlan;
    expect(d.rows).toEqual({ p2: { take: 2, give: 0 } });
    expect(d.cheers).toBe(false);
  });

  it('Gleichstand: alle Spitzenreiter', () => {
    const s = round(3, [{ p0: 'p1', p1: 'p0', p2: 'p2' }]);
    expect(rowsOf(s)).toEqual({ p0: { take: 1, give: 0 }, p1: { take: 1, give: 0 }, p2: { take: 1, give: 0 } });
  });

  it('4-maliger Spitzenreiter ist roh 4 und landet nach capDrinks bei 3', () => {
    const v = { p0: 'p2', p1: 'p2', p2: 'p2' };
    const s = round(3, [v, v, v, v]);
    const d = werwuerde.drinks?.(s) as DrinkPlan;
    expect(d.rows.p2).toEqual({ take: 4, give: 0 });
    expect(capDrinks(d, everyone(3)).rows.p2).toEqual({ take: 3, give: 0 });
  });

  it('Duo: Einigkeit gibt dem Gewaehlten +1, Uneinigkeit und Einzelstimme niemandem', () => {
    const agree = werwuerde.drinks?.(round(2, [{ p0: 'p1', p1: 'p1' }])) as DrinkPlan;
    expect(agree.rows).toEqual({ p1: { take: 1, give: 0 } });
    expect(agree.cheers).toBe(false);
    const split = werwuerde.drinks?.(round(2, [{ p0: 'p0', p1: 'p1' }])) as DrinkPlan;
    expect(split).toEqual({ rows: {}, cheers: true });
    const single = werwuerde.drinks?.(round(2, [{ p0: 'p0' }])) as DrinkPlan;
    expect(single).toEqual({ rows: {}, cheers: true });
  });

  it('cheers genau dann, wenn niemand trinkt', () => {
    expect(werwuerde.drinks?.(make(3))).toEqual({ rows: {}, cheers: true });
    expect(werwuerde.drinks?.(make(8))).toEqual({ rows: {}, cheers: true });
  });

  it('n=1: leerer Plan', () => {
    expect(werwuerde.drinks?.(round(1, [{ p0: 'p0' }]))).toEqual({ rows: {}, cheers: false });
    expect(werwuerde.drinks?.(make(1))).toEqual({ rows: {}, cheers: false });
  });
});
