import { describe, expect, it } from 'vitest';
import type { ProblemSpec } from '@mathtwin/core';
import type { WorkLine, WorkTruth } from '@mathtwin/work';
import { alignWorkLines, compareAlignedWork } from '../src/work-alignment.js';
import { realWork, replayWorkAnswers } from '../src/work-eval.js';
import { auditWork } from '../src/work-audit.js';

const lines = (texts: string[]): WorkLine[] => texts.map((text, index) => ({ text, index, page: 0, conf: 1, alternatives: [] }));
const spec: ProblemSpec = { graph: { directed: false, vertices: [{ id: 'A', label: 'A' }], edges: [] }, task: { type: 'elements' }, questionFormat: 'tu_luan' };
describe('OCR/truth alignment (evaluation only)', () => {
  it('allows split and merged lines without duplicating the restored truth', () => {
    const reference = lines(['Số đỉnh = 1', 'Số cạnh = 0']);
    expect(alignWorkLines(lines(['Số đỉnh', '= 1', 'Số cạnh = 0']), reference).groups).toEqual([
      { observed: [0, 1], truth: [0] }, { observed: [2], truth: [1] },
    ]);
    expect(alignWorkLines(lines(['Số đỉnh = 1 Số cạnh = 0']), reference).groups).toEqual([{ observed: [0], truth: [0, 1] }]);
    const split = lines(['Số đỉnh', '= 9', 'Số cạnh = 0']);
    const replay = replayWorkAnswers(spec, split, reference, alignWorkLines(split, reference));
    expect(replay.lines.filter((l) => !l.skipped).map((l) => l.text)).toEqual(reference.map((l) => l.text));
    expect(replay.answeredLines).toBeLessThanOrEqual(replay.solutionLines);
  });
  it('retains gaps for lost lines and unrelated extra figure labels', () => {
    const reference = lines(['Số đỉnh = 1', 'Đồ thị liên thông', 'Số cạnh = 0']);
    const observed = lines(['Số đỉnh = 1', 'XYZ', 'Số cạnh = 0']);
    const alignment = alignWorkLines(observed, reference);
    expect(alignment.groups).toContainEqual({ observed: [], truth: [1] });
    expect(alignment.groups).toContainEqual({ observed: [1], truth: [] });
    expect(alignment.groups).toContainEqual({ observed: [2], truth: [2] });
    const empty = alignWorkLines([], reference);
    expect(empty.groups.flatMap((g) => g.truth)).toEqual([0, 1, 2]);
  });
  it('prefers a near-exact line to a later group of unrelated diagram labels', () => {
    const observed = lines(['Số khuyễn là 1.', 'khuyơn m', 'a', 'b', 'A', 'I', 'khuyơn m', 'a', 'b']);
    const alignment = alignWorkLines(observed, lines(['Số khuyên là 1.']));
    expect(alignment.groups.find((g) => g.truth.includes(0))).toEqual({ observed: [0], truth: [0] });
    expect(alignment.groups.filter((g) => !g.truth.length).flatMap((g) => g.observed)).toHaveLength(8);
  });
  it('uses box overlap to break otherwise equal text matches and respects pages', () => {
    const reference = lines(['A', 'A']).map((l, i) => ({ ...l, box: [0, i * 100, 50, i * 100 + 50] as [number, number, number, number] }));
    const observed = [{ ...reference[1]!, index: 9 }];
    expect(alignWorkLines(observed, reference).groups).toContainEqual({ observed: [9], truth: [1] });
    expect(alignWorkLines([{ ...observed[0]!, page: 1 }], reference).groups.every((g) => !g.observed.length || !g.truth.length)).toBe(true);
  });
  it('skips unmatched OCR, restores merged truth and marks struck truth', () => {
    const extra = lines(['Đáp số = 9']);
    expect(replayWorkAnswers(spec, extra, [], alignWorkLines(extra, [])).lines[0]!.skipped).toBe(true);
    const struck = [{ ...extra[0]!, struck: true }];
    expect(replayWorkAnswers(spec, extra, struck, alignWorkLines(extra, struck)).lines[0]!.struck).toBe(true);
    const reference = lines(['Số đỉnh = 1', 'Số cạnh = 0']);
    const merged = lines(['Số đỉnh = 9 Số cạnh = 0']);
    expect(replayWorkAnswers(spec, merged, reference, alignWorkLines(merged, reference)).lines[0]!.text).toBe('Số đỉnh = 1\nSố cạnh = 0');
  });
  it('measures error location and reading mismatch in truth coordinates after an extra line', () => {
    const reference = lines(['Số đỉnh = 3']);
    const observed = lines(['xyz', 'Số đỉnh = 3']);
    const truth: WorkTruth = { claims: [{ type: 'vertex_count', value: 3, step: 1, raw: reference[0]!.text }], lineOf: { '1': [0] }, expected: { verdict: 'SAI', firstErrorStep: 1, errorCode: 'SAI_PHEP_TINH' } };
    const prediction = realWork(spec, observed);
    const alignment = alignWorkLines(observed, reference);
    const comparison = compareAlignedWork(prediction, truth, reference, observed, alignment);
    expect(comparison).toMatchObject({ completeCorrect: true, firstErrorCorrect: true, readingMismatch: false, sourceLines: { correct: 1 } });
    const audit = auditWork(spec, observed, truth, reference, prediction, alignment, comparison);
    expect(audit.diagnostics.numberMismatch).toBe(0);
    expect(audit.region.present).toBe(0);
    expect(audit.unmatchedLines).toEqual([0]);
    expect(audit.intrusionLines).toEqual([]);
  });
  it('attributes lost erroneous truth to a, and exact-text pipeline errors to d', () => {
    const reference = lines(['Số cạnh = 0', 'Số đỉnh = 9']);
    const observed = lines(['Số cạnh = 0']);
    const truth: WorkTruth = { claims: [{ type: 'edge_count', value: 0, step: 1, raw: reference[0]!.text }, { type: 'vertex_count', value: 9, step: 2, raw: reference[1]!.text }], lineOf: { '1': [0], '2': [1] }, expected: { verdict: 'SAI', firstErrorStep: 2, errorCode: 'SAI_PHEP_TINH' } };
    const prediction = realWork(spec, observed), alignment = alignWorkLines(observed, reference);
    const comparison = compareAlignedWork(prediction, truth, reference, observed, alignment);
    expect(auditWork(spec, observed, truth, reference, prediction, alignment, comparison)).toMatchObject({ cause: 'a', missingClaimLines: [1] });
    const exact = lines(['Số đỉnh = 9']);
    const wrongTruth: WorkTruth = { claims: [], lineOf: {}, expected: { verdict: 'DUNG' } };
    const exactPrediction = realWork(spec, exact), exactAlignment = alignWorkLines(exact, exact);
    const exactComparison = compareAlignedWork(exactPrediction, wrongTruth, exact, exact, exactAlignment);
    expect(auditWork(spec, exact, wrongTruth, exact, exactPrediction, exactAlignment, exactComparison).cause).toBe('d');
  });
  it('classifies ii/iii by the reported error line, not an earlier OCR mismatch', () => {
    const reference = lines(['Số cạnh = 0', 'Số đỉnh = 9']);
    const observed = lines(['Số cạnh = 8', 'Số đỉnh = 9']);
    const prediction = realWork(spec, observed);
    prediction.grade.firstErrorLines = [1];
    prediction.grade.result.firstErrorStep = 2;
    const truth: WorkTruth = { claims: [], lineOf: {}, expected: { verdict: 'DUNG' } };
    expect(compareAlignedWork(prediction, truth, reference, observed, alignWorkLines(observed, reference)))
      .toMatchObject({ readingMismatch: false, silentFalseWrongParse: true, silentFalseWrongReading: false });
  });
  it('keeps blank struck truth separate from adjacent content', () => {
    const reference = [{ ...lines([''])[0]!, struck: true }, { ...lines(['Số đỉnh = 1'])[0]!, index: 1 }];
    expect(alignWorkLines(lines(['Số đỉnh = 1']), reference).groups).toEqual([
      { observed: [], truth: [0] }, { observed: [0], truth: [1] },
    ]);
  });
  it('restores merged prose and claim across a missing blank struck line', () => {
    const reference = lines(['Em liệt kê các đỉnh.', '', 'Số đỉnh = 1']).map((l) => l.index === 1 ? { ...l, struck: true } : l);
    const observed = lines(['Em liệt kê các đỉnh. Số đỉnh = 9']);
    const alignment = alignWorkLines(observed, reference);
    expect(alignment.groups).toContainEqual({ observed: [], truth: [1] });
    expect(alignment.groups).toContainEqual({ observed: [0], truth: [0, 2] });
    expect(replayWorkAnswers(spec, observed, reference, alignment).lines[0]!.text).toBe('Em liệt kê các đỉnh.\nSố đỉnh = 1');
  });
  it('attributes high-confidence misreading to b and region intrusion to c', () => {
    const reference = lines(['Số đỉnh = 1']), observed = lines(['Số đỉnh = 9']);
    const truth: WorkTruth = { claims: [{ type: 'vertex_count', value: 1, step: 1, raw: reference[0]!.text }], lineOf: { '1': [0] }, expected: { verdict: 'DUNG' } };
    const prediction = realWork(spec, observed), alignment = alignWorkLines(observed, reference);
    const comparison = compareAlignedWork(prediction, truth, reference, observed, alignment);
    expect(auditWork(spec, observed, truth, reference, prediction, alignment, comparison).cause).toBe('b');
    const question = [{ ...observed[0]!, region: 'question' as const }];
    const qAlignment = alignWorkLines(observed, question);
    expect(auditWork(spec, observed, { ...truth, claims: [], lineOf: {} }, question, prediction, qAlignment, comparison).cause).toBe('c');
  });
});
