import { describe, expect, it } from 'vitest';
import type { Claim, ClaimBody, ErrorCode, GradeResult, ProblemSpec } from '../src/index.js';
import { grade } from '../src/index.js';
import { problem } from './fixtures.js';
import { weighted } from './weighted-fixtures.js';

const claims = (...bodies: ClaimBody[]): Claim[] => bodies.map((body, i) => ({ ...body, step: i + 1, raw: 'Bài làm' }));
const spec41: ProblemSpec = { ...problem({ type: 'shortest_path', from: 'A', to: 'E' }),
  graph: weighted(['A', 'B', 'C', 'D', 'E'], [['A', 'B', 3], ['A', 'C', 1], ['C', 'B', 3], ['B', 'D', 2], ['C', 'E', 9]]) };
const prefix41: ClaimBody[] = [
  { type: 'dijkstra_label', v: 'A', value: 0 }, { type: 'dijkstra_select', v: 'A' },
  { type: 'dijkstra_label', v: 'B', value: 3, via: 'A' }, { type: 'dijkstra_label', v: 'C', value: 1, via: 'A' },
  { type: 'dijkstra_select', v: 'C' },
];

function numbers(value: unknown): string[] {
  if (typeof value === 'number') return [String(value)];
  if (typeof value === 'string') return value.match(/-?\d+(?:\.\d+)?/g) ?? [];
  if (Array.isArray(value)) return value.flatMap(numbers);
  if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(numbers);
  return [];
}
function expectSourcedNumbers(result: GradeResult): void {
  const values = numbers(result.facts);
  for (const number of numbers(result.message)) expect(values, `Message number ${number}: ${result.message}`).toContain(number);
}

describe('review point 2: exact specification 4.1 label arithmetic', () => {
  it.each([true, false])('reports addition error before predecessor checking (via supplied: %s)', (via) => {
    const result = grade(spec41, claims(...prefix41, { type: 'dijkstra_label', v: 'B', value: 2, ...(via ? { via: 'C' } : {}) }));
    expect(result).toMatchObject({ verdict: 'SAI', firstErrorStep: 6, errorCode: 'SAI_PHEP_TINH', facts: { edge: 'C-B', nC: 1, nVia: 1, w: 3, expected: 4, got: 2, old: 3 } });
    expect(result.message).toContain('n(C) + w(C–B) = 1 + 3 = 4, nhưng bài ghi 2');
    expectSourcedNumbers(result);
  });
  it('reports failure to take the minimum and recovers the correct label', () => {
    const result = grade(spec41, claims(...prefix41, { type: 'dijkstra_label', v: 'B', value: 4, via: 'C' }, { type: 'dijkstra_label', v: 'E', value: 10 }, { type: 'dijkstra_select', v: 'B' }));
    expect(result).toMatchObject({ verdict: 'SAI', firstErrorStep: 6, errorCode: 'SAI_PHEP_TINH', facts: { expected: 3, candidate: 4, old: 3, got: 4 } });
    expect(result.message).toContain('4 > 3 nên giữ nhãn 3 của B, bài ghi 4');
    expect(result.notes.some((note) => note.startsWith('Bước 8'))).toBe(false);
    expectSourcedNumbers(result);
  });
  it('only flags an invalid predecessor after the number is correct', () => {
    expect(grade(spec41, claims(...prefix41, { type: 'dijkstra_label', v: 'B', value: 3, via: 'C' }))).toMatchObject({ errorCode: 'KET_LUAN_KHONG_SUY_RA', facts: { expected: 3, got: 3 } });
  });
});

describe('review point 3: replay only consequential uncertainty', () => {
  const wrongB = claims({ type: 'dijkstra_select', v: 'A' }, { type: 'dijkstra_label', v: 'B', value: 4, via: 'A' });
  it('does not ask about uncertain C–E when B = 4 is wrong under every candidate', () => {
    const result = grade({ ...spec41, uncertain: [{ item: 'e5.w', candidates: [9, 1] }] }, wrongB);
    expect(result).toMatchObject({ verdict: 'SAI', firstErrorStep: 2, errorCode: 'SAI_PHEP_TINH' });
    expect(result).not.toHaveProperty('needsConfirmation');
  });
  it('asks only about A–B when its candidate makes the current label valid', () => {
    const spec = { ...spec41, uncertain: [{ item: 'e5.w', candidates: [9, 1] }, { item: 'e1.w', candidates: [3, 4] }] };
    const before = JSON.stringify(spec);
    const result = grade(spec, wrongB);
    expect(result).toMatchObject({ verdict: 'CAN_XAC_NHAN', needsConfirmation: [{ step: 2, item: 'e1.w' }] });
    expect(result.message).toContain('trọng số cạnh A–B đọc được là 3 hoặc 4');
    expect(result.message).not.toMatch(/e1\.w|claim\.|e5\.w/);
    expect(JSON.stringify(spec)).toBe(before);
    expectSourcedNumbers(result);
  });
  it.each(['e1.w', 'edges[0].w', 'graph.edges[0].w'])('accepts replaceable weight path %s', (item) => {
    expect(grade({ ...spec41, uncertain: [{ item, candidates: [3, 4] }] }, wrongB).verdict).toBe('CAN_XAC_NHAN');
  });
  it.each(['e2.u', 'edges[1].u', 'graph.edges[1].u'])('replays endpoint changes for %s', (item) => {
    expect(grade({ ...problem(), uncertain: [{ item, candidates: ['B', 'A'] }] }, claims({ type: 'degree', v: 'A', value: 2 })).verdict).toBe('CAN_XAC_NHAN');
  });
  it('skips invalid candidates and retains conservative unknown graph descriptions', () => {
    expect(grade({ ...spec41, uncertain: [{ item: 'e1.w', candidates: [0, -1, null, '4'] }] }, wrongB).verdict).toBe('SAI');
    expect(grade({ ...spec41, uncertain: [{ item: 'graph', candidates: [] }] }, wrongB).verdict).toBe('CAN_XAC_NHAN');
  });
  it('replays prior choices as well as the failing NN step', () => {
    const spec: ProblemSpec = { ...problem({ type: 'tsp', start: 'A', method: 'nearest_neighbor' }), graph: weighted(['A', 'B', 'C', 'D'], [['A', 'B', 1], ['A', 'C', 5], ['B', 'C', 2], ['B', 'D', 3], ['C', 'D', 4], ['A', 'D', 8]]) };
    const steps = claims({ type: 'nn_step', from: 'A', to: 'B' }, { type: 'nn_step', from: 'B', to: 'D' });
    expect(grade({ ...spec, uncertain: [{ item: 'e6.w', candidates: [8, 9] }] }, steps).verdict).toBe('SAI');
    expect(grade({ ...spec, uncertain: [{ item: 'e4.w', candidates: [3, 1] }] }, steps)).toMatchObject({ verdict: 'CAN_XAC_NHAN', needsConfirmation: [{ step: 2, item: 'e4.w' }] });
  });
});

describe('review point 1: specific, student-facing messages for all error codes', () => {
  const cycle: ProblemSpec = { ...problem({ type: 'hamilton', want: 'cycle' }), graph: weighted(['A', 'B', 'C', 'D', 'E'], [['A', 'B', 1], ['B', 'C', 1], ['C', 'D', 1], ['D', 'E', 1], ['E', 'A', 1]]) };
  const confusion: ProblemSpec = { ...problem({ type: 'shortest_path', from: 'A', to: 'D' }), graph: weighted(['A', 'B', 'C', 'D'], [['A', 'B', 1], ['A', 'C', 3], ['B', 'D', 3], ['C', 'D', 1]]) };
  const cases: { code: ErrorCode; spec: ProblemSpec; steps: Claim[]; fragments: string[] }[] = [
    { code: 'SAI_PHEP_TINH', spec: spec41, steps: claims(...prefix41, { type: 'dijkstra_label', v: 'B', value: 2, via: 'C' }), fragments: ['n(C)', '1 + 3 = 4', 'bài ghi 2'] },
    { code: 'SAI_DIEU_KIEN', spec: cycle, steps: claims({ type: 'hamilton_exists', kind: 'cycle', value: false, reason: 'dirac' }), fragments: ['Dirac', 'n = 5', 'bậc 2', 'chỉ là điều kiện đủ', 'A–B–C–D–E–A'] },
    { code: 'BO_SOT', spec: problem(), steps: claims({ type: 'odd_vertices', vertices: ['A'] }), fragments: ['thiếu đỉnh bậc lẻ C (bậc 1)', 'liệt kê'] },
    { code: 'CANH_KHONG_TON_TAI', spec: problem(), steps: claims({ type: 'walk', kind: 'path', vertices: ['A', 'C'] }), fragments: ['cạnh A–C', 'vị trí 2', 'sửa'] },
    { code: 'LAP', spec: problem(), steps: claims({ type: 'walk', kind: 'euler_path', vertices: ['A', 'B', 'A'] }), fragments: ['cạnh B–A', 'vị trí 3', 'không lặp'] },
    { code: 'NHAM_THUAT_TOAN', spec: confusion, steps: claims(...['A', 'B', 'D', 'C'].map((v): ClaimBody => ({ type: 'dijkstra_select', v }))), fragments: ['Prim', 'chọn cạnh nhỏ nhất', 'Dijkstra', 'C (nhãn 3)'] },
    { code: 'SAI_LUA_CHON', spec: spec41, steps: claims({ type: 'dijkstra_select', v: 'A' }, { type: 'dijkstra_select', v: 'B' }), fragments: ['B có nhãn 3', 'C (nhãn 1)', 'Phải khoanh C'] },
    { code: 'KET_LUAN_KHONG_SUY_RA', spec: problem({ type: 'shortest_path', from: 'A', to: 'C' }), steps: claims({ type: 'final_answer', value: 6 }), fragments: ['đáp số đúng là 5, bài ghi 6', 'sửa kết luận'] },
    { code: 'HIEU_SAI_DE', spec: problem({ type: 'euler', want: 'circuit' }), steps: claims({ type: 'walk', kind: 'euler_path', vertices: ['A', 'B', 'C'] }), fragments: ['kết thúc tại C', 'vị trí 3', 'quay về A'] },
  ];
  it.each(cases)('explains $code with facts and a correction', ({ code, spec, steps, fragments }) => {
    const result = grade(spec, steps);
    expect(result).toMatchObject({ verdict: 'SAI', errorCode: code });
    fragments.forEach((fragment) => expect(result.message).toContain(fragment));
    expect(result.message).not.toContain('dữ liệu chấm');
    expectSourcedNumbers(result);
  });
  it('uses labels and named edges in place of internal IDs', () => {
    const spec: ProblemSpec = { ...spec41, graph: {
      directed: false, vertices: [{ id: 'node-a', label: 'A' }, { id: 'node-b', label: 'B' }, { id: 'node-c', label: 'C' }],
      edges: [{ id: 'private-ab', u: 'node-a', v: 'node-b', w: 3 }, { id: 'private-ac', u: 'node-a', v: 'node-c', w: 1 }, { id: 'private-cb', name: 'm', u: 'node-c', v: 'node-b', w: 3 }],
    }, task: { type: 'shortest_path', from: 'node-a', to: 'node-b' } };
    const result = grade(spec, claims({ type: 'dijkstra_select', v: 'node-a' }, { type: 'dijkstra_select', v: 'node-c' }, { type: 'dijkstra_label', v: 'node-b', value: 2, via: 'node-c' }));
    expect(result.message).toContain('tại B, n(C) + w(m) = 1 + 3 = 4');
    expect(result.message).not.toMatch(/node-|private-/);
    expectSourcedNumbers(result);
  });
  it('explains a low-confidence claim without a protocol path', () => {
    const steps = claims({ type: 'dijkstra_select', v: 'A' }, { type: 'dijkstra_label', v: 'B', value: 4, via: 'A' });
    steps[1]!.conf = 0.2;
    const result = grade(spec41, steps);
    expect(result.message).toContain('nhãn tại B đọc được là 4 chưa chắc chắn');
    expect(result.message).not.toContain('claim.');
    expectSourcedNumbers(result);
  });
  it('explains inconsistent walk data with counts rather than edgeIds', () => {
    const result = grade(problem(), claims({ type: 'walk', kind: 'path', vertices: ['A', 'B', 'C'], edgeIds: ['e1'] }));
    expect(result.message).toContain('dãy có 3 đỉnh, cần 2 cạnh nhưng đã đọc 1 cạnh');
    expect(result.message).not.toContain('edgeIds');
    expectSourcedNumbers(result);
  });
  it('lists missing walk elements and repeated Hamilton vertices', () => {
    const missingEdge = grade(problem(), claims({ type: 'walk', kind: 'euler_path', vertices: ['A', 'B'] }));
    const missingVertex = grade(problem(), claims({ type: 'walk', kind: 'hamilton_path', vertices: ['A', 'B'] }));
    expect(missingEdge.message).toContain('thiếu cạnh B–C khi kết thúc dãy ở vị trí 2');
    expect(missingVertex.message).toContain('thiếu đỉnh C khi kết thúc dãy ở vị trí 2');
    expectSourcedNumbers(missingEdge);
    expectSourcedNumbers(missingVertex);
    const repeated = grade(problem(), claims({ type: 'walk', kind: 'hamilton_path', vertices: ['A', 'B', 'A'] }));
    expect(repeated.message).toContain('đỉnh A đã xuất hiện trước đó tại vị trí 3');
    expectSourcedNumbers(repeated);
  });
  it('explains theorem claims with their actual threshold and violating vertices', () => {
    const result = grade(cycle, claims({ type: 'theorem', name: 'dirac', holds: true }));
    expect(result.message).toContain('ngưỡng là 2.5');
    expect(result.message).toContain('A có bậc 2');
    expectSourcedNumbers(result);
  });
  it('names an absent via-edge correctly even when another relaxation edge exists', () => {
    const spec: ProblemSpec = { ...problem({ type: 'shortest_path', from: 'A', to: 'D' }), graph: weighted(['A', 'B', 'C', 'D'], [['A', 'B', 1], ['A', 'C', 1], ['B', 'D', 3], ['C', 'D', 3]]) };
    const result = grade(spec, claims({ type: 'dijkstra_select', v: 'A' }, { type: 'dijkstra_label', v: 'B', value: 1, via: 'C' }));
    expect(result.message).toContain('không có cạnh C–B');
    expect(result.message).not.toContain('không có cạnh A–B');
    expectSourcedNumbers(result);
  });
  it('reports the actual odd degree instead of a generic missing-vertex warning', () => {
    const spec = { ...problem(), graph: weighted(['A', 'B', 'C', 'D'], [['A', 'C', 1], ['B', 'C', 1], ['D', 'C', 1]]) };
    const result = grade(spec, claims({ type: 'odd_vertices', vertices: ['A', 'B', 'D'] }));
    expect(result.message).toContain('thiếu đỉnh bậc lẻ C (bậc 3)');
    expectSourcedNumbers(result);
  });
  it('explains tied legal Dijkstra choices with all labels', () => {
    const spec: ProblemSpec = { ...problem({ type: 'shortest_path', from: 'A', to: 'D' }), graph: weighted(['A', 'B', 'C', 'D'], [['A', 'B', 1], ['A', 'C', 1], ['A', 'D', 5]]) };
    const result = grade(spec, claims({ type: 'dijkstra_select', v: 'A' }, { type: 'dijkstra_select', v: 'D' }));
    expect(result.message).toContain('B (nhãn 1), C (nhãn 1)');
    expect(result.message).toContain('đồng hạng B, C');
    expectSourcedNumbers(result);
  });
  it('uses concrete route data when an uncertain walk has no scalar got value', () => {
    const steps = claims({ type: 'walk', kind: 'path', vertices: ['A', 'C'] });
    steps[0]!.conf = 0.1;
    const result = grade(problem(), steps);
    expect(result.message).toContain('dãy đi đọc được là A, C chưa chắc chắn');
    expectSourcedNumbers(result);
  });
});

describe('review point 4: prescribed NN start', () => {
  it('reports wrong first departure as misunderstanding with clear expected/got', () => {
    const result = grade(problem({ type: 'tsp', start: 'A', method: 'nearest_neighbor' }), claims({ type: 'nn_step', from: 'B', to: 'A' }));
    expect(result).toMatchObject({ verdict: 'SAI', errorCode: 'HIEU_SAI_DE', facts: { expected: 'A', got: 'B' } });
    expect(result.message).toContain('đề yêu cầu xuất phát từ A, bài xuất phát từ B');
    expectSourcedNumbers(result);
  });
});

describe('review round 2: missing-element facts only describe omissions', () => {
  it('does not label an open Euler trail as missing vertices or edges', () => {
    const spec: ProblemSpec = { ...problem({ type: 'euler', want: 'circuit' }),
      graph: weighted(['A', 'B', 'C', 'D'], [['D', 'C', 1], ['C', 'A', 1], ['A', 'B', 1], ['B', 'C', 1]]) };
    const result = grade(spec, claims({ type: 'walk', kind: 'euler_path', vertices: ['D', 'C', 'A', 'B', 'C'] }));
    expect(result).toMatchObject({ verdict: 'SAI', errorCode: 'HIEU_SAI_DE', facts: { reason: 'not_closed' } });
    expect(result.facts).not.toHaveProperty('missingVertices');
    expect(result.facts).not.toHaveProperty('missingEdges');
  });
  it('does not label an open TSP tour as missing vertices or edges', () => {
    const spec: ProblemSpec = { ...problem({ type: 'tsp', start: 'A', method: 'optimal' }),
      graph: weighted(['A', 'B', 'C', 'D'], [['A', 'B', 1], ['B', 'C', 1], ['C', 'D', 1], ['D', 'A', 1]]) };
    const result = grade(spec, claims({ type: 'walk', kind: 'tsp_tour', vertices: ['A', 'B', 'C', 'D'] }));
    expect(result).toMatchObject({ verdict: 'SAI', errorCode: 'HIEU_SAI_DE', facts: { reason: 'not_closed' } });
    expect(result.facts).not.toHaveProperty('missingVertices');
    expect(result.facts).not.toHaveProperty('missingEdges');
  });
  it('keeps the actual missing edge for an incomplete Euler circuit', () => {
    const spec: ProblemSpec = { ...problem({ type: 'euler', want: 'circuit' }),
      graph: weighted(['A', 'B'], [['A', 'B', 1], ['A', 'B', 1], ['A', 'A', 1]]) };
    const result = grade(spec, claims({ type: 'walk', kind: 'euler_circuit', vertices: ['A', 'B', 'A'], edgeIds: ['e1', 'e2'] }));
    expect(result).toMatchObject({ verdict: 'SAI', errorCode: 'BO_SOT', facts: { reason: 'missing_edges', missingEdges: ['A–A'] } });
    expect(result.facts).not.toHaveProperty('missingVertices');
  });
});
