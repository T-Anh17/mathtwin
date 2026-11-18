import { describe, expect, it } from 'vitest';
import { parseWork } from '../src/index.js';
import type { WorkVocabulary } from '../src/index.js';
const vocab: WorkVocabulary = { vertexLabels: ['A', 'B', 'C', 'D', 'I'], edgeNames: [], task: 'path', questionFormat: 'tu_luan', statementIds: [], questionText: [] };
const parse = (text: string) => parseWork([{ text, index: 0, page: 0, conf: 1, alternatives: [] }], vocab);
describe('noun and value slots', () => {
  it('uses the same preposition and vertex noun slots for degree topics', () => {
    for (const preposition of ['', 'của ', 'tại ', 'ở ', 'cho ', 'đến ', 'tới '])
      for (const noun of ['', 'đỉnh ', 'điểm ']) for (const v of vocab.vertexLabels) {
        const text = `Nhận xét: Bậc ${preposition}${noun}${v} có giá trị 3`;
        expect(parse(text), text).toMatchObject({steps:[{claim:{type:'degree',v,value:3}}],unchecked:[]});
      }
  });
  it.each([
    ['Em liệt kê tập đỉnh A, B, I', { type: 'vertex_list', vertices: ['A', 'B', 'I'] }],
    ['Em chia các đỉnh thành 2 nhóm liên thông', { type: 'component_count', value: 2 }],
    ['Tổng bậc = 2 × số cạnh = 2 × 3 = 6', { type: 'degree_sum', value: 6 }],
    ['Các đỉnh bậc lẻ = {A, B}', { type: 'odd_vertices', vertices: ['A', 'B'] }],
    ['đường đi = {A → C → D}', { type: 'walk', kind: 'path', vertices: ['A', 'C', 'D'] }],
    ['Em tính được số lượng cạnh bằng 17', { type: 'edge_count', value: 17 }],
    ['Sau khi kiểm tra em ghi 17 là số cạnh', { type: 'edge_count', value: 17 }],
    ['A, B là tập đỉnh', { type: 'vertex_list', vertices: ['A', 'B'] }],
    ['Có 3 đỉnh', { type: 'vertex_count', value: 3 }],
    ['Số cạnh em kiểm tra kỹ rồi ghi nhận được 17', { type: 'edge_count', value: 17 }],
    ['Số đỉnh, em tổng hợp lại được 3', { type: 'vertex_count', value: 3 }],
    ['Đếm các đầu cạnh tại A, em được bậc 3.', { type: 'degree', v: 'A', value: 3 }],
    ['Tại D, sau khi kiểm tra em ghi bậc 7.', { type: 'degree', v: 'D', value: 7 }],
  ])('translates %s literally', (text, expected) => {
    expect(parse(text).steps.map(s => s.claim)).toEqual([expect.objectContaining(expected)]);
    expect(parse(text).unchecked).toEqual([]);
  });
  it.each(['Số cạnh là 3 hoặc 4', 'Số đỉnh và số cạnh = 4', 'Số cạnh chưa biết = 3', 'Số cạnh khoảng 3', 'Số cạnh = ? = 3',
    'Số cạnh ban đầu 3 sau đó 4', '3 là số cạnh em ghi 4',
    'Tại A và B, em ghi bậc 3.', 'Tại A, em ghi bậc 3 và bậc 4.',
  ])('leaves ambiguous values unchecked: %s', text => {
    expect(parse(text)).toMatchObject({ steps: [], unchecked: [0] });
  });
  it('splits independent clauses without splitting lists, expressions or decimal values', () => {
    expect(parse('Số đỉnh = 3, và số cạnh = 4; Tổng bậc = 2 × số cạnh = 8.').steps.map(s => s.claim.type)).toEqual(['vertex_count', 'edge_count', 'degree_sum']);
    expect(parse('A → B, nên độ dài = 2.5').steps.at(-1)?.claim).toMatchObject({ type: 'length', value: 2.5 });
  });
  it('keeps route-search descriptions as prose', () => {
    for (const text of ['Em tìm chu trình đi qua mọi đỉnh.', 'Em thử khép một vòng Hamilton qua tất cả đỉnh.']) expect(parse(text)).toMatchObject({ steps: [], unchecked: [], ignored: [{line:0,reason:'prose'}] });
  });
  it('rejects JSON answer notation', () => {
    expect(parse('Đáp số: {"walk":{"vertices":["A","B"]}}')).toMatchObject({ steps: [], unchecked: [0] });
  });
  it('reads one task-shaped answer despite surrounding verbs, retaining wrong values', () => {
    const answer = (text: string, task: WorkVocabulary['task']) => parseWork([{ text, index: 0, page: 0, conf: 1, alternatives: [] }], { ...vocab, task });
    for (const text of ['Em ghi đáp số sau khi tính được 17', 'Kết luận em tổng hợp lại được 17', '17 là đáp số em ghi lại']) {
      expect(answer(text, 'shortest_path').steps, text).toMatchObject([{ claim: { type: 'final_answer', value: 17 } }]);
      expect(answer(text, 'connectivity').steps).toEqual([]);
    }
    expect(answer('Đáp số em tính 1 + 3 = 2', 'shortest_path').steps).toMatchObject([{ claim: { type: 'final_answer', value: 2 } }]);
    for (const text of ['Đáp số em tính 3 rồi 4', 'Đáp số em ghi 3 hoặc 4']) expect(answer(text, 'shortest_path')).toMatchObject({ steps: [], unchecked: [0] });
    expect(answer('Em ghi đáp số xác nhận không liên thông', 'connectivity').steps).toMatchObject([{ claim: { type: 'final_answer', value: false } }]);
  });
  it('does not count digits embedded in a vertex label as values', () => {
    const result = parseWork([{ text: 'Tại v1, em ghi bậc 3.', index: 0, page: 0, conf: 1, alternatives: [] }], { ...vocab, vertexLabels: ['v1'] });
    expect(result.steps).toMatchObject([{ claim: { type: 'degree', v: 'v1', value: 3 } }]);
  });
});

