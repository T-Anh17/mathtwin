import type { Edge, Graph } from '../types.js';

export type DegreeSequenceResult = { exists: true; graph: Graph } | { exists: false };

// Bound realization work: at most 20 * 100 / 2 = 1,000 edges.
export const MAX_DEGREE_SEQUENCE_VALUE = 100;

export function isValidDegreeSequence(sequence: readonly number[]): boolean {
  return sequence.length <= 20
    && sequence.every((value) => Number.isSafeInteger(value) && value >= 0 && value <= MAX_DEGREE_SEQUENCE_VALUE)
    && Number.isSafeInteger(sequence.reduce((sum, value) => sum + value, 0));
}

/** Vertex i has degree sequence[i]; labels and ties preserve input order. */
export function realizeDegreeSequence(sequence: readonly number[], simple: boolean): DegreeSequenceResult {
  if (!isValidDegreeSequence(sequence)) return { exists: false };
  const total = sequence.reduce((sum, value) => sum + value, 0);
  if (total % 2 !== 0) return { exists: false };
  const vertices = sequence.map((_, index) => ({ id: String(index + 1), label: String(index + 1) }));
  const edges: Edge[] = [];
  const addEdge = (u: number, v: number): void => {
    edges.push({ id: `e${edges.length + 1}`, u: vertices[u]!.id, v: vertices[v]!.id });
  };

  if (simple) {
    if (sequence.some((value) => value >= sequence.length)) return { exists: false };
    let remaining = sequence.map((value, index) => ({ value, index }));
    while (remaining.length > 0) {
      remaining.sort((a, b) => b.value - a.value || a.index - b.index);
      const current = remaining.shift()!;
      if (current.value === 0) break;
      if (current.value > remaining.length) return { exists: false };
      for (let i = 0; i < current.value; i++) {
        const neighbor = remaining[i]!;
        if (neighbor.value === 0) return { exists: false };
        neighbor.value--;
        addEdge(current.index, neighbor.index);
      }
    }
  } else {
    const remaining = sequence.map((value, index) => ({ value, index }));
    while (remaining.length > 0) {
      remaining.sort((a, b) => b.value - a.value || a.index - b.index);
      const current = remaining[0]!;
      if (current.value === 0) break;
      const neighbor = remaining[1];
      // Greedily pair the two largest residual degrees. If max <= total - max,
      // this stays loopless. Otherwise only the dominant vertex needs loops.
      if (neighbor === undefined || neighbor.value === 0) {
        for (let i = 0; i < current.value / 2; i++) addEdge(current.index, current.index);
        break;
      }
      addEdge(current.index, neighbor.index);
      current.value--;
      neighbor.value--;
    }
  }
  return { exists: true, graph: { directed: false, vertices, edges } };
}
