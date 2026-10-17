import { GAME_IDS, type GameDef, type GameId } from '../games/types';
import { capDrinks, placeDrinks } from './drinks';
import { DRINK_EXTRA, INTRO, OFFLINE, RESULT, scale } from './durations';
import { mix32 } from './prng';
import { planOrder } from './rounds';
import { rank } from './scoring';
import type { HelloResult, HostAction, Party, Phase, Player, RoundRecord, Rounds } from './types';
import type { PlayerView, View } from './view';

const MAX_PLAYERS = 8;
const MAX_NAME = 12;
const ROUNDS: readonly number[] = [3, 5, 8];

function must<T>(x: T | undefined, what: string): T {
  if (x === undefined) throw new Error(what);
  return x;
}

const sorted = <T extends { place: number }>(xs: T[]): T[] => [...xs].sort((a, b) => a.place - b.place);

export function createEngine(games: Record<string, GameDef<any, any, any>>) {
  const ids = GAME_IDS.filter((id) => id in games);
  if (ids.length === 0) throw new Error('Registry enthält kein Spiel');
  const def = (id: GameId) => must(games[id], `unbekanntes Spiel ${id}`);
  const defAt = (p: Party, r: number) => def(must(p.order[r], `keine Runde ${r}`));
  const onlineSet = (p: Party): Set<string> => new Set(p.players.filter((x) => x.online).map((x) => x.pid));
  const minPlayers = (p: Party) => (p.dev ? 1 : 2);
  const canStart = (p: Party) => p.phase.k === 'lobby' && onlineSet(p).size >= minPlayers(p);
  const intro = (p: Party, r: number, now: number): Party => ({
    ...p,
    phase: { k: 'intro', r, until: now + scale(INTRO, p.speed) },
  });
  const poolOf = (p: Party): GameId[] => {
    const pool = ids.filter((id) => p.drinking || !def(id).drinkOnly);
    return pool.length > 0 ? pool : ids;
  };
  const resetTotals = (players: Player[]) => players.map((x) => ({ ...x, total: 0 }));

  function refresh(p: Party, now: number): Party {
    const stale = (x: Player) => x.pid !== p.hostPid && x.online && now - x.lastSeen > OFFLINE;
    if (!p.players.some(stale)) return p;
    const players =
      p.phase.k === 'lobby'
        ? p.players.filter((x) => !stale(x))
        : p.players.map((x) => (stale(x) ? { ...x, online: false } : x));
    return { ...p, players };
  }

  function finishRound(p: Party, r: number, state: unknown, now: number): Party {
    const d = defAt(p, r);
    const pids = p.players.map((x) => x.pid);
    const online = onlineSet(p);
    const { places, points } = rank(d.result(state), pids, online);
    const record: RoundRecord = {
      gameId: d.id,
      places,
      points,
      labels: Object.fromEntries(pids.map((pid) => [pid, d.label(state, pid)])),
      drinks: p.drinking ? capDrinks(d.drinks ? d.drinks(state) : placeDrinks(places, online), online) : null,
    };
    return {
      ...p,
      players: p.players.map((x) => ({ ...x, total: x.total + (points[x.pid] ?? 0) })),
      history: [...p.history, record],
      phase: { k: 'result', r, until: now + scale(RESULT + (p.drinking ? DRINK_EXTRA : 0), p.speed) },
    };
  }

  const afterResult = (p: Party, r: number, now: number): Party =>
    r + 1 < p.rounds ? intro(p, r + 1, now) : { ...p, phase: { k: 'podium' } };

  function tick(p0: Party, now: number): Party {
    const p = refresh(p0, now);
    const ph = p.phase;
    switch (ph.k) {
      case 'intro': {
        if (now < ph.until) return p;
        const players = p.players.map(({ pid, name, color }) => ({ pid, name, color }));
        const state = defAt(p, ph.r).init(players, mix32(p.seed, ph.r), now, {
          speed: p.speed,
          drinking: p.drinking,
        });
        return { ...p, phase: { k: 'play', r: ph.r, started: now, state } };
      }
      case 'play': {
        const d = defAt(p, ph.r);
        const state = d.tick(ph.state, now, onlineSet(p));
        if (d.done(state, now)) return finishRound(p, ph.r, state, now);
        return state === ph.state ? p : { ...p, phase: { ...ph, state } };
      }
      case 'result':
        return now < ph.until ? p : afterResult(p, ph.r, now);
      default:
        return p;
    }
  }

  function hello(p: Party, pid: string, rawName: string, now: number): { p: Party; res: HelloResult } {
    if (p.players.some((x) => x.pid === pid)) {
      const players = p.players.map((x) => (x.pid === pid ? { ...x, online: true, lastSeen: now } : x));
      return { p: { ...p, players }, res: { ok: true, pid } };
    }
    const name = rawName.trim();
    if (name.length < 1 || name.length > MAX_NAME) return { p, res: { ok: false, reason: 'badname' } };
    if (p.phase.k !== 'lobby') return { p, res: { ok: false, reason: 'started' } };
    if (p.players.length >= MAX_PLAYERS) return { p, res: { ok: false, reason: 'full' } };
    const taken = new Set(p.players.map((x) => x.name.toLowerCase()));
    let unique = name;
    for (let i = 2; taken.has(unique.toLowerCase()); i++) unique = `${name} ${i}`;
    const used = new Set(p.players.map((x) => x.color));
    let color = 0;
    while (used.has(color)) color++;
    const player: Player = { pid, name: unique, color, online: true, lastSeen: now, total: 0 };
    return { p: { ...p, players: [...p.players, player] }, res: { ok: true, pid } };
  }

  function seen(p: Party, pid: string, now: number): Party {
    if (!p.players.some((x) => x.pid === pid)) return p;
    return { ...p, players: p.players.map((x) => (x.pid === pid ? { ...x, online: true, lastSeen: now } : x)) };
  }

  function disconnect(p: Party, pid: string, _now: number): Party {
    const who = p.players.find((x) => x.pid === pid);
    if (!who || pid === p.hostPid) return p;
    if (p.phase.k === 'lobby') return { ...p, players: p.players.filter((x) => x.pid !== pid) };
    if (!who.online) return p;
    return { ...p, players: p.players.map((x) => (x.pid === pid ? { ...x, online: false } : x)) };
  }

  function input(p: Party, pid: string, round: number, payload: unknown, now: number): Party {
    const ph = p.phase;
    if (ph.k !== 'play' || ph.r !== round || !p.players.some((x) => x.pid === pid)) return p;
    const d = defAt(p, ph.r);
    const i = d.parseInput(payload);
    if (i === null) return p;
    const state = d.input(ph.state, pid, i, now);
    return state === ph.state ? p : { ...p, phase: { ...ph, state } };
  }

  function control(p: Party, act: HostAction, now: number): Party {
    const k = p.phase.k;
    switch (act.a) {
      case 'rounds':
        return k === 'lobby' && ROUNDS.includes(act.n) ? { ...p, rounds: act.n as Rounds } : p;
      case 'drinking':
        return k === 'lobby' && typeof act.on === 'boolean' && act.on !== p.drinking ? { ...p, drinking: act.on } : p;
      case 'start':
        return canStart(p) ? intro({ ...p, order: planOrder(p.seed, p.rounds, poolOf(p)) }, 0, now) : p;
      case 'next':
        return p.phase.k === 'result' ? afterResult(p, p.phase.r, now) : p;
      case 'again':
        if (k !== 'podium') return p;
        return intro(
          { ...p, seed: act.seed, order: planOrder(act.seed, p.rounds, poolOf(p)), history: [], players: resetTotals(p.players) },
          0,
          now,
        );
      case 'lobby':
        if (k !== 'podium' && k !== 'lobby') return p;
        return {
          ...p,
          seed: act.seed,
          order: [],
          history: [],
          phase: { k: 'lobby' },
          players: resetTotals(p.players.filter((x) => x.online)),
        };
    }
  }

  function viewFor(p: Party, pid: string, now: number): View {
    const players: PlayerView[] = p.players.map((x) => ({
      pid: x.pid,
      name: x.name,
      color: x.color,
      online: x.online,
      total: x.total,
      host: x.pid === p.hostPid,
    }));
    const base = { me: pid, isHost: pid === p.hostPid, code: p.code, players, drinking: p.drinking };
    const ph: Phase = p.phase;
    switch (ph.k) {
      case 'lobby':
        return { ...base, s: 'lobby', rounds: p.rounds, canStart: canStart(p), min: minPlayers(p) };
      case 'intro': {
        const d = defAt(p, ph.r);
        return {
          ...base,
          s: 'intro',
          r: ph.r,
          n: p.rounds,
          game: d.id,
          title: d.title,
          rule: d.rule,
          accent: d.accent,
          until: ph.until,
        };
      }
      case 'play': {
        const d = defAt(p, ph.r);
        return { ...base, s: 'game', r: ph.r, n: p.rounds, game: d.id, g: d.view(ph.state, pid, now) };
      }
      case 'result': {
        const rec = p.history[ph.r];
        const rows = p.players.map((x) => ({
          pid: x.pid,
          place: rec?.places[x.pid] ?? p.players.length,
          points: rec?.points[x.pid] ?? 0,
          total: x.total,
          label: rec?.labels[x.pid] ?? '–',
        }));
        const ordered = sorted(rows);
        const plan = rec?.drinks;
        return {
          ...base,
          s: 'result',
          r: ph.r,
          n: p.rounds,
          game: defAt(p, ph.r).id,
          until: ph.until,
          rows: ordered,
          drinks: plan
            ? {
                rows: ordered.flatMap(({ pid: who }) => {
                  const d = plan.rows[who];
                  return d && (d.take > 0 || d.give > 0) ? [{ pid: who, take: d.take, give: d.give }] : [];
                }),
                cheers: plan.cheers,
              }
            : null,
        };
      }
      case 'podium': {
        const rows = p.players.map((x) => ({
          pid: x.pid,
          place: 1 + p.players.filter((y) => y.total > x.total).length,
          total: x.total,
        }));
        return { ...base, s: 'podium', rows: sorted(rows) };
      }
    }
  }

  function create(code: string, seed: number, hostPid: string, o: { dev: boolean; speed: number; rounds?: number }): Party {
    return {
      code,
      seed,
      hostPid,
      dev: o.dev,
      speed: o.speed,
      players: [],
      rounds: o.rounds ?? 5,
      drinking: false,
      order: [],
      phase: { k: 'lobby' },
      history: [],
    };
  }

  return { create, hello, seen, disconnect, input, control, tick, viewFor, canStart };
}

export type Engine = ReturnType<typeof createEngine>;
