import fc from 'fast-check';
import { expect } from 'vitest';
import type { Graph, GraphWalk, HamiltonOptions, VertexId } from '../src/index.js';
import { graph } from './fixtures.js';

export function fromPairs(ids: string[], pairs: [string, string][]): Graph {
  return graph(ids, pairs.map(([u, v], i) => ({ id: `e${i + 1}`, u, v })));
}

export function cycleGraph(n: number): Graph {
  const ids = Array.from({ length: n }, (_, i) => String(i));
  return fromPairs(ids, ids.map((id, i) => [id, ids[(i + 1) % n]!]));
}

export function completeGraph(n: number): Graph {
  const ids = Array.from({ length: n }, (_, i) => String(i));
  const pairs: [string, string][] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) pairs.push([ids[i]!, ids[j]!]);
  return fromPairs(ids, pairs);
}

export function multigraphArbitrary(maxEdges = 25): fc.Arbitrary<Graph> {
  return fc.integer({ min: 0, max: 8 }).chain((n) => {
    const ids = Array.from({ length: n }, (_, i) => String(i));
    if (n === 0) return fc.constant(graph([]));
    return fc.array(fc.tuple(fc.integer({ min: 0, max: n - 1 }), fc.integer({ min: 0, max: n - 1 })), { maxLength: maxEdges })
      .map((pairs) => fromPairs(ids, pairs.map(([u, v]) => [String(u), String(v)])));
  });
}

export function freezeGraph(input: Graph): Graph {
  input.vertices.forEach(Object.freeze);
  input.edges.forEach(Object.freeze);
  Object.freeze(input.vertices);
  Object.freeze(input.edges);
  return Object.freeze(input);
}

/** Independent edge-incidence checks; deliberately does not call checkWalk. */
export function assertWalkEdges(input: Graph, walk: GraphWalk): void {
  expect(walk.edgeIds).toHaveLength(Math.max(0, walk.vertices.length - 1));
  expect(walk.vertices.every((id) => input.vertices.some((v) => v.id === id))).toBe(true);
  for (let i = 0; i < walk.edgeIds.length; i++) {
    const edge = input.edges.find(({ id }) => id === walk.edgeIds[i]);
    const u = walk.vertices[i];
    const v = walk.vertices[i + 1];
    expect(edge !== undefined && ((edge.u === u && edge.v === v) || (edge.u === v && edge.v === u))).toBe(true);
  }
}

/** Enumerate complete vertex permutations, without DP, degree rules or pruning by adjacency. */
export function bruteHamilton(input: Graph, options: HamiltonOptions): VertexId[] | null {
  const ids = input.vertices.map(({ id }) => id);
  const cycle = options.want === 'cycle';
  if (ids.length === 0 || (cycle && ids.length < 3)) return null;
  const adjacent = (u: string, v: string): boolean => input.edges.some((e) => (e.u === u && e.v === v) || (e.u === v && e.v === u));
  const start = options.start ?? (cycle ? options.end : undefined);
  const permutation: VertexId[] = [];
  const used = new Set<VertexId>();
  const enumerate = (): VertexId[] | null => {
    if (permutation.length === ids.length) {
      const first = permutation[0]!;
      const last = permutation[permutation.length - 1]!;
      if (options.end !== undefined && (cycle ? first : last) !== options.end) return null;
      for (let i = 1; i < permutation.length; i++) if (!adjacent(permutation[i - 1]!, permutation[i]!)) return null;
      if (cycle && !adjacent(last, first)) return null;
      return cycle ? [...permutation, first] : [...permutation];
    }
    for (const id of ids) {
      if (used.has(id) || (permutation.length === 0 && start !== undefined && id !== start)) continue;
      used.add(id);
      permutation.push(id);
      const found = enumerate();
      if (found !== null) return found;
      permutation.pop();
      used.delete(id);
    }
    return null;
  };
  return enumerate();
}

/** Exhaustive edge-use oracle for small Euler fixtures; no degree/connectivity theorem. */
export function bruteEuler(input: Graph, circuit: boolean, start?: string): boolean {
  if (input.edges.length === 0) return true;
  const used = new Set<string>();
  const visit = (current: string, root: string): boolean => {
    if (used.size === input.edges.length) return !circuit || current === root;
    for (const edge of input.edges) {
      if (used.has(edge.id) || (edge.u !== current && edge.v !== current)) continue;
      used.add(edge.id);
      if (visit(edge.u === current ? edge.v : edge.u, root)) return true;
      used.delete(edge.id);
    }
    return false;
  };
  return input.vertices.some(({ id }) => (start === undefined || start === id) && visit(id, id));
}
