import type { Graph, VertexId } from '../types.js';
import { unknownVertexMessage, validationMessages } from '../explain/templates.vi.js';

export interface WeightedGraph {
  ids: VertexId[];
  indices: Map<VertexId, number>;
  weights: number[][];
  edgeIds: (string | null)[][];
}

/** Minimum parallel edge, retaining the first input edge when weights tie. */
export function weightedGraph(graph: Graph): WeightedGraph {
  if (graph.vertices.length > 20) throw new RangeError(validationMessages.vertexLimit);
  const ids = graph.vertices.map(({ id }) => id);
  const indices = new Map(ids.map((id, i) => [id, i]));
  const weights = ids.map(() => ids.map(() => Infinity));
  const edgeIds = ids.map(() => ids.map((): string | null => null));
  for (const edge of graph.edges) {
    if (edge.w === undefined) throw new RangeError(validationMessages.missingWeight);
    if (!Number.isFinite(edge.w) || edge.w <= 0) throw new RangeError(validationMessages.weight);
    const u = indices.get(edge.u)!;
    const v = indices.get(edge.v)!;
    if (edge.w < weights[u]![v]!) {
      weights[u]![v] = weights[v]![u] = edge.w;
      edgeIds[u]![v] = edgeIds[v]![u] = edge.id;
    }
  }
  return { ids, indices, weights, edgeIds };
}

export function vertexIndex(input: WeightedGraph, id: VertexId): number {
  const index = input.indices.get(id);
  if (index === undefined) throw new RangeError(unknownVertexMessage(id));
  return index;
}

export interface AllPairsShortestPaths {
  distances: number[][];
  next: (number | null)[][];
}

/** Internal Infinity values never escape into solution data or traces. */
export function floydWarshall(input: WeightedGraph): AllPairsShortestPaths {
  const distances = input.weights.map((row, i) => row.map((w, j) => i === j ? 0 : w));
  const next = distances.map((row) => row.map((w, j) => Number.isFinite(w) ? j : null));
  for (let k = 0; k < input.ids.length; k++) {
    for (let i = 0; i < input.ids.length; i++) {
      for (let j = 0; j < input.ids.length; j++) {
        const candidate = distances[i]![k]! + distances[k]![j]!;
        if (candidate < distances[i]![j]!) {
          distances[i]![j] = candidate;
          next[i]![j] = next[i]![k]!;
        }
      }
    }
  }
  return { distances, next };
}
