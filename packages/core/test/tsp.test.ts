import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { solveTsp } from '../src/index.js';
import type { Graph, TourAnswer } from '../src/index.js';
import { graph } from './fixtures.js';
import { freezeGraph } from './traversal-fixtures.js';
import { assertWeightedWalk, bruteTour, weighted, weightedArbitrary } from './weighted-fixtures.js';

// Node provides this API; the shared core tsconfig deliberately excludes DOM/Node types.
const { performance } = globalThis as typeof globalThis & { performance: { now(): number } };

function assertTour(input: Graph, answer: TourAnswer, start: string): void {
  expect(answer.exists).toBe(true);
  if (!answer.exists) throw new Error('Expected a tour');
  assertWeightedWalk(input, answer.walk, answer.length);
  expect(answer.walk.vertices[0]).toBe(start);
  expect(answer.walk.vertices.at(-1)).toBe(start);
  const visits = input.vertices.length === 1 ? answer.walk.vertices : answer.walk.vertices.slice(0, -1);
  expect(visits).toHaveLength(input.vertices.length);
  expect(new Set(visits)).toEqual(new Set(input.vertices.map(({ id }) => id)));
}

describe('TSP', () => {
  const counterexample = weighted(['A', 'B', 'C', 'D'], [
    ['A', 'B', 1], ['A', 'C', 2], ['A', 'D', 3], ['B', 'C', 4], ['B', 'D', 5], ['C', 'D', 10],
  ]);

  it('shows a nearest-neighbor result that is worse than the Held–Karp optimum', () => {
    const result = solveTsp(counterexample, { method: 'both', start: 'A' });
    expect(result.answer.nearestNeighbor).toEqual([{ start: 'A', answer: { exists: true, length: 18,
      walk: { vertices: ['A', 'B', 'C', 'D', 'A'], edgeIds: ['e1', 'e4', 'e6', 'e3'] } } }]);
    expect(result.answer.optimal).toEqual({ exists: true, length: 14,
      walk: { vertices: ['A', 'C', 'B', 'D', 'A'], edgeIds: ['e2', 'e4', 'e5', 'e3'] } });
    expect(result.answer.comparison).toEqual([{ start: 'A', nearestLength: 18, optimalLength: 14, gap: 4 }]);
    expect(result.steps.some(({ text }) => text.includes('không bảo đảm tối ưu'))).toBe(true);
    expect(result.trace.at(-1)).toMatchObject({ type: 'held_karp', start: 'A' });
    expect(result.steps.map(({ index }) => index)).toEqual(result.steps.map((_, i) => i + 1));
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it('runs nearest neighbor from every vertex when start is omitted', () => {
    const result = solveTsp(counterexample);
    expect(result.answer.nearestNeighbor?.map(({ start }) => start)).toEqual(['A', 'B', 'C', 'D']);
    expect(result.answer.comparison).toHaveLength(4);
    for (const { start, answer } of result.answer.nearestNeighbor!) assertTour(counterexample, answer, start);
    expect(result.answer.optimal).toMatchObject({ length: 14, walk: { vertices: ['A', 'C', 'B', 'D', 'A'] } });
  });

  it('records nearest-neighbor ties in vertex order, and minimum parallel edges in edge order', () => {
    const input = weighted(['A', 'C', 'B'], [['A', 'B', 1], ['A', 'C', 1], ['A', 'C', 1], ['C', 'B', 2], ['A', 'A', 0.5]]);
    const result = solveTsp(input, { method: 'both', start: 'A' });
    expect(result.trace[0]).toEqual({ type: 'nearest_neighbor', start: 'A', from: 'A', to: 'C', tied: ['C', 'B'], edgeId: 'e2', weight: 1, length: 1, closing: false });
    expect(result.answer.optimal).toMatchObject({ exists: true, walk: { vertices: ['A', 'C', 'B', 'A'], edgeIds: ['e2', 'e4', 'e1'] } });
    expect(result.trace[2]).toMatchObject({ closing: true, to: 'A', tied: ['A'] });
  });

  it('distinguishes a greedy dead end from nonexistence of any tour', () => {
    const input = weighted(['A', 'B', 'C', 'D'], [['A', 'B', 1], ['B', 'C', 1], ['C', 'D', 1], ['D', 'A', 1], ['A', 'C', 0.5]]);
    const result = solveTsp(input, { method: 'both', start: 'A' });
    expect(result.answer.nearestNeighbor?.[0]?.answer).toMatchObject({ exists: false, reason: 'no_neighbor', partialWalk: { vertices: ['A', 'C', 'B'] }, partialLength: 1.5 });
    expect(result.answer.optimal).toMatchObject({ exists: true, length: 4 });
    expect(result.answer.comparison).toEqual([{ start: 'A', nearestLength: null, optimalLength: 4, gap: null }]);
  });

  it('rejects incomplete tours that cannot return, without adding nonexistent metric edges', () => {
    const input = weighted(['A', 'B', 'C'], [['A', 'B', 1], ['B', 'C', 1]]);
    const result = solveTsp(input, { method: 'both', start: 'A' });
    expect(result.answer.nearestNeighbor?.[0]?.answer).toMatchObject({ exists: false, reason: 'no_return' });
    expect(result.answer.optimal).toEqual({ exists: false, reason: 'no_tour' });
    const disconnected = solveTsp(graph(['A', 'B', 'C']), { method: 'optimal' });
    expect(disconnected.answer.optimal).toEqual({ exists: false, reason: 'no_tour' });
  });

  it('only computes the requested method', () => {
    const nn = solveTsp(counterexample, { method: 'nearest_neighbor', start: 'B' });
    expect(Object.keys(nn.answer)).toEqual(['nearestNeighbor']);
    expect(nn.trace.every(({ type }) => type === 'nearest_neighbor')).toBe(true);
    const optimal = solveTsp(counterexample, { method: 'optimal', start: 'D' });
    expect(Object.keys(optimal.answer)).toEqual(['optimal']);
    expect(optimal.trace).toHaveLength(1);
    assertTour(counterexample, optimal.answer.optimal!, 'D');
  });

  it('handles empty, one-vertex and two-vertex closed tours explicitly', () => {
    expect(solveTsp(graph([])).answer).toEqual({ nearestNeighbor: [], optimal: { exists: false, reason: 'empty_graph' }, comparison: [] });
    const single = solveTsp(weighted(['A'], [['A', 'A', 9]]));
    expect(single.answer.optimal).toEqual({ exists: true, length: 0, walk: { vertices: ['A'], edgeIds: [] } });
    const pair = weighted(['A', 'B'], [['A', 'B', 2.5]]);
    const result = solveTsp(pair);
    expect(result.answer.optimal).toEqual({ exists: true, length: 5, walk: { vertices: ['A', 'B', 'A'], edgeIds: ['e1', 'e1'] } });
    assertTour(pair, result.answer.optimal!, 'A');
  });

  it('supports unusual IDs, labels, frozen input and deterministic output', () => {
    const input = weighted(['__proto__', 'constructor'], [['__proto__', 'constructor', 2]]);
    input.vertices[0]!.label = 'Nhà';
    input.vertices[1]!.label = 'Trường';
    freezeGraph(input);
    const result = solveTsp(input);
    expect(result.steps.some(({ text }) => text.includes('Nhà → Trường → Nhà'))).toBe(true);
    expect(solveTsp(input)).toEqual(result);
    assertTour(input, result.answer.optimal!, '__proto__');
  });

  it('guards unknown starts, weights and the bitmask size', () => {
    expect(() => solveTsp(counterexample, { method: 'optimal', start: 'missing' })).toThrow(RangeError);
    expect(() => solveTsp(graph(['A', 'B'], [{ id: 'e', u: 'A', v: 'B' }]))).toThrow(RangeError);
    expect(() => solveTsp(weighted(['A'], [['A', 'A', -1]]))).toThrow(RangeError);
    expect(() => solveTsp(graph(Array.from({ length: 21 }, (_, i) => String(i))))).toThrow(RangeError);
  });

  it('solves a sparse 20-vertex cycle at the bitmask boundary', () => {
    const ids = Array.from({ length: 20 }, (_, i) => String(i));
    const input = weighted(ids, ids.map((id, i) => [id, ids[(i + 1) % ids.length]!, 1]));
    const result = solveTsp(input, { method: 'optimal', start: '7' });
    expect(result.answer.optimal).toMatchObject({ exists: true, length: 20 });
    assertTour(input, result.answer.optimal!, '7');
  });

  it.each(['v0', undefined])('solves nonuniform complete K20 with both methods under one second (start=%s)', (start) => {
    const ids = Array.from({ length: 20 }, (_, i) => `v${i}`);
    const edges: [string, string, number][] = [];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        edges.push([ids[i]!, ids[j]!, ((i * 7919 + j * 104729) % 97) + 1]);
      }
    }
    const input = weighted(ids, edges);
    const before = performance.now();
    const result = solveTsp(input, { method: 'both', ...(start === undefined ? {} : { start }) });
    const elapsed = performance.now() - before;
    expect(elapsed, `K20 solveTsp took ${elapsed.toFixed(1)} ms`).toBeLessThan(1000);
    assertTour(input, result.answer.optimal!, start ?? 'v0');
    expect(result.answer.nearestNeighbor).toHaveLength(start === undefined ? 20 : 1);
    for (const comparison of result.answer.comparison!) {
      expect(comparison.gap).toBeGreaterThanOrEqual(0);
    }
  });

  it('traces stored parents with fractional weights and preserves input-order ties', () => {
    const fractional = weighted(['A', 'B', 'C', 'D'], [
      ['A', 'B', 0.1], ['A', 'C', 0.3], ['A', 'D', 0.7], ['B', 'C', 0.2], ['B', 'D', 0.4], ['C', 'D', 0.6],
    ]);
    const result = solveTsp(fractional, { method: 'optimal', start: 'B' });
    assertTour(fractional, result.answer.optimal!, 'B');
    if (!result.answer.optimal!.exists) throw new Error('Expected a tour');
    expect(result.answer.optimal!.length).toBeCloseTo(bruteTour(fractional, 'B'), 12);

    const ids = ['A', 'B', 'C', 'D', 'E'];
    const edges: [string, string, number][] = [];
    ids.forEach((u, i) => ids.slice(i + 1).forEach((v) => edges.push([u, v, 1])));
    const tied = solveTsp(weighted(ids, edges), { method: 'optimal', start: 'C' });
    expect(tied.answer.optimal).toMatchObject({ walk: { vertices: ['C', 'A', 'B', 'D', 'E', 'C'] } });
  });

  it('matches exhaustive permutations on 1,000 graphs with up to eight vertices', () => {
    fc.assert(fc.property(weightedArbitrary(), (input) => {
      const start = input.vertices.at(-1)!.id;
      const expected = bruteTour(input, start);
      const before = JSON.stringify(input);
      const result = solveTsp(input, { method: 'both', start });
      const optimal = result.answer.optimal!;
      expect(optimal.exists).toBe(Number.isFinite(expected));
      if (optimal.exists) {
        expect(optimal.length).toBe(expected);
        assertTour(input, optimal, start);
      }
      const nn = result.answer.nearestNeighbor![0]!.answer;
      if (nn.exists) {
        assertTour(input, nn, start);
        expect(nn.length).toBeGreaterThanOrEqual(expected);
      }
      expect(JSON.stringify(input)).toBe(before);
    }), { seed: 1302, numRuns: 1000 });
  });
});
