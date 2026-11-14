import type { Edge, Graph, Solution, SolutionStep, Task, VertexId } from '../types.js';
import type { GraphWalk } from '../graph/walk.js';
import { connectedComponents, degrees, oddVertices } from '../graph/basic.js';
import { floydWarshall, vertexIndex, weightedGraph } from '../graph/weighted.js';
import { solveEuler } from './euler.js';
import type { EulerTraceStep } from './euler.js';
import { postmanTemplates } from '../explain/templates.vi.js';

export type PostmanOptions = Omit<Extract<Task, { type: 'postman' }>, 'type'>;
export type PostmanFailureReason = 'disconnected' | 'invalid_start';
export interface PostmanPair { from: VertexId; to: VertexId; length: number; walk: GraphWalk }
export interface PostmanDuplicate { id: string; originalEdgeId: string }
export type PostmanAnswer =
  | { exists: true; walk: GraphWalk; length: number; baseLength: number; duplicateLength: number; duplicates: PostmanDuplicate[] }
  | { exists: false; reason: PostmanFailureReason };
export type PostmanTraceStep =
  | { type: 'odd_vertices'; vertices: VertexId[]; degrees: Record<VertexId, number> }
  | { type: 'distances'; vertices: VertexId[]; distances: (number | null)[][] }
  | { type: 'matching'; pairs: PostmanPair[]; length: number; statesVisited: number }
  | { type: 'duplicate'; pair: PostmanPair; copies: PostmanDuplicate[] }
  | { type: 'euler'; event: EulerTraceStep }
  | { type: 'total'; baseLength: number; duplicateLength: number; length: number };
export interface PostmanSolution extends Solution {
  answer: PostmanAnswer;
  matching: PostmanPair[];
  trace: PostmanTraceStep[];
}

/** Minimum perfect matching on the odd-vertex metric, with deterministic ties. */
function minimumMatching(distances: number[][]): { pairs: [number, number][]; length: number; statesVisited: number } {
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

/** Closed Chinese postman tour: traverse every original edge, then return to start. */
export function solvePostman(graph: Graph, options: PostmanOptions): PostmanSolution {
  const input = weightedGraph(graph);
  vertexIndex(input, options.start);
  const odd = oddVertices(graph);
  const allDegrees = degrees(graph);
  const trace: PostmanTraceStep[] = [{ type: 'odd_vertices', vertices: odd, degrees: allDegrees }];
  const steps: SolutionStep[] = [];
  const matching: PostmanPair[] = [];
  const labels = new Map(graph.vertices.map(({ id, label }) => [id, label]));
  const names = new Map(graph.edges.map(({ id, name }) => [id, name ?? id]));
  const label = (id: VertexId): string => labels.get(id)!;
  const add = (kind: string, text: string, data: unknown, highlight?: SolutionStep['highlight']): void => {
    steps.push({ index: steps.length + 1, kind, text, data, ...(highlight === undefined ? {} : { highlight }) });
  };
  add('postman_degrees', postmanTemplates.degrees(graph.vertices.map(({ id }) => [label(id), allDegrees[id]!])), trace[0], { vertices: odd });
  const finish = (answer: PostmanAnswer): PostmanSolution => ({ answer, matching, trace, steps, notes: [postmanTemplates.note] });
  const fail = (reason: PostmanFailureReason): PostmanSolution => {
    add('conclusion', postmanTemplates.failure(reason, label(options.start)), { reason });
    return finish({ exists: false, reason });
  };
  if (connectedComponents(graph, { ignoreIsolated: true }).length > 1) return fail('disconnected');
  if (graph.edges.length > 0 && allDegrees[options.start] === 0) return fail('invalid_start');

  const shortest = floydWarshall(input);
  const oddIndices = odd.map((id) => input.indices.get(id)!);
  const distances = oddIndices.map((u) => oddIndices.map((v) => shortest.distances[u]![v]!));
  const distanceEvent: PostmanTraceStep = { type: 'distances', vertices: odd,
    distances: distances.map((row) => row.map((value) => Number.isFinite(value) ? value : null)) };
  trace.push(distanceEvent);
  add('postman_distances', postmanTemplates.distances(odd.map(label)), distanceEvent);
  const matched = minimumMatching(distances);
  for (const [a, b] of matched.pairs) {
    let u = oddIndices[a]!;
    const v = oddIndices[b]!;
    const walk: GraphWalk = { vertices: [input.ids[u]!], edgeIds: [] };
    while (u !== v) {
      const next = shortest.next[u]![v]!;
      walk.edgeIds.push(input.edgeIds[u]![next]!);
      walk.vertices.push(input.ids[next]!);
      u = next;
    }
    matching.push({ from: odd[a]!, to: odd[b]!, length: distances[a]![b]!, walk });
  }
  const matchEvent: PostmanTraceStep = { type: 'matching', pairs: matching, length: matched.length, statesVisited: matched.statesVisited };
  trace.push(matchEvent);
  add('postman_matching', postmanTemplates.matching(matching, label, matched.length), matchEvent);

  const extraEdges: Edge[] = [];
  const duplicates: PostmanDuplicate[] = [];
  const usedIds = new Set(graph.edges.map(({ id }) => id));
  const byId = new Map(graph.edges.map((edge) => [edge.id, edge]));
  let serial = 1;
  for (const pair of matching) {
    const copies: PostmanDuplicate[] = [];
    for (const originalEdgeId of pair.walk.edgeIds) {
      let id: string;
      do { id = `postman_duplicate_${serial++}`; } while (usedIds.has(id));
      usedIds.add(id);
      const original = byId.get(originalEdgeId)!;
      extraEdges.push({ ...original, id, name: original.name ?? original.id });
      const copy = { id, originalEdgeId };
      duplicates.push(copy);
      copies.push(copy);
    }
    const event: PostmanTraceStep = { type: 'duplicate', pair, copies };
    trace.push(event);
    add('postman_duplicate', postmanTemplates.duplicate(pair.walk.vertices.map(label), pair.walk.edgeIds.map((id) => names.get(id)!), pair.length), event,
      { vertices: pair.walk.vertices, edges: pair.walk.edgeIds });
  }
  const originalIds = new Map(duplicates.map(({ id, originalEdgeId }) => [id, originalEdgeId]));
  const originalId = (id: string): string => originalIds.get(id) ?? id;
  const augmented: Graph = { directed: false, vertices: graph.vertices, edges: [...graph.edges, ...extraEdges] };
  const euler = solveEuler(augmented, { want: 'circuit', start: options.start });
  // Connectivity and parity have already been established by the construction.
  if (!euler.answer.exists) throw new Error(postmanTemplates.constructionFailure);
  for (const event of euler.trace) trace.push({ type: 'euler', event });
  add('postman_augmented', postmanTemplates.augmented(graph.vertices.map(({ id }) => [label(id), euler.analysis.degrees[id]!])),
    { degrees: euler.analysis.degrees }, { vertices: graph.vertices.map(({ id }) => id) });
  const walk: GraphWalk = { vertices: [...euler.answer.walk.vertices], edgeIds: euler.answer.walk.edgeIds.map(originalId) };
  add('postman_euler', postmanTemplates.eulerCircuit(label(options.start), walk.vertices.map(label)), walk,
    { vertices: walk.vertices, edges: walk.edgeIds });
  const baseLength = graph.edges.reduce((sum, edge) => sum + edge.w!, 0);
  const length = baseLength + matched.length;
  const total: PostmanTraceStep = { type: 'total', baseLength, duplicateLength: matched.length, length };
  trace.push(total);
  add('conclusion', postmanTemplates.success(baseLength, matched.length, length), total,
    { vertices: walk.vertices, edges: walk.edgeIds });
  return finish({ exists: true, walk, length, baseLength, duplicateLength: matched.length, duplicates });
}
