import { describe, expect, it } from 'vitest';
import { parseFlags } from './config';
import { GAME_IDS } from './games/types';

describe('parseFlags', () => {
  it('liefert Defaults bei leerem String', () => {
    expect(parseFlags('')).toEqual({ net: 'peer', dev: false, fast: false, speed: 1, only: undefined });
  });

  it('akzeptiert führendes ?', () => {
    expect(parseFlags('?net=local').net).toBe('local');
    expect(parseFlags('net=local').net).toBe('local');
  });

  it('unbekanntes net ergibt peer', () => {
    expect(parseFlags('?net=foo').net).toBe('peer');
    expect(parseFlags('?net=').net).toBe('peer');
  });

  it('fast ohne dev ist wirkungslos', () => {
    const f = parseFlags('?fast=1');
    expect(f.fast).toBe(false);
    expect(f.speed).toBe(1);
  });

  it('dev und fast ergeben speed 10', () => {
    const f = parseFlags('?dev=1&fast=1');
    expect(f).toMatchObject({ dev: true, fast: true, speed: 10 });
  });

  it('dev ohne fast bleibt speed 1', () => {
    expect(parseFlags('?dev=1')).toMatchObject({ dev: true, fast: false, speed: 1 });
  });

  it('0 und false schalten aus', () => {
    expect(parseFlags('?dev=0&fast=1').dev).toBe(false);
    expect(parseFlags('?dev=1&fast=false')).toMatchObject({ fast: false, speed: 1 });
  });

  it('only gilt mit dev für bekannte Ids', () => {
    for (const id of GAME_IDS) expect(parseFlags(`?dev=1&only=${id}`).only).toBe(id);
  });

  it('unbekanntes only wird ignoriert', () => {
    expect(parseFlags('?dev=1&only=nope').only).toBeUndefined();
  });

  it('only ohne dev wird ignoriert', () => {
    expect(parseFlags(`?only=${GAME_IDS[0]}`).only).toBeUndefined();
  });
});
