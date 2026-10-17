import { createEmitter } from './emitter';
import type { Conn } from './transport';

export interface ConnCore {
  conn: Conn;
  receive(data: string): void;
  ended(): void;
}

export function createConn(o: { write(data: string): void; shut(): void }): ConnCore {
  const messages = createEmitter<[string]>();
  const closes = createEmitter<[]>();
  let closed = false;
  const end = (): void => {
    closed = true;
    closes.emit();
    messages.clear();
    closes.clear();
  };
  return {
    conn: {
      send(data) {
        if (!closed) o.write(data);
      },
      onMessage: messages.on,
      onClose: closes.on,
      close() {
        if (closed) return;
        closed = true;
        try {
          o.shut();
        } finally {
          end();
        }
      },
    },
    receive(data) {
      if (!closed) messages.emit(data);
    },
    ended() {
      if (!closed) end();
    },
  };
}
