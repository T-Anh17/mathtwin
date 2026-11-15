import { describe, expect, it } from 'vitest';
import { compareText, editDistance, stripDiacritics } from '../src/index.js';
import type { TextLine, TruthLine } from '../src/index.js';

const lines = (texts: string[], conf = 0.9): TextLine[] => texts.map((text) => ({ text, conf, alternatives: [] }));
const truth = (texts: string[]): TruthLine[] => texts.map((text) => ({ text, region: 'solution' }));
describe('text metrics preserve Vietnamese and reading order', () => {
  it('normalizes NFC and whitespace while keeping accents and case significant', () => {
    const result = compareText(lines(['  Đường   đi  '.normalize('NFD')]), truth(['Đường đi']));
    expect(result.cer).toEqual({ errors: 0, reference: 8, rate: 0 });
    expect(result.lineRecall).toBe(1);
    expect(compareText(lines(['đường đi']), truth(['Đường đi'])).cer.errors).toBe(1);
  });
  it('separates diacritic loss from other recognition errors including đ', () => {
    const result = compareText(lines(['Duong di']), truth(['Đường đi']));
    expect(result.cer.errors).toBeGreaterThan(0);
    expect(result.wer.rate).toBe(1);
    expect(result.cerWithoutDiacritics.rate).toBe(0);
    expect(stripDiacritics('Đặng đỗ')).toBe('Dang do');
  });
  it('counts Unicode codepoints, insertions, deletions and substitutions', () => {
    expect(compareText(lines(['A 😀']), truth(['A 😃'])).cer).toEqual({ errors: 1, reference: 3, rate: 1 / 3 });
    expect(editDistance(['a', 'b'], ['b', 'c'])).toBe(2);
    expect(editDistance([], ['a'])).toBe(1);
    expect(compareText(lines(['a b c']), truth(['a'])).wer.rate).toBe(2);
  });
  it('measures numeric tokens and labels, including unfamiliar inserted vertex labels', () => {
    const result = compareText(lines(['A → Z → B, 12,5 + 8 = 21']), truth(['A → B, 12,5 + 7 = 20']), ['A', 'B']);
    expect(result.digits).toMatchObject({ errors: 2, reference: 3, rate: 2 / 3 });
    expect(result.digits.accuracy).toBeCloseTo(1 / 3);
    expect(result.vertexLabels.errors).toBe(1);
    expect(result.vertexLabels.reference).toBe(2);
    expect(compareText(lines(['Đà Nẵng → B']), truth(['Đà Nẵng → B']), ['Đà Nẵng', 'B']).vertexLabels.reference).toBe(2);
  });
  it('uses ordered exact line recall; missing lines cannot be hidden by correct ones', () => {
    expect(compareText(lines(['A', 'C']), truth(['A', 'B', 'C'])).lineRecall).toBe(2 / 3);
    const reordered = compareText(lines(['B', 'A']), truth(['A', 'B']));
    expect(reordered.lineRecall).toBe(0.5); expect(reordered.silentLines).toBe(1);
    expect(compareText(lines(['A', 'A']), truth(['A'])).wrongLines).toBe(1);
  });
  it('counts wrong confident lines at the inclusive threshold and ignores alternatives', () => {
    const result = compareText([{ text: 'sai', conf: 0.85, alternatives: ['đúng'] }, { text: 'lỗi', conf: 0.84, alternatives: [] }], truth(['đúng', 'đúng']));
    expect(result.silentLines).toBe(1); expect(result.silentLineRate).toBe(0.5);
    expect(compareText(lines(['sai'], 0.85), truth(['đúng']), [], 0.9).silentLines).toBe(0);
  });
  it('does not count duplicate confident lines as correct twice', () => {
    expect(compareText(lines(['đúng', 'đúng']), truth(['đúng'])).silentLines).toBe(1);
    const result = compareText([...lines(['đúng'], 0.1), ...lines(['đúng'], 0.95)], truth(['đúng']));
    expect(result.silentLines).toBe(0); expect(result.wrongLines).toBe(1);
  });
  it('retains missing predictions in denominators; undefined empty-reference rates are null', () => {
    const missing = compareText([], truth(['A 7']), ['A']);
    expect(missing.cer.rate).toBe(1); expect(missing.lineRecall).toBe(0); expect(missing.silentLineRate).toBeNull();
    const extra = compareText(lines(['A 7']), []);
    expect(extra.cer.rate).toBeNull(); expect(extra.cer.errors).toBe(3); expect(extra.silentLineRate).toBe(1);
    expect(compareText([], []).digits.accuracy).toBeNull();
  });
  it('splits compact edges and parenthesized endpoints into known labels without splitting prose partially', () => {
    const labels = ['A', 'B', 'C', 'D'];
    expect(compareText(lines(['cạnh AD']), truth(['cạnh AB']), labels).vertexLabels).toMatchObject({ errors: 1, reference: 2, accuracy: 0.5 });
    expect(compareText(lines(['cạnh (A, B)']), truth(['cạnh AB']), labels).vertexLabels.errors).toBe(0);
    expect(compareText(lines(['cạnh BD']), truth(['cạnh BD']), labels).vertexLabels.reference).toBe(2);
    expect(compareText(lines(['BADGE']), truth(['BADGE']), labels).vertexLabels.reference).toBe(0);
    expect(compareText(lines(['v1v2']), truth(['v1v2']), ['v1', 'v2']).vertexLabels.reference).toBe(2);
    expect(compareText(lines(['ABC']), truth(['ABC']), ['AB', 'A', 'BC']).vertexLabels.reference).toBe(2);
  });
  it('excludes both readable and opaque struck references by default, and explicit struck predictions too', () => {
    const reference: TruthLine[] = [{ text: '7', region: 'solution', struck: true }, { text: null, region: 'solution', struck: true }, ...truth(['Đáp số 9'])];
    const result = compareText([...lines(['7']).map((l) => ({ ...l, struck: true })), ...lines(['Đáp số 9'])], reference);
    expect(result.cer.rate).toBe(0); expect(result.referenceLines).toBe(1); expect(result.lineRecall).toBe(1);
    expect(result.struckReadAsContent).toBe(0); expect(result.struckReferenceLines).toBe(2);
  });
  it('counts a readable struck line transcribed as normal content without blaming an identical active line', () => {
    const reference: TruthLine[] = [{ text: '7', region: 'solution', struck: true }, ...truth(['7'])];
    expect(compareText(lines(['7']), reference).struckReadAsContent).toBe(0);
    const result = compareText(lines(['7', '7']), reference);
    expect(result.struckReadAsContent).toBe(1); expect(result.struckUnassessable).toBe(0);
    expect(result.cer.errors).toBeGreaterThan(0);
  });
  it('detects opaque strike leakage by box, preserves unknown when boxes are absent, and counts each strike once', () => {
    const reference: TruthLine[] = [{ text: null, struck: true, region: 'solution', box: [10, 10, 110, 40] }];
    const predicted = lines(['7', '9']).map((l) => ({ ...l, box: [12, 12, 108, 38] as [number, number, number, number] }));
    const result = compareText(predicted, reference);
    expect(result.struckReadAsContent).toBe(1); expect(result.byRegion.solution.struckReadAsContent).toBe(1);
    expect(compareText(lines(['7']), reference).struckUnassessable).toBe(1);
    expect(compareText([], reference).struckUnassessable).toBe(0);
    expect(compareText([{ ...predicted[0]!, box: [200, 200, 300, 240] }], reference).struckReadAsContent).toBe(0);
  });
  it('reports metrics in all four truth regions without hiding incorrect or untagged predictions', () => {
    const reference: TruthLine[] = [{ text: 'Câu hỏi', region: 'question' }, { text: 'A', region: 'figure' }, { text: 'A 0 7', region: 'table' }, { text: 'Tổng là 8', region: 'solution' }];
    const result = compareText(lines(['Câu hỏi', 'A', 'A 0 7', 'Tổng là 9']), reference, ['A']);
    expect(result.byRegion.question.cer.rate).toBe(0); expect(result.byRegion.figure.cer.rate).toBe(0);
    expect(result.byRegion.table.cer.rate).toBe(0); expect(result.byRegion.solution.cer.errors).toBe(1);
    expect(result.byRegion.solution.silentLines).toBe(1);
    expect(Object.values(result.byRegion).reduce((sum, c) => sum + c.predictedLines, 0)).toBe(result.predictedLines);
    const missing = compareText([], reference);
    expect(missing.byRegion.solution.cer.rate).toBe(1); expect(missing.byRegion.solution.lineRecall).toBe(0);
  });
  it.each([NaN, Infinity, -0.1, 1.1])('rejects invalid confidence/threshold %s', (value) => {
    expect(() => compareText(lines(['A'], value), truth(['A']))).toThrow();
    expect(() => compareText([], [], [], value)).toThrow();
  });
});
