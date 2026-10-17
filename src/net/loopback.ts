import { createConn } from './conn';
import type { Conn } from './transport';

export function createLoopbackPair(): [Conn, Conn] {
  const a: ReturnType<typeof createConn> = createConn({
    write: (m) => queueMicrotask(() => b.receive(m)),
    shut: () => queueMicrotask(() => b.ended()),
  });
  const b: ReturnType<typeof createConn> = createConn({
    write: (m) => queueMicrotask(() => a.receive(m)),
    shut: () => queueMicrotask(() => a.ended()),
  });
  return [a.conn, b.conn];
}
