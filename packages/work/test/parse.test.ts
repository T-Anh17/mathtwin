import { describe, expect, it, vi } from 'vitest';
import { grade } from '@mathtwin/core';
import type { ClaimBody, ProblemSpec } from '@mathtwin/core';
import { parseWork } from '../src/index.js';
import type { WorkLine, WorkVocabulary } from '../src/index.js';
import { editDistance, language, symbols } from '../src/parse/text.js';
const vocab: WorkVocabulary = { vertexLabels: ['A', 'B', 'C', 'D'], edgeNames: [], task: 'path', questionFormat: 'tu_luan', statementIds: ['a', 'b', 'c', 'd'], questionText: [] };
const lines = (texts: string[]): WorkLine[] => texts.map((text, index) => ({ text, index, page: 0, conf: 0.95, alternatives: [] }));
function bodies(texts: string[], vocabulary = vocab): ClaimBody[] {
  return parseWork(lines(texts), vocabulary).steps.map(({ claim }) => {
    const { step: _step, raw: _raw, conf: _conf, box: _box, ...body } = claim;
    return body;
  });
}
describe('prose work parser, batch 3.2', () => {
  it.each([
    ['Đồ thị có 5 đỉnh', { type: 'vertex_count', value: 5 }],
    ['Số cạnh: 6', { type: 'edge_count', value: 6 }],
    ['|E| = 6', { type: 'edge_count', value: 6 }],
    ['Số cạnh = 12 : 2 = 6', { type: 'edge_count', value: 6 }],
    ['Số khuyên là 1', { type: 'loop_count', value: 1 }],
    ['có 1 khuyên', { type: 'loop_count', value: 1 }],
    ['Em đếm được 2 đỉnh bậc lẻ', { type: 'odd_count', value: 2 }],
    ['Có 2 thành phần liên thông', { type: 'component_count', value: 2 }],
    ['Tổng bậc = 2 × 6 = 12', { type: 'degree_sum', value: 12 }],
    ['deg(A) = 3', { type: 'degree', v: 'A', value: 3 }],
    ['d(A) = 3', { type: 'degree', v: 'A', value: 3 }],
    ['bậc của A là 3', { type: 'degree', v: 'A', value: 3 }],
    ['A có bậc 3', { type: 'degree', v: 'A', value: 3 }],
    ['Các đỉnh là A, B, C, D', { type: 'vertex_list', vertices: ['A', 'B', 'C', 'D'] }],
    ['V = {A, B, C}', { type: 'vertex_list', vertices: ['A', 'B', 'C'] }],
    ['Các cạnh: AB, AC, BD', { type: 'edge_list', edges: [{ u: 'A', v: 'B' }, { u: 'A', v: 'C' }, { u: 'B', v: 'D' }] }],
    ['Các cạnh: (A, B), (A, C)', { type: 'edge_list', edges: [{ u: 'A', v: 'B' }, { u: 'A', v: 'C' }] }],
    ['Các đỉnh bậc lẻ: B, D', { type: 'odd_vertices', vertices: ['B', 'D'] }],
    ['không có đỉnh bậc lẻ', { type: 'odd_vertices', vertices: [] }],
    ['Đồ thị liên thông', { type: 'connected', value: true }],
    ['không liên thông', { type: 'connected', value: false }],
    ['Có chu trình Euler', { type: 'euler_exists', kind: 'circuit', value: true }],
    ['không có đường đi Euler', { type: 'euler_exists', kind: 'path', value: false }],
    ['vẽ được bằng một nét', { type: 'euler_exists', kind: 'path', value: true }],
    ['Theo Dirac đồ thị có chu trình Hamilton', { type: 'hamilton_exists', kind: 'cycle', value: true, reason: 'dirac' }],
    ['Không thỏa Dirac', { type: 'theorem', name: 'dirac', holds: false }],
    ['A có bậc 1 nên không có chu trình Hamilton', { type: 'degree', v: 'A', value: 1 }],
    ['d(A, D) = 4', { type: 'shortest_length', from: 'A', to: 'D', value: 4 }],
    ['Đường đi ngắn nhất từ A đến D dài 4', { type: 'shortest_length', from: 'A', to: 'D', value: 4 }],
  ] satisfies [string, ClaimBody][])('understands %s literally', (text, expected) => {
    expect(bodies([text])).toContainEqual(expected);
  });
  it('emits all explicit claims in source order, with no implied connected claim', () => {
    expect(bodies(['Có 2 thành phần liên thông'])).toEqual([{ type: 'component_count', value: 2 }]);
    expect(bodies(['Bậc: A = 3, B = 2'])).toEqual([{ type: 'degree', v: 'A', value: 3 }, { type: 'degree', v: 'B', value: 2 }]);
    expect(bodies(['Đồ thị có 3 đỉnh; Số cạnh = 2.'])).toEqual([{ type: 'vertex_count', value: 3 }, { type: 'edge_count', value: 2 }]);
  });
  it('handles walk notations, explicit titles and same-page wrapping', () => {
    for (const text of ['A → B → D', 'A -> B -> D', 'A - B - D', 'ABD', 'A ⟶ B ⟶ D']) expect(bodies([text])).toEqual([{ type: 'walk', kind: 'path', vertices: ['A', 'B', 'D'] }]);
    expect(bodies(['chu trình Hamilton:', 'ABDA'])).toEqual([{ type: 'walk', kind: 'hamilton_cycle', vertices: ['A', 'B', 'D', 'A'] }]);
    const source = lines(['A → B →', 'C → A']); source[0]!.box = [10, 20, 200, 40]; source[1]!.box = [20, 50, 250, 80]; source[1]!.conf = 0.8;
    expect(parseWork(source, vocab).steps[0]).toMatchObject({ lines: [0, 1], page: 0, box: [10, 20, 250, 80], claim: { step: 1, raw: 'A → B →\nC → A', conf: 0.8, box: [10, 20, 250, 80] } });
    source[1]!.page = 1; expect(parseWork(source, vocab).steps[0]).toMatchObject({ lines: [0, 1], page: 0, claim: { vertices: ['A', 'B', 'C', 'A'] } }); expect(parseWork(source, vocab).steps[0]!.box).toEqual([10, 20, 200, 40]);
  });
  it('preserves wrong arithmetic and binds length to the preceding walk', () => {
    const parsed = parseWork(lines(['A → B → C → D → A', 'Độ dài = 1 + 2 + 4 + 9 = 17']), { ...vocab, task: 'tsp' });
    expect(parsed.steps[1]!.claim).toMatchObject({ type: 'length', vertices: ['A', 'B', 'C', 'D', 'A'], value: 17 });
    const spec: ProblemSpec = { graph: { directed: false, vertices: vocab.vertexLabels.map((id) => ({ id, label: id })), edges: [['A', 'B', 1], ['B', 'C', 2], ['C', 'D', 4], ['D', 'A', 9]].map(([u, v, w], i) => ({ id: String(i), u: String(u), v: String(v), w: Number(w) })) }, task: { type: 'tsp', method: 'optimal' }, questionFormat: 'tu_luan' };
    expect(grade(spec, parsed.steps.map((s) => s.claim))).toMatchObject({ verdict: 'SAI', errorCode: 'SAI_PHEP_TINH', firstErrorStep: 2 });
    expect(parseWork(lines(['Độ dài = 4']), vocab)).toMatchObject({ steps: [], unchecked: [0], issues: [expect.objectContaining({ code: 'unparsed_line' })] });
  });
  it('filters question, figure, empty and struck lines before parsing', () => {
    const source = lines(['a) Đồ thị có 3 đỉnh.', 'a) Đ b) S c) Đ d) S', 'Độ dài đường đi = 6.', 'A → B', 'Đường đi có độ dài 4.', 'Số cạnh = 99', 'A = 5', '']);
    source[2]!.struck = true; source[5]!.region = 'question'; source[6]!.region = 'figure';
    const parsed = parseWork(source, { ...vocab, questionFormat: 'dung_sai' });
    expect(parsed.steps.map((s) => s.claim.type)).toEqual(['statement', 'statement', 'statement', 'statement', 'walk', 'length']);
    expect(parsed.steps.at(-1)!.claim).toMatchObject({ value: 4 });
    expect(parsed.ignored).toEqual([{ line: 0, reason: 'question' }, { line: 2, reason: 'struck' }, { line: 5, reason: 'question' }, { line: 6, reason: 'figure' }, { line: 7, reason: 'empty' }]);
    expect(parsed.issues).toContainEqual(expect.objectContaining({ code: 'figure_annotations', severity: 'warning' }));
    expect(parseWork(lines(['Do thi co 5 dinh va 6 canh.']), { ...vocab, questionText: ['Đồ thị có 5 đỉnh và 6 cạnh?'] }).ignored).toContainEqual({ line: 0, reason: 'question' });
  });
  it('distinguishes harmless descriptions from unchecked grading content', () => {
    const source = lines(['Cập nhật nhãn D qua cạnh BD.', 'Em đi lần lượt qua cạnh AA rồi AB.', 'Ghép cặp: (A, B); (C, D).', 'x = 3 + ?', 'Vậy chưa rõ', 'Số cạnh = ?']);
    expect(parseWork(source, vocab)).toMatchObject({ steps: [], unchecked: [3, 4, 5], ignored: [{ line: 0, reason: 'prose' }, { line: 1, reason: 'prose' }, { line: 2, reason: 'prose' }] });
    expect(parseWork(lines(['Cập nhật nhãn v1 qua cạnh AB.']), { ...vocab, vertexLabels: ['A', 'B', 'v1'] }).unchecked).toEqual([]);
  });
  it('selects a vocabulary-valid alternative and rejects unrelated algorithm actions', () => {
    const source = lines(['A → E → D']); source[0]!.alternatives = ['A → B → D'];
    expect(parseWork(source, vocab)).toMatchObject({ steps: [{ claim: { type: 'walk', vertices: ['A', 'B', 'D'], conf: 0.84 } }], unchecked: [] });
    for (const text of ['Gán nhãn A = 0, các đỉnh khác ∞', 'Khoanh tròn C', 'n(B) = n(C) + w(CB) = 1 + 3 = 2', 'Từ A đi đến B (gần nhất)', 'A → B vì AB = 1 nhỏ nhất', 'Lặp lại đường B → C → D']) expect(bodies([text], { ...vocab, task: 'path' })).toEqual([]);
    const table = lines(['Chọn A B C D', 'A 0 1 3 4']); table.forEach((l) => { l.region = 'table'; });
    expect(parseWork(table, vocab)).toMatchObject({ steps: [], unchecked: [0, 1] });
  });
  it('normalizes indexed labels, rejects ambiguous compact segmentation and keeps counts exact', () => {
    expect(bodies(['v₁ → V2', 'V1 → v₂'], { ...vocab, vertexLabels: ['v1', 'v2'] })).toEqual(Array(2).fill({ type: 'walk', kind: 'path', vertices: ['v1', 'v2'] }));
    expect(parseWork(lines(['AB']), { ...vocab, vertexLabels: ['A', 'B', 'AB'] })).toMatchObject({ steps: [], unchecked: [0], issues: expect.arrayContaining([expect.objectContaining({ code: 'ambiguous_line' })]) });
    expect(bodies(['Số cạnh = 12 : 2 = 7'])).toEqual([{ type: 'edge_count', value: 7 }]);
    expect(bodies(['Do thi co 5 dinhh'])).toEqual([{ type: 'vertex_count', value: 5 }]);
    expect(language('Đườnh đi', [])).toBe('duong di');
    expect(symbols('v₁ ⟶ v₂ = +∞ × 2')).toBe('v1 → v2 = ∞ × 2');
    expect(editDistance('canh', 'cah')).toBe(1);
  });
  it('parses task-shaped final answers and multiple-choice notation without synthesis', () => {
    for (const text of ['Chọn B', 'Đáp án B', 'B.']) expect(bodies([text], { ...vocab, questionFormat: 'trac_nghiem' })).toEqual([{ type: 'choice', option: 'B' }]);
    expect(bodies(['Đáp số: 4'], { ...vocab, task: 'shortest_path' })).toEqual([{ type: 'final_answer', value: 4 }]);
    expect(bodies(['KL: true'], { ...vocab, task: 'connectivity' })).toEqual([{ type: 'final_answer', value: true }]);
    expect(bodies(['Đáp số: đường đi = {A → B}'])).toEqual([{ type: 'final_answer', value: { walk: { vertices: ['A', 'B'] } } }]);
    expect(parseWork(lines(['Đáp số: {"walk":{"vertices":["A","E"]}}']), vocab).unchecked).toEqual([0]);
  });
  it('does not invent edge identifiers and recognizes unlabeled tables as unsupported', () => {
    expect(bodies(['Đường đi: A → B → C. Các cạnh theo thứ tự: e9.'])).toEqual([{ type: 'walk', kind: 'path', vertices: ['A', 'B', 'C'] }]);
    expect(parseWork(lines(['Chọn A B C D', 'A 0 1 3 4', 'B - 1 2 4']), vocab)).toMatchObject({ steps: [], unchecked: [0, 1, 2] });
    expect(bodies(['A có bậc 1 nên không có chu trình Hamilton'])).toEqual([{ type: 'degree', v: 'A', value: 1 }, { type: 'hamilton_exists', kind: 'cycle', value: false, reason: 'degree1' }]);
    expect(bodies(['Vậy có chu trình Euler'], { ...vocab, task: 'euler' })).toEqual([{ type: 'final_answer', value: true }]);
    expect(bodies(['Vậy kết quả là đường đi = {A → B}'])).toEqual([{ type: 'final_answer', value: { walk: { vertices: ['A', 'B'] } } }]);
    expect(symbols('2 x 3; 2 . 3; 2 * 3')).toBe('2 × 3; 2 × 3; 2 × 3');
  });
  it('is deterministic, pure and runs with no Node globals', () => {
    const source = lines(['Các đỉnh: A, B', 'A → B']); const before = structuredClone(source);
    vi.stubGlobal('process', undefined); vi.stubGlobal('Buffer', undefined);
    try { expect(parseWork(source, vocab)).toEqual(parseWork(source, vocab)); }
    finally { vi.unstubAllGlobals(); }
    expect(source).toEqual(before);
    expect(parseWork([], vocab)).toMatchObject({ steps: [], issues: [{ code: 'no_solution_lines', severity: 'blocking' }] });
  });
  it('keeps incomplete arithmetic and naked algorithm assignments unchecked', () => {
    for (const text of ['Số cạnh = không rõ 3', 'deg(A) = ? = 3', 'A = 0', 'Đ', 'S']) {
      expect(parseWork(lines([text]), vocab)).toMatchObject({ steps: [], unchecked: [0] });
    }
    expect(bodies(['Số cạnh = −2'])).toEqual([{ type: 'edge_count', value: -2 }]);
    expect(bodies(['Bậc: v1 = 3, v2 = 2'], { ...vocab, vertexLabels: ['v1', 'v2'] })).toEqual([
      { type: 'degree', v: 'v1', value: 3 }, { type: 'degree', v: 'v2', value: 2 },
    ]);
  });
  it('does not swallow an independent claim after a truncated walk', () => {
    for (const next of ['Số cạnh = 3', 'Đồ thị có 3 cạnh']) {
      const parsed = parseWork(lines(['A → B →', next]), vocab);
      expect(parsed.unchecked).toEqual([0]);
      expect(parsed.steps).toMatchObject([{ lines: [1], claim: { type: 'edge_count', value: 3 } }]);
    }
  });
  it('does not turn the descriptive verb dùng into a truth judgment', () => {
    const parsed = parseWork(lines(['Dùng thuật toán láng giềng gần nhất.', 'Hai cạnh AB và BC cùng nhận B làm đầu mút.', 'Đúng.', 'Sai.']), vocab);
    expect(parsed.ignored).toEqual([{ line: 0, reason: 'prose' }, { line: 1, reason: 'prose' }]);
    expect(parsed.unchecked).toEqual([2, 3]);
  });
});
