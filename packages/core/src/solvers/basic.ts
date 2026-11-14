import type { Graph, Solution, SolutionStep, Task, VertexId } from '../types.js';
import { connectedComponents, degrees, hasLoops, hasParallelEdges, isolatedVertices, isSimpleGraph, oddVertices } from '../graph/basic.js';
import { realizeDegreeSequence } from '../graph/degree-sequence.js';
import { basicTemplates } from '../explain/templates.vi.js';

export type BasicTask = Extract<Task, { type: 'elements' | 'degree' | 'degree_sequence' | 'path' | 'connectivity' }>;

/** BFS ties follow vertex input order, then edge input order. */
export function findPath(graph: Graph, from: VertexId, to: VertexId): { vertices: VertexId[]; edgeIds: string[] } | null {
  const previous = new Map<VertexId, { vertex: VertexId; edgeId: string }>();
  const visited = new Set([from]);
  const queue = [from];
  for (let i = 0; i < queue.length && !visited.has(to); i++) {
    const current = queue[i]!;
    for (const { id } of graph.vertices) {
      if (visited.has(id)) continue;
      const edge = graph.edges.find((e) => (e.u === current && e.v === id) || (e.v === current && e.u === id));
      if (edge === undefined) continue;
      visited.add(id);
      previous.set(id, { vertex: current, edgeId: edge.id });
      queue.push(id);
    }
  }
  if (!visited.has(to)) return null;
  const vertices = [to];
  const edgeIds: string[] = [];
  let current = to;
  while (current !== from) {
    const parent = previous.get(current)!;
    vertices.push(parent.vertex);
    edgeIds.push(parent.edgeId);
    current = parent.vertex;
  }
  return { vertices: vertices.reverse(), edgeIds: edgeIds.reverse() };
}

export function solveBasic(graph: Graph, task: BasicTask): Solution {
  const labels = new Map(graph.vertices.map(({ id, label }) => [id, label]));
  const label = (id: VertexId): string => labels.get(id)!;
  const steps: SolutionStep[] = [];
  const add = (kind: string, text: string, data: unknown, highlight?: SolutionStep['highlight']): void => {
    steps.push({ index: steps.length + 1, kind, text, data, ...(highlight === undefined ? {} : { highlight }) });
  };
  switch (task.type) {
    case 'elements': {
      const answer = {
        vertices: graph.vertices.map(({ id }) => id), edges: graph.edges.map(({ id }) => id),
        vertexCount: graph.vertices.length, edgeCount: graph.edges.length,
        loops: graph.edges.filter(({ u, v }) => u === v).map(({ id }) => id),
        isolatedVertices: isolatedVertices(graph),
        hasLoops: hasLoops(graph), hasParallelEdges: hasParallelEdges(graph),
        simple: isSimpleGraph(graph), multigraph: !isSimpleGraph(graph),
      };
      add('vertices', basicTemplates.vertices(graph.vertices.map(({ label }) => label)), { vertices: answer.vertices }, { vertices: answer.vertices });
      add('edges', basicTemplates.edges(graph.edges.map((e) => ({ name: e.name ?? e.id, u: label(e.u), v: label(e.v) }))), { edges: graph.edges }, { edges: answer.edges });
      add('elements', basicTemplates.elements(answer.loops, answer.isolatedVertices.map(label), answer.simple, answer.hasParallelEdges), answer,
        { vertices: answer.isolatedVertices, edges: answer.loops });
      return { answer, steps, notes: [basicTemplates.notes.elements] };
    }
    case 'degree': {
      const all = degrees(graph);
      const selected = task.vertices ?? graph.vertices.map(({ id }) => id);
      for (const id of selected) add('degree', basicTemplates.degree(label(id), all[id]!), { vertex: id, degree: all[id] }, { vertices: [id] });
      const sum = Object.values(all).reduce((total, value) => total + value, 0);
      const odd = oddVertices(graph);
      const answer = { degrees: Object.fromEntries(selected.map((id) => [id, all[id]!])), degreeSum: sum, oddVertices: odd };
      add('degree_sum', basicTemplates.degreeSum(sum, graph.edges.length, odd.map(label)), { degreeSum: sum, edgeCount: graph.edges.length, oddVertices: odd }, { vertices: odd });
      return { answer, steps, notes: [basicTemplates.notes.degree] };
    }
    case 'degree_sequence': {
      const answer = realizeDegreeSequence(task.sequence, task.simple);
      add('degree_sequence_condition', basicTemplates.sequence(task.sequence, task.simple), { sequence: task.sequence, simple: task.simple });
      if (answer.exists) {
        add('degree_sequence_realization', basicTemplates.realization(answer.graph), answer.graph,
          { vertices: answer.graph.vertices.map(({ id }) => id), edges: answer.graph.edges.map(({ id }) => id) });
        const actual = degrees(answer.graph);
        for (const { id, label: name } of answer.graph.vertices) add('degree', basicTemplates.degree(name, actual[id]!), { vertex: id, degree: actual[id] });
      } else add('conclusion', basicTemplates.noSequence(task.simple), { exists: false });
      return { answer, steps, notes: [basicTemplates.notes.degree_sequence] };
    }
    case 'path': {
      const walk = findPath(graph, task.from, task.to);
      const answer = walk === null ? { exists: false as const } : { exists: true as const, walk };
      add('path', basicTemplates.path(label(task.from), label(task.to), walk?.vertices.map(label) ?? null), answer,
        walk === null ? undefined : { vertices: walk.vertices, edges: walk.edgeIds });
      return { answer, steps, notes: [basicTemplates.notes.path] };
    }
    case 'connectivity': {
      const components = connectedComponents(graph);
      const answer = { connected: components.length <= 1, components };
      for (const vertices of components) add('component', basicTemplates.component(vertices.map(label)), { vertices }, { vertices });
      add('conclusion', basicTemplates.connectivity(components.length, answer.connected), answer);
      return { answer, steps, notes: [basicTemplates.notes.connectivity] };
    }
  }
}
