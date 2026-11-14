import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { analyzeHamilton, checkWalk, hamiltonCycleRules, solveHamilton } from '../src/index.js';
import type { Graph, HamiltonOptions, HamiltonSolution } from '../src/index.js';
import { graph } from './fixtures.js';
import { assertWalkEdges, bruteHamilton, completeGraph, cycleGraph, freezeGraph, fromPairs, multigraphArbitrary } from './traversal-fixtures.js';

function assertHamilton(input: Graph, result: HamiltonSolution, options: HamiltonOptions): void {
  expect(result.answer.exists).toBe(true);
  if (!result.answer.exists) throw new Error('Expected a Hamilton walk');
  const { walk } = result.answer;
  const cycle = options.want === 'cycle';
  assertWalkEdges(input, walk);
  const visits = cycle ? walk.vertices.slice(0, -1) : walk.vertices;
  expect(visits).toHaveLength(input.vertices.length);
  expect(new Set(visits)).toEqual(new Set(input.vertices.map(({ id }) => id)));
  expect(new Set(visits).size).toBe(visits.length);
  if (cycle) expect(walk.vertices.at(-1)).toBe(walk.vertices[0]);
  if (options.start !== undefined) expect(walk.vertices[0]).toBe(options.start);
  if (options.end !== undefined) expect(walk.vertices.at(-1)).toBe(options.end);
  expect(checkWalk(input, { kind: cycle ? 'hamilton_cycle' : 'hamilton_path', ...walk }, options).ok).toBe(true);
  expect(result.steps.map(({ index }) => index)).toEqual(result.steps.map((_, i) => i + 1));
  expect(result.steps.every(({ text }) => text.length > 0)).toBe(true);
  expect(result.trace.at(-1)).toEqual({ type: 'verify', vertexCount: input.vertices.length, edgeCount: walk.edgeIds.length, closed: cycle });
}

function bipartite(a: number, b: number): Graph {
  const left = Array.from({ length: a }, (_, i) => `L${i}`);
  const right = Array.from({ length: b }, (_, i) => `R${i}`);
  return fromPairs([...left, ...right], left.flatMap((u) => right.map((v): [string, string] => [u, v])));
}

function simpleGraphArbitrary(): fc.Arbitrary<Graph> {
  return fc.integer({ min: 0, max: 8 }).chain((n) => {
    const complete = completeGraph(n);
    return fc.array(fc.boolean(), { minLength: complete.edges.length, maxLength: complete.edges.length })
      .map((include) => graph(complete.vertices.map(({ id }) => id), complete.edges.filter((_, i) => include[i])));
  });
}

describe('Hamilton solver', () => {
  const line = fromPairs(['A', 'B', 'C'], [['A', 'B'], ['B', 'C']]);

  it('finds a Hamilton path in A–B–C but proves there is no Hamilton cycle by degree one', () => {
    const path = solveHamilton(line, { want: 'path' });
    assertHamilton(line, path, { want: 'path' });
    expect(path.answer).toMatchObject({ walk: { vertices: ['A', 'B', 'C'], edgeIds: ['e1', 'e2'] } });
    expect(path.trace.some(({ type }) => type === 'force_edges')).toBe(false);
    const cycle = solveHamilton(line, { want: 'cycle' });
    expect(cycle.answer).toEqual({ exists: false, reason: 'cycle_rules' });
    expect(cycle.method).toBe('rules');
    expect(cycle.trace).toEqual([{ type: 'insufficient_degree', vertex: 'A', degree: 1 }]);
    expect(cycle.steps.find(({ kind }) => kind === 'hamilton_insufficient_degree')?.text).toContain('bậc 1');
  });

  it('finds a cycle even though both Dirac and Ore fail', () => {
    const input = cycleGraph(5);
    const result = solveHamilton(input);
    expect(result.analysis.dirac).toEqual({ applicable: true, holds: false });
    expect(result.analysis.ore).toEqual({ applicable: true, holds: false });
    expect(result.method).toBe('rules');
    expect(result.trace.some(({ type }) => type === 'force_edges')).toBe(true);
    expect(result.trace.some(({ type }) => type === 'search')).toBe(false);
    expect(result.steps.find(({ kind }) => kind === 'hamilton_theorems')?.text).toContain('chỉ là các điều kiện đủ');
    assertHamilton(input, result, { want: 'cycle' });
  });

  it('checks Dirac and Ore separately, including an Ore-only graph', () => {
    expect(analyzeHamilton(completeGraph(5))).toMatchObject({ dirac: { holds: true }, ore: { holds: true } });
    const input = completeGraph(5);
    input.edges = input.edges.filter((e) => !(e.u === '0' && (e.v === '1' || e.v === '2')));
    expect(analyzeHamilton(input)).toMatchObject({ dirac: { applicable: true, holds: false }, ore: { applicable: true, holds: true } });
    assertHamilton(input, solveHamilton(input), { want: 'cycle' });
  });

  it('forces degree-two edges, excludes surplus edges and constructs the resulting cycle', () => {
    const input = cycleGraph(4);
    input.edges.push({ id: 'diagonal', u: '0', v: '2' });
    const result = solveHamilton(input, { want: 'cycle', start: '2' });
    expect(result.method).toBe('rules');
    expect(result.trace).toContainEqual({ type: 'exclude_edges', vertex: '0', edgeIds: ['diagonal'], forcedEdgeIds: ['e1', 'e4'] });
    expect(result.steps.find(({ kind }) => kind === 'hamilton_exclude_edges')?.text).toContain('đã có hai cạnh bắt buộc');
    assertHamilton(input, result, { want: 'cycle', start: '2' });
    if (result.answer.exists) expect(result.answer.walk.edgeIds).not.toContain('diagonal');
  });

  it('proves impossibility when forced edges close a proper subcycle', () => {
    const input = fromPairs(['A', 'B', 'C', 'D', 'E', 'F'], [
      ['A', 'B'], ['B', 'C'], ['C', 'A'], ['D', 'E'], ['E', 'F'], ['F', 'D'], ['A', 'D'],
    ]);
    const result = solveHamilton(input);
    expect(result.answer).toEqual({ exists: false, reason: 'cycle_rules' });
    expect(result.trace).toContainEqual({ type: 'contradiction', reason: 'premature_cycle', vertices: ['A', 'B', 'C'], edgeIds: ['e1', 'e2', 'e3'] });
    expect(result.steps.some(({ text }) => text.includes('chưa qua mọi đỉnh'))).toBe(true);
  });

  it('detects too many forced edges and too few available edges', () => {
    const input = bipartite(2, 3);
    const tooMany = hamiltonCycleRules(input);
    expect(tooMany.status).toBe('impossible');
    expect(tooMany.trace).toContainEqual(expect.objectContaining({ type: 'contradiction', reason: 'too_many_forced' }));
    const reordered = graph(['R0', 'R1', 'L0', 'R2', 'L1'], input.edges);
    const tooFew = hamiltonCycleRules(reordered);
    expect(tooFew.status).toBe('impossible');
    expect(tooFew.trace).toContainEqual(expect.objectContaining({ type: 'contradiction', reason: 'too_few_edges' }));
  });

  it('uses exact search when the degree rules do not decide the answer', () => {
    const input = completeGraph(5);
    const result = solveHamilton(input, { want: 'cycle', start: '3' });
    expect(result.method).toBe('search');
    expect(result.trace).toContainEqual(expect.objectContaining({ type: 'search', statesVisited: 5 }));
    expect(result.answer).toMatchObject({ walk: { vertices: ['3', '0', '1', '2', '4', '3'] } });
    assertHamilton(input, result, { want: 'cycle', start: '3' });
  });

  it('exhausts exact search on a connected minimum-degree-three graph without a cycle', () => {
    const input = bipartite(3, 4);
    const result = solveHamilton(input);
    expect(result.method).toBe('search');
    expect(result.answer).toEqual({ exists: false, reason: 'exhausted' });
    expect(result.trace).toContainEqual(expect.objectContaining({ type: 'search', statesVisited: expect.any(Number) }));
    assertHamilton(input, solveHamilton(input, { want: 'path' }), { want: 'path' });
  });

  it('honors path endpoints and can fail for a required start even when another path exists', () => {
    const options: HamiltonOptions = { want: 'path', start: 'C', end: 'A' };
    assertHamilton(line, solveHamilton(line, options), options);
    expect(solveHamilton(line, { want: 'path', start: 'B' }).answer.exists).toBe(false);
    expect(solveHamilton(line, { want: 'path', end: 'B' }).answer.exists).toBe(false);
    const endOnly: HamiltonOptions = { want: 'path', end: 'A' };
    assertHamilton(line, solveHamilton(line, endOnly), endOnly);
    expect(solveHamilton(line, { want: 'path', start: 'A', end: 'A' }).answer).toEqual({ exists: false, reason: 'incompatible_endpoints' });
  });

  it('treats cycle end as the return to its start and honors an end-only request', () => {
    for (const input of [cycleGraph(5), completeGraph(5)]) {
      for (const options of [
        { want: 'cycle', start: '2', end: '2' }, { want: 'cycle', end: '3' },
      ] satisfies HamiltonOptions[]) assertHamilton(input, solveHamilton(input, options), options);
      expect(solveHamilton(input, { want: 'cycle', start: '0', end: '1' }).answer).toEqual({ exists: false, reason: 'incompatible_endpoints' });
    }
  });

  it('checks connectivity on all vertices, including isolated ones', () => {
    const input = graph(['A', 'B', 'C', 'D'], line.edges);
    for (const want of ['path', 'cycle'] as const) {
      const result = solveHamilton(input, { want });
      expect(result.analysis.connected).toBe(false);
      expect(result.answer).toEqual({ exists: false, reason: 'disconnected' });
    }
  });

  it('applies theorems and cycle rules to the underlying simple graph of a multigraph', () => {
    const input = cycleGraph(5);
    input.edges.unshift({ id: 'loop', u: '0', v: '0' }, { id: 'parallel', u: '0', v: '1' });
    const result = solveHamilton(input);
    expect(result.analysis).toMatchObject({ simple: false, neighborCounts: { '0': 2 }, dirac: { applicable: true, holds: false }, ore: { applicable: true, holds: false } });
    expect(result.method).toBe('rules');
    expect(result.steps.find(({ kind }) => kind === 'hamilton_underlying')?.text).toContain('bỏ các khuyên và gộp các cạnh song song');
    assertHamilton(input, result, { want: 'cycle' });
    if (result.answer.exists) {
      expect(result.answer.walk.edgeIds[0]).toBe('parallel');
      expect(result.answer.walk.edgeIds).not.toContain('loop');
    }
  });

  it('uses distinct neighbors for Dirac/Ore even when edge multiplicity inflates degrees', () => {
    const complete = completeGraph(5);
    complete.edges.push({ id: 'loop', u: '0', v: '0' }, { id: 'copy', u: '0', v: '1' });
    expect(analyzeHamilton(complete)).toMatchObject({ simple: false, dirac: { applicable: true, holds: true }, ore: { applicable: true, holds: true } });
    const inflated = fromPairs(['A', 'B', 'C'], [['A', 'B'], ['A', 'B'], ['A', 'B'], ['B', 'C'], ['A', 'A'], ['C', 'C']]);
    expect(analyzeHamilton(inflated)).toMatchObject({ neighborCounts: { A: 1, B: 2, C: 1 }, dirac: { holds: false }, ore: { holds: false } });
    const result = solveHamilton(inflated);
    expect(result.method).toBe('rules');
    expect(result.trace).toContainEqual({ type: 'insufficient_degree', vertex: 'A', degree: 1 });
    assertHamilton(inflated, solveHamilton(inflated, { want: 'path' }), { want: 'path' });
  });

  it('excludes surplus representative edges and proves contradictions on multigraphs', () => {
    const input = cycleGraph(4);
    input.edges.push({ id: 'diagonal', u: '0', v: '2' }, { id: 'parallel', u: '2', v: '0' }, { id: 'loop', u: '1', v: '1' });
    const rules = hamiltonCycleRules(input);
    expect(rules.status).toBe('cycle');
    expect(rules.excludedEdgeIds).toEqual(['diagonal']);
    expect(rules.forcedEdgeIds).not.toContain('parallel');
    assertHamilton(input, solveHamilton(input), { want: 'cycle' });
    const impossible = bipartite(2, 3);
    impossible.edges.push({ id: 'copy', u: 'L0', v: 'R0' }, { id: 'loop', u: 'L0', v: 'L0' });
    expect(hamiltonCycleRules(impossible).status).toBe('impossible');
  });

  it('uses vertex input order for choices and the first parallel edge in edge input order', () => {
    const input = graph(['D', 'B', 'A', 'C'], completeGraph(0).edges);
    input.edges = [
      { id: 'lastVertexFirst', u: 'D', v: 'C' },
      { id: 'preferred', u: 'D', v: 'B' }, { id: 'parallel', u: 'B', v: 'D' },
      { id: 'ba', u: 'B', v: 'A' }, { id: 'ac', u: 'A', v: 'C' }, { id: 'ad', u: 'A', v: 'D' },
    ];
    const result = solveHamilton(input, { want: 'path' });
    expect(result.answer).toMatchObject({ walk: { vertices: ['D', 'B', 'A', 'C'], edgeIds: ['preferred', 'ba', 'ac'] } });
    assertHamilton(input, result, { want: 'path' });
  });

  it('handles empty graphs, singleton paths and short-cycle conventions', () => {
    expect(solveHamilton(graph([]), { want: 'path' }).answer).toEqual({ exists: false, reason: 'empty_graph' });
    expect(solveHamilton(graph([])).answer.exists).toBe(false);
    const singleton = graph(['A']);
    assertHamilton(singleton, solveHamilton(singleton, { want: 'path', start: 'A', end: 'A' }), { want: 'path', start: 'A', end: 'A' });
    for (const input of [singleton, fromPairs(['A'], [['A', 'A']]), fromPairs(['A', 'B'], [['A', 'B'], ['A', 'B']])]) {
      expect(solveHamilton(input).answer).toEqual({ exists: false, reason: 'too_few_vertices' });
    }
    const two = fromPairs(['A', 'B'], [['A', 'B']]);
    assertHamilton(two, solveHamilton(two, { want: 'path' }), { want: 'path' });
  });

  it('supports twenty vertices for rules and exact search, rejecting larger input', () => {
    const ring = cycleGraph(20);
    assertHamilton(ring, solveHamilton(ring, { want: 'cycle', start: '19' }), { want: 'cycle', start: '19' });
    const complete = completeGraph(20);
    assertHamilton(complete, solveHamilton(complete), { want: 'cycle' });
    const pathOptions: HamiltonOptions = { want: 'path', start: '17', end: '4' };
    assertHamilton(complete, solveHamilton(complete, pathOptions), pathOptions);
    expect(() => solveHamilton(cycleGraph(21))).toThrow(RangeError);
  });

  it('explains a found cycle using Vietnamese labels/names and supplies trace highlights', () => {
    const input = fromPairs(['A', 'B', 'C'], [['A', 'B'], ['B', 'C'], ['C', 'A']]);
    input.vertices[0]!.label = 'Nhà';
    input.edges[0]!.name = 'đường a';
    const result = solveHamilton(input);
    expect(result.steps.some(({ text }) => text.includes('Nhà') && text.includes('đường a'))).toBe(true);
    expect(result.steps.find(({ kind }) => kind === 'hamilton_advance')).toMatchObject({
      data: { type: 'advance', from: 'A', to: 'B', edgeId: 'e1' }, highlight: { vertices: ['A', 'B'], edges: ['e1'] },
    });
    expect(result.trace.filter(({ type }) => type === 'close')).toEqual([{ type: 'close', from: 'C', to: 'A', edgeId: 'e3' }]);
    expect(result.steps.find(({ kind }) => kind === 'hamilton_verify')?.text).toContain('đủ 3 đỉnh');
  });

  it('rejects unknown endpoints, preserves frozen input and handles prototype-like IDs', () => {
    expect(() => solveHamilton(line, { want: 'path', start: 'missing' })).toThrow(RangeError);
    expect(() => solveHamilton(line, { want: 'cycle', end: 'missing' })).toThrow(RangeError);
    const input = freezeGraph(fromPairs(['__proto__', 'constructor', 'A'], [['__proto__', 'constructor'], ['constructor', 'A'], ['A', '__proto__']]));
    const before = JSON.stringify(input);
    const result = solveHamilton(input);
    assertHamilton(input, result, { want: 'cycle' });
    expect(solveHamilton(input)).toEqual(result);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('matches exhaustive permutations on generated simple graphs and multigraphs with up to eight vertices', () => {
    fc.assert(fc.property(fc.oneof(simpleGraphArbitrary(), multigraphArbitrary()), (input) => {
      for (const want of ['path', 'cycle'] as const) {
        const expected = bruteHamilton(input, { want });
        const result = solveHamilton(input, { want });
        expect(result.answer.exists).toBe(expected !== null);
        if (result.answer.exists) assertHamilton(input, result, { want });
      }
    }), { seed: 1204, numRuns: 500 });
  }, 20000);

  it('matches exhaustive permutations with optional start/end constraints', () => {
    const cases = fc.oneof(simpleGraphArbitrary(), multigraphArbitrary()).chain((input) => {
      const ids = input.vertices.map(({ id }) => id);
      const endpoint = ids.length === 0 ? fc.constant(undefined) : fc.option(fc.constantFrom(...ids), { nil: undefined });
      return fc.tuple(fc.constant(input), endpoint, endpoint);
    });
    fc.assert(fc.property(cases, ([input, start, end]) => {
      for (const want of ['path', 'cycle'] as const) {
        const options: HamiltonOptions = { want, ...(start === undefined ? {} : { start }), ...(end === undefined ? {} : { end }) };
        const expected = bruteHamilton(input, options);
        const result = solveHamilton(input, options);
        expect(result.answer.exists).toBe(expected !== null);
        if (result.answer.exists) assertHamilton(input, result, options);
      }
    }), { seed: 1205, numRuns: 500 });
  }, 20000);
});
