import type { Graph } from '../types.js';

export interface HamiltonSearchResult {
  indices: number[] | null;
  edgeIds: string[];
  statesVisited: number;
  memoHits: number;
}

/** Exact search with memoized (remaining vertices, current vertex) failures. */
export function searchHamilton(
  graph: Graph, starts: number[], cycle: boolean, end: number | undefined,
): HamiltonSearchResult {
  const n = graph.vertices.length;
  const index = new Map(graph.vertices.map(({ id }, i) => [id, i]));
  const adjacency = new Int32Array(n);
  const firstEdge: (string | undefined)[] = Array.from({ length: n * n });
  for (const edge of graph.edges) {
    const u = index.get(edge.u)!;
    const v = index.get(edge.v)!;
    if (u === v) continue;
    adjacency[u] = adjacency[u]! | (1 << v);
    adjacency[v] = adjacency[v]! | (1 << u);
    firstEdge[u * n + v] ??= edge.id;
    firstEdge[v * n + u] ??= edge.id;
  }
  // One bit per current vertex, one word per remaining mask: at most 4 MiB.
  const failed = new Uint32Array(1 << n);
  const all = (1 << n) - 1;
  let statesVisited = 0;
  let memoHits = 0;
  let root = 0;
  const route: number[] = [];

  const canComplete = (current: number, remaining: number): boolean => {
    const active = remaining | (1 << current);
    if ((adjacency[current]! & remaining) === 0) return false;
    if (cycle && (adjacency[root]! & remaining) === 0) return false;
    let leaves = 0;
    for (let pending = remaining; pending !== 0; pending &= pending - 1) {
      const v = 31 - Math.clz32(pending & -pending);
      const choices = adjacency[v]! & (cycle ? active | (1 << root) : active);
      if (choices === 0) return false;
      if ((choices & (choices - 1)) === 0) {
        if (cycle || (end !== undefined && v !== end) || ++leaves > 1) return false;
      }
    }
    // Removing the already visited prefix must leave a connected suffix.
    let reached = 1 << current;
    let frontier = reached;
    while (frontier !== 0) {
      const bit = frontier & -frontier;
      frontier ^= bit;
      const v = 31 - Math.clz32(bit);
      const next = adjacency[v]! & active & ~reached;
      reached |= next;
      frontier |= next;
    }
    return reached === active;
  };

  const visit = (current: number, remaining: number): boolean => {
    statesVisited++;
    if (remaining === 0) {
      return cycle ? (adjacency[current]! & (1 << root)) !== 0 : end === undefined || current === end;
    }
    const bit = 1 << current;
    if ((failed[remaining]! & bit) !== 0) {
      memoHits++;
      return false;
    }
    if (canComplete(current, remaining)) {
      let choices = adjacency[current]! & remaining;
      // Lowest input vertex index first; parallel edges use their first input ID.
      while (choices !== 0) {
        const nextBit = choices & -choices;
        choices ^= nextBit;
        const next = 31 - Math.clz32(nextBit);
        if (!cycle && next === end && remaining !== nextBit) continue;
        route.push(next);
        if (visit(next, remaining ^ nextBit)) return true;
        route.pop();
      }
    }
    failed[remaining] = failed[remaining]! | bit;
    return false;
  };

  for (const start of starts) {
    root = start;
    // A cycle's completion depends on its root; a path's suffix does not.
    if (cycle) failed.fill(0);
    if (!cycle && start === end && n > 1) continue;
    route.length = 0;
    route.push(start);
    if (!visit(start, all ^ (1 << start))) continue;
    const indices = cycle ? [...route, start] : [...route];
    const edgeIds = indices.slice(1).map((v, i) => firstEdge[indices[i]! * n + v]!);
    return { indices, edgeIds, statesVisited, memoHits };
  }
  return { indices: null, edgeIds: [], statesVisited, memoHits };
}
