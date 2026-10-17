import { describe, expect, it } from 'vitest';
import { createLoopbackPair } from './loopback';
import type { Conn } from './transport';

const settle = () => new Promise<void>((r) => setImmediate(r));

function record(c: Conn, tag: string, log: string[]): void {
  c.onMessage((m) => log.push(`${tag}:msg:${m}`));
  c.onClose(() => log.push(`${tag}:close`));
}

describe('createLoopbackPair', () => {
  it('stellt in beide Richtungen asynchron und in Reihenfolge zu', async () => {
    const [a, b] = createLoopbackPair();
    const atB: string[] = [];
    const atA: string[] = [];
    b.onMessage((m) => atB.push(m));
    a.onMessage((m) => atA.push(m));
    a.send('1');
    a.send('2');
    b.send('x');
    b.send('y');
    expect(atB).toEqual([]);
    expect(atA).toEqual([]);
    await settle();
    expect(atB).toEqual(['1', '2']);
    expect(atA).toEqual(['x', 'y']);
  });

  it('close auf einer Seite löst onClose auf beiden Seiten genau einmal aus', async () => {
    const [a, b] = createLoopbackPair();
    const log: string[] = [];
    record(a, 'a', log);
    record(b, 'b', log);
    a.close();
    a.close();
    await settle();
    b.close();
    await settle();
    expect(log.filter((l) => l === 'a:close')).toHaveLength(1);
    expect(log.filter((l) => l === 'b:close')).toHaveLength(1);
  });

  it('gleichzeitiges close auf beiden Seiten meldet je Seite einmal', async () => {
    const [a, b] = createLoopbackPair();
    const log: string[] = [];
    record(a, 'a', log);
    record(b, 'b', log);
    a.close();
    b.close();
    await settle();
    expect([...log].sort()).toEqual(['a:close', 'b:close']);
  });

  it('send nach close ist ein No-op', async () => {
    const [a, b] = createLoopbackPair();
    const log: string[] = [];
    record(a, 'a', log);
    record(b, 'b', log);
    a.close();
    a.send('von-a');
    b.send('von-b');
    await settle();
    expect(log.filter((l) => l.includes(':msg:'))).toEqual([]);
  });

  it('eine vor close gesendete Nachricht kommt vor dem onClose der Gegenseite an', async () => {
    const [a, b] = createLoopbackPair();
    const log: string[] = [];
    record(b, 'b', log);
    a.send('letzte');
    a.close();
    await settle();
    expect(log).toEqual(['b:msg:letzte', 'b:close']);
  });

  it('abgemeldete Listener werden nicht mehr gerufen', async () => {
    const [a, b] = createLoopbackPair();
    const got: string[] = [];
    const off = b.onMessage((m) => got.push(m));
    a.send('1');
    await settle();
    off();
    a.send('2');
    await settle();
    expect(got).toEqual(['1']);
  });
});
