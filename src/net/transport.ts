import { createLocalTransport } from './local';

export interface Conn {
  send(data: string): void;
  onMessage(fn: (data: string) => void): () => void;
  onClose(fn: () => void): () => void;
  close(): void;
}

export interface HostEndpoint {
  readonly code: string;
  onConnection(fn: (c: Conn) => void): () => void;
  close(): void;
}

export interface Transport {
  host(code: string): Promise<HostEndpoint>;
  join(code: string, timeoutMs?: number): Promise<Conn>;
}

export type NetKind = 'peer' | 'local';

export async function createTransport(kind: NetKind): Promise<Transport> {
  if (kind === 'local') return createLocalTransport();
  return (await import('./peer')).createPeerTransport();
}
