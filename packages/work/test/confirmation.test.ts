import { describe, expect, it, vi } from 'vitest';
import type { ProblemSpec } from '@mathtwin/core';
import { applyWorkAnswers, gradeWork, parseWork, vocabularyOf } from '../src/index.js';
import type { WorkLine } from '../src/index.js';

const spec: ProblemSpec = { graph: { directed: false, vertices: ['A', 'B', 'C', 'D'].map((id) => ({ id, label: id })),
  edges: [{ id: 'ac', u: 'A', v: 'C', w: 1 }, { id: 'cb', u: 'C', v: 'B', w: 3 }, { id: 'bd', u: 'B', v: 'D', w: 2 }] },
  task: { type: 'shortest_path', from: 'A', to: 'D' }, questionFormat: 'tu_luan' };
const lines = (texts: string[]): WorkLine[] => texts.map((text, index) => ({ text, index, page: 0, conf: 0.98, alternatives: [] }));
const parse = (source: WorkLine[]) => parseWork(source, vocabularyOf(spec));
const run = (source: WorkLine[]) => gradeWork(spec, parse(source));
const equation = 'n(B) = n(C) + w(CB) = 1 + 3 = 2';

describe('confidence and work confirmation, batch 3.4', () => {
  it('keeps wrong arithmetic and attaches the exact first-error lines and reading check', () => {
    const source = lines(['Khoanh tròn A', 'Khoanh tròn C', equation]);
    source[2]!.box = [10, 20, 500, 80];
    expect(run(source)).toMatchObject({ result: { verdict: 'SAI', firstErrorStep: 3, errorCode: 'SAI_PHEP_TINH', facts: { expected: 4, got: 2 } },
      firstErrorLines: [2], questions: [], readingCheck: { kind: 'reading', lines: [2], page: 0, box: [10, 20, 500, 80], shownText: equation } });
  });
  it('uses the uncertain final digit, offers candidate text, and regrades a user correction', () => {
    const source = lines(['Khoanh tròn A', 'Khoanh tròn C', equation]);
    source[2]!.charConf = [...equation].map((_, i) => i === [...equation].length - 1 ? 0.4 : 0.99);
    source[2]!.alternatives = [equation.replace(/2$/u, '4')];
    expect(parse(source).steps[2]!.claim.conf).toBe(0.4);
    expect(run(source)).toMatchObject({ result: { verdict: 'CAN_XAC_NHAN' }, questions: [{ kind: 'reading', lines: [2], options: [equation, equation.replace(/2$/u, '4')] }] });
    const corrected = applyWorkAnswers(source, [{ line: 2, text: equation.replace(/2$/u, '4') }]);
    expect(run(corrected).result.verdict).toBe('DUNG');
    expect(corrected[2]!.charConf).toBeUndefined(); expect(corrected[2]!.alternatives).toEqual([]);
    expect(source[2]!.text).toBe(equation); expect(source[2]!.charConf!.at(-1)).toBe(0.4);
  });
  it('falls back to line confidence and caps garbage lines below 0.5', () => {
    const source = lines(['deg(A) = 3']); source[0]!.conf = 0.4;
    expect(parse(source).steps[0]!.claim.conf).toBe(0.4);
    source[0]!.charConf = [...source[0]!.text].map((_, i) => i === 0 ? 0.01 : 0.97);
    expect(parse(source).steps[0]!.claim.conf).toBe(0.01);
    source[0]!.charConf = [...source[0]!.text].map(() => 0.99);
    expect(parse(source).steps[0]!.claim.conf).toBe(0.4);
    source[0]!.charConf = [0.99]; expect(parse(source).steps[0]!.claim.conf).toBe(0.4);
  });
  it('includes claim subjects, actions, conclusions, equality and route arrows', () => {
    for (const [text, token] of [['Số cạnh = 3', 'cạnh'], ['Khoanh tròn A', 'Khoanh'], ['deg(A) = 0', 'deg'],
      ['Số cạnh = 3', '='], ['A → C', '→'], ['Vậy độ dài = 6', 'Vậy'], ['Bậc: A = 1, B = 2', 'Bậc']]) {
      const source = lines([text!]);
      const start = text!.indexOf(token!);
      source[0]!.charConf = [...text!].map((_, i) => i === start ? 0.3 : 0.99);
      expect(parse(source).steps.length, text).toBeGreaterThan(0);
      expect(parse(source).steps.every((step) => step.claim.conf === 0.3), text).toBe(true);
    }
    const padding = lines(['Em ghi: deg(A) = 1']); padding[0]!.charConf = [...padding[0]!.text].map((_, i) => i === 0 ? 0.1 : 0.99);
    expect(parse(padding).steps[0]!.claim.conf).toBe(0.99);
    const fuzzy = lines(['Khoah tròn A']); fuzzy[0]!.charConf = [...fuzzy[0]!.text].map(() => 0.99);
    expect(parse(fuzzy).steps[0]!.claim.conf).toBe(0.84);
  });
  it('asks about uncertain unknown prose and empty readings, excluding questions and strikes', () => {
    const source = lines(['Số cạnh = 3', 'chữ nhòe', '   ', 'Đề mờ', 'Dòng gạch']);
    source.slice(1).forEach((line) => { line.conf = 0.3; });
    source[3]!.region = 'question'; source[4]!.struck = true;
    expect(parse(source)).toMatchObject({ unchecked: [1, 2], ignored: [{ line: 3, reason: 'question' }, { line: 4, reason: 'struck' }] });
    expect(run(source)).toMatchObject({ result: { verdict: 'CAN_XAC_NHAN' }, questions: [{ kind: 'reading', lines: [1] }, { kind: 'reading', lines: [2] }] });
    const chars = lines(['mô tả chắc']); chars[0]!.charConf = [...chars[0]!.text].map((_, i) => i === 2 ? 0.2 : 0.99);
    expect(parse(chars).unchecked).toEqual([0]);
    expect(parseWork(chars, vocabularyOf(spec), { confThreshold: 0.1 }).ignored).toEqual([{ line: 0, reason: 'prose' }]);
  });
  it('confirms accepted uncertain steps before accepting the final verdict', () => {
    const source = lines(['Khoanh tròn A', 'Khoanh tròn C', 'n(B) = 4']); source[0]!.conf = 0.4;
    expect(run(source)).toMatchObject({ result: { verdict: 'CAN_XAC_NHAN' }, questions: [{ kind: 'reading', lines: [0] }] });
    expect(run(applyWorkAnswers(source, [{ line: 0, text: source[0]!.text }])).result.verdict).toBe('DUNG');
  });
  it('includes negation, indexed vertex labels, statements and choice characters', () => {
    const cases: [string, ProblemSpec, string][] = [
      ['Không liên thông', spec, 'Không'],
      ['deg(v₁) = 3', { ...spec, graph: { ...spec.graph, vertices: [{ id: 'internal', label: 'v1' }] } }, '₁'],
      ['a) Đ', { ...spec, questionFormat: 'dung_sai' as const }, 'Đ'],
      ['Chọn B', { ...spec, questionFormat: 'trac_nghiem' as const }, 'B'],
    ];
    for (const [text, problem, token] of cases) {
      const source = lines([text]); const chars = [...text]; const start = chars.join('').indexOf(token);
      source[0]!.charConf = chars.map((_, i) => i >= start && i < start + [...token].length ? 0.3 : 0.99);
      const vocab = { ...vocabularyOf(problem), statementIds: ['a', 'B'] };
      expect(parseWork(source, vocab).steps[0]?.claim.conf, text).toBe(0.3);
    }
  });
  it('selects the first vocabulary-valid reading, never the one that grades correctly', () => {
    const source = lines(['A → E → D']); source[0]!.alternatives = ['A → B → D', 'A → C → D'];
    const parsed = parse(source);
    expect(parsed.steps[0]).toMatchObject({ claim: { vertices: ['A', 'B', 'D'], conf: 0.84 }, candidates: [
      { type: 'walk', vertices: ['A', 'B', 'D'] }, { type: 'walk', vertices: ['A', 'C', 'D'] }] });
    const numbers = lines(['Số cạnh = 99']); numbers[0]!.alternatives = ['Số cạnh = 3', 'Số cạnh = 4'];
    const step = parse(numbers).steps[0]!;
    expect(step.claim).toMatchObject({ value: 99, conf: 0.98 });
    expect(step.candidates).toEqual([99, 3, 4].map((value) => ({ type: 'edge_count', value })));
    expect(parseWork(numbers, vocabularyOf({ ...spec, graph: { ...spec.graph, edges: [] } })).steps).toEqual(parse(numbers).steps);
  });
  it('applies alternatives in tables using only syntax and known labels', () => {
    const source = lines(['Chọn A B C D', 'A 0 (4, Q) (1, A) ∞', 'C - (4, C) (1, A) ∞', 'B - (4, C) - (6, B)', 'D - - - (6, B)']);
    source.forEach((line) => { line.region = 'table'; });
    source[1]!.alternatives = ['A 0 (4, A) (1, A) ∞'];
    const parsed = parse(source);
    expect(parsed.unchecked).toEqual([]);
    expect(parsed.steps.find((s) => s.lines.includes(1))!.claim.conf).toBeLessThan(0.85);
  });
  it('isolates confidence of separate clauses, table cells and selection marks', () => {
    const source = lines(['Số cạnh = 3; Số đỉnh = 4']);
    source[0]!.charConf = [...source[0]!.text].map((c) => c === '4' ? 0.2 : 0.99);
    expect(parse(source).steps.map((step) => step.claim.conf)).toEqual([0.99, 0.2]);
    const table = lines(['A B C D', '0* (4,A) (1,A) ∞', '- (4,C) (1,C*) ∞', '- (4,B*) - (6,B)', '- - - (6,D*)']);
    table.forEach((line) => { line.region = 'table'; line.charConf = [...line.text].map((c) => c === '4' ? 0.3 : 0.99); });
    const parsed = parse(table);
    expect(parsed.unchecked).toEqual([]);
    expect(parsed.steps.slice(0, 3).map((step) => step.claim.conf)).toEqual([0.99, 0.3, 0.99]);
    table[1]!.charConf![1] = 0.25;
    expect(parse(table).steps[0]!.claim.conf).toBe(0.25);
  });
  it('raises correct work with unchecked lines and supports explicitly skipping a line', () => {
    const source = lines(['Số cạnh = 3', 'x = 3 + ?']);
    expect(run(source)).toMatchObject({ result: { verdict: 'CAN_XAC_NHAN' }, questions: [{ kind: 'unparsed', lines: [1], shownText: 'x = 3 + ?' }] });
    expect(run(applyWorkAnswers(source, [{ line: 1, skip: true }])).result.verdict).toBe('DUNG');
    expect(run(lines(['x = ?'])).questions).toMatchObject([{ kind: 'unparsed', lines: [0] }]);
  });
  it('asks for a table header when its OCR confidence contributes to the failing claim', () => {
    const source = lines(['A B C D', 'A 0 99 1 ∞', 'C - 99 1 ∞', 'B - 99 - 101', 'D - - - 101']);
    source.forEach((line) => { line.region = 'table'; });
    source[0]!.charConf = [...source[0]!.text].map((c) => c === 'B' ? 0.4 : 0.99);
    const first = run(source);
    expect(first).toMatchObject({ result: { verdict: 'CAN_XAC_NHAN' }, questions: [{ lines: [0, 1], shownText: 'A B C D\nA 0 99 1 ∞' }] });
    const confirmed = applyWorkAnswers(source, first.questions[0]!.lines.map((line) => ({ line, text: source[line]!.text })));
    expect(run(confirmed).result.verdict).toBe('SAI');
  });
  it('asks only unchecked lines preceding the first error and preserves SAI for later unchecked lines', () => {
    expect(run(lines(['x = ?', 'Số cạnh = 99', 'y = ?']))).toMatchObject({ result: { verdict: 'CAN_XAC_NHAN' }, questions: [{ kind: 'unparsed', lines: [0] }], firstErrorLines: [1] });
    const after = run(lines(['Số cạnh = 99', 'x = ?']));
    expect(after).toMatchObject({ result: { verdict: 'SAI' }, questions: [], readingCheck: { lines: [0] } });
  });
  it('uses page/index ordering, supports custom thresholds and reports empty work', () => {
    const source = lines(['x = ?', 'Số cạnh = 99']); source[0]!.page = 2; source[1]!.page = 1;
    expect(run(source).result.verdict).toBe('SAI');
    const alternative = lines(['A → X → D']); alternative[0]!.alternatives = ['A → B → D'];
    expect(parseWork(alternative, vocabularyOf(spec), { confThreshold: 0.7 }).steps[0]!.claim.conf).toBe(0.69);
    expect(run([])).toMatchObject({ result: { verdict: 'KHONG_DU_CAN_CU' }, questions: [] });
  });
  it('keeps filtering copied questions and struck lines ahead of alternative selection', () => {
    const source = lines(['Số cạnh = 99', 'Số cạnh = 99']); source[0]!.struck = true;
    source.forEach((line) => { line.alternatives = ['Số cạnh = 3']; });
    const parsed = parseWork(source, { ...vocabularyOf(spec), questionText: ['Số cạnh = 99'] });
    expect(parsed.steps).toEqual([]); expect(parsed.unchecked).toEqual([]);
  });
  it('keeps answer operations pure, NFC-normalized and runnable without Node globals', () => {
    const source = lines(['Số cạnh = 99']);
    vi.stubGlobal('process', undefined); vi.stubGlobal('Buffer', undefined);
    try {
      const struck = applyWorkAnswers(source, [{ line: 0, struck: true }]);
      expect(parse(struck).steps).toEqual([]);
      const corrected = applyWorkAnswers(struck, [{ line: 0, struck: false }, { line: 0, text: 'Số cạnh = 3' }]);
      expect(corrected[0]!.text).toBe('Số cạnh = 3');
      expect(run(applyWorkAnswers(source, [{ line: 0, text: 'Số cạnh = 3' }])).result.verdict).toBe('DUNG');
    } finally { vi.unstubAllGlobals(); }
    expect(source[0]!.text).toBe('Số cạnh = 99');
  });
});
