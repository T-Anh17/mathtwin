import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { analyzeEuler, checkWalk, solveEuler } from '../src/index.js';
import type { EulerOptions, EulerSolution, Graph } from '../src/index.js';
import { graph } from './fixtures.js';
import { assertWalkEdges, bruteEuler, freezeGraph, fromPairs, multigraphArbitrary } from './traversal-fixtures.js';

function assertEuler(input: Graph, solution: EulerSolution, options: EulerOptions): void {
  expect(solution.answer.exists).toBe(true);
  if (!solution.answer.exists) throw new Error('Expected an Euler walk');
  const { walk, kind } = solution.answer;
  assertWalkEdges(input, walk);
  expect(new Set(walk.edgeIds)).toEqual(new Set(input.edges.map(({ id }) => id)));
  expect(walk.edgeIds).toHaveLength(input.edges.length);
  if (options.start !== undefined) expect(walk.vertices[0]).toBe(options.start);
  if (kind === 'circuit' || options.want === 'circuit') expect(walk.vertices.at(-1)).toBe(walk.vertices[0]);
  expect(checkWalk(input, {
    kind: kind === 'circuit' ? 'euler_circuit' : 'euler_path', ...walk,
  }, options.start === undefined ? {} : { start: options.start }).ok).toBe(true);
  expect(solution.steps.map(({ index }) => index)).toEqual(solution.steps.map((_, i) => i + 1));
  expect(solution.steps.every(({ text }) => text.length > 0)).toBe(true);
}

describe('Euler solver', () => {
  const triangle = fromPairs(['A', 'B', 'C'], [['A', 'B'], ['B', 'C'], ['C', 'A']]);
  const line = fromPairs(['A', 'B', 'C'], [['A', 'B'], ['B', 'C']]);

  it.each(['path', 'circuit', 'any'] as const)('rejects the Königsberg bridges for want=%s', (want) => {
    const bridges = fromPairs(['A', 'B', 'C', 'D'], [
      ['A', 'B'], ['A', 'B'], ['A', 'C'], ['A', 'C'], ['A', 'D'], ['B', 'D'], ['C', 'D'],
    ]);
    const result = solveEuler(bridges, { want });
    expect(result.analysis.degrees).toEqual({ A: 5, B: 3, C: 3, D: 3 });
    expect(result.analysis.oddVertices).toEqual(['A', 'B', 'C', 'D']);
    expect(result.analysis.hasPath).toBe(false);
    expect(result.analysis.hasCircuit).toBe(false);
    expect(result.answer).toEqual({ exists: false, reason: 'odd_degrees' });
    expect(result.trace).toEqual([]);
    expect(result.steps.filter(({ kind }) => kind === 'degree')).toHaveLength(4);
    expect(result.steps.at(-1)?.text).toContain('Không có');
  });

  it('counts a loop twice and traverses every parallel edge exactly once', () => {
    const input = fromPairs(['A', 'B', 'C', 'isolated'], [
      ['A', 'A'], ['A', 'B'], ['B', 'A'], ['B', 'C'],
    ]);
    const result = solveEuler(input);
    expect(result.analysis.degrees).toEqual({ A: 4, B: 3, C: 1, isolated: 0 });
    expect(result.analysis.oddVertices).toEqual(['B', 'C']);
    expect(result.answer).toMatchObject({ kind: 'path', walk: { vertices: ['B', 'A', 'A', 'B', 'C'], edgeIds: ['e2', 'e1', 'e3', 'e4'] } });
    assertEuler(input, result, { want: 'any' });
    const reverse = solveEuler(input, { want: 'path', start: 'C' });
    assertEuler(input, reverse, { want: 'path', start: 'C' });
    expect(reverse.answer).toMatchObject({ walk: { vertices: ['C', 'B', 'A', 'A', 'B'] } });
  });

  it('constructs a circuit containing loops and parallel edges', () => {
    const input = fromPairs(['A', 'B'], [['A', 'A'], ['A', 'B'], ['B', 'A'], ['B', 'B']]);
    assertEuler(input, solveEuler(input, { want: 'circuit', start: 'B' }), { want: 'circuit', start: 'B' });
  });

  it('chooses the first odd vertex and honors a requested odd start', () => {
    expect(solveEuler(line).answer).toMatchObject({ kind: 'path', walk: { vertices: ['A', 'B', 'C'] } });
    expect(solveEuler(line, { want: 'path', start: 'C' }).answer).toMatchObject({ walk: { vertices: ['C', 'B', 'A'] } });
    expect(solveEuler(line, { want: 'path', start: 'B' }).answer).toEqual({ exists: false, reason: 'invalid_start' });
    expect(solveEuler(line, { want: 'circuit' }).answer).toEqual({ exists: false, reason: 'odd_degrees' });
  });

  it('uses input vertex order for the default start, and input edge order for traversal', () => {
    const input = fromPairs(['isolated', 'C', 'B', 'A'], [['A', 'C'], ['B', 'A'], ['C', 'B']]);
    const result = solveEuler(input);
    expect(result.answer).toMatchObject({ walk: { vertices: ['C', 'A', 'B', 'C'], edgeIds: ['e1', 'e2', 'e3'] } });
    assertEuler(input, result, { want: 'any' });
  });

  it.each(['path', 'circuit', 'any'] as const)('allows closed walks for want=%s', (want) => {
    const result = solveEuler(triangle, { want, start: 'B' });
    expect(result.analysis.hasPath).toBe(true);
    expect(result.analysis.hasCircuit).toBe(true);
    expect(result.answer).toMatchObject({ kind: 'circuit' });
    assertEuler(triangle, result, { want, start: 'B' });
  });

  it('ignores isolated vertices but rejects starting at one when there are edges', () => {
    const input = graph(['isolated', 'A', 'B', 'C'], triangle.edges);
    expect(analyzeEuler(input).components).toEqual([['A', 'B', 'C']]);
    assertEuler(input, solveEuler(input), { want: 'any' });
    expect(solveEuler(input, { want: 'any', start: 'isolated' }).answer).toEqual({ exists: false, reason: 'invalid_start' });
  });

  it('rejects disconnected active components even when all degrees are even', () => {
    const input = fromPairs(['A', 'B'], [['A', 'A'], ['B', 'B']]);
    expect(analyzeEuler(input)).toMatchObject({ components: [['A'], ['B']], hasPath: false, hasCircuit: false });
    expect(solveEuler(input).answer).toEqual({ exists: false, reason: 'disconnected' });
  });

  it('splices the remaining circuit after reaching a dead end in Hierholzer', () => {
    const input = fromPairs(['A', 'B', 'C', 'D'], [['A', 'D'], ['A', 'B'], ['B', 'C'], ['C', 'A']]);
    const result = solveEuler(input);
    expect(result.trace.slice(0, 4)).toEqual([
      { type: 'start', vertex: 'A' },
      { type: 'traverse', from: 'A', to: 'D', edgeId: 'e1' },
      { type: 'backtrack', vertex: 'D', via: 'e1' },
      { type: 'traverse', from: 'A', to: 'B', edgeId: 'e2' },
    ]);
    expect(result.answer).toMatchObject({ walk: { vertices: ['A', 'B', 'C', 'A', 'D'], edgeIds: ['e2', 'e3', 'e4', 'e1'] } });
    assertEuler(input, result, { want: 'any' });

    // Replay stack actions and reconstruct the final walk from backtracking.
    const stack: string[] = [];
    const reverseVertices: string[] = [];
    const reverseEdges: string[] = [];
    const used = new Set<string>();
    for (const event of result.trace) {
      if (event.type === 'start') stack.push(event.vertex);
      else if (event.type === 'traverse') {
        expect(stack.at(-1)).toBe(event.from);
        expect(used.has(event.edgeId)).toBe(false);
        used.add(event.edgeId);
        stack.push(event.to);
      } else {
        expect(stack.pop()).toBe(event.vertex);
        expect(input.edges.filter((e) => (e.u === event.vertex || e.v === event.vertex) && !used.has(e.id))).toEqual([]);
        reverseVertices.push(event.vertex);
        if (event.via !== undefined) reverseEdges.push(event.via);
      }
    }
    expect(stack).toEqual([]);
    expect(result.answer).toMatchObject({ walk: { vertices: reverseVertices.reverse(), edgeIds: reverseEdges.reverse() } });
  });

  it('uses Vietnamese vertex labels and edge names in the explanation, retaining IDs in data', () => {
    const input: Graph = {
      directed: false,
      vertices: [{ id: 'v1', label: 'Nhà' }, { id: 'v2', label: 'Trường' }],
      edges: [{ id: 'e1', u: 'v1', v: 'v2', name: 'đường a' }],
    };
    const result = solveEuler(input);
    expect(result.steps[0]?.text).toBe('Bậc của đỉnh Nhà là 1.');
    expect(result.steps.find(({ kind }) => kind === 'euler_traverse')).toMatchObject({
      text: 'Đi từ Nhà đến Trường qua cạnh đường a chưa dùng; đánh dấu cạnh này đã dùng.',
      data: { from: 'v1', to: 'v2', edgeId: 'e1' }, highlight: { vertices: ['v1', 'v2'], edges: ['e1'] },
    });
    expect(result.notes[0]).toContain('Khuyên');
  });

  it('handles edgeless graphs and the graph with no vertices consistently with checkWalk', () => {
    for (const input of [graph([]), graph(['A']), graph(['B', 'A'])]) {
      for (const want of ['path', 'circuit', 'any'] as const) {
        const result = solveEuler(input, { want });
        assertEuler(input, result, { want });
        expect(result.answer).toMatchObject({ kind: 'circuit', walk: { vertices: input.vertices.length ? [input.vertices[0]!.id] : [], edgeIds: [] } });
      }
    }
    assertEuler(graph(['A', 'B']), solveEuler(graph(['A', 'B']), { want: 'any', start: 'B' }), { want: 'any', start: 'B' });
  });

  it('rejects an unknown start and handles unusual IDs without mutation', () => {
    expect(() => solveEuler(triangle, { want: 'any', start: 'missing' })).toThrow(RangeError);
    const input = freezeGraph(fromPairs(['__proto__', 'constructor'], [['__proto__', '__proto__'], ['__proto__', 'constructor']]));
    const before = JSON.stringify(input);
    const result = solveEuler(input);
    assertEuler(input, result, { want: 'any' });
    expect(solveEuler(input)).toEqual(result);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('returns valid Euler walks on generated multigraphs with up to eight vertices', () => {
    fc.assert(fc.property(multigraphArbitrary(), (input) => {
      for (const want of ['path', 'circuit', 'any'] as const) {
        const result = solveEuler(input, { want });
        if (result.answer.exists) assertEuler(input, result, { want });
      }
    }), { seed: 1201, numRuns: 1000 });
  });

  it('always finds a valid Euler walk in graphs generated from a walk', () => {
    fc.assert(fc.property(fc.array(fc.integer({ min: 0, max: 7 }), { minLength: 1, maxLength: 35 }), fc.boolean(), (visits, closed) => {
      const route = closed ? [...visits, visits[0]!] : visits;
      const input = fromPairs(Array.from({ length: 8 }, (_, i) => String(i)), route.slice(1).map((v, i) => [String(route[i]), String(v)]));
      const options: EulerOptions = { want: closed ? 'circuit' : 'path', start: String(route[0]) };
      assertEuler(input, solveEuler(input, options), options);
    }), { seed: 1202, numRuns: 500 });
  });

  it('matches exhaustive edge traversal, including constrained starts', () => {
    fc.assert(fc.property(multigraphArbitrary(8), (input) => {
      for (const want of ['path', 'circuit'] as const) {
        const starts = [undefined, ...input.vertices.map(({ id }) => id)];
        for (const start of starts) {
          const options: EulerOptions = { want, ...(start === undefined ? {} : { start }) };
          const result = solveEuler(input, options);
          expect(result.answer.exists).toBe(bruteEuler(input, want === 'circuit', start));
          if (result.answer.exists) assertEuler(input, result, options);
        }
      }
    }), { seed: 1203, numRuns: 200 });
  });
});
