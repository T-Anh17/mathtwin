import type { Graph, VertexId } from '../types.js';
import { isConnected, isSimpleGraph } from './basic.js';

export interface HamiltonAnalysis {
  connected: boolean;
  simple: boolean;
  neighborCounts: Record<VertexId, number>;
  dirac: { applicable: boolean; holds: boolean };
  ore: { applicable: boolean; holds: boolean };
}

/** Remove loops and retain the first input edge for each unordered pair. */
export function underlyingSimpleGraph(graph: Graph): Graph {
  const neighbors = new Map(graph.vertices.map(({ id }) => [id, new Set<VertexId>()]));
  const edges = graph.edges.filter(({ u, v }) => {
    if (u === v || neighbors.get(u)!.has(v)) return false;
    neighbors.get(u)!.add(v);
    neighbors.get(v)!.add(u);
    return true;
  });
  return { directed: false, vertices: graph.vertices, edges };
}

/** Dirac and Ore are evaluated on the underlying simple graph, for n >= 3. */
export function analyzeHamilton(graph: Graph): HamiltonAnalysis {
  const neighbors = new Map(graph.vertices.map(({ id }) => [id, new Set<VertexId>()]));
  for (const { u, v } of graph.edges) {
    if (u === v) continue;
    neighbors.get(u)!.add(v);
    neighbors.get(v)!.add(u);
  }
  const n = graph.vertices.length;
  const simple = isSimpleGraph(graph);
  const applicable = n >= 3;
  const neighborCounts = Object.fromEntries(graph.vertices.map(({ id }) => [id, neighbors.get(id)!.size]));
  const dirac = applicable && graph.vertices.every(({ id }) => neighborCounts[id]! >= n / 2);
  let ore = applicable;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const u = graph.vertices[i]!.id;
      const v = graph.vertices[j]!.id;
      if (!neighbors.get(u)!.has(v) && neighborCounts[u]! + neighborCounts[v]! < n) ore = false;
    }
  }
  return {
    connected: isConnected(graph), simple, neighborCounts,
    dirac: { applicable, holds: dirac }, ore: { applicable, holds: ore },
  };
}

export type HamiltonRuleStep =
  | { type: 'force_edges'; vertex: VertexId; edgeIds: string[]; availableEdgeIds: string[] }
  | { type: 'exclude_edges'; vertex: VertexId; edgeIds: string[]; forcedEdgeIds: string[] }
  | { type: 'insufficient_degree'; vertex: VertexId; degree: number }
  | {
    type: 'contradiction'; reason: 'too_few_edges' | 'too_many_forced' | 'premature_cycle';
    vertices: VertexId[]; edgeIds: string[];
  };

export interface HamiltonRulesResult {
  status: 'inconclusive' | 'impossible' | 'cycle';
  forcedEdgeIds: string[];
  excludedEdgeIds: string[];
  trace: HamiltonRuleStep[];
}

/** Necessary cycle rules on the underlying simple graph; never constrain paths. */
export function hamiltonCycleRules(input: Graph): HamiltonRulesResult {
  const graph = underlyingSimpleGraph(input);
  const trace: HamiltonRuleStep[] = [];
  // 0 = undecided, 1 = forced, 2 = excluded. Edge order is the input order.
  const state = new Uint8Array(graph.edges.length);
  const result = (status: HamiltonRulesResult['status']): HamiltonRulesResult => ({
    status,
    forcedEdgeIds: graph.edges.filter((_, i) => state[i] === 1).map(({ id }) => id),
    excludedEdgeIds: graph.edges.filter((_, i) => state[i] === 2).map(({ id }) => id),
    trace,
  });
  if (graph.vertices.length < 3) return result('inconclusive');

  const incident = new Map(graph.vertices.map(({ id }) => [id, [] as number[]]));
  graph.edges.forEach(({ u, v }, i) => {
    incident.get(u)!.push(i);
    incident.get(v)!.push(i);
  });
  const edgeIds = (indices: number[]): string[] => indices.map((i) => graph.edges[i]!.id);
  for (const { id } of graph.vertices) {
    if (incident.get(id)!.length < 2) {
      trace.push({ type: 'insufficient_degree', vertex: id, degree: incident.get(id)!.length });
      return result('impossible');
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const { id } of graph.vertices) {
      const available = incident.get(id)!.filter((i) => state[i] !== 2);
      const forced = available.filter((i) => state[i] === 1);
      if (available.length < 2 || forced.length > 2) {
        trace.push({
          type: 'contradiction',
          reason: available.length < 2 ? 'too_few_edges' : 'too_many_forced',
          vertices: [id], edgeIds: edgeIds(available.length < 2 ? available : forced),
        });
        return result('impossible');
      }
      const undecided = available.filter((i) => state[i] === 0);
      if (undecided.length === 0) continue;
      if (forced.length === 2) {
        for (const i of undecided) state[i] = 2;
        trace.push({ type: 'exclude_edges', vertex: id, edgeIds: edgeIds(undecided), forcedEdgeIds: edgeIds(forced) });
        changed = true;
      } else if (available.length === 2) {
        for (const i of undecided) state[i] = 1;
        trace.push({ type: 'force_edges', vertex: id, edgeIds: edgeIds(undecided), availableEdgeIds: edgeIds(available) });
        changed = true;
      }
    }

    // A forced cycle on a proper subset cannot be extended to visit all vertices.
    const seen = new Set<VertexId>();
    for (const { id } of graph.vertices) {
      if (seen.has(id)) continue;
      const queue = [id];
      seen.add(id);
      let closed = true;
      for (let i = 0; i < queue.length; i++) {
        const current = queue[i]!;
        const forced = incident.get(current)!.filter((e) => state[e] === 1);
        if (forced.length !== 2) closed = false;
        for (const e of forced) {
          const edge = graph.edges[e]!;
          const next = edge.u === current ? edge.v : edge.u;
          if (!seen.has(next)) {
            seen.add(next);
            queue.push(next);
          }
        }
      }
      if (!closed) continue;
      if (queue.length === graph.vertices.length) {
        // Finish excluding surplus edges so the explanation includes that rule.
        if (state.every((value) => value !== 0)) return result('cycle');
        continue;
      }
      const members = new Set(queue);
      trace.push({
        type: 'contradiction', reason: 'premature_cycle',
        vertices: graph.vertices.filter((v) => members.has(v.id)).map((v) => v.id),
        edgeIds: graph.edges.filter((e, i) => state[i] === 1 && members.has(e.u)).map((e) => e.id),
      });
      return result('impossible');
    }
  }
  return result('inconclusive');
}
