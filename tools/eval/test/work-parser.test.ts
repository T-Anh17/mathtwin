import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ProblemSpec } from '@mathtwin/core';
import { evaluateWork, realWork, readWorkOptions, replayWorkAnswers, silentReadingPartition, uncheckedGuard } from '../src/work-eval.js';
import { compareWork } from '@mathtwin/work';
const spec: ProblemSpec = { graph: { directed: false, vertices: [{ id: 'v1', label: 'A' }], edges: [] }, task: { type: 'degree', vertices: ['v1'] }, questionFormat: 'tu_luan' };
describe('real parser evaluation switch', { timeout: 60000 }, () => {
  it('guards unchecked and bounds truth replay, including unchanged unparsed truth', () => {
    const lines = (texts: string[]) => texts.map((text,index)=>({text,index,page:0,conf:1,alternatives:[]}));
    const observed = lines(['x = ?', 'deg(A) = 3']);
    expect(realWork(spec, observed).grade.result.verdict).toBe('CAN_XAC_NHAN');
    const replay = replayWorkAnswers(spec, observed, lines(['x = ?', 'deg(A) = 0']));
    expect(replay).toMatchObject({ questions: 1, answeredLines: 1, prediction: { grade: { result: { verdict: 'CAN_XAC_NHAN' } } } });
    const reading = replayWorkAnswers(spec, lines(['deg(A) = 3']), lines(['deg(A) = 0']));
    expect(reading).toMatchObject({ questions: 1, prediction: { grade: { result: { verdict: 'DUNG' } } } });
    const same = replayWorkAnswers(spec, lines(['deg(A) = 3']), lines(['deg(A) = 3']));
    expect(same).toMatchObject({ questions: 1, prediction: { grade: { result: { verdict: 'SAI' } } } });
    const rounds = replayWorkAnswers(spec, observed, lines(['Số cạnh = 0', 'deg(A) = 0']));
    expect(rounds).toMatchObject({ questions: 2, answeredLines: 2, prediction: { grade: { result: { verdict: 'DUNG' } } } });
    const comparison = compareWork(realWork(spec, lines(['deg(A) = 3'])), {claims:[],lineOf:{},expected:{verdict:'DUNG'}});
    expect(uncheckedGuard(comparison,[0],[1]).silentFalseWrongParseWithPriorUnchecked).toBe(1);
  });
  it('maps display labels at the grading boundary, including nested final answers', () => {
    const line = (text: string) => [{ text, index: 0, page: 0, conf: 1, alternatives: [] }];
    expect(realWork(spec, line('deg(A) = 0')).grade.result.verdict).toBe('DUNG');
    expect(realWork(spec, line('Đáp số: bậc của A là 0')).grade.result.verdict).toBe('DUNG');
    expect(realWork(spec, line('deg(A) = 3')).grade).toMatchObject({ result: { verdict: 'SAI', firstErrorStep: 1 }, firstErrorLines: [0] });
  });
  it('reparses after each answer and checks newly exposed errors, within solution-line bounds', () => {
    const lines = (texts: string[]) => texts.map((text, index) => ({ text, index, page: 0, conf: 0.3, alternatives: [] }));
    const reference = lines(['Số cạnh = 0', 'deg(A) = 0', 'Đề', 'Gạch']);
    const observed = lines(['chữ hỏng', 'deg(A) = 3', 'Đề', 'Gạch']);
    const input = observed.map((line) => ({ ...line, ...(line.index === 2 ? { region: 'question' as const } : {}), ...(line.index === 3 ? { struck: true } : {}) }));
    const replay = replayWorkAnswers(spec, input, reference);
    expect(replay).toMatchObject({ questions: 2, answeredLines: 2, solutionLines: 2, prediction: { grade: { result: { verdict: 'DUNG' } } } });
    const comparison = compareWork(realWork(spec, [{ ...input[1]!, index: 0, conf: 1 }]), { claims: [], lineOf: {}, expected: { verdict: 'DUNG' } });
    expect(silentReadingPartition(comparison, [{ ...input[1]!, index: 1, conf: 0.9 }], reference)).toEqual({ withHighConfidenceMisread: 1, withoutHighConfidenceMisread: 0 });
    expect(silentReadingPartition(comparison, input, reference)).toEqual({ withHighConfidenceMisread: 0, withoutHighConfidenceMisread: 1 });
  });
  it('selects variants and runs observed text through the parser instead of copying truth', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mathtwin-work-parser-'));
    try {
      const sample = join(root, 'testdata/work-text/dev/sample-a');
      const core = join(root, 'testdata/core/degree');
      await mkdir(sample, { recursive: true }); await mkdir(core, { recursive: true });
      const save = (path: string, value: unknown) => writeFile(path, JSON.stringify(value));
      await save(join(root, 'testdata/work-text/manifest.json'), [
        { id: 'sample-a', split: 'dev', variant: 'a', coreFixture: 'degree', family: 'unit' },
        { id: 'missing-b', split: 'dev', variant: 'b', coreFixture: 'degree', family: 'unit' },
      ]);
      await save(join(core, 'spec.json'), spec);
      await save(join(sample, 'lines.json'), [{ text: 'deg(A) = 3', index: 0, page: 0, conf: 1, alternatives: [] }]);
      await save(join(sample, 'work.json'), { claims: [{ type: 'degree', v: 'v1', value: 0, step: 1, raw: 'deg(A) = 0' }], lineOf: { '1': [0] }, expected: { verdict: 'DUNG' }, prose: [] });
      const args = ['--set', 'work-text', '--lines', 'truth', '--split', 'dev', '--variant', 'a'];
      const oracle = await evaluateWork([...args, '--parser', 'oracle'], root, '2000-01-01');
      const real = await evaluateWork([...args, '--parser', 'real'], root, '2000-01-01');
      expect(oracle.summary.completeRate).toBe(1);
      expect(real).toMatchObject({ parser: 'real', summary: { total: 1, completeRate: 0, silentFalseWrongReading: 0 } });
      expect(real.rows[0]).toMatchObject({ firstErrorLines: [0], predictedClaimTypes: ['degree'] });
      expect(await readFile(join(root, 'reports/work-eval-work-text-truth-dev-a-real-2000-01-01.md'), 'utf8')).toContain('parser real');
      // Noisy input must be parsed, but reading evidence comes from clean variant a.
      const noisy = join(root, 'testdata/work-text/dev/missing-b');
      await mkdir(noisy);
      await save(join(sample, 'lines.json'), [{ text: 'deg(A) = 0', index: 0, page: 0, conf: 1, alternatives: [] }]);
      await save(join(noisy, 'lines.json'), [{ text: 'deg(A) = 3', index: 0, page: 0, conf: 1, alternatives: [] }]);
      await save(join(noisy, 'work.json'), JSON.parse(await readFile(join(sample, 'work.json'), 'utf8')) as unknown);
      const noiseReport = await evaluateWork(['--set', 'work-text', '--lines', 'truth', '--split', 'dev', '--variant', 'b', '--parser', 'real'], root, '2000-01-01');
      expect(noiseReport.summary).toMatchObject({ total: 1, silentFalseWrongReading: 1, silentFalseWrongParse: 0 });
      expect(noiseReport.rows[0]!.comparison.readingMismatch).toBe(true);
      expect(noiseReport.afterSummary).toMatchObject({ verdictCorrect: 1, confirmations: 0, silentFalseWrongReading: 0, questionsMean: 1, questionsMax: 1 });
    } finally {
      if (!resolve(root).startsWith(resolve(tmpdir(), 'mathtwin-work-parser-'))) throw new Error('Unexpected temporary path');
      await rm(root, { recursive: true, force: true });
    }
  });
  it('validates parser and variant flags without changing the oracle default', () => {
    expect(readWorkOptions(['--set', 'work-text', '--lines', 'truth', '--parser', 'real', '--variant', 'a'])).toMatchObject({ parser: 'real', variant: 'a' });
    for (const flags of [['--parser', 'fake'], ['--variant', 'e'], ['--parser', 'real', '--parser', 'real']]) expect(() => readWorkOptions(['--set', 'work-text', '--lines', 'truth', ...flags])).toThrow();
    expect(() => readWorkOptions(['--set', 'synthetic-hw', '--lines', 'truth', '--variant', 'a'])).toThrow();
  });
});
