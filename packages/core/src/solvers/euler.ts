import type { Graph, Solution, SolutionStep, Task, VertexId } from '../types.js';
import type { GraphWalk } from '../graph/walk.js';
import { connectedComponents, degree, degrees } from '../graph/basic.js';
import { eulerTemplates } from '../explain/templates.vi.js';

export type EulerOptions = Omit<Extract<Task, { type: 'euler' }>, 'type'>;
export interface EulerAnalysis {
  degrees: Record<VertexId, number>;
  oddVertices: VertexId[];
  components: VertexId[][];
  hasPath: boolean;
  hasCircuit: boolean;
}
export type EulerFailureReason = 'disconnected' | 'odd_degrees' | 'invalid_start';
export type EulerAnswer =
  | { exists: true; kind: 'path' | 'circuit'; walk: GraphWalk }
  | { exists: false; reason: EulerFailureReason };
export type EulerTraceStep =
  | { type: 'start'; vertex: VertexId }
  | { type: 'traverse'; from: VertexId; to: VertexId; edgeId: string }
  | { type: 'backtrack'; vertex: VertexId; via?: string };
export interface EulerSolution extends Solution {
  answer: EulerAnswer;
  analysis: EulerAnalysis;
  trace: EulerTraceStep[];
}

/** A closed Euler walk also satisfies hasPath. Isolated vertices are ignored. */
export function analyzeEuler(graph: Graph): EulerAnalysis {
  const allDegrees = degrees(graph);
  const oddVertices = graph.vertices.filter(({ id }) => allDegrees[id]! % 2 === 1).map(({ id }) => id);
  const components = connectedComponents(graph, { ignoreIsolated: true });
  return {
    degrees: allDegrees, oddVertices, components,
    hasPath: components.length <= 1 && (oddVertices.length === 0 || oddVertices.length === 2),
    hasCircuit: components.length <= 1 && oddVertices.length === 0,
  };
}

/** Hierholzer, using each edge ID once (including loops and parallel edges). */
export function solveEuler(graph: Graph, options: EulerOptions = { want: 'any' }): EulerSolution {
  if (options.start !== undefined) degree(graph, options.start);
  const analysis = analyzeEuler(graph);
  const trace: EulerTraceStep[] = [];
  const steps: SolutionStep[] = [];
  const labels = new Map(graph.vertices.map(({ id, label }) => [id, label]));
  const names = new Map(graph.edges.map(({ id, name }) => [id, name ?? id]));
  const label = (id: VertexId): string => labels.get(id)!;
  const add = (kind: string, text: string, data: unknown, highlight?: SolutionStep['highlight']): void => {
    steps.push({ index: steps.length + 1, kind, text, data, ...(highlight === undefined ? {} : { highlight }) });
  };
  for (const { id } of graph.vertices) {
    add('degree', eulerTemplates.degree(label(id), analysis.degrees[id]!), { vertex: id, degree: analysis.degrees[id] }, { vertices: [id] });
  }
  add('euler_conditions', eulerTemplates.conditions(
    analysis.components.length <= 1, analysis.oddVertices.map(label),
  ), analysis, { vertices: analysis.oddVertices });
  const finish = (answer: EulerAnswer): EulerSolution => ({ answer, analysis, trace, steps, notes: [eulerTemplates.note] });
  const fail = (reason: EulerFailureReason): EulerSolution => {
    add('conclusion', eulerTemplates.failure(reason, options.want, options.start === undefined ? undefined : label(options.start)), { reason });
    return finish({ exists: false, reason });
  };
  if (analysis.components.length > 1) return fail('disconnected');
  if (options.want === 'circuit' ? !analysis.hasCircuit : !analysis.hasPath) return fail('odd_degrees');
  if (options.start !== undefined && graph.edges.length > 0
    && (analysis.degrees[options.start] === 0
      || (analysis.oddVertices.length === 2 && !analysis.oddVertices.includes(options.start)))) {
    return fail('invalid_start');
  }

  const start = options.start ?? analysis.oddVertices[0]
    ?? graph.vertices.find(({ id }) => analysis.degrees[id]! > 0)?.id ?? graph.vertices[0]?.id;
  const vertices: VertexId[] = [];
  const edgeIds: string[] = [];
  if (start !== undefined) {
    const incident = new Map(graph.vertices.map(({ id }) => [id, [] as number[]]));
    graph.edges.forEach(({ u, v }, i) => {
      incident.get(u)!.push(i);
      if (u !== v) incident.get(v)!.push(i);
    });
    const cursor = new Map(graph.vertices.map(({ id }) => [id, 0]));
    const used = new Set<number>();
    const stack: { vertex: VertexId; via?: string }[] = [{ vertex: start }];
    trace.push({ type: 'start', vertex: start });
    while (stack.length > 0) {
      const current = stack[stack.length - 1]!;
      const candidates = incident.get(current.vertex)!;
      let i = cursor.get(current.vertex)!;
      while (i < candidates.length && used.has(candidates[i]!)) i++;
      cursor.set(current.vertex, i + 1);
      if (i < candidates.length) {
        const edgeIndex = candidates[i]!;
        const edge = graph.edges[edgeIndex]!;
        const next = edge.u === current.vertex ? edge.v : edge.u;
        used.add(edgeIndex);
        stack.push({ vertex: next, via: edge.id });
        trace.push({ type: 'traverse', from: current.vertex, to: next, edgeId: edge.id });
      } else {
        stack.pop();
        vertices.push(current.vertex);
        if (current.via !== undefined) edgeIds.push(current.via);
        trace.push({ type: 'backtrack', ...current });
      }
    }
    vertices.reverse();
    edgeIds.reverse();
  }
  for (const event of trace) {
    if (event.type === 'start') {
      add('euler_start', eulerTemplates.start(label(event.vertex)), event, { vertices: [event.vertex] });
    } else if (event.type === 'traverse') {
      add('euler_traverse', eulerTemplates.traverse(label(event.from), label(event.to), names.get(event.edgeId)!), event,
        { vertices: [event.from, event.to], edges: [event.edgeId] });
    } else {
      add('euler_backtrack', eulerTemplates.backtrack(label(event.vertex)), event, { vertices: [event.vertex] });
    }
  }
  const kind = analysis.oddVertices.length === 0 ? 'circuit' : 'path';
  const walk = { vertices, edgeIds };
  add('conclusion', eulerTemplates.success(kind, vertices.map(label), edgeIds.length), walk, { vertices, edges: edgeIds });
  return finish({ exists: true, kind, walk });
}
