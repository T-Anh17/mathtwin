import { describe, expect, it } from 'vitest';
import type { ProblemSpec } from '@mathtwin/core';
import { applyWorkAnswers, gradeWork, inspectLostDiacritics, lostDiacritics, parseWork } from '../src/index.js';
import type { WorkLine, WorkVocabulary } from '../src/index.js';

const vocab: WorkVocabulary = {
  vertexLabels: ['A', 'B', 'C', 'D'], edgeNames: [], task: 'path', questionFormat: 'tu_luan', statementIds: [], questionText: [],
};
const source = (text: string, index = 0): WorkLine => ({ text, index, page: 0, conf: .95, alternatives: [] });
const spec: ProblemSpec = {
  graph: { directed: false, vertices: vocab.vertexLabels.map((label) => ({ id: label, label })), edges: [] },
  task: { type: 'path', from: 'A', to: 'B' }, questionFormat: 'tu_luan',
};

describe('complete Vietnamese accent loss', () => {
  it('requires three familiar words, ignores labels and keeps notation out', () => {
    expect(lostDiacritics('A la dinh bac 2, B la dinh bac 3', vocab)).toBe(true);
    expect(inspectLostDiacritics('A la dinh bac 2, B la dinh bac 3', vocab).matchedWords).toHaveLength(6);
    for (const text of ['A → B → C', 'V(G)={A,B,C,D}', 'd(A) = 2', 'AB + BC = 5', 'A la B', 'A C D']) {
      expect(lostDiacritics(text, vocab)).toBe(false);
    }
  });

  it('does not flag normal Vietnamese accents', () => {
    expect(lostDiacritics('A là đỉnh bậc 2, B là đỉnh bậc 3', vocab)).toBe(false);
  });

  it('forces a reading question instead of silently accepting parsed prose', () => {
    const parsed = parseWork([source('A la dinh bac 2, B la dinh bac 3')], vocab);
    expect(parsed.steps).toHaveLength(2);
    expect(parsed.steps.every((step) => (step.claim.conf ?? 1) < .85)).toBe(true);
    const grade = gradeWork(spec, parsed);
    expect(grade.result.verdict).toBe('CAN_XAC_NHAN');
    expect(grade.questions).toEqual([expect.objectContaining({ kind: 'reading', lines: [0] })]);
  });

  it('asks reading, not unparsed, for unparsed accent loss even with high character scores', () => {
    const line = { ...source('Ta thay do thi nay khong co dinh co lap', 0), charConf: new Array(39).fill(.99) };
    const parsed = parseWork([line, source('A là đỉnh bậc 2, B là đỉnh bậc 3', 1)], vocab);
    expect(parsed.unchecked).toContain(0);
    expect(parsed.ignored).not.toContainEqual({ line: 0, reason: 'prose' });
    const grade = gradeWork(spec, parsed);
    expect(grade.result.verdict).toBe('CAN_XAC_NHAN');
    expect(grade.questions).toEqual([expect.objectContaining({ kind: 'reading', lines: [0] })]);
  });

  it('stops asking once the user confirms the unaccented text', () => {
    const lines = [source('A la dinh bac 2, B la dinh bac 3')];
    const confirmed = applyWorkAnswers(lines, [{ line: 0, text: 'A la dinh bac 2, B la dinh bac 3' }]);
    expect(confirmed[0]!.textConfirmed).toBe(true);
    const parsed = parseWork(confirmed, vocab);
    expect(parsed.steps.every((step) => (step.claim.conf ?? 1) >= .85)).toBe(true);
    expect(gradeWork(spec, parsed).questions).toEqual([]);
  });

  it('only asks the accent-loss line on a mixed page', () => {
    const parsed = parseWork([source('A la dinh bac 2, B la dinh bac 3'), source('A là đỉnh bậc 2, B là đỉnh bậc 3', 1)], vocab);
    const grade = gradeWork(spec, parsed);
    expect(grade.questions).toEqual([expect.objectContaining({ kind: 'reading', lines: [0] })]);
  });
});
