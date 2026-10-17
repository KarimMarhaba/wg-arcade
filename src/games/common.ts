export function allDone(pids: readonly string[], online: ReadonlySet<string>, isDone: (pid: string) => boolean): boolean {
  const here = pids.filter((pid) => online.has(pid));
  return here.length > 0 && here.every(isDone);
}

export const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

export const isInt = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x);
