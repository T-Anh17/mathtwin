import type { Graph, Solution, SolutionStep, Task, VertexId } from '../types.js';
import type { GraphWalk } from '../graph/walk.js';
import { degree } from '../graph/basic.js';
import { analyzeHamilton, hamiltonCycleRules } from '../graph/hamilton.js';
import type { HamiltonAnalysis, HamiltonRuleStep } from '../graph/hamilton.js';
import { searchHamilton } from '../graph/hamilton-search.js';
import { hamiltonTemplates, validationMessages } from '../explain/templates.vi.js';

export type HamiltonOptions = Omit<Extract<Task, { type: 'hamilton' }>, 'type'>;
export type HamiltonFailureReason =
  | 'empty_graph' | 'too_few_vertices' | 'disconnected' | 'incompatible_endpoints' | 'cycle_rules' | 'exhausted';
export type HamiltonAnswer =
  | { exists: true; kind: 'path' | 'cycle'; walk: GraphWalk }
  | { exists: false; reason: HamiltonFailureReason };
export type HamiltonTraceStep = HamiltonRuleStep
  | { type: 'search'; statesVisited: number; memoHits: number }
  | { type: 'start'; vertex: VertexId }
  | { type: 'advance' | 'close'; from: VertexId; to: VertexId; edgeId: string }
  | { type: 'verify'; vertexCount: number; edgeCount: number; closed: boolean };
export interface HamiltonSolution extends Solution {
  answer: HamiltonAnswer;
  analysis: HamiltonAnalysis;
  method: 'conditions' | 'rules' | 'search';
  trace: HamiltonTraceStep[];
}

function forcedCycle(graph: Graph, forcedEdgeIds: string[], start: VertexId): GraphWalk {
  const forced = new Set(forcedEdgeIds);
  const edges = graph.edges.filter(({ id }) => forced.has(id));
  const walk: GraphWalk = { vertices: [start], edgeIds: [] };
  let current = start;
  let previous: VertexId | undefined;
  for (let i = 0; i < graph.vertices.length; i++) {
    const next = graph.vertices.find(({ id }) => id !== previous && edges.some((e) =>
      (e.u === current && e.v === id) || (e.v === current && e.u === id)))!.id;
    const edge = edges.find((e) => (e.u === current && e.v === next) || (e.v === current && e.u === next))!;
    walk.vertices.push(next);
    walk.edgeIds.push(edge.id);
    previous = current;
    current = next;
  }
  return walk;
}

/** Exact Hamilton solver. Cycle-specific textbook rules never constrain paths. */
export function solveHamilton(graph: Graph, options: HamiltonOptions = { want: 'cycle' }): HamiltonSolution {
  if (graph.vertices.length > 20) throw new RangeError(validationMessages.vertexLimit);
  if (options.start !== undefined) degree(graph, options.start);
  if (options.end !== undefined) degree(graph, options.end);
  const analysis = analyzeHamilton(graph);
  const n = graph.vertices.length;
  const cycle = options.want === 'cycle';
  const trace: HamiltonTraceStep[] = [];
  const steps: SolutionStep[] = [];
  let method: HamiltonSolution['method'] = 'conditions';
  const labels = new Map(graph.vertices.map(({ id, label }) => [id, label]));
  const names = new Map(graph.edges.map(({ id, name }) => [id, name ?? id]));
  const label = (id: VertexId): string => labels.get(id)!;
  const name = (id: string): string => names.get(id)!;
  const add = (kind: string, text: string, data: unknown, highlight?: SolutionStep['highlight']): void => {
    steps.push({ index: steps.length + 1, kind, text, data, ...(highlight === undefined ? {} : { highlight }) });
  };
  add('hamilton_conditions', hamiltonTemplates.conditions(n, analysis.connected), analysis);
  if (!analysis.simple) add('hamilton_underlying', hamiltonTemplates.underlying, { neighborCounts: analysis.neighborCounts });
  if (cycle) add('hamilton_theorems', hamiltonTemplates.theorems(analysis, n), { dirac: analysis.dirac, ore: analysis.ore });
  const finish = (answer: HamiltonAnswer): HamiltonSolution => ({ answer, analysis, method, trace, steps, notes: [hamiltonTemplates.note] });
  const fail = (reason: HamiltonFailureReason): HamiltonSolution => {
    add('conclusion', hamiltonTemplates.failure(reason, options.want), { reason });
    return finish({ exists: false, reason });
  };
  if (n === 0) return fail('empty_graph');
  if (cycle && n < 3) return fail('too_few_vertices');
  if (options.start !== undefined && options.end !== undefined
    && (cycle ? options.start !== options.end : n > 1 && options.start === options.end)) {
    return fail('incompatible_endpoints');
  }
  if (!analysis.connected) return fail('disconnected');

  const cycleStart = options.start ?? options.end ?? graph.vertices[0]!.id;
  let walk: GraphWalk | undefined;
  if (cycle) {
    const rules = hamiltonCycleRules(graph);
    for (const event of rules.trace) {
      trace.push(event);
      const vertices = 'vertex' in event ? [event.vertex] : event.vertices;
      const edges = 'edgeIds' in event ? event.edgeIds : [];
      add(`hamilton_${event.type}`, hamiltonTemplates.rule(event, label, name), event, { vertices, edges });
    }
    if (rules.status === 'impossible') {
      method = 'rules';
      return fail('cycle_rules');
    }
    if (rules.status === 'cycle') {
      method = 'rules';
      walk = forcedCycle(graph, rules.forcedEdgeIds, cycleStart);
    }
  }
  if (walk === undefined) {
    method = 'search';
    const indices = new Map(graph.vertices.map(({ id }, i) => [id, i]));
    const starts = cycle ? [indices.get(cycleStart)!]
      : options.start === undefined ? graph.vertices.map((_, i) => i) : [indices.get(options.start)!];
    const search = searchHamilton(graph, starts, cycle, !cycle && options.end !== undefined ? indices.get(options.end) : undefined);
    const event: HamiltonTraceStep = { type: 'search', statesVisited: search.statesVisited, memoHits: search.memoHits };
    trace.push(event);
    add('hamilton_search', hamiltonTemplates.search(options.want), event);
    if (search.indices === null) return fail('exhausted');
    walk = { vertices: search.indices.map((i) => graph.vertices[i]!.id), edgeIds: search.edgeIds };
  }

  const start: HamiltonTraceStep = { type: 'start', vertex: walk.vertices[0]! };
  trace.push(start);
  add('hamilton_start', hamiltonTemplates.start(label(start.vertex)), start, { vertices: [start.vertex] });
  for (let i = 0; i < walk.edgeIds.length; i++) {
    const event: HamiltonTraceStep = {
      type: cycle && i === walk.edgeIds.length - 1 ? 'close' : 'advance',
      from: walk.vertices[i]!, to: walk.vertices[i + 1]!, edgeId: walk.edgeIds[i]!,
    };
    trace.push(event);
    add(`hamilton_${event.type}`, hamiltonTemplates.advance(label(event.from), label(event.to), name(event.edgeId), event.type === 'close'), event,
      { vertices: [event.from, event.to], edges: [event.edgeId] });
  }
  const verified: HamiltonTraceStep = { type: 'verify', vertexCount: n, edgeCount: walk.edgeIds.length, closed: cycle };
  trace.push(verified);
  add('hamilton_verify', hamiltonTemplates.verify(n, cycle), verified, { vertices: walk.vertices, edges: walk.edgeIds });
  add('conclusion', hamiltonTemplates.success(options.want, walk.vertices.map(label)), walk, { vertices: walk.vertices, edges: walk.edgeIds });
  return finish({ exists: true, kind: options.want, walk });
}
