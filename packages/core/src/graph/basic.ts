import type { Graph, VertexId } from '../types.js';
import { unknownVertexMessage } from '../explain/templates.vi.js';

/** A loop contributes twice. Call validateSpec at the JSON boundary. */
export function degree(graph: Graph, vertex: VertexId): number {
  if (!graph.vertices.some(({ id }) => id === vertex)) {
    throw new RangeError(unknownVertexMessage(vertex));
  }
  return graph.edges.reduce((sum, edge) => sum + Number(edge.u === vertex) + Number(edge.v === vertex), 0);
}

export function degrees(graph: Graph): Record<VertexId, number> {
  return Object.fromEntries(graph.vertices.map(({ id }) => [id, degree(graph, id)]));
}

export function oddVertices(graph: Graph): VertexId[] {
  return graph.vertices.filter(({ id }) => degree(graph, id) % 2 === 1).map(({ id }) => id);
}

export function isolatedVertices(graph: Graph): VertexId[] {
  return graph.vertices.filter(({ id }) => degree(graph, id) === 0).map(({ id }) => id);
}

/** Component and vertex order both follow the input vertex order. */
export function connectedComponents(graph: Graph, options: { ignoreIsolated?: boolean } = {}): VertexId[][] {
  const active = graph.vertices.filter(({ id }) => !options.ignoreIsolated || degree(graph, id) > 0);
  const adjacency = new Map(graph.vertices.map(({ id }) => [id, new Set<VertexId>()]));
  for (const edge of graph.edges) {
    adjacency.get(edge.u)?.add(edge.v);
    adjacency.get(edge.v)?.add(edge.u);
  }
  const visited = new Set<VertexId>();
  const components: VertexId[][] = [];
  for (const { id } of active) {
    if (visited.has(id)) continue;
    const queue = [id];
    visited.add(id);
    for (let i = 0; i < queue.length; i++) {
      for (const neighbor of adjacency.get(queue[i]!) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    const members = new Set(queue);
    components.push(active.filter((vertex) => members.has(vertex.id)).map((vertex) => vertex.id));
  }
  return components;
}

/** Empty active vertex sets are connected by convention. */
export function isConnected(graph: Graph, options: { ignoreIsolated?: boolean } = {}): boolean {
  return connectedComponents(graph, options).length <= 1;
}

export function hasLoops(graph: Graph): boolean {
  return graph.edges.some(({ u, v }) => u === v);
}

export function hasParallelEdges(graph: Graph): boolean {
  const seen = new Map<VertexId, Set<VertexId>>();
  for (const { u, v } of graph.edges) {
    if (seen.get(u)?.has(v) || seen.get(v)?.has(u)) return true;
    const neighbors = seen.get(u) ?? new Set<VertexId>();
    neighbors.add(v);
    seen.set(u, neighbors);
  }
  return false;
}

export function isSimpleGraph(graph: Graph): boolean {
  return !hasLoops(graph) && !hasParallelEdges(graph);
}

/** Here multigraph means a non-simple graph, including graphs with loops. */
export function isMultigraph(graph: Graph): boolean {
  return !isSimpleGraph(graph);
}
