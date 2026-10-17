import { describe, expect, it } from 'vitest';
import { createEngine } from '../engine/party';
import type { Party } from '../engine/types';
import { GAMES, gamesFor } from './index';
import { QUESTIONS } from './schaetzfuchs/questions';
import { GAME_IDS, type GameId } from './types';

const ACCENTS = ['lime', 'hot', 'cyan', 'orange'];

describe('Registry', () => {
  it('GAMES[id].id === id, Akzent aus den vier Spielfarben, Titel und Regel gesetzt', () => {
    for (const id of GAME_IDS) {
      expect(GAMES[id].id).toBe(id);
      expect(ACCENTS).toContain(GAMES[id].accent);
      expect(GAMES[id].title).not.toBe('');
      expect(GAMES[id].rule).not.toBe('');
    }
    expect(Object.keys(GAMES).sort()).toEqual([...GAME_IDS].sort());
  });

  it('die genaue Liste der zwoelf Spiele, pokerface und erklaerbaer am Ende, Akzente lime und orange', () => {
    expect([...GAME_IDS]).toEqual([
      'blitz',
      'hammer',
      'farbfalle',
      'schaetzfuchs',
      'gleichklang',
      'werwuerde',
      'bombe',
      'stopp',
      'luegenbaron',
      'verraeter',
      'pokerface',
      'erklaerbaer',
    ]);
    expect(GAMES.gleichklang.accent).toBe('cyan');
    expect(GAMES.werwuerde.accent).toBe('hot');
    expect(GAMES.bombe.accent).toBe('orange');
    expect(GAMES.stopp.accent).toBe('lime');
    expect(GAMES.luegenbaron.accent).toBe('hot');
    expect(GAMES.verraeter.accent).toBe('cyan');
    expect(GAMES.pokerface.accent).toBe('lime');
    expect(GAMES.erklaerbaer.accent).toBe('orange');
    for (const id of ['luegenbaron', 'verraeter', 'pokerface', 'erklaerbaer'] as const) {
      expect(GAMES[id].drinks, id).toBeUndefined();
      expect(GAMES[id].drinkOnly, id).toBeUndefined();
    }
    expect(typeof GAMES.werwuerde.drinks).toBe('function');
    expect(GAMES.gleichklang.drinks).toBeUndefined();
    expect(GAMES.bombe.drinks).toBeUndefined();
    expect(GAMES.stopp.drinks).toBeUndefined();
  });

  it('drinkOnly ist nur true oder fehlt, drinks nur eine Funktion oder fehlt', () => {
    for (const id of GAME_IDS) {
      expect([true, undefined]).toContain(GAMES[id].drinkOnly);
      expect(['function', 'undefined']).toContain(typeof GAMES[id].drinks);
    }
  });
});

describe('gamesFor', () => {
  it('liefert ohne only alle Spiele', () => {
    expect(Object.keys(gamesFor()).sort()).toEqual([...GAME_IDS].sort());
    expect(Object.keys(gamesFor(undefined)).sort()).toEqual([...GAME_IDS].sort());
  });

  it('liefert mit only genau das eine Spiel', () => {
    for (const id of GAME_IDS) {
      const reg = gamesFor(id);
      expect(Object.keys(reg)).toEqual([id]);
      expect(reg[id]).toBe(GAMES[id]);
    }
  });

  it('die Ein-Spiel-Registry taugt für die Engine', () => {
    const one = createEngine(gamesFor('hammer'));
    let p = one.create('ABCD', 5, 'h', { dev: true, speed: 1 });
    p = one.hello(p, 'h', 'Host', 0).p;
    p = one.control(p, { a: 'start' }, 0);
    expect(p.order).toEqual(['hammer', 'hammer', 'hammer', 'hammer', 'hammer']);
  });
});

const HOST = 'h';
const GUEST = 'g';
const eng = createEngine(GAMES);

function lobby(engine: ReturnType<typeof createEngine>, o: { speed: number; guest: boolean; rounds: 3 | 5 | 8 }): Party {
  let p = engine.create('ABCD', 31, HOST, { dev: true, speed: o.speed });
  p = engine.hello(p, HOST, 'Host', 0).p;
  if (o.guest) p = engine.hello(p, GUEST, 'Gast', 0).p;
  return engine.control(engine.control(p, { a: 'rounds', n: o.rounds }, 0), { a: 'start' }, 0);
}

const step = (engine: ReturnType<typeof createEngine>, p: Party, t: number): Party =>
  engine.tick(p.players.reduce((q, x) => engine.seen(q, x.pid, t), p), t);

function until(engine: ReturnType<typeof createEngine>, p: Party, t0: number, k: Party['phase']['k']) {
  let t = t0;
  let q = p;
  for (let n = 0; q.phase.k !== k; n++) {
    if (n > 3000) throw new Error(`${k} nicht erreicht`);
    t += 100;
    q = step(engine, q, t);
  }
  return { p: q, t };
}

describe('Integration: ganze Party nur mit Ticks', () => {
  it('erreicht das Podium; order liegt im Normalpool ohne Wiederholung, Intro traegt Titel und Akzent', () => {
    let p = lobby(eng, { speed: 10, guest: false, rounds: 5 });
    const normal = GAME_IDS.filter((id) => !GAMES[id].drinkOnly);
    expect(p.order).toHaveLength(5);
    for (const id of p.order) expect(normal).toContain(id);
    p.order.forEach((id, r) => expect(r === 0 || id !== p.order[r - 1]).toBe(true));
    expect(new Set(p.order).size).toBe(Math.min(5, normal.length));
    const intros = new Map<number, ReturnType<typeof eng.viewFor>>();
    let t = 0;
    for (let n = 0; p.phase.k !== 'podium'; n++) {
      if (n > 3000) throw new Error('Podium nicht erreicht');
      if (p.phase.k === 'intro' && !intros.has(p.phase.r)) intros.set(p.phase.r, eng.viewFor(p, HOST, t));
      t += 100;
      p = step(eng, p, t);
    }
    expect(intros.size).toBe(5);
    p.order.forEach((id, r) => {
      expect(intros.get(r)).toMatchObject({ s: 'intro', r, game: id, title: GAMES[id].title, accent: GAMES[id].accent });
      expect(ACCENTS).toContain(GAMES[id].accent);
    });
    expect(p.history).toHaveLength(5);
  });

  it('mit Trinkmodus darf order auch drinkOnly-Spiele enthalten, ohne nie', () => {
    const drinkOnly = GAME_IDS.filter((id) => GAMES[id].drinkOnly);
    for (let seed = 0; seed < 50; seed++) {
      const mk = (on: boolean) => {
        let p = eng.create('ABCD', seed, HOST, { dev: true, speed: 10 });
        p = eng.hello(p, HOST, 'Host', 0).p;
        p = eng.control(p, { a: 'rounds', n: 8 }, 0);
        return eng.control(eng.control(p, { a: 'drinking', on }, 0), { a: 'start' }, 0).order;
      };
      for (const id of mk(false)) expect(drinkOnly).not.toContain(id);
      expect(mk(true)).toHaveLength(8);
    }
  });
});

type Wire = (p: Party, t: number) => { host: unknown[]; guest: unknown[] };

const gview = (e: typeof eng, p: Party, t: number): any => {
  const v = e.viewFor(p, HOST, t);
  if (v.s !== 'game') throw new Error('keine Spielsicht');
  return v.g;
};

const WIRES: Partial<Record<GameId, Wire>> = {
  blitz: () => ({
    host: [0, 1, 2].map((i) => ({ i, ms: 200 })),
    guest: [0, 1, 2].map((i) => ({ i, ms: 600 })),
  }),
  hammer: () => ({ host: [{ n: 50, final: true }], guest: [{ n: 20, final: true }] }),
  farbfalle: (p, t) => {
    const seq: [number, number][] = gview(eng, p, t).seq;
    return {
      host: [...[0, 1, 2, 3, 4].map((i) => ({ i, c: (seq[i] as [number, number])[1] })), { done: true }],
      guest: [{ i: 0, c: ((seq[0] as [number, number])[1] + 1) % 4 }, { done: true }],
    };
  },
  schaetzfuchs: (p, t) => {
    const q = gview(eng, p, t).q as string;
    const a = (QUESTIONS.find((x) => x.q === q) as { a: number }).a;
    return { host: [{ guess: a }], guest: [{ guess: a * 3 }] };
  },
  gleichklang: () => ({ host: [{ k: 0, i: 0, ms: 100 }], guest: [{ k: 0, i: 0, ms: 900 }] }),
  werwuerde: () => ({ host: [{ k: 0, to: HOST }], guest: [{ k: 0, to: HOST }] }),
  bombe: () => ({ host: [{ b: 0, n: 3, cash: true }], guest: [{ b: 0, n: 2, cash: true }] }),
  stopp: () => ({ host: [{ k: 0, devMs: 100 }], guest: [{ k: 0, devMs: 900 }] }),
};

type Stage = (s: any) => { key: string; host: unknown[]; guest: unknown[] } | null;

const STAGED: Partial<Record<GameId, Stage>> = {
  luegenbaron: (s) => {
    const hostTells = s.narrators[s.k] === HOST;
    const key = `${s.phase}${s.k}`;
    const none = { key, host: [], guest: [] };
    if (s.phase === 'card') return { key, host: hostTells ? [{ a: 'mode', k: s.k, truth: false }] : [], guest: [] };
    if (s.phase === 'tell') return { key, host: hostTells ? [{ a: 'done', k: s.k }] : [], guest: [] };
    if (s.phase !== 'vote') return null;
    return hostTells
      ? { ...none, guest: [{ a: 'tip', k: s.k, truth: true }] }
      : { ...none, host: [{ a: 'tip', k: s.k, truth: s.truth[s.k] }] };
  },
  verraeter: (s) =>
    s.phase === 'vote' ? { key: 'vote', host: [{ a: 'tip', same: s.same }], guest: [{ a: 'tip', same: !s.same }] } : null,
  pokerface: (s) => {
    if (s.phase === 'talk') return { key: 'talk', host: [{ a: 'done' }], guest: [{ a: 'done' }] };
    if (s.phase !== 'guess') return null;
    return { key: 'guess', host: [{ a: 'tip', i: s.answer[HOST] }], guest: [{ a: 'tip', i: (s.answer[GUEST] + 1) % 4 }] };
  },
  erklaerbaer: (s) => {
    if (s.phase !== 'explain') return null;
    const mine = s.explainers[s.k] as string;
    const other = mine === HOST ? GUEST : HOST;
    const c = s.pos as number;
    const first = { a: 'hit', k: s.k, c, to: other };
    const second = mine === HOST ? { a: 'hit', k: s.k, c: c + 1, to: other } : { a: 'taboo', k: s.k, c: c + 1 };
    return {
      key: `turn${s.k}`,
      host: mine === HOST ? [first, second] : [],
      guest: mine === GUEST ? [first, second] : [],
    };
  },
};

describe('Integration: Draht-Payloads, besserer Spieler gewinnt', () => {
  for (const id of GAME_IDS)
    it(`${id}: Platz 1 und 5 Punkte`, () => {
      const one = createEngine({ [id]: GAMES[id] });
      const start = until(one, lobby(one, { speed: 10, guest: true, rounds: 3 }), 0, 'play');
      let p = start.p;
      let t = start.t;
      const send = (pid: string, payloads: unknown[]) => {
        for (const raw of payloads) p = one.input(p, pid, 0, JSON.parse(JSON.stringify(raw)), t);
      };
      const wire = WIRES[id];
      const stage = STAGED[id];
      expect(Boolean(wire) !== Boolean(stage), `${id}: genau eine Draht-Zeile`).toBe(true);
      if (wire) {
        const w = wire(p, t);
        send(HOST, w.host);
        send(GUEST, w.guest);
      }
      const sent = new Set<string>();
      for (let n = 0; p.phase.k !== 'result'; n++) {
        if (n > 3000) throw new Error('result nicht erreicht');
        const at = p.phase.k === 'play' && stage ? stage(p.phase.state) : null;
        if (at && !sent.has(at.key)) {
          sent.add(at.key);
          send(HOST, at.host);
          send(GUEST, at.guest);
        }
        t += 100;
        p = step(one, p, t);
      }
      const rec = p.history[0];
      expect(rec?.places).toEqual({ [HOST]: 1, [GUEST]: 2 });
      expect(rec?.points[HOST]).toBe(5);
    });
});
