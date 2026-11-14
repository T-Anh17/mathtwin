import { describe, expect, it } from 'vitest';
import type { Claim, ProblemSpec, Task } from '../src/index.js';
import { grade, solve } from '../src/index.js';
import { graph, problem } from './fixtures.js';
import { weighted } from './weighted-fixtures.js';

const final = (value: unknown, step = 1): Claim => ({ type: 'final_answer', value, step, raw: 'Đáp số' });

describe('grade final answers', () => {
  it.each<Task>([
    { type: 'elements' }, { type: 'degree' }, { type: 'degree', vertices: ['B'] },
    { type: 'degree_sequence', sequence: [2, 3, 4, 3], simple: false },
    { type: 'degree_sequence', sequence: [2, 3, 4, 3], simple: true },
    { type: 'path', from: 'A', to: 'C' }, { type: 'connectivity' },
    { type: 'euler', want: 'path' }, { type: 'hamilton', want: 'path' },
    { type: 'hamilton', want: 'cycle' }, { type: 'shortest_path', from: 'A', to: 'C' },
    { type: 'tsp', method: 'both', start: 'A' }, { type: 'postman', start: 'B' },
    { type: 'statements', items: [{ id: 'a', text: 'Có ba đỉnh', check: { type: 'vertex_count', value: 3 } }] },
  ])('accepts the solver answer for $type with an answer-only note', (task) => {
    const spec = problem(task);
    const result = grade(spec, [final(solve(spec).answer)]);
    expect(result.verdict).toBe('DUNG');
    expect(result.notes).toContain('Không có bước giải để kiểm tra; chỉ chấm đáp số.');
  });
  it.each<[Task, unknown, unknown]>([
    [{ type: 'degree', vertices: ['B'] }, 2, 3],
    [{ type: 'connectivity' }, true, false],
    [{ type: 'path', from: 'A', to: 'C' }, true, false],
    [{ type: 'euler', want: 'path' }, true, false],
    [{ type: 'hamilton', want: 'cycle' }, false, true],
    [{ type: 'shortest_path', from: 'A', to: 'C' }, 5, 4],
    [{ type: 'postman', start: 'B' }, 10, 5],
    [{ type: 'degree_sequence', sequence: [1, 1], simple: true }, true, false],
  ])('checks a compact scalar for $0.type', (task, correct, wrong) => {
    expect(grade(problem(task), [final(correct)]).verdict).toBe('DUNG');
    expect(grade(problem(task), [final(wrong)])).toMatchObject({ verdict: 'SAI', errorCode: 'KET_LUAN_KHONG_SUY_RA' });
  });
  it('does not let a correct answer erase an incorrect derivation', () => {
    expect(grade(problem({ type: 'shortest_path', from: 'A', to: 'C' }), [
      { type: 'length', vertices: ['A', 'B', 'C'], value: 3, step: 2, raw: 'Tính sai' }, final(5, 3),
    ])).toMatchObject({ verdict: 'SAI', firstErrorStep: 2, errorCode: 'SAI_PHEP_TINH' });
  });
  it('checks an alternative shortest route rather than matching a reference route', () => {
    const spec: ProblemSpec = { ...problem({ type: 'shortest_path', from: 'A', to: 'D' }), graph: weighted(['A', 'B', 'C', 'D'], [['A', 'B', 1], ['A', 'C', 1], ['B', 'D', 3], ['C', 'D', 3], ['A', 'D', 9]]) };
    expect(grade(spec, [final({ exists: true, length: 4, walk: { vertices: ['A', 'C', 'D'] } })]).verdict).toBe('DUNG');
    expect(grade(spec, [final({ exists: true, length: 9, walk: { vertices: ['A', 'D'] } })])).toMatchObject({ errorCode: 'KET_LUAN_KHONG_SUY_RA' });
    expect(grade(spec, [final({ walk: { vertices: ['A', 'C', 'D'], edgeIds: ['e2'] } })])).toMatchObject({ verdict: 'CAN_XAC_NHAN' });
  });
  it('accepts an alternative Hamilton cycle, but enforces requested start', () => {
    const spec: ProblemSpec = { ...problem({ type: 'hamilton', want: 'cycle', start: 'A' }), graph: weighted(['A', 'B', 'C'], [['A', 'B', 1], ['B', 'C', 1], ['C', 'A', 1]]) };
    expect(grade(spec, [final({ exists: true, kind: 'cycle', walk: { vertices: ['A', 'C', 'B', 'A'] } })]).verdict).toBe('DUNG');
    expect(grade(spec, [final({ walk: { vertices: ['B', 'A', 'C', 'B'] } })])).toMatchObject({ errorCode: 'HIEU_SAI_DE' });
  });
  it('checks alternative TSP tours for optimality or nearest-neighbor choices', () => {
    const spec: ProblemSpec = { ...problem({ type: 'tsp', start: 'A', method: 'nearest_neighbor' }), graph: weighted(['A', 'B', 'C', 'D'], [['A', 'B', 1], ['A', 'C', 1], ['A', 'D', 9], ['B', 'C', 2], ['B', 'D', 3], ['C', 'D', 4]]) };
    const route = { exists: true, length: 15, walk: { vertices: ['A', 'C', 'B', 'D', 'A'] } };
    expect(grade(spec, [final(route)]).verdict).toBe('DUNG');
    expect(grade(spec, [final(15)]).verdict).toBe('KHONG_DU_CAN_CU');
    expect(grade(spec, [final({ length: 15 })]).verdict).toBe('KHONG_DU_CAN_CU');
    expect(grade(spec, [final({ nearestNeighbor: [{ start: 'A', answer: route }] })]).verdict).toBe('DUNG');
    expect(grade({ ...spec, task: { type: 'tsp', start: 'A', method: 'optimal' } }, [final(route)])).toMatchObject({ errorCode: 'KET_LUAN_KHONG_SUY_RA' });
    const optimal = { exists: true, length: 9, walk: { vertices: ['A', 'B', 'D', 'C', 'A'] } };
    expect(grade({ ...spec, task: { type: 'tsp', start: 'A', method: 'optimal' } }, [final({ optimal })]).verdict).toBe('DUNG');
  });
  it('checks postman tour cost with parallel edges of different weights and even-degree start', () => {
    const spec: ProblemSpec = { ...problem({ type: 'postman', start: 'A' }), graph: weighted(['A', 'B'], [['A', 'B', 1], ['A', 'B', 3]]) };
    expect(grade(spec, [final({ exists: true, length: 4, walk: { vertices: ['A', 'B', 'A'] } })]).verdict).toBe('DUNG');
    expect(grade(spec, [final({ length: 2, walk: { vertices: ['A', 'B', 'A'] } })])).toMatchObject({ errorCode: 'SAI_PHEP_TINH' });
    const line = problem({ type: 'postman', start: 'B' });
    expect(grade(line, [final({ exists: true, length: 10, walk: { vertices: ['B', 'C', 'B', 'A', 'B'] } })]).verdict).toBe('DUNG');
    expect(grade(line, [final({ length: 20, walk: { vertices: ['B', 'C', 'B', 'A', 'B', 'C', 'B', 'A', 'B'] } })])).toMatchObject({ errorCode: 'KET_LUAN_KHONG_SUY_RA' });
  });
  it('rejects a heavier parallel edge in a final nearest-neighbor tour', () => {
    const spec: ProblemSpec = { ...problem({ type: 'tsp', start: 'A', method: 'nearest_neighbor' }), graph: weighted(['A', 'B'], [['A', 'B', 1], ['A', 'B', 3]]) };
    expect(grade(spec, [final({ length: 4, walk: { vertices: ['A', 'B', 'A'], edgeIds: ['e2', 'e1'] } })])).toMatchObject({ verdict: 'SAI', errorCode: 'SAI_LUA_CHON' });
  });
  it('accepts another realization of a degree sequence', () => {
    const spec = problem({ type: 'degree_sequence', sequence: [2, 2, 2, 2], simple: true });
    const witness = weighted(['A', 'B', 'C', 'D'], [['A', 'C', 1], ['C', 'B', 1], ['B', 'D', 1], ['D', 'A', 1]]);
    expect(grade(spec, [final({ exists: true, graph: witness })]).verdict).toBe('DUNG');
    expect(grade(spec, [final({ exists: true, graph: graph(['A']) })])).toMatchObject({ errorCode: 'KET_LUAN_KHONG_SUY_RA' });
  });
  it('treats vertex and component listings as sets', () => {
    expect(grade(problem(), [final({ vertices: ['C', 'B', 'A'], edges: ['e2', 'e1'] })]).verdict).toBe('DUNG');
    const spec = { ...problem({ type: 'connectivity' }), graph: graph(['A', 'B', 'C'], [{ id: 'ab', u: 'A', v: 'B' }]) };
    expect(grade(spec, [final({ connected: false, components: [['C'], ['B', 'A']] })]).verdict).toBe('DUNG');
  });
});
