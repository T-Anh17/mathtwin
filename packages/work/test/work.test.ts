import { describe, expect, it, vi } from 'vitest';
import { claimKey, compareWork, vocabularyOf } from '../src/index.js';
import type { ParsedWork, WorkGrade, WorkTruth } from '../src/index.js';
import type { Claim, GradeResult, ProblemSpec } from '@mathtwin/core';
const a: Claim = { type: 'edge_count', value: 2, step: 1, raw: 'Số cạnh: 2.' };
const b: Claim = { type: 'loop_count', value: 1, step: 2, raw: 'Có 1 khuyên.' };
const truth: WorkTruth = { claims: [a, b], lineOf: { '1': [0], '2': [1] }, expected: { verdict: 'DUNG' },
  lines: [a, b].map((c, index) => ({ index, page: 0, conf: 1, alternatives: [], text: c.raw })) };
function predicted(claims: Claim[], result: GradeResult = { verdict: 'DUNG', message: '', notes: [] }, source?: number[][]) {
  const parsed: ParsedWork = { steps: claims.map((claim, i) => ({ claim, lines: source?.[i] ?? [i], page: 0, candidates: [claim], origin: 'text' })), ignored: [], unchecked: [], issues: [] };
  const grade: WorkGrade = { result, questions: [], ...(result.firstErrorStep === undefined ? {} : { firstErrorLines: source?.[result.firstErrorStep - 1] ?? [result.firstErrorStep - 1] }) };
  return { parsed, grade };
}
describe('pure work package', () => {
  it('runs without Node globals', () => {
    let complete: boolean;
    vi.stubGlobal('process', undefined); vi.stubGlobal('Buffer', undefined);
    try { complete = compareWork(predicted([a, b]), truth).completeCorrect; }
    finally { vi.unstubAllGlobals(); }
    expect(complete).toBe(true);
  });
  it('exposes vocabulary only, without graph structure, weights or answers; returns copies', () => {
    const spec: ProblemSpec = { graph: { directed: false, vertices: [{ id: 'v1', label: 'A' }], edges: [{ id: 'e', u: 'v1', v: 'v1', w: 17, name: 'm' }] }, task: { type: 'statements', items: [{ id: 'a', text: 'Một cạnh', check: { type: 'edge_count', value: 1 } }] }, questionFormat: 'dung_sai' };
    const question = ['Đề bài']; const vocabulary = vocabularyOf(spec, question);
    expect(vocabulary).toEqual({ vertexLabels: ['A'], edgeNames: ['m'], task: 'statements', questionFormat: 'dung_sai', statementIds: ['a'], questionText: ['Đề bài'] });
    vocabulary.vertexLabels[0] = 'X'; vocabulary.questionText.push('khác');
    expect(spec.graph.vertices[0]!.label).toBe('A'); expect(question).toEqual(['Đề bài']);
  });
  it('counts exact ordered bodies while ignoring reading metadata and set order', () => {
    expect(compareWork(predicted([{ ...a, conf: 0.1, raw: 'khác' }, b]), truth)).toMatchObject({ completeCorrect: true, claims: { precision: 1, recall: 1 }, sourceLines: { accuracy: 1 } });
    expect(claimKey({ type: 'edge_list', edges: [{ u: 'B', v: 'A' }, { u: 'C', v: 'A' }] })).toBe(claimKey({ type: 'edge_list', edges: [{ u: 'A', v: 'C' }, { u: 'A', v: 'B' }] }));
    expect(claimKey({ type: 'vertex_list', vertices: ['B', 'A'] })).toBe(claimKey({ type: 'vertex_list', vertices: ['A', 'B'] }));
    expect(claimKey({ type: 'walk', kind: 'path', vertices: ['A', 'B'] })).not.toBe(claimKey({ type: 'walk', kind: 'path', vertices: ['B', 'A'] }));
  });
  it('uses LCS without reusing duplicates and checks exact source indices', () => {
    expect(compareWork(predicted([b, a]), truth)).toMatchObject({ completeCorrect: false, claims: { matched: 1, precision: 0.5, recall: 0.5 } });
    expect(compareWork(predicted([a, a, b]), truth).claims).toMatchObject({ matched: 2, precision: 2 / 3, recall: 1 });
    expect(compareWork(predicted([a, b], undefined, [[1], [0]]), truth).sourceLines.accuracy).toBe(0);
  });
  it('measures first-error line intersection and error code independently from step numbering', () => {
    const wrong: WorkTruth = { ...truth, expected: { verdict: 'SAI', firstErrorStep: 2, errorCode: 'SAI_PHEP_TINH' } };
    const p = predicted([a, b], { verdict: 'SAI', firstErrorStep: 2, errorCode: 'SAI_PHEP_TINH', message: '', notes: [] });
    p.grade.firstErrorLines = [1, 3]; expect(compareWork(p, wrong).firstErrorCorrect).toBe(true);
    p.grade.result.errorCode = 'BO_SOT'; expect(compareWork(p, wrong).firstErrorCorrect).toBe(false);
  });
  it('counts false correct (i), wrong parse (ii), and wrong reading (iii) separately', () => {
    const wrong: WorkTruth = { ...truth, expected: { verdict: 'SAI', firstErrorStep: 2, errorCode: 'SAI_PHEP_TINH' } };
    expect(compareWork(predicted([a, b]), wrong)).toMatchObject({ silentFalseCorrect: true, silentFalseWrongParse: false, silentFalseWrongReading: false });
    const result: GradeResult = { verdict: 'SAI', firstErrorStep: 1, errorCode: 'SAI_PHEP_TINH', message: '', notes: [] };
    for (const reference of [truth, wrong]) {
      expect(compareWork(predicted([{ ...a, value: 9 }, b], result), reference)).toMatchObject({
        readingMismatch: false, silentFalseWrongParse: true, silentFalseWrongReading: false });
      expect(compareWork(predicted([{ ...a, raw: 'Số cạnh: 9.', value: 9 }, b], result), reference)).toMatchObject({
        readingMismatch: true, silentFalseWrongParse: false, silentFalseWrongReading: true });
    }
    const correctError = predicted([a, b], { ...result, firstErrorStep: 2 });
    expect(compareWork(correctError, wrong)).toMatchObject({ silentFalseCorrect: false, silentFalseWrongParse: false, silentFalseWrongReading: false });
  });
  it('conservatively counts unknown reading evidence as (ii), including absent error lines', () => {
    const result: GradeResult = { verdict: 'SAI', firstErrorStep: 1, errorCode: 'SAI_PHEP_TINH', message: '', notes: [] };
    const p = predicted([a, b], result);
    const { lines: _lines, ...withoutLines } = truth;
    const reference = { ...withoutLines, claims: [], lineOf: {} };
    expect(compareWork(p, reference)).toMatchObject({ readingMismatch: null, silentFalseWrongParse: true, silentFalseWrongReading: false });
    p.grade.firstErrorLines = [];
    expect(compareWork(p, truth)).toMatchObject({ readingMismatch: null, silentFalseWrongParse: true });
    expect(compareWork(predicted([a, b], result), withoutLines)).toMatchObject({ readingMismatch: false, silentFalseWrongParse: true });
  });
  it('checks all reading evidence through the error, including content lost before it', () => {
    const result: GradeResult = { verdict: 'SAI', firstErrorStep: 2, errorCode: 'SAI_PHEP_TINH', message: '', notes: [] };
    const p = predicted([{ ...a, raw: 'Số cạnh: 9.' }, b], result);
    expect(compareWork(p, truth)).toMatchObject({ readingMismatch: true, silentFalseWrongReading: true, silentFalseWrongParse: false });
    p.parsed.steps[0]!.claim.raw = a.raw;
    expect(compareWork(p, truth)).toMatchObject({ readingMismatch: false, silentFalseWrongParse: true });
    const missing = predicted([{ ...b, step: 1 }], { ...result, firstErrorStep: 1 }, [[1]]);
    missing.parsed.sourceLines = truth.lines!.map((line) => line.index === 0 ? { ...line, text: 'nhiễu', conf: 0.3 } : line);
    missing.parsed.ignored = [{ line: 0, reason: 'prose' }];
    expect(compareWork(missing, truth)).toMatchObject({ readingMismatch: true, silentFalseWrongReading: true,
      contentAsProse: { lowConfidence: 1, highConfidence: 0 } });
    missing.parsed.sourceLines[0]!.conf = 0.99;
    expect(compareWork(missing, truth).contentAsProse).toEqual({ lowConfidence: 0, highConfidence: 1 });
    missing.parsed.sourceLines[0]!.text = a.raw;
    expect(compareWork(missing, truth)).toMatchObject({ readingMismatch: false, silentFalseWrongParse: true });
    // A later misread must not contaminate the prefix classification.
    const early = predicted([a, { ...b, raw: 'nhiễu sau lỗi' }], { ...result, firstErrorStep: 1 });
    expect(compareWork(early, truth).readingMismatch).toBe(false);
  });
  it('counts distinct prose truth lines put in unchecked', () => {
    const p = predicted([a, b]); p.parsed.unchecked = [2, 2, 3, 4];
    expect(compareWork(p, { ...truth, prose: [2, 3, 5] }).proseAsUnchecked).toBe(2);
    expect(compareWork(p, truth).proseAsUnchecked).toBe(0);
  });
  it('counts confirmations separately, struck content, empty work and insufficient reasons', () => {
    const p = predicted([a], { verdict: 'CAN_XAC_NHAN', message: '', notes: [] });
    expect(compareWork(p, truth)).toMatchObject({ confirmation: true, verdictCorrect: null });
    const struck = { ...truth, lines: truth.lines!.map((l) => ({ ...l, struck: true })) };
    expect(compareWork(predicted([a, b]), struck).struckAsContent).toBe(2);
    const empty: WorkTruth = { claims: [], lineOf: {}, expected: { verdict: 'KHONG_DU_CAN_CU' } };
    const e = predicted([], { verdict: 'KHONG_DU_CAN_CU', message: '', notes: [] });
    e.parsed.issues.push({ code: 'no_solution_lines', severity: 'blocking', message: 'Không có bài làm.' });
    expect(compareWork(e, empty)).toMatchObject({ completeCorrect: true, insufficient: true, insufficientReasons: ['no_solution_lines'], claims: { precision: 1, recall: 1 } });
  });
});
