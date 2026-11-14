import { describe, expect, it } from 'vitest';
import { solveBasic } from '../src/solvers/basic.js';
import { degrees } from '../src/index.js';
import { graph } from './fixtures.js';
import { freezeGraph } from './traversal-fixtures.js';

describe('basic solutions', () => {
  it('lists named edges, loops, parallel edges and isolated vertices', () => {
    const input = graph(['A', 'B', 'C'], [
      { id: 'loop', u: 'A', v: 'A', name: 'khuyên a' },
      { id: 'ab', u: 'A', v: 'B', name: 'đường b' }, { id: 'ba', u: 'B', v: 'A' },
    ]);
    input.vertices[0]!.label = 'Nhà';
    const result = solveBasic(input, { type: 'elements' });
    expect(result.answer).toEqual({
      vertices: ['A', 'B', 'C'], edges: ['loop', 'ab', 'ba'], vertexCount: 3, edgeCount: 3,
      loops: ['loop'], isolatedVertices: ['C'], hasLoops: true, hasParallelEdges: true, simple: false, multigraph: true,
    });
    expect(result.steps.some(({ text }) => text.includes('Nhà') && text.includes('khuyên a'))).toBe(true);
    expect(result.steps.at(-1)?.highlight).toEqual({ vertices: ['C'], edges: ['loop'] });
  });

  it('reports requested degrees in request order and global degree facts', () => {
    const input = graph(['A', 'B', 'C'], [{ id: 'loop', u: 'A', v: 'A' }, { id: 'ab', u: 'A', v: 'B' }]);
    const result = solveBasic(input, { type: 'degree', vertices: ['B', 'A'] });
    expect(result.answer).toEqual({ degrees: { B: 1, A: 3 }, degreeSum: 4, oddVertices: ['A', 'B'] });
    expect(result.steps.map(({ kind }) => kind)).toEqual(['degree', 'degree', 'degree_sum']);
    expect(result.steps.at(-1)?.text).toContain('4 = 2 × 2');
    expect(solveBasic(input, { type: 'degree', vertices: [] }).answer).toMatchObject({ degrees: {} });
  });

  it('distinguishes simple and multigraph realizations of [2,3,4,3]', () => {
    const task = { type: 'degree_sequence' as const, sequence: [2, 3, 4, 3], simple: true };
    expect(solveBasic(graph([]), task).answer).toEqual({ exists: false });
    const result = solveBasic(graph([]), { ...task, simple: false });
    expect(result.answer).toMatchObject({ exists: true });
    const answer = result.answer as { exists: true; graph: ReturnType<typeof graph> };
    expect(Object.values(degrees(answer.graph))).toEqual([2, 3, 4, 3]);
    expect(result.steps.some(({ kind }) => kind === 'degree_sequence_realization')).toBe(true);
  });

  it('handles valid/invalid and empty degree sequences', () => {
    for (const simple of [true, false]) {
      expect(solveBasic(graph([]), { type: 'degree_sequence', sequence: [1, 1, 1], simple }).answer).toEqual({ exists: false });
      expect(solveBasic(graph([]), { type: 'degree_sequence', sequence: [], simple }).answer).toMatchObject({ exists: true, graph: { vertices: [], edges: [] } });
    }
    expect(solveBasic(graph([]), { type: 'degree_sequence', sequence: [2, 2, 2], simple: true }).answer).toMatchObject({ exists: true });
  });

  it('uses vertex order for BFS and the first input parallel edge', () => {
    const input = graph(['A', 'B', 'C', 'D'], [
      { id: 'ac', u: 'A', v: 'C' }, { id: 'cd', u: 'C', v: 'D' },
      { id: 'ab', u: 'A', v: 'B' }, { id: 'ab2', u: 'A', v: 'B' }, { id: 'bd', u: 'B', v: 'D' },
    ]);
    expect(solveBasic(input, { type: 'path', from: 'A', to: 'D' }).answer).toEqual({ exists: true, walk: { vertices: ['A', 'B', 'D'], edgeIds: ['ab', 'bd'] } });
    expect(solveBasic(input, { type: 'path', from: 'A', to: 'A' }).answer).toEqual({ exists: true, walk: { vertices: ['A'], edgeIds: [] } });
  });

  it('reports no path and includes isolated vertices in connectivity', () => {
    const input = graph(['A', 'B', 'C'], [{ id: 'ab', u: 'A', v: 'B' }]);
    expect(solveBasic(input, { type: 'path', from: 'A', to: 'C' }).answer).toEqual({ exists: false });
    expect(solveBasic(input, { type: 'connectivity' }).answer).toEqual({ connected: false, components: [['A', 'B'], ['C']] });
    expect(solveBasic(graph([]), { type: 'connectivity' }).answer).toEqual({ connected: true, components: [] });
  });

  it('is deterministic, preserves frozen input and supports prototype-like ids', () => {
    const input = freezeGraph(graph(['__proto__', 'constructor'], [{ id: 'ab', u: '__proto__', v: 'constructor' }]));
    for (const task of [{ type: 'elements' }, { type: 'degree' }, { type: 'connectivity' }, { type: 'path', from: '__proto__', to: 'constructor' }] as const) {
      const result = solveBasic(input, task);
      expect(solveBasic(input, task)).toEqual(result);
      expect(result.steps.map(({ index }) => index)).toEqual(result.steps.map((_, i) => i + 1));
      expect(result.notes.length).toBeGreaterThan(0);
    }
  });
});
