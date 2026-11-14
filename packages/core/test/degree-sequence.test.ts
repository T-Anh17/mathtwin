import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { Graph } from '../src/index.js';
import { degrees, hasLoops, isSimpleGraph, realizeDegreeSequence, validateSpec } from '../src/index.js';

function assertRealization(sequence: number[], simple: boolean): Graph {
  const before = [...sequence];
  const result = realizeDegreeSequence(sequence, simple);
  expect(result.exists).toBe(true);
  if (!result.exists) throw new Error('Expected a graph realization');
  expect(result.graph.vertices.map(({ id }) => degrees(result.graph)[id])).toEqual(sequence);
  expect(result.graph.edges.length).toBe(sequence.reduce((sum, value) => sum + value, 0) / 2);
  if (simple) expect(isSimpleGraph(result.graph)).toBe(true);
  expect(validateSpec({ graph: result.graph, task: { type: 'elements' }, questionFormat: 'tu_luan' })).toEqual({ ok: true, errors: [] });
  expect(realizeDegreeSequence(sequence, simple)).toEqual(result);
  expect(sequence).toEqual(before);
  return result.graph;
}

describe('degree sequence realization', () => {
  it('rejects [2,3,4,3] as simple and realizes it with loops allowed', () => {
    expect(realizeDegreeSequence([2, 3, 4, 3], true)).toEqual({ exists: false });
    expect(hasLoops(assertRealization([2, 3, 4, 3], false))).toBe(false);
  });

  it.each([[], [0], [0, 0, 0], [1, 1], [2, 2, 2], [3, 3, 3, 3], [3, 1, 1, 1], [2, 0, 1, 1]])('realizes simple sequence %j', (...sequence) => {
    assertRealization(sequence, true);
  });

  it.each([[1], [1, 1, 1], [3, 3, 1, 1], [4, 2, 2, 0], [2, 2]])('rejects non-graphical simple sequence %j', (...sequence) => {
    expect(realizeDegreeSequence(sequence, true)).toEqual({ exists: false });
  });

  it.each([[2], [4], [5, 1], [8, 0, 0], [3, 3, 3, 3]])('realizes multigraph sequence %j', (...sequence) => {
    assertRealization(sequence, false);
  });

  it('preserves original vertex indices when Havel–Hakimi reorders degrees', () => {
    assertRealization([1, 3, 2, 2], true);
    expect(realizeDegreeSequence([2, 2, 2], true)).toEqual({ exists: true, graph: {
      directed: false,
      vertices: [{ id: '1', label: '1' }, { id: '2', label: '2' }, { id: '3', label: '3' }],
      edges: [{ id: 'e1', u: '1', v: '2' }, { id: 'e2', u: '1', v: '3' }, { id: 'e3', u: '2', v: '3' }],
    } });
  });

  it('accepts twenty vertices', () => {
    assertRealization(Array<number>(20).fill(19), true);
    assertRealization(Array<number>(20).fill(0), false);
  });

  it('accepts the degree limit of 100 and bounds realizations to 1,000 edges', () => {
    const loops = assertRealization([100], false);
    expect(loops.edges).toHaveLength(50);
    expect(loops.edges.every(({ u, v }) => u === '1' && v === '1')).toBe(true);
    const maximal = assertRealization(Array<number>(20).fill(100), false);
    expect(maximal.edges).toHaveLength(1000);
    expect(hasLoops(maximal)).toBe(false);
  });

  it('uses loops only for the unavoidable surplus of a dominant vertex', () => {
    const dominant = assertRealization([1, 8, 1], false);
    expect(dominant.edges.filter(({ u, v }) => u === v)).toEqual([
      { id: 'e3', u: '2', v: '2' },
      { id: 'e4', u: '2', v: '2' },
      { id: 'e5', u: '2', v: '2' },
    ]);
    expect(hasLoops(assertRealization([4, 2, 2], false))).toBe(false);
    expect(hasLoops(assertRealization([2, 0, 2], false))).toBe(false);
  });

  it('breaks multigraph degree ties by original vertex index', () => {
    expect(assertRealization([2, 2, 2], false).edges).toEqual([
      { id: 'e1', u: '1', v: '2' },
      { id: 'e2', u: '3', v: '1' },
      { id: 'e3', u: '2', v: '3' },
    ]);
  });

  it.each([[-1], [0.5, 1.5], [NaN], [Infinity], [101, 1], [2e7], [1e15], [Number.MAX_SAFE_INTEGER + 1], [Number.MAX_SAFE_INTEGER, 1], Array<number>(21).fill(0)])('rejects invalid degree input %j for both graph types', (...sequence) => {
    expect(realizeDegreeSequence(sequence, true)).toEqual({ exists: false });
    expect(realizeDegreeSequence(sequence, false)).toEqual({ exists: false });
  });

  it('matches an exhaustive simple-graph oracle for random sequences of up to five vertices', () => {
    const possible = new Map<number, Set<string>>();
    for (let n = 0; n <= 5; n++) {
      const pairs: [number, number][] = [];
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) pairs.push([i, j]);
      const sequences = new Set<string>();
      for (let mask = 0; mask < 2 ** pairs.length; mask++) {
        const counts = Array<number>(n).fill(0);
        pairs.forEach(([u, v], bit) => {
          if ((mask & (1 << bit)) !== 0) { counts[u] = counts[u]! + 1; counts[v] = counts[v]! + 1; }
        });
        sequences.add(JSON.stringify(counts));
      }
      possible.set(n, sequences);
      for (const entry of sequences) {
        const sequence: number[] = JSON.parse(entry) as number[];
        assertRealization(sequence, true);
      }
    }
    fc.assert(fc.property(fc.array(fc.integer({ min: 0, max: 5 }), { maxLength: 5 }), (sequence) => {
      expect(realizeDegreeSequence(sequence, true).exists).toBe(possible.get(sequence.length)!.has(JSON.stringify(sequence)));
    }), { seed: 1102, numRuns: 500 });
  });

  it('realizes a multigraph exactly when the nonnegative degree sum is even', () => {
    fc.assert(fc.property(fc.array(fc.integer({ min: 0, max: 100 }), { maxLength: 20 }), (sequence) => {
      const total = sequence.reduce((sum, value) => sum + value, 0);
      if (total % 2 === 0) {
        const generated = assertRealization(sequence, false);
        const max = Math.max(0, ...sequence);
        const unavoidableLoops = Math.max(0, max - (total - max)) / 2;
        expect(generated.edges.filter(({ u, v }) => u === v)).toHaveLength(unavoidableLoops);
      } else expect(realizeDegreeSequence(sequence, false)).toEqual({ exists: false });
    }), { seed: 1103, numRuns: 200 });
  });
});
