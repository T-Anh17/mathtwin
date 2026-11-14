import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { advanceDijkstra, createDijkstraState, dijkstraCandidates, solveDijkstra, validateSpec } from '../src/index.js';
import type { DijkstraState } from '../src/index.js';
import { graph } from './fixtures.js';
import { freezeGraph } from './traversal-fixtures.js';
import { assertWeightedWalk, bruteShortest, weighted, weightedArbitrary } from './weighted-fixtures.js';

describe('Dijkstra', () => {
  const tied = weighted(['A', 'C', 'B', 'D', 'E'], [
    ['A', 'B', 1], ['A', 'C', 1], ['C', 'D', 3], ['B', 'D', 3], ['D', 'E', 2],
  ]);

  it('records minimum-label ties, every relaxation, and stops upon settling the target', () => {
    const result = solveDijkstra(tied, { from: 'A', to: 'D' });
    expect(result.trace.map((event) => event.selected)).toEqual(['A', 'C', 'B', 'D']);
    expect(result.trace[1]?.tied).toEqual(['C', 'B']);
    expect(result.trace[1]?.updates).toContainEqual({ v: 'D', old: null, candidate: 4, new: 4, via: 'C', edgeId: 'e3', viaDistance: 1, weight: 3 });
    expect(result.trace[2]?.updates).toContainEqual({ v: 'D', old: 4, candidate: 4, new: 4, via: 'B', edgeId: 'e4', viaDistance: 1, weight: 3 });
    expect(result.trace.at(-1)?.updates).toEqual([]);
    expect(result.state.labels.E).toBe(null);
    expect(result.answer).toEqual({ exists: true, length: 4, walk: { vertices: ['A', 'C', 'D'], edgeIds: ['e2', 'e3'] } });
    expect(result.steps.some(({ kind, text }) => kind === 'dijkstra_label' && text.includes('1 + 3 = 4'))).toBe(true);
    expect(result.steps.map(({ index }) => index)).toEqual(result.steps.map((_, i) => i + 1));
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it('accepts the other tied choice through pure state transitions', () => {
    const initial = createDijkstraState(tied, 'A', 'D');
    const afterA = advanceDijkstra(tied, initial, 'A').state;
    expect(initial.settled).toEqual([]);
    expect(initial.labels.B).toBe(null);
    expect(dijkstraCandidates(tied, afterA)).toEqual(['C', 'B']);
    const afterB = advanceDijkstra(tied, afterA, 'B');
    expect(afterB.trace.tied).toEqual(['C', 'B']);
    expect(afterB.state.previous.D).toEqual({ vertex: 'B', edgeId: 'e4' });
    expect(dijkstraCandidates(tied, afterB.state)).toEqual(['C']);
    expect(() => advanceDijkstra(tied, afterB.state, 'D')).toThrow(RangeError);
    let state = afterB.state;
    for (const selected of ['C', 'D']) state = advanceDijkstra(tied, state, selected).state;
    expect(state.labels.D).toBe(4);
    expect(state.previous.D?.vertex).toBe('B');
    expect(dijkstraCandidates(tied, state)).toEqual([]);
  });

  it('updates an already finite label, retaining minimum parallel edges and ignoring loops', () => {
    const input = weighted(['A', 'B', 'C'], [['A', 'B', 9], ['A', 'A', 1], ['A', 'C', 1], ['C', 'B', 3], ['C', 'B', 3], ['C', 'B', 8]]);
    const result = solveDijkstra(input, { from: 'A', to: 'B' });
    expect(result.answer).toEqual({ exists: true, length: 4, walk: { vertices: ['A', 'C', 'B'], edgeIds: ['e3', 'e4'] } });
    expect(result.trace[1]?.updates).toContainEqual(expect.objectContaining({ v: 'B', old: 9, candidate: 4, new: 4 }));
    expect(result.steps.some(({ text }) => text.includes('1 + 3 = 4'))).toBe(true);
  });

  it('records candidates that do not improve a label', () => {
    const input = weighted(['A', 'B', 'C'], [['A', 'B', 1], ['A', 'C', 2], ['B', 'C', 5]]);
    const result = solveDijkstra(input, { from: 'A', to: 'C' });
    expect(result.trace[1]?.updates).toContainEqual(expect.objectContaining({ v: 'C', old: 2, candidate: 6, new: 2 }));
  });

  it('handles unreachable vertices, identical endpoints, decimals and unusual IDs', () => {
    const input = freezeGraph(weighted(['__proto__', 'constructor', 'isolated'], [['__proto__', 'constructor', 0.25]]));
    expect(solveDijkstra(input, { from: '__proto__', to: 'isolated' }).answer).toEqual({ exists: false, reason: 'unreachable' });
    const self = solveDijkstra(input, { from: 'constructor', to: 'constructor' });
    expect(self.answer).toEqual({ exists: true, length: 0, walk: { vertices: ['constructor'], edgeIds: [] } });
    expect(self.trace).toHaveLength(1);
    expect(self.trace[0]?.updates).toEqual([]);
    expect(solveDijkstra(input, { from: 'constructor', to: '__proto__' }).answer).toMatchObject({ length: 0.25 });
  });

  it('rejects unknown endpoints and missing or nonpositive weights, including at validation', () => {
    expect(() => solveDijkstra(tied, { from: 'unknown', to: 'D' })).toThrow(RangeError);
    expect(() => solveDijkstra(tied, { from: 'A', to: 'unknown' })).toThrow(RangeError);
    for (const w of [undefined, 0, -1, NaN, Infinity]) {
      const input = graph(['A', 'B'], [{ id: 'e', u: 'A', v: 'B', ...(w === undefined ? {} : { w }) }]);
      expect(() => solveDijkstra(input, { from: 'A', to: 'B' })).toThrow(RangeError);
      expect(validateSpec({ graph: input, task: { type: 'shortest_path', from: 'A', to: 'B' }, questionFormat: 'tu_luan' }).ok).toBe(false);
    }
  });

  it('uses Vietnamese labels in text and IDs in highlights', () => {
    const input = weighted(['a', 'b'], [['a', 'b', 2]]);
    input.vertices[0]!.label = 'Nhà';
    input.vertices[1]!.label = 'Trường';
    const result = solveDijkstra(input, { from: 'a', to: 'b' });
    expect(result.steps[0]?.text).toContain('Nhà');
    expect(result.steps.at(-1)).toMatchObject({ text: expect.stringContaining('Nhà → Trường'), highlight: { vertices: ['a', 'b'], edges: ['e1'] } });
  });

  it('matches exhaustive paths on 1,000 graphs, also when ties are resolved in reverse order', () => {
    fc.assert(fc.property(weightedArbitrary(), (input) => {
      const from = input.vertices[0]!.id;
      const to = input.vertices.at(-1)!.id;
      const before = JSON.stringify(input);
      const expected = bruteShortest(input, from, to);
      const result = solveDijkstra(input, { from, to });
      expect(result.answer.exists).toBe(Number.isFinite(expected));
      if (result.answer.exists) {
        expect(result.answer.length).toBe(expected);
        assertWeightedWalk(input, result.answer.walk, result.answer.length);
      }
      let state: DijkstraState = createDijkstraState(input, from, to);
      while (true) {
        const next = dijkstraCandidates(input, state).at(-1);
        if (next === undefined) break;
        state = advanceDijkstra(input, state, next).state;
      }
      expect(state.labels[to] ?? Infinity).toBe(expected);
      expect(JSON.stringify(input)).toBe(before);
      expect(solveDijkstra(input, { from, to })).toEqual(result);
    }), { seed: 1301, numRuns: 1000 });
  });
});
