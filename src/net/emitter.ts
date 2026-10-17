export interface Emitter<A extends unknown[]> {
  on(fn: (...a: A) => void): () => void;
  emit(...a: A): void;
  clear(): void;
}

export function createEmitter<A extends unknown[]>(): Emitter<A> {
  const fns = new Set<(...a: A) => void>();
  return {
    on(fn) {
      fns.add(fn);
      return () => void fns.delete(fn);
    },
    emit(...a) {
      for (const fn of [...fns]) fn(...a);
    },
    clear: () => fns.clear(),
  };
}
