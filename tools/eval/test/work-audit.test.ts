import { describe, expect, it } from 'vitest';
import type { ProblemSpec } from '@mathtwin/core';
import type { ParsedWork, WorkGrade, WorkLine, WorkTruth } from '@mathtwin/work';
import { auditWork } from '../src/work-audit.js';

const spec: ProblemSpec = { graph: { directed: false, vertices: [{ id: 'A', label: 'A' }], edges: [] }, task: { type: 'elements' }, questionFormat: 'tu_luan' };
const line: WorkLine = { index: 0, page: 0, text: 'Số đỉnh A = 3', conf: 1, alternatives: [], region: 'solution' };
const truth: WorkTruth = { claims: [{ type: 'vertex_count', value: 3, step: 1, raw: line.text }], lineOf: { '1': [0] }, expected: { verdict: 'DUNG' } };
const prediction: { parsed: ParsedWork; grade: WorkGrade } = {
  parsed: { steps: [], ignored: [], unchecked: [0], issues: [] },
  grade: { questions: [], result: { verdict: 'CAN_XAC_NHAN', message: '', notes: [] } },
};
describe('post-inference work audit', () => {
  it('separates token mismatches from correct but unsupported wording', () => {
    const observed = [{ ...line, text: 'Số đỉnh B = 8' }];
    const snapshot = structuredClone({ observed, truth, prediction });
    const audit = auditWork(spec, observed, truth, [line], prediction);
    expect(audit.diagnostics).toMatchObject({ numberMismatch: 1, labelMismatch: 1, unsupportedWording: 0 });
    expect(audit.evidence).toMatchObject([{ index: 0, observed: observed[0]!.text, truth: line.text }]);
    expect({ observed, truth, prediction }).toEqual(snapshot);
  });
  it('marks accent damage only when parsing the line failed', () => {
    expect(auditWork(spec, [{ ...line, text: 'So dinh A = 3' }], truth, [line], prediction).diagnostics.accentDamage).toBe(1);
    const parsed: ParsedWork = { steps: [{ claim: truth.claims[0]!, lines: [0], page: 0, candidates: [{ type: 'vertex_count', value: 3 }], origin: 'text' }], unchecked: [], ignored: [], issues: [] };
    expect(auditWork(spec, [{ ...line, text: 'So dinh A = 3' }], truth, [line], { ...prediction, parsed }).diagnostics.accentDamage).toBe(0);
  });
  it('counts table failures and ignores question-only evidence', () => {
    const question: WorkLine = { ...line, index: 1, region: 'question' };
    const result = auditWork(spec, [line, { ...question, text: 'B = 9' }], truth, [{ ...line, region: 'table' }, question], prediction);
    expect(result.diagnostics).toMatchObject({ tableFailure: 1, unsupportedWording: 1, numberMismatch: 0, labelMismatch: 0 });
  });
});
