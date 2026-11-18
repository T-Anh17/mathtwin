import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { grade, solve } from '@mathtwin/core';
import type { Claim, ProblemSpec } from '@mathtwin/core';
import type { Session } from '../src/flow/types.js';
import { createSession, sessionReducer as reduce } from '../src/flow/sessionReducer.js';
import { errorMarks, graphHighlight, resultView } from '../src/flow/view.js';
import { ResultScreen } from '../src/ResultScreen.js';
import { WorkFlowScreen } from '../src/WorkFlowScreen.js';
import { WorkQuestionScreen } from '../src/WorkScreen.js';
import { emptyProductActions } from '../src/sample-data.js';
import { resultVi as m, tutorText } from '../src/result.vi.js';
import { productVi } from '../src/product-messages.vi.js';

const root = new URL('../../../testdata/core/', import.meta.url);
const fixtures = readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => {
  const spec = JSON.parse(readFileSync(new URL(`${e.name}/spec.json`, root), 'utf8')) as ProblemSpec;
  const claims = JSON.parse(readFileSync(new URL(`${e.name}/claims.json`, root), 'utf8')) as Claim[];
  return { name: e.name, spec, claims, result: grade(spec, claims) };
});
const noop = () => {};
const numbers = (value: unknown) => JSON.stringify(value).match(/-?\d+(?:\.\d+)?/g) ?? [];
const spec: ProblemSpec = { graph: { directed: false, vertices: [{ id: 'internalA', label: 'A' }, { id: 'internalB', label: 'B' }],
  edges: [{ id: 'internalEdge', u: 'internalA', v: 'internalB', name: 'a', w: 7 }] }, task: { type: 'elements' }, questionFormat: 'tu_luan' };
const fresh = () => reduce(createSession('result', '2026-11-18T00:00:00Z'), { type: 'manual_spec', spec });
function session(f: typeof fixtures[number]): Session {
  const indices = f.claims.filter((c) => c.step === f.result.firstErrorStep).map((c) => c.step);
  return { ...createSession('fixture', '2026-11-18T00:00:00Z'), stage: 'result', spec: f.spec, specConfirmed: true,
    solution: solve(f.spec), workSource: 'photo', workLines: f.claims.map((c) => ({ text: c.raw, index: c.step, page: c.step % 2,
      conf: 1, alternatives: [], box: [20, 100, 900, 200] })),
    workGrade: { result: f.result, questions: [], firstErrorLines: indices } };
}

describe('4.5 resultView on unchanged core fixtures', () => {
  it('covers every error code with real core evidence', () => {
    expect(fixtures).toHaveLength(60);
    expect(new Set(fixtures.flatMap((f) => f.result.errorCode ? [f.result.errorCode] : []))).toEqual(new Set(Object.keys(m.errors)));
  });
  for (const f of fixtures.filter((f) => f.result.verdict === 'SAI')) it(f.name, () => {
    const s = session(f), before = structuredClone(s), data = resultView(s);
    expect(data.verdict).toBe('sai');
    if (data.verdict !== 'sai') throw new Error('wrong result missing');
    expect(data.firstErrorStep).toBe(f.result.firstErrorStep); expect(data.errorCode).toBe(f.result.errorCode);
    for (const text of [data.message, data.errorType, data.reason, ...(data.correction ? [data.correction] : []), data.nextStep, data.previousSteps]) {
      expect(text.trim().length).toBeGreaterThan(0); expect(text).not.toMatch(/undefined|\[object Object\]/);
      expect(text).not.toMatch(/\b(?:vertices|edgeIds|vertexCount|edgeCount|displayExpected|displayGot)\b/);
      const allowed = new Set(numbers({ facts: f.result.facts, solution: s.solution }));
      for (const number of numbers(text)) expect(allowed.has(number), `${f.name}: ${number} in ${text}`).toBe(true);
    }
    expect(data.errorMarks).toHaveLength(1); expect(data.errorMarks[0]?.page).toBe(f.result.firstErrorStep! % 2);
    expect(data.graphHighlight).toBeDefined(); expect(s).toEqual(before);
    const html = renderToStaticMarkup(createElement(ResultScreen, { state: 'du-lieu', data, actions: emptyProductActions, onBack: noop }));
    expect(html).toContain(m.solution); expect(html.includes(m.correction)).toBe(!!data.correction);
  });
});

describe('4.5 session gates, questions, insufficient evidence and display references', () => {
  it('hides photo crops and reading checks for manual work, including persisted photo metadata', () => {
    const s = reduce(fresh(), { type: 'manual_work', lines: ['Đồ thị có 3 đỉnh.'] });
    const check = { kind: 'reading' as const, lines: [0], page: 0, box: [20, 100, 900, 200] as [number, number, number, number],
      shownText: 'Đồ thị có 3 đỉnh.', options: [] };
    const data = resultView({ ...s, workGrade: { ...s.workGrade!, readingCheck: check } });
    expect(data.verdict).toBe('sai');
    if (data.verdict !== 'sai') throw new Error('wrong result missing');
    expect(data.errorMarks).toEqual([]); expect(data.readingCheck).toBeUndefined();
    const html = renderToStaticMarkup(createElement(ResultScreen, { state: 'du-lieu',
      data: { ...data, errorMarks: [{ page: 0, box: check.box }], readingCheck: check }, actions: emptyProductActions, onBack: noop }));
    expect(html).not.toContain(productVi.work.noImage); expect(html).not.toContain('work-crop');
    expect(html).not.toContain('Máy đọc dòng này');
    expect(html).not.toContain(productVi.work.yes); expect(html).not.toContain(productVi.work.edit);
  });
  it('quotes photo reading text, truncates only the title, and preserves the full crop', () => {
    const s = reduce(fresh(), { type: 'manual_work', lines: ['Đồ thị có 3 đỉnh.'] });
    for (const shownText of ['Đồ thị có 3 đỉnh.', 'Đây là dòng bài làm rất dài. '.repeat(20)]) {
      const check = { kind: 'reading' as const, lines: [0], page: 0, box: [20, 100, 900, 200] as [number, number, number, number], shownText, options: [] };
      const data = resultView({ ...s, workSource: 'photo', workGrade: { ...s.workGrade!, readingCheck: check } });
      if (data.verdict !== 'sai') throw new Error('wrong result missing');
      const html = renderToStaticMarkup(createElement(ResultScreen, { state: 'du-lieu', data, actions: emptyProductActions, onBack: noop,
        pages: [{ image: 'data:image/png;base64,AA==', width: 1000, height: 1000 }] }));
      expect(html).toContain(m.readingCheck(shownText));
      expect(html).not.toContain('là … —'); expect(html).toContain(productVi.work.yes); expect(html).toContain(productVi.work.edit);
      expect(html).toContain('viewBox="5 88 910 124"');
      if (shownText.length > 160) { expect(m.readingCheck(shownText)).toContain('…”'); expect(html).not.toContain(shownText); }
    }
  });
  it('shows only the expected correction, formats known structures, and omits unknown objects', () => {
    const base = { verdict: 'SAI' as const, errorCode: 'SAI_PHEP_TINH' as const, message: 'Phép tính trong bài chưa đúng.', notes: [] };
    const cases = [
      [5, 'Tại bước này, kết quả hợp lệ là 5.'],
      [{ vertices: ['A', 'B', 'C'], edgeIds: ['a', 'b'] }, 'Tại bước này, kết quả hợp lệ là A → B → C (qua các cạnh: a, b).'],
      [{ edgeIds: ['a', 'b'] }, 'Tại bước này, kết quả hợp lệ là a, b.'],
      [{ vertices: ['A', 'B', 'C'] }, 'Tại bước này, kết quả hợp lệ là A → B → C.'],
      [{ unknown: 5, vertices: ['A'] }, undefined],
      [undefined, undefined],
    ] as const;
    for (const [displayExpected, expected] of cases) {
      const text = tutorText({ ...base, facts: { displayExpected } }, 'elements');
      expect(text.correction).toBe(expected);
      expect(text.correction).not.toBe(base.message);
      expect(text.correction ?? '').not.toMatch(/vertices|edgeIds|unknown/);
    }
  });
  it('withholds photo correctness before review_ack, edits regrade, manual work is immediate', () => {
    let s = reduce(fresh(), { type: 'work_photos', photos: [{ id: 'photo', page: 0, width: 100, height: 100 }] });
    s = reduce(s, { type: 'work_read', lines: [{ index: 0, page: 0, text: 'Đồ thị có 2 đỉnh.', conf: 1, alternatives: [], struck: false }], ms: 0 });
    expect(resultView(s).verdict).toBe('can_xac_nhan');
    const html = renderToStaticMarkup(createElement(WorkFlowScreen, { session: s, busy: false, onBack: noop, onEvent: noop }));
    expect(html).not.toContain('>ĐÚNG<'); expect(html).toContain('Đúng như bài em viết');
    s = reduce(s, { type: 'review_ack' }); expect(resultView(s).verdict).toBe('dung');
    expect(renderToStaticMarkup(createElement(WorkFlowScreen, { session: s, busy: false, onBack: noop, onEvent: noop }))).toContain('>ĐÚNG<');
    s = reduce(s, { type: 'work_answer', answer: { line: 0, text: 'Đồ thị có 3 đỉnh.' } });
    expect(resultView(s).verdict).toBe('sai'); expect(s.reviewAcknowledged).toBe(false);
    s = reduce(s, { type: 'work_answer', answer: { line: 0, text: 'Đồ thị có 2 đỉnh.' } });
    expect(resultView(s).verdict).toBe('can_xac_nhan');
    const manual = reduce(fresh(), { type: 'manual_work', lines: ['Đồ thị có 2 đỉnh.'] });
    expect(manual.reviewAcknowledged).toBe(false); expect(resultView(manual).verdict).toBe('dung');
    // Defense at the mapping boundary, including old/persisted raw grades.
    expect(resultView({ ...manual, workSource: 'photo' }).verdict).toBe('can_xac_nhan');
    expect(resultView({ ...manual, specConfirmed: false }).verdict).toBe('can_xac_nhan');
    const data = resultView(manual); expect(data.notes).toEqual(expect.arrayContaining(manual.solution!.notes));
  });
  it('questions take priority over definitive grades and point to the remaining question', () => {
    const s = reduce(fresh(), { type: 'manual_work', lines: ['Đồ thị có 2 đỉnh.'] });
    const q = { kind: 'reading' as const, lines: [0], page: 0, shownText: 'internalA', options: ['internalB'] };
    const data = resultView({ ...s, workGrade: { ...s.workGrade!, questions: [q] } });
    expect(data.verdict).toBe('can_xac_nhan');
    if (data.verdict !== 'can_xac_nhan') throw new Error('question missing');
    expect(data.question?.shownText).toBe('A'); expect(data.question?.options).toEqual(['B']);
    expect(renderToStaticMarkup(createElement(ResultScreen, { state: 'du-lieu', data, actions: emptyProductActions, onBack: noop }))).toContain(m.question);
    expect(renderToStaticMarkup(createElement(WorkQuestionScreen, { question: data.question!, lines: s.workLines, pages: [], onAnswer: noop, onBack: noop }))).toContain('<textarea');
  });
  it('shows missing evidence and all recovery actions, without inventing a length', () => {
    const s = reduce(fresh(), { type: 'manual_work', lines: [] }), data = resultView(s);
    expect(data.verdict).toBe('khong_du_can_cu');
    if (data.verdict !== 'khong_du_can_cu') throw new Error('issues missing');
    expect(data.issues.length).toBeGreaterThan(0);
    const html = renderToStaticMarkup(createElement(ResultScreen, { state: 'loi', data, actions: emptyProductActions, onBack: noop }));
    for (const text of [m.retake, m.addPage, m.manual]) expect(html).toContain(text);
    expect(html).not.toContain('>ĐÚNG<');
  });
  it('maps all error lines across pages, ignoring absent/invalid boxes, and owns returned data', () => {
    const f = fixtures.find((f) => f.result.verdict === 'SAI')!, s = session(f);
    s.workLines = [0, 1, 2, 3].map((index) => ({ index, page: index % 2, text: '', conf: 1, alternatives: [],
      ...(index === 2 ? {} : { box: (index === 3 ? [9, 9, 1, 1] : [10, 20, 30, 40]) as [number, number, number, number] }) }));
    s.workGrade!.firstErrorLines = [0, 1, 2, 3];
    expect(errorMarks(s)).toEqual([{ page: 0, box: [10, 20, 30, 40] }, { page: 1, box: [10, 20, 30, 40] }]);
    const marks = errorMarks(s); marks[0]!.box[0] = 999; expect(s.workLines[0]?.box?.[0]).toBe(10);
  });
  it('highlights actual related objects and displays names instead of internal ids, including numeric ids', () => {
    const input: ProblemSpec = { ...spec, task: { type: 'degree' } };
    const s = reduce(reduce(createSession('ids', ''), { type: 'manual_spec', spec: input }), { type: 'manual_work', lines: ['Bậc của A bằng 8.'] });
    const data = resultView(s); expect(data.verdict).toBe('sai');
    if (data.verdict !== 'sai') throw new Error('wrong degree missing');
    expect(data.graphHighlight.vertices).toContain('internalA'); expect(data.graphHighlight.edges).toEqual(['internalEdge']);
    expect([data.message, data.reason, data.correction].join(' ')).not.toMatch(/internal/);
    const f = fixtures.find((f) => f.result.errorCode === 'SAI_PHEP_TINH' && f.result.facts?.claimType === 'dijkstra_label')!;
    const highlight = graphHighlight(f.spec, solve(f.spec), { result: f.result, questions: [] });
    expect(highlight.edges!.length).toBeGreaterThan(0);
    // Numeric vertex IDs must map by reference without replacing arithmetic digits.
    const numericSpec = { ...input, graph: { ...input.graph, vertices: [{ id: '721', label: 'A' }, { id: '722', label: 'B' }], edges: [{ id: '723', u: '721', v: '722', w: 7 }] } };
    const result = grade(numericSpec, [{ type: 'degree', step: 1, raw: '', v: '721', value: 8 }]);
    const numeric = resultView({ ...s, spec: numericSpec, solution: solve(numericSpec), workGrade: { result, questions: [] } });
    expect(numeric.message).toContain('A'); expect(numeric.message).not.toMatch(/721|722|723/);
    expect(numeric.message).toContain('8');
  });
  it('replaces opaque statement IDs with the question text', () => {
    const input: ProblemSpec = { ...spec, task: { type: 'statements', items: [{ id: 'opaqueStatement', text: 'A có bậc một.',
      check: { type: 'degree', v: 'internalA', value: 1 } }] } };
    const result = grade(input, [{ type: 'statement', step: 1, raw: '', id: 'opaqueStatement', value: false }]);
    const s: Session = { ...fresh(), spec: input, solution: solve(input), workSource: 'manual', workGrade: { result, questions: [] } };
    const data = resultView(s);
    expect(data.verdict).toBe('sai'); expect(data.message).not.toContain('opaqueStatement'); expect(data.message).toContain('A có bậc một.');
  });
});
