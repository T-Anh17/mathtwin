import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { Claim, ClaimBody, ProblemSpec } from '../src/index.js';
import { grade, solveDijkstra, solveEuler, solveHamilton } from '../src/index.js';
import { graph, problem } from './fixtures.js';
import { weighted, weightedArbitrary } from './weighted-fixtures.js';

const c = (body: ClaimBody, step = 1): Claim => ({ ...body, step, raw: 'Bài làm' });
const ordered = (bodies: ClaimBody[]): Claim[] => bodies.map((body, i) => c(body, i + 1));

describe('grade student Dijkstra simulation', () => {
  const spec: ProblemSpec = { ...problem({ type: 'shortest_path', from: 'A', to: 'D' }), graph: weighted(['A', 'B', 'C', 'D'], [['A', 'B', 1], ['A', 'C', 1], ['B', 'D', 3], ['C', 'D', 3]]) };
  it('accepts another tied ordering and predecessor', () => {
    const claims = ordered([
      { type: 'dijkstra_init', source: 'A' }, { type: 'dijkstra_label', v: 'D', value: null },
      { type: 'dijkstra_select', v: 'A' }, { type: 'dijkstra_select', v: 'C' },
      { type: 'dijkstra_label', v: 'D', value: 4, via: 'C' }, { type: 'dijkstra_select', v: 'B' },
      { type: 'dijkstra_label', v: 'D', value: 4, via: 'B' }, { type: 'dijkstra_select', v: 'D' },
      { type: 'final_answer', value: 4 },
    ]);
    expect(grade(spec, claims).verdict).toBe('DUNG');
  });
  it('reports 1 + 3 as 4 and recovers true state after a wrong label', () => {
    const result = grade(spec, ordered([
      { type: 'dijkstra_select', v: 'A' }, { type: 'dijkstra_select', v: 'C' },
      { type: 'dijkstra_label', v: 'D', value: 2, via: 'C' },
      { type: 'dijkstra_select', v: 'B' }, { type: 'dijkstra_select', v: 'D' },
      { type: 'final_answer', value: 4 },
    ]));
    expect(result).toMatchObject({ verdict: 'SAI', firstErrorStep: 3, errorCode: 'SAI_PHEP_TINH', facts: { expected: 4, got: 2, viaDistance: 1, weight: 3 } });
    expect(result.notes.some((note) => note.startsWith('Bước '))).toBe(false);
  });
  it('reports missed updates in a partially written relaxation block', () => {
    const result = grade(spec, ordered([
      { type: 'dijkstra_select', v: 'A' }, { type: 'dijkstra_label', v: 'B', value: 1 },
      { type: 'dijkstra_select', v: 'B' },
    ]));
    expect(result).toMatchObject({ verdict: 'SAI', firstErrorStep: 3, errorCode: 'BO_SOT', facts: { vertices: ['C'] } });
  });
  it('accepts selected-only traces, but rejects selecting a settled vertex or continuing after the target', () => {
    expect(grade(spec, ordered([{ type: 'dijkstra_select', v: 'A' }, { type: 'dijkstra_select', v: 'A' }]))).toMatchObject({ errorCode: 'SAI_LUA_CHON', firstErrorStep: 2 });
    expect(grade(spec, ordered(['A', 'B', 'C', 'D', 'C'].map((v) => ({ type: 'dijkstra_select', v }))))).toMatchObject({ errorCode: 'SAI_LUA_CHON', firstErrorStep: 5 });
  });
  it('recognizes an entire Prim/nearest-neighbor selection sequence', () => {
    const confused = { ...spec, graph: weighted(['A', 'B', 'C', 'D'], [['A', 'B', 1], ['A', 'C', 3], ['B', 'D', 3], ['C', 'D', 1]]) };
    expect(grade(confused, ordered(['A', 'B', 'D', 'C'].map((v) => ({ type: 'dijkstra_select', v }))))).toMatchObject({ verdict: 'SAI', firstErrorStep: 3, errorCode: 'NHAM_THUAT_TOAN' });
    expect(grade(confused, ordered(['A', 'D'].map((v) => ({ type: 'dijkstra_select', v }))))).toMatchObject({ errorCode: 'SAI_LUA_CHON' });
  });
  it('supports an explicit source on a non-shortest-path task and skips a missing source', () => {
    expect(grade(problem(), [c({ type: 'dijkstra_select', v: 'A' })]).verdict).toBe('KHONG_DU_CAN_CU');
    expect(grade(problem(), ordered([{ type: 'dijkstra_init', source: 'A' }, { type: 'dijkstra_select', v: 'A' }, { type: 'dijkstra_label', v: 'B', value: 2, via: 'A' }])).verdict).toBe('DUNG');
  });
  it('distinguishes wrong source, nonexistent via, and unsupported predecessor', () => {
    expect(grade(spec, [c({ type: 'dijkstra_init', source: 'B' })])).toMatchObject({ errorCode: 'HIEU_SAI_DE' });
    expect(grade(spec, ordered([{ type: 'dijkstra_select', v: 'A' }, { type: 'dijkstra_label', v: 'B', value: 1, via: 'C' }]))).toMatchObject({ errorCode: 'CANH_KHONG_TON_TAI' });
    expect(grade(spec, ordered([{ type: 'dijkstra_select', v: 'A' }, { type: 'dijkstra_label', v: 'D', value: null, via: 'C' }]))).toMatchObject({ errorCode: 'KET_LUAN_KHONG_SUY_RA' });
  });
  it('handles unreachable labels and rejects a late reinitialization', () => {
    const disconnected = { ...spec, graph: weighted(['A', 'B', 'C', 'D'], [['A', 'B', 1]]) };
    expect(grade(disconnected, ordered([{ type: 'dijkstra_select', v: 'A' }, { type: 'dijkstra_label', v: 'D', value: null }, { type: 'dijkstra_select', v: 'B' }])).verdict).toBe('DUNG');
    expect(grade(spec, ordered([{ type: 'dijkstra_select', v: 'A' }, { type: 'dijkstra_init', source: 'A' }]))).toMatchObject({ errorCode: 'SAI_DIEU_KIEN' });
  });
});

describe('grade walks and reviewer mismatch convention', () => {
  it.each<Extract<ClaimBody, { type: 'walk' }>['kind']>(['path', 'euler_path', 'euler_circuit', 'hamilton_path', 'hamilton_cycle', 'tsp_tour', 'postman_tour'])('requires confirmation for mismatched edge IDs in %s', (kind) => {
    const result = grade(problem(), [c({ type: 'walk', kind, vertices: ['A', 'B', 'C'], edgeIds: ['e1'] }, 6)]);
    expect(result).toMatchObject({ verdict: 'CAN_XAC_NHAN', firstErrorStep: 6, facts: { reason: 'edge_count_mismatch' }, needsConfirmation: [{ step: 6, item: 'edgeIds' }] });
    expect(result).not.toHaveProperty('errorCode');
  });
  it('keeps an earlier mathematical error before a later mismatch', () => {
    expect(grade(problem(), ordered([{ type: 'edge_count', value: 0 }, { type: 'walk', kind: 'path', vertices: ['A', 'B'], edgeIds: [] }]))).toMatchObject({ verdict: 'SAI', firstErrorStep: 1 });
  });
  it.each<[ClaimBody, string]>([
    [{ type: 'walk', kind: 'path', vertices: ['A', 'C'] }, 'CANH_KHONG_TON_TAI'],
    [{ type: 'walk', kind: 'euler_path', vertices: ['A', 'B'] }, 'BO_SOT'],
    [{ type: 'walk', kind: 'euler_path', vertices: ['A', 'B', 'A'] }, 'LAP'],
    [{ type: 'walk', kind: 'hamilton_path', vertices: ['A', 'B', 'A'] }, 'LAP'],
    [{ type: 'walk', kind: 'hamilton_path', vertices: ['A', 'B'] }, 'BO_SOT'],
    [{ type: 'walk', kind: 'euler_circuit', vertices: ['A', 'B', 'C'] }, 'HIEU_SAI_DE'],
  ])('classifies a structural walk failure', (body, errorCode) => {
    expect(grade(problem(), [c(body)])).toMatchObject({ verdict: 'SAI', errorCode });
  });
  it('accepts alternative Euler/Hamilton paths and respects start/end constraints', () => {
    for (const kind of ['euler_path', 'hamilton_path'] as const) expect(grade(problem(), [c({ type: 'walk', kind, vertices: ['C', 'B', 'A'] })]).verdict).toBe('DUNG');
    expect(grade(problem({ type: 'euler', want: 'path', start: 'A' }), [c({ type: 'walk', kind: 'euler_path', vertices: ['C', 'B', 'A'] })])).toMatchObject({ errorCode: 'HIEU_SAI_DE' });
    expect(grade(problem({ type: 'hamilton', want: 'path', end: 'C' }), [c({ type: 'walk', kind: 'hamilton_path', vertices: ['C', 'B', 'A'] })])).toMatchObject({ errorCode: 'HIEU_SAI_DE' });
  });
  it('accepts loops and either assignment of parallel edges in an Euler circuit', () => {
    const spec = { ...problem({ type: 'euler', want: 'circuit' }), graph: graph(['A', 'B'], [{ id: 'l', u: 'A', v: 'A' }, { id: 'a', u: 'A', v: 'B' }, { id: 'b', u: 'A', v: 'B' }]) };
    expect(grade(spec, [c({ type: 'walk', kind: 'euler_circuit', vertices: ['B', 'A', 'A', 'B'], edgeIds: ['b', 'l', 'a'] })]).verdict).toBe('DUNG');
  });
  it('requires a postman tour to cover every parallel original edge', () => {
    const spec = { ...problem(), graph: weighted(['A', 'B'], [['A', 'B', 1], ['A', 'B', 1], ['A', 'B', 1]]) };
    expect(grade(spec, [c({ type: 'walk', kind: 'postman_tour', vertices: ['A', 'B', 'A'] })])).toMatchObject({ errorCode: 'BO_SOT' });
    expect(grade(spec, [c({ type: 'walk', kind: 'postman_tour', vertices: ['A', 'B', 'A', 'B', 'A'] })]).verdict).toBe('DUNG');
  });
});

describe('nearest neighbor and postman grading state', () => {
  const spec: ProblemSpec = { ...problem({ type: 'tsp', start: 'A', method: 'nearest_neighbor' }), graph: weighted(['A', 'B', 'C', 'D'], [['A', 'B', 1], ['A', 'C', 1], ['A', 'D', 9], ['B', 'C', 2], ['B', 'D', 3], ['C', 'D', 4]]) };
  it('follows a student tie choice with a different final tour length', () => {
    // The solver chooses B first (length 16); the student chooses C (length 15).
    const claims = ordered([
      { type: 'nn_step', from: 'A', to: 'C' }, { type: 'nn_step', from: 'C', to: 'B' },
      { type: 'nn_step', from: 'B', to: 'D' }, { type: 'nn_step', from: 'D', to: 'A' },
      { type: 'final_answer', value: 15 },
    ]);
    expect(grade(spec, claims).verdict).toBe('DUNG');
    expect(grade(spec, [...claims.slice(0, -1), c({ type: 'final_answer', value: { exists: true, length: 15 } }, 5)]).verdict).toBe('DUNG');
  });
  it('rejects early closure, wrong departure and a nonminimum neighbor', () => {
    for (const [from, to] of [['A', 'D'], ['A', 'A']]) expect(grade(spec, [c({ type: 'nn_step', from: from!, to: to! })])).toMatchObject({ errorCode: 'SAI_LUA_CHON' });
    expect(grade(spec, [c({ type: 'nn_step', from: 'B', to: 'A' })])).toMatchObject({ errorCode: 'HIEU_SAI_DE', facts: { expected: 'A', got: 'B' } });
    expect(grade(spec, ordered([{ type: 'nn_step', from: 'A', to: 'B' }, { type: 'nn_step', from: 'B', to: 'A' }]))).toMatchObject({ errorCode: 'SAI_LUA_CHON', firstErrorStep: 2 });
  });
  it('accepts another optimal matching but rejects reusing an odd endpoint', () => {
    const four = { ...problem({ type: 'postman', start: 'A' }), graph: weighted(['A', 'B', 'C', 'D'], [['A', 'B', 1], ['A', 'C', 1], ['A', 'D', 1], ['B', 'C', 1], ['B', 'D', 1], ['C', 'D', 1]]) };
    expect(grade(four, ordered([{ type: 'postman_duplicate', vertices: ['A', 'D'] }, { type: 'postman_duplicate', vertices: ['C', 'B'] }])).verdict).toBe('DUNG');
    expect(grade(four, ordered([{ type: 'postman_duplicate', vertices: ['A', 'D'] }, { type: 'postman_duplicate', vertices: ['A', 'C'] }]))).toMatchObject({ errorCode: 'LAP', firstErrorStep: 2 });
  });
});

describe('generated valid algorithm claims', () => {
  it('accepts every emitted Dijkstra trace and valid Euler/Hamilton witness', () => {
    fc.assert(fc.property(weightedArbitrary(7, 16), (input) => {
      const from = input.vertices[0]!.id;
      const to = input.vertices.at(-1)!.id;
      const spec: ProblemSpec = { graph: input, task: { type: 'shortest_path', from, to }, questionFormat: 'tu_luan' };
      const dijkstra = solveDijkstra(input, { from, to });
      const bodies: ClaimBody[] = [{ type: 'dijkstra_init', source: from }];
      for (const trace of dijkstra.trace) {
        bodies.push({ type: 'dijkstra_select', v: trace.selected });
        for (const u of trace.updates) bodies.push({ type: 'dijkstra_label', v: u.v, value: u.new });
      }
      expect(grade(spec, ordered(bodies)).verdict).toBe('DUNG');
      const euler = solveEuler(input).answer;
      if (euler.exists) expect(grade({ ...spec, task: { type: 'euler', want: 'any' } }, [c({ type: 'walk', kind: euler.kind === 'circuit' ? 'euler_circuit' : 'euler_path', ...euler.walk })]).verdict).toBe('DUNG');
      const hamilton = solveHamilton(input, { want: 'path' }).answer;
      if (hamilton.exists) expect(grade({ ...spec, task: { type: 'hamilton', want: 'path' } }, [c({ type: 'walk', kind: 'hamilton_path', ...hamilton.walk })]).verdict).toBe('DUNG');
    }), { seed: 1505, numRuns: 150 });
  });
});
