import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  connectedComponents, degree, degrees, hasLoops, hasParallelEdges,
  isConnected, isolatedVertices, isMultigraph, isSimpleGraph, oddVertices,
} from '../src/index.js';
import { graph } from './fixtures.js';

describe('graph basics', () => {
  const sample = graph(['A', 'B', 'C', 'D'], [
    { id: 'e1', u: 'A', v: 'A', name: 'a' },
    { id: 'e2', u: 'A', v: 'B' },
    { id: 'e3', u: 'B', v: 'A' },
    { id: 'e4', u: 'B', v: 'C' },
  ]);

  it('counts loops twice and each parallel edge separately', () => {
    expect(degree(sample, 'A')).toBe(4);
    expect(degrees(sample)).toEqual({ A: 4, B: 3, C: 1, D: 0 });
    expect(oddVertices(sample)).toEqual(['B', 'C']);
    expect(isolatedVertices(sample)).toEqual(['D']);
  });

  it('distinguishes ordinary connectivity from connectivity on active vertices', () => {
    expect(isConnected(sample)).toBe(false);
    expect(isConnected(sample, { ignoreIsolated: true })).toBe(true);
    expect(connectedComponents(sample)).toEqual([['A', 'B', 'C'], ['D']]);
    expect(connectedComponents(sample, { ignoreIsolated: true })).toEqual([['A', 'B', 'C']]);
  });

  it('does not connect distinct components just because they have edges', () => {
    const disconnected = graph(['A', 'B', 'C', 'D', 'E'], [
      { id: 'e1', u: 'A', v: 'B' },
      { id: 'e2', u: 'C', v: 'D' },
    ]);
    expect(connectedComponents(disconnected)).toEqual([['A', 'B'], ['C', 'D'], ['E']]);
    expect(isConnected(disconnected, { ignoreIsolated: true })).toBe(false);
  });

  it('keeps components and their members in input vertex order', () => {
    const unordered = graph(['C', 'A', 'B', 'E', 'D'], [
      { id: 'e1', u: 'C', v: 'B' },
      { id: 'e2', u: 'C', v: 'A' },
      { id: 'e3', u: 'D', v: 'E' },
    ]);
    expect(connectedComponents(unordered)).toEqual([['C', 'A', 'B'], ['E', 'D']]);
  });

  it('recognizes loops and unordered parallel endpoints', () => {
    expect(hasLoops(sample)).toBe(true);
    expect(hasParallelEdges(sample)).toBe(true);
    expect(isSimpleGraph(sample)).toBe(false);
    expect(isMultigraph(sample)).toBe(true);
    const loop = graph(['A'], [{ id: 'e1', u: 'A', v: 'A' }]);
    expect(hasParallelEdges(loop)).toBe(false);
    expect(isMultigraph(loop)).toBe(true);
    expect(hasParallelEdges(graph(['A'], [
      { id: 'e1', u: 'A', v: 'A' }, { id: 'e2', u: 'A', v: 'A' },
    ]))).toBe(true);
  });

  it('recognizes a simple graph independently of edge weights and names', () => {
    const simple = graph(['A', 'B', 'C'], [{ id: 'e1', u: 'B', v: 'A', w: 5, name: 'm' }]);
    expect(isSimpleGraph(simple)).toBe(true);
    expect(isMultigraph(simple)).toBe(false);
    expect(hasLoops(simple)).toBe(false);
    expect(hasParallelEdges(simple)).toBe(false);
  });

  it('treats an empty active graph as connected, and includes isolated vertices by default', () => {
    expect(isConnected(graph([]))).toBe(true);
    expect(connectedComponents(graph([]))).toEqual([]);
    expect(isConnected(graph(['A']))).toBe(true);
    expect(isConnected(graph(['A', 'B']))).toBe(false);
    expect(isConnected(graph(['A', 'B']), { ignoreIsolated: true })).toBe(true);
    expect(isolatedVertices(graph(['A', 'B']))).toEqual(['A', 'B']);
    expect(isSimpleGraph(graph([]))).toBe(true);
  });

  it('treats vertices with only loops as active, separate components', () => {
    const loops = graph(['A', 'B'], [
      { id: 'e1', u: 'A', v: 'A' }, { id: 'e2', u: 'B', v: 'B' },
    ]);
    expect(isConnected(loops, { ignoreIsolated: true })).toBe(false);
    expect(oddVertices(loops)).toEqual([]);
    expect(isolatedVertices(loops)).toEqual([]);
  });

  it('handles arbitrary vertex identifiers without object or delimiter collisions', () => {
    const unusual = graph(['__proto__', 'constructor', 'A-B', 'A', 'B-C', 'C'], [
      { id: 'e1', u: '__proto__', v: 'constructor' },
      { id: 'e2', u: 'A-B', v: 'C' },
      { id: 'e3', u: 'A', v: 'B-C' },
    ]);
    expect(degrees(unusual)['__proto__']).toBe(1);
    expect(degrees(unusual)['constructor']).toBe(1);
    expect(hasParallelEdges(unusual)).toBe(false);
    expect(connectedComponents(unusual)).toHaveLength(3);
  });

  it('rejects a degree query for an unknown vertex', () => {
    expect(() => degree(sample, 'missing')).toThrow(RangeError);
  });

  it('computes the four odd degrees of the Königsberg multigraph', () => {
    const konigsberg = graph(['A', 'B', 'C', 'D'], [
      { id: 'e1', u: 'A', v: 'B' }, { id: 'e2', u: 'A', v: 'B' },
      { id: 'e3', u: 'A', v: 'C' }, { id: 'e4', u: 'A', v: 'C' },
      { id: 'e5', u: 'A', v: 'D' }, { id: 'e6', u: 'B', v: 'D' },
      { id: 'e7', u: 'C', v: 'D' },
    ]);
    expect(degrees(konigsberg)).toEqual({ A: 5, B: 3, C: 3, D: 3 });
    expect(oddVertices(konigsberg)).toEqual(['A', 'B', 'C', 'D']);
    expect(isConnected(konigsberg)).toBe(true);
  });

  it('does not mutate its input', () => {
    const before = JSON.stringify(sample);
    sample.vertices.forEach(Object.freeze);
    sample.edges.forEach(Object.freeze);
    Object.freeze(sample.vertices);
    Object.freeze(sample.edges);
    Object.freeze(sample);
    degrees(sample);
    oddVertices(sample);
    isolatedVertices(sample);
    connectedComponents(sample);
    isSimpleGraph(sample);
    expect(JSON.stringify(sample)).toBe(before);
  });

  it('satisfies the handshake lemma and reachability for generated multigraphs', () => {
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 8 }).chain((n) => fc.tuple(
        fc.constant(n),
        fc.array(fc.tuple(fc.integer({ min: 0, max: n - 1 }), fc.integer({ min: 0, max: n - 1 })), { maxLength: 30 }),
      )),
      ([n, pairs]) => {
        const ids = Array.from({ length: n }, (_, i) => String(i));
        const generated = graph(ids, pairs.map(([u, v], i) => ({ id: `e${i}`, u: String(u), v: String(v) })));
        expect(Object.values(degrees(generated)).reduce((a, b) => a + b, 0)).toBe(2 * pairs.length);
        expect(oddVertices(generated).length % 2).toBe(0);
        // Independent transitive closure oracle, including reflexive reachability.
        const reachable = ids.map((_, i) => ids.map((__, j) => i === j || pairs.some(([u, v]) => (u === i && v === j) || (v === i && u === j))));
        for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
          reachable[i]![j] = reachable[i]![j]! || (reachable[i]![k]! && reachable[k]![j]!);
        }
        const components = connectedComponents(generated);
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
          expect(components.some((component) => component.includes(String(i)) && component.includes(String(j)))).toBe(reachable[i]![j]);
        }
        expect(isConnected(generated)).toBe(reachable.every((row) => row.every(Boolean)));
      },
    ), { seed: 1101, numRuns: 200 });
  });
});
