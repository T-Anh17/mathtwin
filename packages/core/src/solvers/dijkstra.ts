import type { Graph, Solution, SolutionStep, Task, VertexId } from '../types.js';
import type { GraphWalk } from '../graph/walk.js';
import { vertexIndex, weightedGraph } from '../graph/weighted.js';
import { dijkstraTemplates } from '../explain/templates.vi.js';

export type DijkstraOptions = Omit<Extract<Task, { type: 'shortest_path' }>, 'type'>;
export interface DijkstraState {
  source: VertexId;
  target?: VertexId;
  labels: Record<VertexId, number | null>;
  previous: Record<VertexId, { vertex: VertexId; edgeId: string } | null>;
  settled: VertexId[];
}
export interface DijkstraUpdate {
  v: VertexId;
  old: number | null;
  candidate: number;
  new: number;
  via: VertexId;
  edgeId: string;
  viaDistance: number;
  weight: number;
}
export interface DijkstraTraceStep {
  selected: VertexId;
  tied: VertexId[];
  updates: DijkstraUpdate[];
  labels: Record<VertexId, number | null>;
  settled: VertexId[];
}
export type DijkstraAnswer =
  | { exists: true; length: number; walk: GraphWalk }
  | { exists: false; reason: 'unreachable' };
export interface DijkstraSolution extends Solution {
  answer: DijkstraAnswer;
  state: DijkstraState;
  trace: DijkstraTraceStep[];
}

export function createDijkstraState(graph: Graph, source: VertexId, target?: VertexId): DijkstraState {
  const input = weightedGraph(graph);
  vertexIndex(input, source);
  if (target !== undefined) vertexIndex(input, target);
  return {
    source, ...(target === undefined ? {} : { target }),
    labels: Object.fromEntries(input.ids.map((id) => [id, id === source ? 0 : null])),
    previous: Object.fromEntries(input.ids.map((id) => [id, null])),
    settled: [],
  };
}

/** All legal next selections, in input vertex order; null denotes infinity. */
export function dijkstraCandidates(graph: Graph, state: DijkstraState): VertexId[] {
  if (state.target !== undefined && state.settled.includes(state.target)) return [];
  let minimum = Infinity;
  let tied: VertexId[] = [];
  for (const { id } of graph.vertices) {
    if (state.settled.includes(id)) continue;
    const value = state.labels[id] ?? Infinity;
    if (value < minimum) { minimum = value; tied = [id]; }
    else if (value === minimum && value !== Infinity) tied.push(id);
  }
  return tied;
}

/** Pure transition, accepting any tied selection rather than a reference trace. */
export function advanceDijkstra(graph: Graph, state: DijkstraState, selected: VertexId): {
  state: DijkstraState; trace: DijkstraTraceStep;
} {
  const input = weightedGraph(graph);
  const u = vertexIndex(input, selected);
  const tied = dijkstraCandidates(graph, state);
  if (!tied.includes(selected)) throw new RangeError(dijkstraTemplates.invalidSelection);
  const labels = { ...state.labels };
  const previous = { ...state.previous };
  const settled = [...state.settled, selected];
  const updates: DijkstraUpdate[] = [];
  if (selected !== state.target) {
    for (let v = 0; v < input.ids.length; v++) {
      const id = input.ids[v]!;
      if (settled.includes(id) || !Number.isFinite(input.weights[u]![v]!)) continue;
      const old = labels[id]!;
      const candidate = labels[selected]! + input.weights[u]![v]!;
      const value = Math.min(old ?? Infinity, candidate);
      const edgeId = input.edgeIds[u]![v]!;
      updates.push({ v: id, old, candidate, new: value, via: selected, edgeId,
        viaDistance: labels[selected]!, weight: input.weights[u]![v]! });
      if (candidate < (old ?? Infinity)) {
        labels[id] = candidate;
        previous[id] = { vertex: selected, edgeId };
      }
    }
  }
  const nextState: DijkstraState = { ...state, labels, previous, settled };
  return { state: nextState, trace: { selected, tied, updates, labels: { ...labels }, settled: [...settled] } };
}

export function solveDijkstra(graph: Graph, options: DijkstraOptions): DijkstraSolution {
  let state = createDijkstraState(graph, options.from, options.to);
  const trace: DijkstraTraceStep[] = [];
  const steps: SolutionStep[] = [];
  const labels = new Map(graph.vertices.map(({ id, label }) => [id, label]));
  const label = (id: VertexId): string => labels.get(id)!;
  const add = (kind: string, text: string, data: unknown, highlight?: SolutionStep['highlight']): void => {
    steps.push({ index: steps.length + 1, kind, text, data, ...(highlight === undefined ? {} : { highlight }) });
  };
  add('dijkstra_init', dijkstraTemplates.init(label(options.from)), { labels: { ...state.labels } }, { labels: { ...state.labels } });
  while (true) {
    const selected = dijkstraCandidates(graph, state)[0];
    if (selected === undefined) break;
    const transition = advanceDijkstra(graph, state, selected);
    state = transition.state;
    trace.push(transition.trace);
    add('dijkstra_select', dijkstraTemplates.select(label(selected), state.labels[selected]!, transition.trace.tied.map(label)),
      transition.trace, { circled: [...state.settled], labels: { ...state.labels } });
    for (const update of transition.trace.updates) {
      add('dijkstra_label', dijkstraTemplates.update(label(update.v), update, label(update.via)), update,
        { vertices: [update.v], edges: [update.edgeId], labels: { [update.v]: update.new } });
    }
  }
  let answer: DijkstraAnswer;
  if (!state.settled.includes(options.to)) {
    answer = { exists: false, reason: 'unreachable' };
    add('conclusion', dijkstraTemplates.unreachable(label(options.from), label(options.to)), answer);
  } else {
    const walk: GraphWalk = { vertices: [options.to], edgeIds: [] };
    let current = options.to;
    while (current !== options.from) {
      const previous = state.previous[current]!;
      walk.edgeIds.push(previous.edgeId);
      walk.vertices.push(previous.vertex);
      current = previous.vertex;
    }
    walk.vertices.reverse();
    walk.edgeIds.reverse();
    answer = { exists: true, length: state.labels[options.to]!, walk };
    add('conclusion', dijkstraTemplates.success(walk.vertices.map(label), answer.length), answer,
      { vertices: walk.vertices, edges: walk.edgeIds });
  }
  return { answer, state, trace, steps, notes: [dijkstraTemplates.note] };
}
