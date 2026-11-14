import { describe, expect, it } from 'vitest';
import type { Claim, ClaimBody, ProblemSpec, Task } from '../src/index.js';
import { grade, solve } from '../src/index.js';
import { graph, problem } from './fixtures.js';
import { weighted } from './weighted-fixtures.js';
import { freezeGraph } from './traversal-fixtures.js';

const c = (body: ClaimBody, step = 1): Claim => ({ ...body, step, raw: 'Bài làm' });
const p = (task: Task = { type: 'elements' }): ProblemSpec => problem(task);

describe('grade independent claims', () => {
  const cases: [ClaimBody, ClaimBody, string][] = [
    [{ type: 'vertex_count', value: 3 }, { type: 'vertex_count', value: 4 }, 'SAI_PHEP_TINH'],
    [{ type: 'edge_count', value: 2 }, { type: 'edge_count', value: 1 }, 'SAI_PHEP_TINH'],
    [{ type: 'degree', v: 'B', value: 2 }, { type: 'degree', v: 'B', value: 1 }, 'SAI_PHEP_TINH'],
    [{ type: 'degree_sum', value: 4 }, { type: 'degree_sum', value: 2 }, 'SAI_PHEP_TINH'],
    [{ type: 'odd_vertices', vertices: ['C', 'A'] }, { type: 'odd_vertices', vertices: ['A'] }, 'BO_SOT'],
    [{ type: 'connected', value: true }, { type: 'connected', value: false }, 'KET_LUAN_KHONG_SUY_RA'],
    [{ type: 'euler_exists', kind: 'path', value: true }, { type: 'euler_exists', kind: 'circuit', value: true }, 'SAI_DIEU_KIEN'],
    [{ type: 'hamilton_exists', kind: 'path', value: true }, { type: 'hamilton_exists', kind: 'cycle', value: true }, 'SAI_DIEU_KIEN'],
    [{ type: 'theorem', name: 'dirac', holds: false }, { type: 'theorem', name: 'dirac', holds: true }, 'SAI_DIEU_KIEN'],
    [{ type: 'length', vertices: ['A', 'B', 'C'], value: 5 }, { type: 'length', vertices: ['A', 'B', 'C'], value: 4 }, 'SAI_PHEP_TINH'],
    [{ type: 'shortest_length', from: 'A', to: 'C', value: 5 }, { type: 'shortest_length', from: 'A', to: 'C', value: 2 }, 'SAI_PHEP_TINH'],
    [{ type: 'postman_duplicate', vertices: ['C', 'B', 'A'] }, { type: 'postman_duplicate', vertices: ['B', 'A'] }, 'SAI_DIEU_KIEN'],
  ];
  it.each(cases)('checks $0.type and classifies an incorrect claim', (correct, wrong, errorCode) => {
    expect(grade(p(), [c(correct)]).verdict).toBe('DUNG');
    expect(grade(p(), [c(wrong, 7)])).toMatchObject({ verdict: 'SAI', firstErrorStep: 7, errorCode });
  });
  it('rejects invalid Hamilton reasoning even when the existence conclusion is correct', () => {
    const spec: ProblemSpec = { ...p({ type: 'hamilton', want: 'cycle' }), graph: weighted(['A', 'B', 'C', 'D', 'E'], [['A', 'B', 1], ['B', 'C', 1], ['C', 'D', 1], ['D', 'E', 1], ['E', 'A', 1]]) };
    const wrong = c({ type: 'hamilton_exists', kind: 'cycle', value: false, reason: 'dirac' }, 2);
    expect(grade(spec, [wrong, c({ type: 'final_answer', value: true }, 3)])).toMatchObject({ verdict: 'SAI', firstErrorStep: 2, errorCode: 'SAI_DIEU_KIEN' });
    expect(grade(spec, [c({ type: 'hamilton_exists', kind: 'cycle', value: true, reason: 'dirac' })])).toMatchObject({ verdict: 'SAI', errorCode: 'SAI_DIEU_KIEN' });
  });
  it('counts loops twice and parallel edges separately', () => {
    const spec = { ...p(), graph: graph(['A', 'B'], [{ id: 'loop', u: 'A', v: 'A' }, { id: 'a', u: 'A', v: 'B' }, { id: 'b', u: 'A', v: 'B' }]) };
    expect(grade(spec, [c({ type: 'degree', v: 'A', value: 4 }), c({ type: 'edge_count', value: 3 }, 2)]).verdict).toBe('DUNG');
  });
  it('does not throw on a nonexistent student vertex', () => {
    expect(grade(p(), [c({ type: 'degree', v: 'X', value: 4 })])).toMatchObject({ verdict: 'SAI', errorCode: 'CANH_KHONG_TON_TAI' });
  });
});

describe('grade ordering, confidence and evidence', () => {
  it('sorts steps, retains location, and never replaces the first failure', () => {
    const result = grade(p(), [c({ type: 'degree_sum', value: 0 }, 9), { ...c({ type: 'edge_count', value: 5 }, 3), box: [1, 2, 3, 4] }, c({ type: 'vertex_count', value: 3 }, 1)]);
    expect(result).toMatchObject({ verdict: 'SAI', firstErrorStep: 3, errorCode: 'SAI_PHEP_TINH', facts: { expected: 2, got: 5, box: [1, 2, 3, 4] } });
    expect(result.notes.some((note) => note.includes('Bước 9'))).toBe(true);
  });
  it.each([0, 0.84])('asks confirmation for an incorrect claim at confidence %s', (conf) => {
    expect(grade(p(), [{ ...c({ type: 'edge_count', value: 0 }, 4), conf }])).toMatchObject({ verdict: 'CAN_XAC_NHAN', firstErrorStep: 4, needsConfirmation: [{ step: 4, item: 'claim.edge_count' }] });
  });
  it.each([0.85, 1, undefined])('grades incorrect confident claims at confidence %s', (conf) => {
    expect(grade(p(), [{ ...c({ type: 'edge_count', value: 0 }), ...(conf === undefined ? {} : { conf }) }]).verdict).toBe('SAI');
  });
  it('accepts correct claims even at low confidence and supports an explicit threshold', () => {
    expect(grade(p(), [{ ...c({ type: 'edge_count', value: 2 }), conf: 0 }]).verdict).toBe('DUNG');
    expect(grade(p(), [{ ...c({ type: 'edge_count', value: 0 }), conf: 0.9 }], { confThreshold: 0.95 }).verdict).toBe('CAN_XAC_NHAN');
  });
  it.each([-0.1, 1.1, NaN, Infinity])('rejects invalid threshold %s', (confThreshold) => {
    expect(() => grade(p(), [], { confThreshold })).toThrow(RangeError);
  });
  it('only applies OCR uncertainty to data used by the failed claim', () => {
    const spec = { ...p(), uncertain: [{ item: 'e1.w', candidates: [2, 3] }] };
    expect(grade(spec, [c({ type: 'length', vertices: ['A', 'B'], value: 3 })])).toMatchObject({ verdict: 'CAN_XAC_NHAN', needsConfirmation: [{ step: 1, item: 'e1.w' }] });
    expect(grade(spec, [c({ type: 'degree', v: 'A', value: 3 })]).verdict).toBe('SAI');
    expect(grade(spec, [c({ type: 'length', vertices: ['B', 'C'], value: 4 })]).verdict).toBe('SAI');
    expect(grade({ ...p(), uncertain: [{ item: 'graph.edges[1].w', candidates: [3, 4] }] }, [c({ type: 'length', vertices: ['B', 'C'], value: 4 })]).verdict).toBe('CAN_XAC_NHAN');
  });
  it('keeps confirmation at the first uncertain failure despite later certain failures', () => {
    const result = grade(p(), [{ ...c({ type: 'edge_count', value: 0 }, 2), conf: 0.2 }, c({ type: 'degree_sum', value: 0 }, 3)]);
    expect(result).toMatchObject({ verdict: 'CAN_XAC_NHAN', firstErrorStep: 2 });
    expect(result).not.toHaveProperty('errorCode');
  });
  it('reports no usable evidence and explains skipped claims', () => {
    expect(grade(p(), []).verdict).toBe('KHONG_DU_CAN_CU');
    const result = grade(p(), [c({ type: 'choice', option: 'A' }), c({ type: 'final_answer', value: 'văn bản tự do' }, 2)]);
    expect(result.verdict).toBe('KHONG_DU_CAN_CU');
    expect(result.notes.length).toBeGreaterThan(2);
  });
  it('validates the problem and is deterministic, JSON-safe and nonmutating', () => {
    expect(() => grade(null as unknown as ProblemSpec, [])).toThrow(RangeError);
    const spec = p();
    const claims = [c({ type: 'degree', v: 'A', value: 0 }, 2), c({ type: 'vertex_count', value: 3 })];
    freezeGraph(spec.graph);
    Object.freeze(claims[0]); Object.freeze(claims[1]); Object.freeze(claims);
    const before = JSON.stringify({ spec, claims });
    const result = grade(spec, claims);
    expect(grade(spec, claims)).toEqual(result);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(JSON.stringify({ spec, claims })).toBe(before);
  });
});

describe('statement and choice grading', () => {
  const spec: ProblemSpec = { ...p(), task: { type: 'statements', items: [
    { id: '__proto__', text: 'Có ba đỉnh', check: { type: 'vertex_count', value: 3 } },
    { id: 'B', text: 'Có ba cạnh', check: { type: 'edge_count', value: 3 } },
  ] } };
  it.each<ClaimBody>([{ type: 'statement', id: '__proto__', value: true }, { type: 'statement', id: 'B', value: false }, { type: 'choice', option: '__proto__' }])('checks $type using the option ID', (body) => {
    expect(grade(spec, [c(body)]).verdict).toBe('DUNG');
  });
  it('rejects a false option and skips unknown option IDs', () => {
    expect(grade(spec, [c({ type: 'choice', option: 'B' })]).verdict).toBe('SAI');
    expect(grade(spec, [c({ type: 'choice', option: 'X' })]).verdict).toBe('KHONG_DU_CAN_CU');
  });
  it.each([true, false])('skips a null statement claimed as %s, adds a note, and requires evidence', (value) => {
    const ambiguous: ProblemSpec = { ...p(), graph: weighted(['A', 'B'], [['A', 'B', 1], ['A', 'B', 2]]), task: { type: 'statements', items: [
      { id: 'a', text: 'Độ dài', check: { type: 'length', vertices: ['A', 'B'], value: 1 } },
      { id: 'b', text: 'Số cạnh', check: { type: 'edge_count', value: 2 } },
    ] } };
    const unknown = c({ type: 'statement', id: 'a', value }, 3);
    expect(solve(ambiguous).answer).toEqual({ a: null, b: true });
    const only = grade(ambiguous, [unknown]);
    expect(only.verdict).toBe('KHONG_DU_CAN_CU');
    expect(only.notes.some((note) => note.includes('Bỏ qua bước 3') && note.includes('chưa đủ dữ kiện'))).toBe(true);
    expect(grade(ambiguous, [unknown, c({ type: 'statement', id: 'b', value: true }, 4)]).verdict).toBe('DUNG');
    expect(grade(ambiguous, [unknown, c({ type: 'statement', id: 'b', value: false }, 4)])).toMatchObject({ verdict: 'SAI', firstErrorStep: 4 });
    expect(grade(ambiguous, [c({ type: 'choice', option: 'a' })]).verdict).toBe('KHONG_DU_CAN_CU');
  });
});
