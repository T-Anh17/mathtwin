/** Minimum perfect matching on a finite, symmetric odd-vertex metric. */
export function minimumMatching(distances: number[][]): { pairs: [number, number][]; length: number; statesVisited: number } {
  const n = distances.length;
  const full = (1 << n) - 1;
  const memo = new Float64Array(full + 1).fill(NaN);
  const choice = new Int8Array(full + 1).fill(-1);
  memo[0] = 0;
  let statesVisited = 0;
  const cost = (mask: number): number => {
    if (!Number.isNaN(memo[mask]!)) return memo[mask]!;
    statesVisited++;
    let first = 0;
    while ((mask & (1 << first)) === 0) first++;
    const remaining = mask ^ (1 << first);
    let best = Infinity;
    for (let second = first + 1; second < n; second++) {
      if ((remaining & (1 << second)) === 0) continue;
      const candidate = distances[first]![second]! + cost(remaining ^ (1 << second));
      if (candidate < best) { best = candidate; choice[mask] = second; }
    }
    memo[mask] = best;
    return best;
  };
  const length = cost(full);
  const pairs: [number, number][] = [];
  let mask = full;
  while (mask !== 0) {
    let first = 0;
    while ((mask & (1 << first)) === 0) first++;
    const second = choice[mask]!;
    pairs.push([first, second]);
    mask ^= (1 << first) | (1 << second);
  }
  return { pairs, length, statesVisited };
}
