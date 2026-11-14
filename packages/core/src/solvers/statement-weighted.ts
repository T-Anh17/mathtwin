import type { Graph, StatementCheck } from '../types.js';
import { connectedComponents, oddVertices } from '../graph/basic.js';
import { checkWalk } from '../graph/walk.js';
import { floydWarshall, weightedGraph } from '../graph/weighted.js';
import { minimumMatching } from '../graph/matching.js';
import { solveDijkstra } from './dijkstra.js';
import { validationMessages } from '../explain/templates.vi.js';

export type WeightedStatementCheck = Extract<StatementCheck, { type: 'length' | 'dijkstra_label' | 'nn_step' | 'postman_duplicate' }>;
export interface WeightedStatementEvaluation { value: boolean | null; facts: Record<string, unknown> }

function checkLength(graph: Graph, check: Extract<StatementCheck, { type: 'length' }>): WeightedStatementEvaluation {
  const path = checkWalk(graph, { kind: 'path', vertices: check.vertices });
  // A missing edge makes the proposition false, even if another step is ambiguous.
  if (!path.ok) return { value: false, facts: { validWalk: false, ...path.facts, reason: path.reason } };
  let length = 0;
  const ambiguousSteps: { index: number; from: string; to: string; edgeIds: string[]; weights: number[] }[] = [];
  for (let i = 1; i < check.vertices.length; i++) {
    const from = check.vertices[i - 1]!;
    const to = check.vertices[i]!;
    const edges = graph.edges.filter((e) => (e.u === from && e.v === to) || (e.u === to && e.v === from));
    const weights = edges.map((e) => e.w!);
    if (new Set(weights).size > 1) ambiguousSteps.push({ index: i - 1, from, to, edgeIds: edges.map(({ id }) => id), weights });
    length += weights[0]!;
  }
  return ambiguousSteps.length > 0
    ? { value: null, facts: { validWalk: true, reason: 'ambiguous_length', ambiguousSteps } }
    : { value: length === check.value, facts: { validWalk: true, expected: length, got: check.value, walk: path.walk } };
}

function checkDijkstraLabel(graph: Graph, check: Extract<StatementCheck, { type: 'dijkstra_label' }>): WeightedStatementEvaluation {
  if (check.source === undefined) throw new RangeError(validationMessages.statementSource);
  const solution = solveDijkstra(graph, { from: check.source, to: check.v });
  const expected = solution.answer.exists ? solution.answer.length : null;
  let viaValid = check.via === undefined;
  if (check.via !== undefined && expected !== null && check.v !== check.source && check.via !== check.v) {
    const viaDistance = solution.state.labels[check.via];
    viaValid = viaDistance !== undefined && viaDistance !== null && graph.edges.some((e) =>
      ((e.u === check.via && e.v === check.v) || (e.v === check.via && e.u === check.v)) && viaDistance + e.w! === expected);
  }
  return { value: expected === check.value && viaValid,
    facts: { source: check.source, vertex: check.v, expected, got: check.value, viaValid, answer: solution.answer } };
}

/** Reachability of a step across all legal NN runs; failed states share a bitmask memo. */
function checkNearestNeighbor(graph: Graph, check: Extract<StatementCheck, { type: 'nn_step' }>): WeightedStatementEvaluation {
  if (check.start === undefined) throw new RangeError(validationMessages.statementStart);
  const input = weightedGraph(graph);
  const n = input.ids.length;
  const start = input.indices.get(check.start)!;
  const from = input.indices.get(check.from)!;
  const to = input.indices.get(check.to)!;
  const full = (1 << n) - 1;
  if (from === to || input.edgeIds[from]![to] === null) {
    return { value: false, facts: { start: check.start, from: check.from, to: check.to, walk: null, statesVisited: 0 } };
  }
  // At n=20 this uses at most 20 MiB, even when many tied runs fail.
  const failed = new Uint8Array((full + 1) * n);
  let statesVisited = 0;
  const search = (mask: number, current: number): number[] | null => {
    const key = mask * n + current;
    if (failed[key] === 1) return null;
    statesVisited++;
    if (mask === full) {
      if (n > 1 && current === from && to === start && Number.isFinite(input.weights[current]![start]!)) return [current, start];
      failed[key] = 1;
      return null;
    }
    if ((current !== from && (mask & (1 << from)) !== 0)
      || (to !== start && (mask & (1 << to)) !== 0)) {
      failed[key] = 1;
      return null;
    }
    let minimum = Infinity;
    let tied: number[] = [];
    for (let next = 0; next < n; next++) {
      if ((mask & (1 << next)) !== 0) continue;
      const weight = input.weights[current]![next]!;
      if (weight < minimum) { minimum = weight; tied = [next]; }
      else if (weight === minimum && Number.isFinite(weight)) tied.push(next);
    }
    if (current === from) {
      if (tied.includes(to)) return [current, to];
    } else {
      for (const next of tied) {
        const continuation = search(mask | (1 << next), next);
        if (continuation !== null) return [current, ...continuation];
      }
    }
    failed[key] = 1;
    return null;
  };
  const indices = search(1 << start, start);
  const walk = indices === null ? null : {
    vertices: indices.map((i) => input.ids[i]!),
    edgeIds: indices.slice(1).map((v, i) => input.edgeIds[indices[i]!]![v]!),
  };
  return { value: walk !== null, facts: { start: check.start, from: check.from, to: check.to, walk, statesVisited } };
}

/** Accept a shortest odd-pair path whenever that pair belongs to any optimal matching. */
function checkPostmanDuplicate(graph: Graph, check: Extract<StatementCheck, { type: 'postman_duplicate' }>): WeightedStatementEvaluation {
  const path = checkWalk(graph, { kind: 'path', vertices: check.vertices });
  const odd = oddVertices(graph);
  const from = check.vertices[0];
  const to = check.vertices.at(-1);
  if (!path.ok || from === undefined || to === undefined || from === to || !odd.includes(from) || !odd.includes(to)
    || connectedComponents(graph, { ignoreIsolated: true }).length > 1) {
    return { value: false, facts: { oddVertices: odd, vertices: check.vertices, reason: 'invalid_odd_pair_path' } };
  }
  const input = weightedGraph(graph);
  const shortest = floydWarshall(input);
  const a = input.indices.get(from)!;
  const b = input.indices.get(to)!;
  const indices = check.vertices.map((id) => input.indices.get(id)!);
  const length = indices.slice(1).reduce((sum, v, i) => sum + input.weights[indices[i]!]![v]!, 0);
  const expected = shortest.distances[a]![b]!;
  const oddIndices = odd.map((id) => input.indices.get(id)!);
  const distances = (members: number[]): number[][] => members.map((u) => members.map((v) => shortest.distances[u]![v]!));
  const optimalLength = minimumMatching(distances(oddIndices)).length;
  const forcedLength = expected + minimumMatching(distances(oddIndices.filter((i) => i !== a && i !== b))).length;
  return { value: length === expected && forcedLength === optimalLength,
    facts: { from, to, length, expected, optimalLength, forcedLength, vertices: check.vertices } };
}

/** Each call evaluates a fresh proposition; there is no state shared across items. */
export function evaluateWeightedStatement(graph: Graph, check: WeightedStatementCheck): WeightedStatementEvaluation {
  switch (check.type) {
    case 'length': return checkLength(graph, check);
    case 'dijkstra_label': return checkDijkstraLabel(graph, check);
    case 'nn_step': return checkNearestNeighbor(graph, check);
    case 'postman_duplicate': return checkPostmanDuplicate(graph, check);
  }
}
