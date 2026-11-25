import { describe, expect, it } from 'vitest';
import type { ProblemSpec } from '@mathtwin/core';
import type { WorkLine, WorkTruth } from '@mathtwin/work';
import { createSession, sessionReducer } from '../../../apps/mobile/src/flow/sessionReducer.js';
import type { Session } from '../../../apps/mobile/src/flow/types.js';
import { alignMvpWork, replayMvpWork, simulateRegionAnswer } from '../src/mvp.js';
import { lossReport, lossSummary, silentClaimLoss } from '../src/mvp-silent-loss.js';
import type { LossReportInput } from '../src/mvp-silent-loss.js';
import type { MvpRow } from '../src/mvp-report.js';

const spec: ProblemSpec = { graph: { directed: false, vertices: [{ id: 'A', label: 'A' }, { id: 'B', label: 'B' }], edges: [{ id: 'e1', u: 'A', v: 'B', w: 3 }] }, task: { type: 'elements' }, questionFormat: 'tu_luan' };
const line = (text: string, index = 0, extra: Partial<WorkLine> = {}): WorkLine => ({ text, index, page: 0, region: 'solution', conf: 1, alternatives: [], box: [0, 700 + index * 50, 900, 740 + index * 50], ...extra });
const reference = [line('Cho đồ thị G.', 0, { region: 'question', box: [0, 100, 900, 140] }), line('Đồ thị có 2 đỉnh.', 1), line('Đồ thị có 1 cạnh.', 2)];
const workTruth: WorkTruth = { claims: [{ type: 'vertex_count', value: 2, step: 1, raw: 'Đồ thị có 2 đỉnh.' }, { type: 'edge_count', value: 1, step: 2, raw: 'Đồ thị có 1 cạnh.' }],
  lineOf: { '1': [1], '2': [2] }, prose: [], expected: { verdict: 'DUNG' } };
function photoWork(lines: WorkLine[]): Session {
  let s = sessionReducer(createSession('test', '2026-11-18'), { type: 'manual_spec', spec });
  s = sessionReducer(s, { type: 'work_photos', photos: [{ id: 'p', page: 0, width: 20, height: 20 }] });
  return sessionReducer(s, { type: 'work_read', lines, ms: 1 });
}

describe('Lô 5.3 evaluator', () => {
  it('answers a region question from the aligned truth region only', () => {
    const observed = [line('Cho đồ thị G.', 0, { region: 'question', box: [0, 100, 900, 140] }), line('Đồ thị có 2 đỉnh.', 1, { region: 'question' }), line('Lạ', 9, { region: 'question', box: [0, 10, 50, 30] })];
    const alignment = alignMvpWork(observed, reference);
    expect(simulateRegionAnswer([1, 0, 9], observed, reference, alignment)).toEqual([
      { line: 1, region: 'solution' }, { line: 0, region: 'question' }, { line: 9, region: 'question' }]);
  });
  it('the replay asks the region question, answers it from truth and regrades to the truth verdict', () => {
    const observed = [line('Đồ thị có 2 đỉnh.', 1), line('Đồ thị có 1 cạnh.', 2, { region: 'question', regionSource: 'model' })];
    const start = photoWork(observed);
    expect(start.workGrade?.questions).toEqual([expect.objectContaining({ kind: 'region', lines: [2] })]);
    const replay = replayMvpWork(start, reference);
    expect(replay.session.workAnswers).toContainEqual({ line: 2, region: 'solution' });
    expect(replay.session.workGrade?.result.verdict).toBe('DUNG');
    expect(silentClaimLoss({ session: replay.session }, reference, workTruth)).toMatchObject({ struck: [], region: [] });
  });
  it('counts claim lines lost by an unasked strike or region exclusion, never answered ones or problem lines', () => {
    const struck = photoWork([line('Đồ thị có 2 đỉnh.', 1, { struck: true }), line('Đồ thị có 1 cạnh.', 2)]);
    expect(silentClaimLoss({ session: struck }, reference, workTruth)).toMatchObject({ struck: [1], region: [] });
    const excluded = photoWork([line('Cho đồ thị G.', 0, { region: 'question', box: [0, 100, 900, 140] }), line('Đồ thị có 2 đỉnh.', 1), line('Đồ thị có 1 cạnh.', 2, { region: 'figure' })]);
    expect(silentClaimLoss({ session: excluded }, reference, workTruth)).toMatchObject({ struck: [], region: [2] });
    const answered = { ...excluded, workAnswers: [{ line: 2, region: 'question' as const }] };
    expect(silentClaimLoss({ session: answered }, reference, workTruth)).toMatchObject({ struck: [], region: [] });
  });
  it('report numbers come from the rows: different data gives different numbers', () => {
    const base = photoWork([line('Đồ thị có 2 đỉnh.', 1), line('Đồ thị có 1 cạnh.', 2)]);
    const row = (id: string, workQuestions: number, verdictCorrect: boolean): MvpRow => ({ id, session: base, workQuestions, regionQuestions: 0,
      expected: { verdict: 'DUNG' }, finalVerdict: verdictCorrect ? 'DUNG' : 'SAI', confirmedCorrect: true, solutionCheck: { correct: true, reason: '' },
      readComparison: { completeCorrect: false }, comparison: { verdictCorrect, firstErrorCorrect: null, silentFalseCorrect: false, silentFalseWrongParse: false, silentFalseWrongReading: false },
    } as unknown as MvpRow);
    const input = (date: string, rows: MvpRow[], lost: number[]): LossReportInput => ({ date, label: date, planned: 3, rows, failures: [],
      loss: new Map(rows.map((r) => [r.id, { struck: lost, region: [] }])) });
    const one = input('2026-01-01', [row('a', 2, true)], [1]);
    const two = input('2026-01-02', [row('a', 5, false), row('b', 7, true)], []);
    expect(lossSummary(one)).toMatchObject({ struckSilent: 1, workQuestions: 2, verdictCorrect: 1, maxQuestions: 2 });
    expect(lossSummary(two)).toMatchObject({ struckSilent: 0, workQuestions: 12, verdictCorrect: 1, maxQuestions: 7 });
    const text = lossReport(one, two);
    expect(text).toContain('| Dòng mệnh đề bị gạch tự động không hỏi (số trang) | 1 (1) | 0 (0) |');
    expect(text).toContain('| Câu hỏi bài làm (tổng / TB mỗi bài / max) | 2 / 2.00 / 2 | 12 / 6.00 / 7 |');
    expect(text).toContain('Câu hỏi tăng thêm: 10');
    expect(text).toContain('- a: DUNG → SAI (truth DUNG)');
    expect(lossReport(two, one)).toContain('Câu hỏi tăng thêm: -10');
  });
});
