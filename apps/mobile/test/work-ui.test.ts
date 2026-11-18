import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WorkScreen, WorkQuestionScreen } from '../src/WorkScreen.js';
import { WorkCrop } from '../src/WorkCrop.js';
import { WorkResultScreen } from '../src/ResultScreen.js';
import { sampleWorkLines, sampleWorkPages, sampleWorkSpec as spec } from '../src/work-sample.js';
import { reviewWork, textAnswers } from '../src/work-session.js';
import { normalizedWorkLines, readWorkSpecs } from '../src/work-benchmark.js';
import { productVi as m } from '../src/product-messages.vi.js';
import type { WorkQuestion } from '@mathtwin/work';

const noop = () => {};
const resultHtml = (lines = sampleWorkLines) => renderToStaticMarkup(createElement(WorkResultScreen, {
  review: reviewWork(spec, lines), pages: sampleWorkPages, onBack: noop, onQuestion: noop,
}));

describe('Lô 3.7 · pure work review and product screens', () => {
  it('renders understood steps, unknown and struck lines with separate styles', () => {
    const html = renderToStaticMarkup(createElement(WorkScreen, { spec, initialLines: sampleWorkLines, pages: sampleWorkPages, onBack: noop }));
    expect(html).toContain(m.work.title); expect(html).toContain(m.work.sampleNote);
    expect(html).toContain('Bước 1'); expect(html).toContain('work-unknown'); expect(html).toContain('work-struck');
  });
  it('reparses and regrades immediately: confirm reading, skip unknown, then edit a wrong line', () => {
    const before = structuredClone(sampleWorkLines);
    const initial = reviewWork(spec, sampleWorkLines);
    expect(initial.grade.result.verdict).toBe('CAN_XAC_NHAN');
    expect(initial.grade.questions[0]?.lines).toContain(1);
    const corrected = reviewWork(spec, initial.lines, [{ line: 1, text: m.work.sampleAlternative }]);
    expect(corrected.grade.result.verdict).toBe('CAN_XAC_NHAN');
    expect(corrected.grade.questions.some((q) => q.kind === 'unparsed' && q.lines.includes(2))).toBe(true);
    const skipped = reviewWork(spec, corrected.lines, [{ line: 2, skip: true }]);
    expect(skipped.grade.result.verdict).toBe('DUNG');
    const wrong = reviewWork(spec, skipped.lines, [{ line: 0, text: 'Đồ thị có 5 đỉnh.' }]);
    expect(wrong.grade.result.verdict).toBe('SAI'); expect(wrong.grade.readingCheck?.lines).toEqual([0]);
    expect(sampleWorkLines).toEqual(before);
  });
  it('SAI result shows the exact readingCheck and both confirm/edit actions', () => {
    const lines = reviewWork(spec, sampleWorkLines, [{ line: 1, text: 'Đồ thị có 8 cạnh.' }, { line: 2, skip: true }]).lines;
    const html = resultHtml(lines);
    expect(html).toContain(m.work.readingCheck); expect(html).toContain('Đồ thị có 8 cạnh.');
    expect(html).toContain(m.work.yes); expect(html).toContain(m.work.edit); expect(html).toContain('Sai ở bước 2');
  });
  it.each(['reading', 'unparsed', 'struck'] as const)('renders %s questions with crop, shownText, retype and skip', (kind) => {
    const question: WorkQuestion = { kind, lines: [1], page: 0, box: sampleWorkLines[1]!.box!, shownText: sampleWorkLines[1]!.text,
      options: kind === 'struck' ? [] : [m.work.sampleAlternative] };
    const html = renderToStaticMarkup(createElement(WorkQuestionScreen, { question, lines: sampleWorkLines, pages: sampleWorkPages, onAnswer: noop, onBack: noop }));
    expect(html).toContain(m.work.source); expect(html).toContain(question.shownText); expect(html).toContain('<textarea');
    expect(html).toContain(m.work.skip); expect(html).toContain(kind === 'struck' ? m.work.struckYes : m.work.sampleAlternative);
  });
  it('keeps separate editable fields and page crops for a question spanning two pages', () => {
    const lines = sampleWorkLines.slice(0, 2).map((line, page) => ({ ...line, page }));
    const question: WorkQuestion = { kind: 'reading', lines: [0, 1], page: 0, shownText: lines.map((l) => l.text).join('\n'), options: [] };
    const html = renderToStaticMarkup(createElement(WorkQuestionScreen, { question, lines, pages: [...sampleWorkPages, ...sampleWorkPages], onAnswer: noop, onBack: noop }));
    expect(html.match(/<textarea/g)).toHaveLength(2); expect(html).toContain('trang 2');
    expect(textAnswers(question, { 0: 'A → B', 1: 'C → A' })).toEqual([{ line: 0, text: 'A → B' }, { line: 1, text: 'C → A' }]);
  });
  it('uses normalized crop coordinates and falls back explicitly when image/box is absent', () => {
    const html = renderToStaticMarkup(createElement(WorkCrop, { pages: sampleWorkPages, page: 0, box: [100, 200, 700, 300] }));
    expect(html).toContain('viewBox="85 188 630 124"');
    expect(renderToStaticMarkup(createElement(WorkCrop, { pages: [], page: 1 }))).toContain(m.work.noImage);
    expect(renderToStaticMarkup(createElement(WorkCrop, { pages: sampleWorkPages, page: 0 }))).toContain(m.work.noBox);
  });
  it('confirms struck content without changing its text and does not reask after skipping', () => {
    const lines = sampleWorkLines.map((l) => ({ ...l, struck: false, strikeScore: l.index === 0 ? 0.5 : 0 }));
    const first = reviewWork(spec, lines);
    expect(first.grade.questions.some((q) => q.kind === 'struck' && q.lines.includes(0))).toBe(true);
    const answered = reviewWork(spec, lines, [{ line: 0, struck: true }, { line: 1, skip: true }, { line: 2, skip: true }, { line: 3, skip: true }]);
    expect(answered.grade.questions).toEqual([]); expect(answered.lines[0]!.text).toBe(lines[0]!.text);
  });
  it('requires valid per-image specs and normalizes B pixels without changing C boxes/charConf', () => {
    expect(readWorkSpecs(JSON.stringify({ 'photo-1': spec }))).toEqual({ 'photo-1': spec });
    for (const json of ['{}', 'null', '{"x":{}}', '[]']) expect(() => readWorkSpecs(json)).toThrow();
    const image = { width: 2000, height: 3000, pixels: new Uint8ClampedArray() };
    const text = [{ text: 'A', conf: 0.9, alternatives: [], charConf: [0.9], box: [200, 600, 1800, 900] as [number, number, number, number] }];
    expect(normalizedWorkLines(text, image, 'b')[0]?.box).toEqual([100, 200, 900, 300]);
    expect(normalizedWorkLines(text, image, 'c')).toEqual(text);
    expect(normalizedWorkLines(text, image, 'b')[0]?.charConf).toEqual([0.9]);
  });
  it('handles empty work without rendering an invented result or number', () => {
    expect(resultHtml([])).toContain(m.verdictNames.khong_du_can_cu);
    expect(resultHtml([])).not.toContain(m.work.readingCheck);
  });
});
