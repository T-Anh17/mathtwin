import fc from 'fast-check';
import { expect } from 'vitest';
import type { Graph, GraphWalk } from '../src/index.js';
import { graph } from './fixtures.js';

export function weighted(ids: string[], edges: [string, string, number][]): Graph {
  return graph(ids, edges.map(([u, v, w], i) => ({ id: `e${i + 1}`, u, v, w })));
}

export function weightedArbitrary(maxVertices = 8, maxEdges = 35): fc.Arbitrary<Graph> {
  return fc.integer({ min: 1, max: maxVertices }).chain((n) => fc.tuple(
    fc.array(fc.tuple(fc.integer({ min: 0, max: n - 1 }), fc.integer({ min: 0, max: n - 1 }), fc.integer({ min: 1, max: 20 })), { maxLength: maxEdges }),
    fc.boolean(),
  ).map(([edges, complete]) => {
    const input = weighted(Array.from({ length: n }, (_, i) => String(i)), edges.map(([u, v, w]) => [String(u), String(v), w]));
    if (complete) {
      for (let u = 0; u < n; u++) {
        for (let v = u + 1; v < n; v++) {
          input.edges.push({ id: `extra_${u}_${v}`, u: String(u), v: String(v), w: (u * 7 + v * 11) % 19 + 1 });
        }
      }
    }
    return input;
  }));
}

function weight(input: Graph, u: string, v: string): number {
  return Math.min(Infinity, ...input.edges.filter((e) => (e.u === u && e.v === v) || (e.u === v && e.v === u)).map((e) => e.w!));
}

/** Enumerate simple paths rather than label-setting or Floyd–Warshall. */
export function bruteShortest(input: Graph, from: string, to: string): number {
  let best = Infinity;
  const visit = (current: string, seen: Set<string>, length: number): void => {
    if (current === to) { best = Math.min(best, length); return; }
    for (const { id } of input.vertices) {
      if (seen.has(id)) continue;
      const nextLength = length + weight(input, current, id);
      if (nextLength >= best) continue;
      visit(id, new Set([...seen, id]), nextLength);
    }
  };
  visit(from, new Set([from]), 0);
  return best;
}

/** Enumerate vertex permutations, including the closing edge. */
export function bruteTour(input: Graph, start: string): number {
  if (input.vertices.length === 1) return 0;
  let best = Infinity;
  const visit = (current: string, remaining: string[], length: number): void => {
    if (remaining.length === 0) { best = Math.min(best, length + weight(input, current, start)); return; }
    for (const id of remaining) {
      const nextLength = length + weight(input, current, id);
      if (!Number.isFinite(nextLength)) continue;
      visit(id, remaining.filter((other) => other !== id), nextLength);
    }
  };
  visit(start, input.vertices.map(({ id }) => id).filter((id) => id !== start), 0);
  return best;
}

export function assertWeightedWalk(input: Graph, walk: GraphWalk, length: number): void {
  expect(walk.edgeIds.length).toBe(Math.max(0, walk.vertices.length - 1));
  let total = 0;
  walk.edgeIds.forEach((id, i) => {
    const edge = input.edges.find((e) => e.id === id)!;
    expect(edge).toBeDefined();
    const u = walk.vertices[i]!;
    const v = walk.vertices[i + 1]!;
    expect((edge.u === u && edge.v === v) || (edge.u === v && edge.v === u)).toBe(true);
    total += edge.w!;
  });
  expect(total).toBeCloseTo(length, 10);
}

/** Exhaustive shortest walk in (current vertex, covered edge subset) state space. */
export function brutePostman(input: Graph, start: string): number {
  const full = (1 << input.edges.length) - 1;
  const frontier = [{ vertex: start, mask: 0, length: 0 }];
  const distances = new Map<string, number>([[`${start}:0`, 0]]);
  while (frontier.length > 0) {
    frontier.sort((a, b) => b.length - a.length);
    const current = frontier.pop()!;
    if (current.length !== distances.get(`${current.vertex}:${current.mask}`)) continue;
    if (current.vertex === start && current.mask === full) return current.length;
    input.edges.forEach((edge, i) => {
      if (edge.u !== current.vertex && edge.v !== current.vertex) return;
      const vertex = edge.u === current.vertex ? edge.v : edge.u;
      const mask = current.mask | (1 << i);
      const length = current.length + edge.w!;
      const key = `${vertex}:${mask}`;
      if (length < (distances.get(key) ?? Infinity)) {
        distances.set(key, length);
        frontier.push({ vertex, mask, length });
      }
    });
  }
  return Infinity;
}
