import type { Edge, Graph, Task } from '@mathtwin/core';
import { mapReferences, normalizeLabel } from './model.js';

export function canonicalGraph(graph: Graph): unknown {
  const label = labelMapper(graph);
  return {
    directed: graph.directed,
    vertices: graph.vertices.map((v) => normalizeLabel(v.label)).sort(),
    edges: graph.edges.map((e) => JSON.stringify([
      ...[label(e.u), label(e.v)].sort(), e.w ?? null, e.name ?? null,
    ])).sort(),
  };
}

export function labelMapper(graph: Graph): (id: string) => string {
  const labels = new Map(graph.vertices.map((v) => [v.id, normalizeLabel(v.label)]));
  return (id) => labels.get(id) ?? normalizeLabel(id);
}

export function canonicalTask(task: Task, graph: Graph): Task {
  const mapped = mapReferences(task, labelMapper(graph));
  if (mapped.type === 'degree' && mapped.vertices) mapped.vertices = [...mapped.vertices].sort();
  if (mapped.type === 'degree_sequence') mapped.sequence = [...mapped.sequence].sort((a, b) => a - b);
  if (mapped.type === 'statements') {
    mapped.items = mapped.items.map(({ id, check }) => {
      const result = { ...check };
      if (result.type === 'odd_vertices') result.vertices = [...result.vertices].sort();
      if (result.type === 'walk' && result.edgeIds) {
        result.edgeIds = result.edgeIds.map((id) => {
          const edge = graph.edges.find((e) => e.id === id);
          return edge ? JSON.stringify(canonicalGraph({ ...graph, edges: [edge] })) : id;
        });
      }
      // Wording is not part of a normalized, independently checkable task.
      return { id, text: '', check: result };
    }).sort((a, b) => a.id.localeCompare(b.id, 'en'));
  }
  return mapped;
}

/** Minimum-cost one-to-one assignment, with dummy rows/columns for absent edges.
 * This avoids order-dependent pairing of parallel edges. Ties keep input order.
 */
export function assignEdges(left: Edge[], right: Edge[]): Map<number, number> {
  const n = left.length + right.length;
  const cost = (i: number, j: number): number => {
    const a = left[i]; const b = right[j];
    if (!a || !b) return a || b ? 6 : 0;
    const endpoints = Math.min(Number(a.u !== b.u) + Number(a.v !== b.v), Number(a.u !== b.v) + Number(a.v !== b.u));
    const named = a.name !== undefined && a.name === b.name;
    const related = ((a.u === a.v) === (b.u === b.v) && endpoints < 2) || named;
    return related ? endpoints * 4 + Number(a.w !== b.w) + Number(a.name !== b.name) : 1000;
  };
  const u = Array<number>(n + 1).fill(0); const v = [...u];
  const p = [...u]; const way = [...u];
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const min = Array<number>(n + 1).fill(Infinity); const used = Array<boolean>(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0]!;
      let delta = Infinity; let j1 = 0;
      for (let j = 1; j <= n; j++) if (!used[j]) {
        const current = cost(i0 - 1, j - 1) - u[i0]! - v[j]!;
        if (current < min[j]!) { min[j] = current; way[j] = j0; }
        if (min[j]! < delta) { delta = min[j]!; j1 = j; }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) { u[p[j]!] = u[p[j]!]! + delta; v[j] = v[j]! - delta; }
        else min[j] = min[j]! - delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]!; p[j0] = p[j1]!; j0 = j1; } while (j0 !== 0);
  }
  const pairs = new Map<number, number>();
  for (let j = 1; j <= n; j++) if (p[j]! <= left.length && j <= right.length) pairs.set(p[j]! - 1, j - 1);
  return pairs;
}
