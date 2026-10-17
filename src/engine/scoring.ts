const POINTS = [5, 3, 2, 1];

export function rank(
  results: ReadonlyMap<string, number>,
  pids: readonly string[],
  online: ReadonlySet<string>,
): { places: Record<string, number>; points: Record<string, number> } {
  const scored = pids.flatMap((pid) => {
    const v = results.get(pid);
    return online.has(pid) && v !== undefined ? [{ pid, v }] : [];
  });
  const places: Record<string, number> = {};
  const points: Record<string, number> = {};
  for (const pid of pids) {
    const me = scored.find((s) => s.pid === pid);
    const place = me ? 1 + scored.filter((s) => s.v > me.v).length : pids.length;
    places[pid] = place;
    points[pid] = me ? (POINTS[place - 1] ?? 0) : 0;
  }
  return { places, points };
}
