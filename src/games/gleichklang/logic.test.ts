import { describe, expect, it } from 'vitest';
import { scale } from '../../engine/durations';
import { gleichklang, GK_QUESTIONS, type GleichklangState, type GleichklangView } from './logic';
import { PROMPTS } from './prompts';

type Ask = Extract<GleichklangView, { phase: 'ask' }>;
type Reveal = Extract<GleichklangView, { phase: 'reveal' }>;

const NOW = 5000;
const players = (n: number) => Array.from({ length: n }, (_, i) => ({ pid: `p${i}`, name: `P${i}`, color: i }));
const pidsOf = (n: number) => players(n).map((p) => p.pid);
const make = (n = 3, seed = 3, speed = 1): GleichklangState =>
  gleichklang.init(players(n), seed, NOW, { speed, drinking: false });
const send = (s: GleichklangState, pid: string, k: number, i: number, ms = 500, now = NOW): GleichklangState => {
  const inp = gleichklang.parseInput({ k, i, ms });
  if (inp === null) throw new Error('ungueltig');
  return gleichklang.input(s, pid, inp, now);
};
const view = (s: GleichklangState, pid: string, now = NOW): GleichklangView => gleichklang.view(s, pid, now);
const ask = (s: GleichklangState, pid = 'p0') => view(s, pid) as Ask;
const reveal = (s: GleichklangState, pid = 'p0') => view(s, pid) as Reveal;
const everyone = (n: number) => new Set(pidsOf(n));
const toReveal = (s: GleichklangState, n: number): GleichklangState => gleichklang.tick(s, s.endsAt, everyone(n));
const nextAsk = (s: GleichklangState, n: number): GleichklangState => {
  const r = toReveal(s, n);
  return gleichklang.tick(r, r.endsAt, everyone(n));
};

function questionsOf(n: number, seed: number): string[] {
  let s = make(n, seed);
  const out: string[] = [];
  for (let k = 0; k < GK_QUESTIONS; k++) {
    out.push(ask(s).q);
    s = nextAsk(s, n);
  }
  return out;
}

describe('gleichklang Fragen', () => {
  it('6 verschiedene Fragen je Runde, je Seed deterministisch', () => {
    expect(GK_QUESTIONS).toBe(6);
    for (let seed = 0; seed < 20; seed++) {
      const qs = questionsOf(3, seed);
      expect(new Set(qs).size).toBe(6);
      expect(questionsOf(3, seed)).toEqual(qs);
    }
    expect(new Set(Array.from({ length: 20 }, (_, seed) => questionsOf(3, seed)[0])).size).toBeGreaterThan(3);
  });

  it('zu zweit nur duo-Fragen, sonst die ganze Bank', () => {
    const duo = new Set(PROMPTS.filter((p) => p.duo).map((p) => p.q));
    const all = new Set(PROMPTS.map((p) => p.q));
    const seen = new Set<string>();
    for (let seed = 0; seed < 40; seed++) {
      for (const q of questionsOf(2, seed)) expect(duo.has(q), q).toBe(true);
      for (const q of questionsOf(3, seed)) {
        expect(all.has(q), q).toBe(true);
        seen.add(q);
      }
    }
    expect([...seen].some((q) => !duo.has(q))).toBe(true);
  });

  it('Optionen der Sicht stammen aus der Bank, alle Spieler sehen dieselbe Frage', () => {
    const s = make(3, 9);
    const v = ask(s);
    expect(PROMPTS.find((p) => p.q === v.q)?.opts).toEqual(v.opts);
    expect(ask(s, 'p2').q).toBe(v.q);
  });
});

describe('gleichklang Ablauf', () => {
  for (const speed of [1, 10])
    it(`Frage 7 s, Aufloesung 3 s, skaliert (speed ${speed})`, () => {
      const s = make(3, 3, speed);
      expect(ask(s)).toMatchObject({ phase: 'ask', k: 0, of: 6, dur: scale(7000, speed), endsAt: NOW + scale(7000, speed) });
      expect(gleichklang.tick(s, s.endsAt - 1, everyone(3))).toBe(s);
      const r = gleichklang.tick(s, s.endsAt, everyone(3));
      expect(reveal(r)).toMatchObject({ phase: 'reveal', k: 0, dur: scale(3000, speed), endsAt: s.endsAt + scale(3000, speed) });
      const a = gleichklang.tick(r, r.endsAt, everyone(3));
      expect(ask(a)).toMatchObject({ phase: 'ask', k: 1, endsAt: r.endsAt + scale(7000, speed) });
    });

  it('allDone beendet die Fragephase sofort, Offline zaehlt nicht, ohne Antworten nie', () => {
    let s = send(send(make(3), 'p0', 0, 0), 'p1', 0, 0);
    expect(gleichklang.tick(s, NOW + 5, everyone(3))).toBe(s);
    expect(reveal(gleichklang.tick(s, NOW + 5, new Set(['p0', 'p1'])))).toMatchObject({ phase: 'reveal', k: 0 });
    s = make(3);
    expect(gleichklang.tick(s, NOW + 5, new Set())).toBe(s);
  });

  it('done erst nach der Aufloesung der letzten Frage', () => {
    let s = make(3);
    for (let k = 0; k < GK_QUESTIONS; k++) {
      expect(gleichklang.done(s, s.endsAt + 1_000_000), `Frage ${k}`).toBe(false);
      s = toReveal(s, 3);
      expect(gleichklang.done(s, s.endsAt - 1), `Aufloesung ${k}`).toBe(false);
      if (k < GK_QUESTIONS - 1) {
        expect(gleichklang.done(s, s.endsAt)).toBe(false);
        s = gleichklang.tick(s, s.endsAt, everyone(3));
      }
    }
    expect(gleichklang.done(s, s.endsAt - 1)).toBe(false);
    expect(gleichklang.done(s, s.endsAt)).toBe(true);
    expect(gleichklang.tick(s, s.endsAt + 5, everyone(3))).toBe(s);
  });
});

describe('gleichklang parseInput und input', () => {
  it('parseInput: k, i ganzzahlig, ms endlich und auf 0..7000 gekappt', () => {
    expect(gleichklang.parseInput({ k: 0, i: 1, ms: 250 })).toEqual({ k: 0, i: 1, ms: 250 });
    expect(gleichklang.parseInput({ k: 0, i: 1, ms: 99_999 })).toEqual({ k: 0, i: 1, ms: 7000 });
    expect(gleichklang.parseInput({ k: 0, i: 1, ms: -5 })).toEqual({ k: 0, i: 1, ms: 0 });
    for (const bad of [
      { k: '0', i: 1, ms: 5 },
      { k: 0, i: 1.5, ms: 5 },
      { k: 0, i: -1, ms: 5 },
      { k: -1, i: 0, ms: 5 },
      { k: 0, i: 0 },
      { k: 0, i: 0, ms: Number.NaN },
      { k: 0, i: 0, ms: Infinity },
      { i: 0, ms: 5 },
      { k: 0, ms: 5 },
      { k: 0, i: 0, ms: '5' },
    ])
      expect(gleichklang.parseInput(bad)).toBeNull();
  });

  it('nur die laufende Frage, nur gueltige Option, nur einmal, nur in der Fragephase', () => {
    const s = make(3);
    const n = ask(s).opts.length;
    expect(send(s, 'p0', 1, 0)).toBe(s);
    expect(send(s, 'p0', 0, n)).toBe(s);
    expect(send(s, 'zz', 0, 0)).toBe(s);
    const a = send(s, 'p0', 0, 0);
    expect(a).not.toBe(s);
    expect(send(a, 'p0', 0, 1)).toBe(a);
    expect(ask(a, 'p0').mine).toBe(0);
    const r = toReveal(a, 3);
    expect(send(r, 'p1', 0, 0)).toBe(r);
  });

  it('keine Nachfrist: bis zum tick gilt die Antwort, danach nicht', () => {
    const s = make(3);
    expect(ask(send(s, 'p0', 0, 0, 100, s.endsAt + 500), 'p0').mine).toBe(0);
    const r = toReveal(s, 3);
    expect(send(r, 'p0', 0, 0, 100, r.endsAt - 1)).toBe(r);
  });
});

describe('gleichklang Sicht', () => {
  it('Fragesicht hat genau die erlaubten Schluessel: eigene Wahl und Zaehler, keine Zaehlung je Option', () => {
    let s = send(send(make(3), 'p0', 0, 1), 'p1', 0, 1);
    const v = view(s, 'p0');
    expect(Object.keys(v).sort()).toEqual(['answered', 'dur', 'endsAt', 'k', 'mine', 'of', 'opts', 'phase', 'q', 'total'].sort());
    expect(v).toMatchObject({ mine: 1, answered: 2, total: 3 });
    expect(view(s, 'p2')).toMatchObject({ mine: null, answered: 2, total: 3 });
    expect(view(s, 'zz')).toMatchObject({ mine: null, answered: 2 });
    s = send(s, 'p2', 0, 0);
    expect(JSON.stringify(view(s, 'p2'))).not.toMatch(/p[0-9]/);
  });

  it('Aufloesung: Gruppen mit Spielern, Hauptstrom, ohne Antwort, Team', () => {
    let s = make(4);
    s = send(send(send(s, 'p0', 0, 0), 'p1', 0, 0), 'p2', 0, 1);
    const v = reveal(toReveal(s, 4), 'p3');
    expect(Object.keys(v).sort()).toEqual(
      ['dur', 'endsAt', 'groups', 'k', 'main', 'mine', 'none', 'of', 'opts', 'phase', 'q', 'team'].sort(),
    );
    expect(v.groups).toEqual([
      { i: 0, pids: ['p0', 'p1'] },
      { i: 1, pids: ['p2'] },
    ]);
    expect(v.main).toEqual([0]);
    expect(v.none).toEqual(['p3']);
    expect(v.mine).toBeNull();
    expect(reveal(toReveal(s, 4), 'p2').mine).toBe(1);
    expect(v.team).toEqual({ hit: 0, asked: 1 });
  });

  it('Hauptstrom: alle groessten Gruppen ab 2 Leuten, bei lauter Einzelnen keiner', () => {
    let s = make(4);
    s = send(send(send(send(s, 'p0', 0, 0), 'p1', 0, 0), 'p2', 0, 1), 'p3', 0, 1);
    expect(reveal(toReveal(s, 4)).main).toEqual([0, 1]);
    s = make(3);
    s = send(send(send(s, 'p0', 0, 0), 'p1', 0, 1), 'p2', 0, 2);
    const v = reveal(toReveal(s, 3));
    expect(v.main).toEqual([]);
    expect(v.team.hit).toBe(0);
  });

  it('Team: Fragen, in denen alle Antwortenden (mindestens 2) gleich gewaehlt haben', () => {
    let s = make(3);
    s = send(send(s, 'p0', 0, 0), 'p1', 0, 0);
    s = nextAsk(s, 3);
    s = send(send(s, 'p0', 1, 0), 'p1', 1, 1);
    s = nextAsk(s, 3);
    s = send(s, 'p2', 2, 0);
    s = nextAsk(s, 3);
    s = send(send(send(s, 'p0', 3, 0), 'p1', 3, 0), 'p2', 3, 0);
    const v = reveal(toReveal(s, 3));
    expect(v.k).toBe(3);
    expect(v.team).toEqual({ hit: 2, asked: 4 });
  });

  it('Reload: die eigene Wahl steht in der Sicht', () => {
    const s = send(make(3), 'p1', 0, 1);
    expect(ask(s, 'p1').mine).toBe(1);
    expect(ask(nextAsk(s, 3), 'p1').mine).toBeNull();
  });
});

describe('gleichklang Wertung', () => {
  const score = (s: GleichklangState, pid: string) => gleichklang.result(s).get(pid);

  it('n>=3: round(100 * Summe Treffer-Anteil, Teiler n-1)', () => {
    let s = send(send(send(make(3), 'p0', 0, 0), 'p1', 0, 0), 'p2', 0, 1);
    expect([score(s, 'p0'), score(s, 'p1'), score(s, 'p2')]).toEqual([50, 50, 0]);
    s = send(send(send(send(make(4), 'p0', 0, 0), 'p1', 0, 0), 'p2', 0, 1), 'p3', 0, 1);
    expect(score(s, 'p0')).toBe(33);
    s = send(send(send(make(4), 'p0', 0, 0), 'p1', 0, 0), 'p2', 0, 0);
    expect([score(s, 'p0'), score(s, 'p1'), score(s, 'p2')]).toEqual([67, 67, 67]);
    s = send(send(send(send(make(4), 'p0', 0, 0), 'p1', 0, 0), 'p2', 0, 0), 'p3', 0, 0);
    expect(score(s, 'p3')).toBe(100);
  });

  it('n>=3: Summe ueber die Fragen, Label zaehlt Fragen mit mindestens einem Treffer', () => {
    let s = make(3);
    s = send(send(s, 'p0', 0, 0), 'p1', 0, 0);
    s = nextAsk(s, 3);
    s = send(send(send(s, 'p0', 1, 0), 'p2', 1, 0), 'p1', 1, 1);
    s = nextAsk(s, 3);
    s = send(send(send(s, 'p0', 2, 0), 'p1', 2, 0), 'p2', 2, 0);
    expect([score(s, 'p0'), score(s, 'p1'), score(s, 'p2')]).toEqual([200, 150, 150]);
    expect([gleichklang.label(s, 'p0'), gleichklang.label(s, 'p1'), gleichklang.label(s, 'p2')]).toEqual([
      '3 Treffer',
      '2 Treffer',
      '2 Treffer',
    ]);
  });

  it('ohne Antwort: kein Eintrag, Label "–", 0 Treffer bei Antwort ohne Gleichen', () => {
    const s = send(make(3), 'p0', 0, 0);
    expect(gleichklang.result(s).has('p1')).toBe(false);
    expect(gleichklang.label(s, 'p1')).toBe('–');
    expect(gleichklang.label(s, 'zz')).toBe('–');
    expect(score(s, 'p0')).toBe(0);
    expect(gleichklang.label(s, 'p0')).toBe('0 Treffer');
  });

  it('Duo: 100 je Treffer, bei Abweichung 0', () => {
    let s = send(send(make(2), 'p0', 0, 0, 300), 'p1', 0, 0, 800);
    expect(score(s, 'p0')).toBe(101);
    expect(score(s, 'p1')).toBe(100);
    s = nextAsk(s, 2);
    s = send(send(s, 'p0', 1, 0, 300), 'p1', 1, 1, 300);
    expect(score(s, 'p0')).toBe(101);
    expect(score(s, 'p1')).toBe(100);
    expect([gleichklang.label(s, 'p0'), gleichklang.label(s, 'p1')]).toEqual(['1 Treffer', '1 Treffer']);
  });

  it('Duo-Tiebreak: die spaeter eingetroffene Antwort mit kleinerem ms gewinnt (D-P2-7)', () => {
    const early = send(make(2), 'p1', 0, 0, 900, NOW + 10);
    const s = send(early, 'p0', 0, 0, 100, NOW + 2000);
    expect(score(s, 'p0')).toBe(101);
    expect(score(s, 'p1')).toBe(100);
    const wrongWay = send(send(make(2), 'p0', 0, 0, 900, NOW + 2000), 'p1', 0, 0, 100, NOW + 10);
    expect(score(wrongWay, 'p1')).toBe(101);
    expect(score(wrongWay, 'p0')).toBe(100);
  });

  it('Duo-Tiebreak: gleiche ms nach der Kappung geben niemandem etwas, je Treffer-Frage zaehlt', () => {
    let s = send(send(make(2), 'p0', 0, 0, 7000), 'p1', 0, 0, 99_999);
    expect([score(s, 'p0'), score(s, 'p1')]).toEqual([100, 100]);
    s = send(send(make(2), 'p0', 0, 0, 0), 'p1', 0, 0, -50);
    expect([score(s, 'p0'), score(s, 'p1')]).toEqual([100, 100]);
    s = send(send(make(2), 'p0', 0, 0, 100), 'p1', 0, 0, 200);
    s = nextAsk(s, 2);
    s = send(send(s, 'p0', 1, 1, 400), 'p1', 1, 1, 300);
    expect([score(s, 'p0'), score(s, 'p1')]).toEqual([201, 201]);
  });

  it('Duo: nur eine Antwort gibt 0 und einen Eintrag nur fuer den Antwortenden', () => {
    const s = send(make(2), 'p0', 0, 0);
    expect(gleichklang.result(s).get('p0')).toBe(0);
    expect(gleichklang.result(s).has('p1')).toBe(false);
  });

  it('n=1: Zahl der Antworten, Label "T Treffer"', () => {
    let s = make(1);
    expect(gleichklang.result(s).size).toBe(0);
    s = send(s, 'p0', 0, 0);
    s = nextAsk(s, 1);
    s = send(s, 'p0', 1, 0);
    expect(score(s, 'p0')).toBe(2);
    expect(gleichklang.label(s, 'p0')).toBe('2 Treffer');
  });

  it('n=1: allDone beendet die Frage', () => {
    const s = send(make(1), 'p0', 0, 0);
    expect(reveal(gleichklang.tick(s, NOW + 5, everyone(1)))).toMatchObject({ phase: 'reveal' });
  });
});
