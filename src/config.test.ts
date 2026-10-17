import { describe, expect, it } from 'vitest';
import { joinUrl, parseFlags } from './config';
import { GAME_IDS } from './games/types';

describe('parseFlags', () => {
  it('liefert Defaults bei leerem String', () => {
    expect(parseFlags('')).toEqual({
      net: 'peer',
      dev: false,
      fast: false,
      speed: 1,
      only: undefined,
      seed: undefined,
      rounds: undefined,
    });
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

describe('parseFlags: seed und rounds (nur Dev)', () => {
  it('gelten nur mit dev', () => {
    expect(parseFlags('?seed=5&rounds=2')).toMatchObject({ seed: undefined, rounds: undefined });
    expect(parseFlags('?dev=0&seed=5&rounds=2')).toMatchObject({ seed: undefined, rounds: undefined });
    expect(parseFlags('?dev=1&seed=5&rounds=2')).toMatchObject({ seed: 5, rounds: 2 });
  });

  it('seed ist ein uint32: 0 bis 4294967295', () => {
    for (const ok of ['0', '1', '31337', '4294967295']) expect(parseFlags(`?dev=1&seed=${ok}`).seed).toBe(Number(ok));
    for (const bad of ['4294967296', '99999999999999999999', '-1', '1.5', '1e3', 'abc', '', ' 5', '0x10', '+5'])
      expect(parseFlags(`?dev=1&seed=${encodeURIComponent(bad)}`).seed, bad).toBeUndefined();
  });

  it('rounds ist eine Ganzzahl von 1 bis 8', () => {
    for (let n = 1; n <= 8; n++) expect(parseFlags(`?dev=1&rounds=${n}`).rounds).toBe(n);
    for (const bad of ['0', '9', '-1', '2.5', 'abc', '', '1e0', '16', ' 3', '+3'])
      expect(parseFlags(`?dev=1&rounds=${encodeURIComponent(bad)}`).rounds, bad).toBeUndefined();
  });

  it('ungültige Werte beeinflussen die anderen Flags nicht', () => {
    expect(parseFlags('?dev=1&fast=1&seed=x&rounds=0&only=hammer')).toMatchObject({
      dev: true,
      speed: 10,
      only: 'hammer',
      seed: undefined,
      rounds: undefined,
    });
  });
});

describe('joinUrl', () => {
  const O = 'https://karimmarhaba.github.io';
  const B = '/wg-arcade/';

  it('hängt #/j/CODE an Origin und Base', () => {
    expect(joinUrl(O, B, '', 'ABCD')).toBe('https://karimmarhaba.github.io/wg-arcade/#/j/ABCD');
  });

  it('übernimmt nur net, dev und fast', () => {
    expect(joinUrl(O, B, '?net=local&dev=1&fast=1', 'ABCD')).toBe(`${O}${B}?net=local&dev=1&fast=1#/j/ABCD`);
    expect(joinUrl(O, B, '?only=blitz&net=local&foo=bar&speed=5', 'WXYZ')).toBe(`${O}${B}?net=local#/j/WXYZ`);
  });

  it('trägt seed und rounds nie in die Beitritts-URL', () => {
    expect(joinUrl(O, B, '?net=local&dev=1&fast=1&seed=7&rounds=2&only=hammer', 'ABCD')).toBe(
      `${O}${B}?net=local&dev=1&fast=1#/j/ABCD`,
    );
  });

  it('lässt fehlende Flags weg und akzeptiert Search ohne ?', () => {
    expect(joinUrl(O, B, 'dev=1', 'ABCD')).toBe(`${O}${B}?dev=1#/j/ABCD`);
    expect(joinUrl(O, B, '?only=hammer', 'ABCD')).toBe(`${O}${B}#/j/ABCD`);
  });
});
