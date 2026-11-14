import type { Graph, Solution, SolutionStep, Task, VertexId } from '../types.js';
import type { GraphWalk } from '../graph/walk.js';
import { vertexIndex, weightedGraph } from '../graph/weighted.js';
import type { WeightedGraph } from '../graph/weighted.js';
import { tspTemplates } from '../explain/templates.vi.js';

export type TspOptions = Omit<Extract<Task, { type: 'tsp' }>, 'type'>;
export type TspFailureReason = 'empty_graph' | 'no_neighbor' | 'no_return' | 'no_tour';
export type TourAnswer =
  | { exists: true; length: number; walk: GraphWalk }
  | { exists: false; reason: TspFailureReason; partialWalk?: GraphWalk; partialLength?: number };
export interface NearestNeighborTraceStep {
  type: 'nearest_neighbor';
  start: VertexId;
  from: VertexId;
  to: VertexId;
  tied: VertexId[];
  edgeId: string;
  weight: number;
  length: number;
  closing: boolean;
}
export type TspTraceStep = NearestNeighborTraceStep
  | { type: 'held_karp'; start: VertexId; statesVisited: number };
export interface TspComparison {
  start: VertexId;
  nearestLength: number | null;
  optimalLength: number | null;
  gap: number | null;
}
export interface TspAnswer {
  nearestNeighbor?: { start: VertexId; answer: TourAnswer }[];
  optimal?: TourAnswer;
  comparison?: TspComparison[];
}
export interface TspSolution extends Solution {
  answer: TspAnswer;
  trace: TspTraceStep[];
}

function nearestNeighbor(input: WeightedGraph, start: number): { answer: TourAnswer; trace: NearestNeighborTraceStep[] } {
  const startId = input.ids[start]!;
  const walk: GraphWalk = { vertices: [startId], edgeIds: [] };
  const visited = new Set([start]);
  const trace: NearestNeighborTraceStep[] = [];
  let current = start;
  let length = 0;
  const traverse = (next: number, tied: number[], closing: boolean): void => {
    const to = input.ids[next]!;
    const edgeId = input.edgeIds[current]![next]!;
    const weight = input.weights[current]![next]!;
    length += weight;
    trace.push({ type: 'nearest_neighbor', start: startId, from: input.ids[current]!, to,
      tied: tied.map((i) => input.ids[i]!), edgeId, weight, length, closing });
    walk.vertices.push(to);
    walk.edgeIds.push(edgeId);
    visited.add(next);
    current = next;
  };
  while (visited.size < input.ids.length) {
    let minimum = Infinity;
    let tied: number[] = [];
    for (let next = 0; next < input.ids.length; next++) {
      if (visited.has(next)) continue;
      const weight = input.weights[current]![next]!;
      if (weight < minimum) { minimum = weight; tied = [next]; }
      else if (weight === minimum && weight !== Infinity) tied.push(next);
    }
    if (tied.length === 0) return { answer: { exists: false, reason: 'no_neighbor', partialWalk: walk, partialLength: length }, trace };
    traverse(tied[0]!, tied, false);
  }
  if (input.ids.length > 1) {
    if (!Number.isFinite(input.weights[current]![start]!)) {
      return { answer: { exists: false, reason: 'no_return', partialWalk: walk, partialLength: length }, trace };
    }
    traverse(start, [start], true);
  }
  return { answer: { exists: true, length, walk }, trace };
}

/** Bottom-up Held–Karp. Only states with last in mask occupy DP/parent slots. */
function heldKarp(input: WeightedGraph, start: number): { answer: TourAnswer; statesVisited: number } {
  const n = input.ids.length;
  if (n === 1) return { answer: { exists: true, length: 0, walk: { vertices: [input.ids[start]!], edgeIds: [] } }, statesVisited: 1 };
  const others = input.ids.map((_, i) => i).filter((i) => i !== start);
  const m = others.length;
  const full = (1 << m) - 1;
  const sizes = new Uint8Array(full + 1);
  const offsets = new Uint32Array(full + 2);
  for (let mask = 1; mask <= full; mask++) {
    sizes[mask] = sizes[mask >>> 1]! + (mask & 1);
    offsets[mask + 1] = offsets[mask]! + sizes[mask]!;
  }
  // Each mask's block stores its set bits in ascending input vertex order.
  // At n=20 there are 19 * 2^18 states: ~40 MB of costs, ~5 MB of parents.
  const statesVisited = offsets[full + 1]!;
  const dp = new Float64Array(statesVisited);
  const parent = new Int8Array(statesVisited);
  const weights = others.map((u) => others.map((v) => input.weights[u]![v]!));
  for (let mask = 1; mask <= full; mask++) {
    let bits = mask;
    let key = offsets[mask]!;
    while (bits !== 0) {
      const bit = bits & -bits;
      const last = 31 - Math.clz32(bit);
      bits ^= bit;
      const remaining = mask ^ bit;
      let best = remaining === 0 ? input.weights[others[last]!]![start]! : Infinity;
      let bestNext = -1;
      let nextBits = remaining;
      let nextKey = offsets[remaining]!;
      const row = weights[last]!;
      // dp[mask,last] goes from last through the rest of mask, then to start.
      // Every dependency has a smaller mask and was already computed.
      while (nextBits !== 0) {
        const nextBit = nextBits & -nextBits;
        const next = 31 - Math.clz32(nextBit);
        const candidate = row[next]! + dp[nextKey++]!;
        if (candidate < best) { best = candidate; bestNext = next; }
        nextBits ^= nextBit;
      }
      dp[key] = best;
      parent[key++] = bestNext;
    }
  }
  let length = Infinity;
  let first = -1;
  for (let next = 0; next < m; next++) {
    const candidate = input.weights[start]![others[next]!]! + dp[offsets[full]! + next]!;
    if (candidate < length) { length = candidate; first = next; }
  }
  if (!Number.isFinite(length)) return { answer: { exists: false, reason: 'no_tour' }, statesVisited };
  const walk: GraphWalk = { vertices: [input.ids[start]!], edgeIds: [] };
  let mask = full;
  let current = start;
  let next = first;
  while (next !== -1) {
    const vertex = others[next]!;
    walk.edgeIds.push(input.edgeIds[current]![vertex]!);
    walk.vertices.push(input.ids[vertex]!);
    const bit = 1 << next;
    const key = offsets[mask]! + sizes[mask & (bit - 1)]!;
    next = parent[key]!;
    mask ^= bit;
    current = vertex;
  }
  walk.edgeIds.push(input.edgeIds[current]![start]!);
  walk.vertices.push(input.ids[start]!);
  return { answer: { exists: true, length, walk }, statesVisited };
}

/** An omitted start runs NN from every vertex; the exact tour is rotation invariant. */
export function solveTsp(graph: Graph, options: TspOptions = { method: 'both' }): TspSolution {
  const input = weightedGraph(graph);
  const start = options.start === undefined ? 0 : vertexIndex(input, options.start);
  const trace: TspTraceStep[] = [];
  const steps: SolutionStep[] = [];
  const answer: TspAnswer = {};
  const labels = new Map(graph.vertices.map(({ id, label }) => [id, label]));
  const label = (id: VertexId): string => labels.get(id)!;
  const add = (kind: string, text: string, data: unknown, highlight?: SolutionStep['highlight']): void => {
    steps.push({ index: steps.length + 1, kind, text, data, ...(highlight === undefined ? {} : { highlight }) });
  };
  if (options.method !== 'optimal') {
    answer.nearestNeighbor = [];
    const starts = options.start === undefined ? input.ids.map((_, i) => i) : [start];
    for (const s of starts) {
      const result = nearestNeighbor(input, s);
      const startId = input.ids[s]!;
      answer.nearestNeighbor.push({ start: startId, answer: result.answer });
      trace.push(...result.trace);
      add('nn_start', tspTemplates.start(label(startId)), { start: startId }, { vertices: [startId] });
      for (const event of result.trace) {
        add('nn_step', tspTemplates.advance(label(event.from), label(event.to), event.weight, event.tied.map(label), event.closing), event,
          { vertices: [event.from, event.to], edges: [event.edgeId] });
      }
      add('nn_conclusion', tspTemplates.result(result.answer, label), result.answer,
        result.answer.exists ? { vertices: result.answer.walk.vertices, edges: result.answer.walk.edgeIds } : undefined);
    }
    if (input.ids.length === 0) add('nn_conclusion', tspTemplates.failure('empty_graph'), { reason: 'empty_graph' });
  }
  if (options.method !== 'nearest_neighbor') {
    if (input.ids.length === 0) {
      answer.optimal = { exists: false, reason: 'empty_graph' };
    } else {
      const result = heldKarp(input, start);
      answer.optimal = result.answer;
      const event: TspTraceStep = { type: 'held_karp', start: input.ids[start]!, statesVisited: result.statesVisited };
      trace.push(event);
      add('tsp_optimal', tspTemplates.optimal(label(input.ids[start]!)), event);
    }
    add('tsp_conclusion', tspTemplates.result(answer.optimal, label), answer.optimal,
      answer.optimal.exists ? { vertices: answer.optimal.walk.vertices, edges: answer.optimal.walk.edgeIds } : undefined);
  }
  if (options.method === 'both') {
    const optimalLength = answer.optimal!.exists ? answer.optimal!.length : null;
    answer.comparison = answer.nearestNeighbor!.map(({ start: s, answer: tour }) => {
      const nearestLength = tour.exists ? tour.length : null;
      const comparison = { start: s, nearestLength, optimalLength,
        gap: nearestLength === null || optimalLength === null ? null : nearestLength - optimalLength };
      add('tsp_comparison', tspTemplates.comparison(label(s), comparison), comparison);
      return comparison;
    });
  }
  return { answer, trace, steps, notes: [tspTemplates.note] };
}
