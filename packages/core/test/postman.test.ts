import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { checkWalk, solvePostman } from '../src/index.js';
import type { Graph, PostmanSolution } from '../src/index.js';
import { graph } from './fixtures.js';
import { freezeGraph } from './traversal-fixtures.js';
import { assertWeightedWalk, brutePostman, weighted, weightedArbitrary } from './weighted-fixtures.js';

function assertPostman(input: Graph, result: PostmanSolution, start: string): void {
  expect(result.answer.exists).toBe(true);
  if (!result.answer.exists) throw new Error('Expected a postman tour');
  const answer = result.answer;
  assertWeightedWalk(input, answer.walk, answer.length);
  expect(answer.walk.vertices[0]).toBe(start);
  expect(answer.walk.vertices.at(-1)).toBe(start);
  expect(new Set(answer.walk.edgeIds)).toEqual(new Set(input.edges.map(({ id }) => id)));
  expect(answer.length).toBe(answer.baseLength + answer.duplicateLength);
  expect(answer.baseLength).toBe(input.edges.reduce((sum, edge) => sum + edge.w!, 0));
  expect(answer.walk.edgeIds.length).toBe(input.edges.length + answer.duplicates.length);
  expect(result.matching.reduce((sum, pair) => sum + pair.length, 0)).toBe(answer.duplicateLength);
  for (const pair of result.matching) assertWeightedWalk(input, pair.walk, pair.length);

  // Reconstruct the augmented graph and independently validate every Euler edge.
  const augmented: Graph = { directed: false, vertices: input.vertices, edges: [
    ...input.edges,
    ...answer.duplicates.map(({ id, originalEdgeId }) => ({ ...input.edges.find((e) => e.id === originalEdgeId)!, id })),
  ] };
  const stack: string[] = [];
  const reverseVertices: string[] = [];
  const reverseEdges: string[] = [];
  for (const item of result.trace) {
    if (item.type !== 'euler') continue;
    const event = item.event;
    if (event.type === 'start') stack.push(event.vertex);
    else if (event.type === 'traverse') { expect(stack.at(-1)).toBe(event.from); stack.push(event.to); }
    else {
      expect(stack.pop()).toBe(event.vertex);
      reverseVertices.push(event.vertex);
      if (event.via !== undefined) reverseEdges.push(event.via);
    }
  }
  expect(stack).toEqual([]);
  expect(checkWalk(augmented, { kind: 'euler_circuit', vertices: reverseVertices.reverse(), edgeIds: reverseEdges.reverse() }, { start }).ok).toBe(true);
  const originals = new Map(answer.duplicates.map(({ id, originalEdgeId }) => [id, originalEdgeId]));
  expect(reverseEdges.map((id) => originals.get(id) ?? id)).toEqual(answer.walk.edgeIds);
  expect(reverseVertices).toEqual(answer.walk.vertices);
}

describe('Chinese postman', () => {
  it('returns to the requested even-degree start when there are two odd vertices', () => {
    const input = weighted(['A', 'B', 'C'], [['A', 'B', 2], ['B', 'C', 3]]);
    const result = solvePostman(input, { start: 'B' });
    expect(result.matching).toEqual([{ from: 'A', to: 'C', length: 5,
      walk: { vertices: ['A', 'B', 'C'], edgeIds: ['e1', 'e2'] } }]);
    expect(result.answer).toMatchObject({ exists: true, baseLength: 5, duplicateLength: 5, length: 10 });
    assertPostman(input, result, 'B');
    expect(result.steps.at(-1)?.text).toContain('5 + 5 = 10');
    expect(result.steps.map(({ index }) => index)).toEqual(result.steps.map((_, i) => i + 1));
  });

  it('pairs four odd vertices and traverses all edges from the even center', () => {
    const input = weighted(['O', 'A', 'B', 'C', 'D'], [['O', 'A', 1], ['O', 'B', 2], ['O', 'C', 3], ['O', 'D', 4]]);
    const result = solvePostman(input, { start: 'O' });
    expect(result.trace[0]).toMatchObject({ vertices: ['A', 'B', 'C', 'D'] });
    expect(result.matching.map(({ from, to }) => [from, to])).toEqual([['A', 'B'], ['C', 'D']]);
    expect(result.answer).toMatchObject({ length: 20, duplicateLength: 10 });
    assertPostman(input, result, 'O');
  });

  it('finds the globally best matching instead of greedily pairing the closest pair', () => {
    const input = weighted(['A', 'B', 'C', 'D'], [
      ['A', 'B', 1], ['A', 'C', 2], ['A', 'D', 2], ['B', 'C', 2], ['B', 'D', 2], ['C', 'D', 9],
    ]);
    const result = solvePostman(input, { start: 'C' });
    expect(result.matching.map(({ from, to }) => [from, to])).toEqual([['A', 'C'], ['B', 'D']]);
    expect(result.answer).toMatchObject({ baseLength: 18, duplicateLength: 4, length: 22 });
    const distances = result.trace.find((event) => event.type === 'distances');
    expect(distances).toMatchObject({ distances: [[0, 1, 2, 2], [1, 0, 2, 2], [2, 2, 0, 4], [2, 2, 4, 0]] });
    assertPostman(input, result, 'C');
  });

  it('needs no duplicated edge when every degree is even, including loops and parallel edges', () => {
    const input = weighted(['A', 'B', 'isolated'], [['A', 'B', 2], ['A', 'B', 5], ['A', 'A', 3], ['B', 'B', 4]]);
    const result = solvePostman(input, { start: 'B' });
    expect(result.matching).toEqual([]);
    expect(result.answer).toMatchObject({ length: 14, duplicateLength: 0, duplicates: [] });
    assertPostman(input, result, 'B');
  });

  it('duplicates the lightest parallel edge but still covers all heavier originals', () => {
    const input = weighted(['A', 'B'], [['A', 'B', 7], ['A', 'B', 1], ['A', 'B', 1], ['A', 'A', 3]]);
    input.edges[0]!.id = 'postman_duplicate_1';
    const result = solvePostman(input, { start: 'B' });
    expect(result.answer).toMatchObject({ baseLength: 12, duplicateLength: 1, length: 13,
      duplicates: [{ id: 'postman_duplicate_2', originalEdgeId: 'e2' }] });
    expect(result.matching[0]?.walk.edgeIds).toEqual(['e2']);
    assertPostman(input, result, 'B');
    const knownIds = new Set(input.edges.map(({ id }) => id));
    expect(result.steps.every(({ highlight }) => highlight?.edges?.every((id) => knownIds.has(id)) ?? true)).toBe(true);
    expect(result.steps.every(({ text }) => !text.includes('postman_duplicate_2'))).toBe(true);
  });

  it('reconstructs Floyd–Warshall paths with multiple intermediate vertices', () => {
    const input = weighted(['A', 'B', 'C', 'D'], [['A', 'B', 2], ['B', 'C', 3], ['C', 'D', 4]]);
    const result = solvePostman(input, { start: 'B' });
    expect(result.matching[0]).toEqual({ from: 'A', to: 'D', length: 9, walk: { vertices: ['A', 'B', 'C', 'D'], edgeIds: ['e1', 'e2', 'e3'] } });
    assertPostman(input, result, 'B');
  });

  it('rejects disconnected edge components and an isolated start', () => {
    const input = weighted(['A', 'B'], [['A', 'A', 1], ['B', 'B', 1]]);
    expect(solvePostman(input, { start: 'A' }).answer).toEqual({ exists: false, reason: 'disconnected' });
    const isolated = weighted(['A', 'B', 'C'], [['A', 'B', 1]]);
    expect(solvePostman(isolated, { start: 'C' }).answer).toEqual({ exists: false, reason: 'invalid_start' });
  });

  it('handles edgeless graphs and a single vertex with loops', () => {
    for (const input of [graph(['A']), graph(['A', 'B']), weighted(['A'], [['A', 'A', 0.25]])]) {
      const result = solvePostman(input, { start: 'A' });
      expect(result.answer).toMatchObject({ exists: true, duplicateLength: 0 });
      assertPostman(input, result, 'A');
    }
    expect(solvePostman(graph(['A', 'B']), { start: 'B' }).answer).toMatchObject({ length: 0, walk: { vertices: ['B'], edgeIds: [] } });
    expect(() => solvePostman(graph([]), { start: 'A' })).toThrow(RangeError);
  });

  it('uses labels and edge names and preserves frozen input with unusual IDs', () => {
    const input = weighted(['__proto__', 'constructor'], [['__proto__', 'constructor', 2]]);
    input.vertices[0]!.label = 'Nhà';
    input.vertices[1]!.label = 'Trường';
    input.edges[0]!.name = 'đường a';
    freezeGraph(input);
    const before = JSON.stringify(input);
    const result = solvePostman(input, { start: 'constructor' });
    expect(result.steps.some(({ text }) => text.includes('Nhà → Trường') && text.includes('đường a'))).toBe(true);
    expect(JSON.stringify(input)).toBe(before);
    expect(solvePostman(input, { start: 'constructor' })).toEqual(result);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    assertPostman(input, result, 'constructor');
  });

  it('guards unknown starts, invalid weights and more than 20 vertices', () => {
    expect(() => solvePostman(graph(['A']), { start: 'missing' })).toThrow(RangeError);
    expect(() => solvePostman(graph(['A', 'B'], [{ id: 'e', u: 'A', v: 'B' }]), { start: 'A' })).toThrow(RangeError);
    expect(() => solvePostman(weighted(['A'], [['A', 'A', 0]]), { start: 'A' })).toThrow(RangeError);
    expect(() => solvePostman(graph(Array.from({ length: 21 }, (_, i) => String(i))), { start: '0' })).toThrow(RangeError);
  });

  it('handles 20 odd vertices with bitmask matching', () => {
    const ids = Array.from({ length: 20 }, (_, i) => String(i));
    const input = weighted(ids, ids.slice(1).map((id) => ['0', id, 1]));
    const result = solvePostman(input, { start: '1' });
    expect(result.matching).toHaveLength(10);
    expect(result.answer).toMatchObject({ length: 38, duplicateLength: 19 });
    assertPostman(input, result, '1');
  });

  it('keeps the K20 explanation concise and distinguishes original and augmented degrees', () => {
    const ids = Array.from({ length: 20 }, (_, i) => `v${i}`);
    const edges: [string, string, number][] = [];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        edges.push([ids[i]!, ids[j]!, ((i * 7919 + j * 104729) % 97) + 1]);
      }
    }
    const input = weighted(ids, edges);
    const result = solvePostman(input, { start: 'v3' });
    assertPostman(input, result, 'v3');
    expect(result.steps.length).toBeLessThanOrEqual(30);
    expect(result.steps[0]).toMatchObject({ kind: 'postman_degrees',
      data: { degrees: Object.fromEntries(ids.map((id) => [id, 19])) } });
    expect(result.steps.some(({ kind }) => kind === 'degree' || kind === 'euler_conditions'
      || kind === 'euler_traverse' || kind === 'euler_backtrack')).toBe(false);
    const augmentedDegrees = Object.fromEntries(ids.map((id) => [id, 19]));
    if (!result.answer.exists) throw new Error('Expected a postman tour');
    for (const { originalEdgeId } of result.answer.duplicates) {
      const edge = input.edges.find(({ id }) => id === originalEdgeId)!;
      augmentedDegrees[edge.u]!++;
      augmentedDegrees[edge.v]!++;
    }
    expect(result.steps.find(({ kind }) => kind === 'postman_augmented')).toMatchObject({
      text: expect.stringContaining('Sau khi đi lặp các đường trên, mọi đỉnh có bậc chẵn'),
      data: { degrees: augmentedDegrees },
    });
    expect(Object.values(augmentedDegrees).every((value) => value >= 20 && value % 2 === 0)).toBe(true);
    const eulerSteps = result.steps.filter(({ kind }) => kind === 'postman_euler');
    expect(eulerSteps).toHaveLength(1);
    expect(eulerSteps[0]).toMatchObject({
      text: expect.stringContaining('xuất phát từ v3'), data: result.answer.walk,
      highlight: { vertices: result.answer.walk.vertices, edges: result.answer.walk.edgeIds },
    });
    expect(result.steps.slice(-3).map(({ kind }) => kind)).toEqual(['postman_augmented', 'postman_euler', 'conclusion']);
    expect(result.trace.filter(({ type }) => type === 'euler').length).toBeGreaterThan(input.edges.length);
  });

  it('matches exhaustive edge-covering walks on 300 small weighted multigraphs', () => {
    const arbitrary = weightedArbitrary(5, 7).map((input) => ({ ...input, edges: input.edges.slice(0, 7) }));
    fc.assert(fc.property(arbitrary, (input) => {
      const start = input.vertices.at(-1)!.id;
      const expected = brutePostman(input, start);
      const result = solvePostman(input, { start });
      expect(result.answer.exists).toBe(Number.isFinite(expected));
      if (result.answer.exists) {
        expect(result.answer.length).toBe(expected);
        assertPostman(input, result, start);
      }
    }), { seed: 1303, numRuns: 300 });
  });
});
