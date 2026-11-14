import { describe, expect, it } from 'vitest';
import type { ProblemSpec, Task } from '../src/index.js';
import { solve } from '../src/index.js';
import { graph, problem } from './fixtures.js';
import { freezeGraph } from './traversal-fixtures.js';

describe('public solve', () => {
  const cases: [Task, unknown][] = [
    [{ type: 'elements' }, { vertexCount: 3, edgeCount: 2, simple: true, loops: [], isolatedVertices: [] }],
    [{ type: 'degree' }, { degrees: { A: 1, B: 2, C: 1 }, degreeSum: 4, oddVertices: ['A', 'C'] }],
    [{ type: 'degree_sequence', sequence: [2, 3, 4, 3], simple: true }, { exists: false }],
    [{ type: 'degree_sequence', sequence: [2, 3, 4, 3], simple: false }, { exists: true }],
    [{ type: 'path', from: 'A', to: 'C' }, { exists: true, walk: { vertices: ['A', 'B', 'C'], edgeIds: ['e1', 'e2'] } }],
    [{ type: 'connectivity' }, { connected: true, components: [['A', 'B', 'C']] }],
    [{ type: 'euler', want: 'path', start: 'C' }, { exists: true, kind: 'path', walk: { vertices: ['C', 'B', 'A'] } }],
    [{ type: 'hamilton', want: 'path', end: 'A' }, { exists: true, kind: 'path', walk: { vertices: ['C', 'B', 'A'] } }],
    [{ type: 'hamilton', want: 'cycle' }, { exists: false, reason: 'cycle_rules' }],
    [{ type: 'shortest_path', from: 'A', to: 'C' }, { exists: true, length: 5 }],
    [{ type: 'tsp', method: 'both', start: 'A' }, { optimal: { exists: false, reason: 'no_tour' }, nearestNeighbor: [{ start: 'A', answer: { exists: false, reason: 'no_return' } }] }],
    [{ type: 'postman', start: 'B' }, { exists: true, length: 10, baseLength: 5, duplicateLength: 5 }],
    [{ type: 'statements', items: [{ id: 'a', text: 'Có 3 đỉnh', check: { type: 'vertex_count', value: 3 } }, { id: 'b', text: 'Có 4 cạnh', check: { type: 'edge_count', value: 4 } }] }, { a: true, b: false }],
  ];
  it.each(cases)('dispatches $0.type and supplies a solution with notes', (task, expected) => {
    const spec = problem(task);
    freezeGraph(spec.graph);
    const before = JSON.stringify(spec);
    const result = solve(spec);
    expect(result.answer).toMatchObject(expected as Record<string, unknown>);
    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.steps.map(({ index }) => index)).toEqual(result.steps.map((_, i) => i + 1));
    expect(result.steps.every(({ text }) => text.length > 0)).toBe(true);
    expect(result.notes.length).toBeGreaterThan(0);
    expect(solve(spec)).toEqual(result);
    expect(JSON.stringify(spec)).toBe(before);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it('preserves algorithm trace fields while exposing the common Solution API', () => {
    expect(solve(problem({ type: 'shortest_path', from: 'A', to: 'C' }))).toMatchObject({ trace: [
      { selected: 'A', tied: ['A'] }, { selected: 'B', tied: ['B'] }, { selected: 'C', tied: ['C'] },
    ] });
  });

  it('accepts all question formats without inferring options from free text', () => {
    for (const questionFormat of ['tu_luan', 'trac_nghiem', 'dung_sai', 'tra_loi_ngan'] as const) {
      const spec = { ...problem({ type: 'statements', items: [{ id: 'A', text: 'Văn bản không quyết định kết quả', check: { type: 'vertex_count', value: 0 } }] }), questionFormat };
      expect(solve(spec).answer).toEqual({ A: false });
    }
  });

  it('validates before dispatch and returns all validation errors in Vietnamese', () => {
    expect(() => solve(null as unknown as ProblemSpec)).toThrow('Đề bài không hợp lệ:');
    expect(() => solve(problem({ type: 'path', from: 'missing', to: 'C' }))).toThrow('task.from: Đỉnh không có trong đồ thị.');
    expect(() => solve({ ...problem(), graph: graph(Array.from({ length: 21 }, (_, i) => String(i))) })).toThrow('tối đa 20 đỉnh');
    expect(() => solve(problem({ type: 'statements', items: [{ id: 's', text: 'Nhãn', check: { type: 'dijkstra_label', v: 'A', value: 0 } }] }))).toThrow('phải chỉ rõ đỉnh nguồn');
  });

  it('keeps disconnected and empty-graph conventions across task types', () => {
    const empty = { ...problem(), graph: graph([]) };
    expect(solve(empty).answer).toMatchObject({ vertexCount: 0, edgeCount: 0, simple: true });
    expect(solve({ ...empty, task: { type: 'connectivity' } }).answer).toEqual({ connected: true, components: [] });
    expect(solve({ ...empty, task: { type: 'euler', want: 'circuit' } }).answer).toMatchObject({ exists: true, walk: { vertices: [], edgeIds: [] } });
    expect(solve({ ...empty, task: { type: 'hamilton', want: 'path' } }).answer).toEqual({ exists: false, reason: 'empty_graph' });
    const disconnected = { ...problem({ type: 'shortest_path', from: 'A', to: 'C' }), graph: graph(['A', 'B', 'C'], [{ id: 'ab', u: 'A', v: 'B', w: 1 }]) };
    expect(solve(disconnected).answer).toEqual({ exists: false, reason: 'unreachable' });
  });
});
