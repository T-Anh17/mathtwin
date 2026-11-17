import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { grade } from '@mathtwin/core';
import type { Claim, ProblemSpec } from '@mathtwin/core';
import { claimKey, compareWork, vocabularyOf } from '@mathtwin/work';
import type { WorkLine, WorkTruth, WorkVocabulary } from '@mathtwin/work';
import type { TruthLine } from '@mathtwin/reader';
import { repositoryRoot } from '../src/cli.js';
import { readJson, loadCases } from '../src/dataset.js';
import { buildHandwritingCase, handwritingStyles } from '../src/handwriting.js';
import { handwritingSolution } from '../src/handwriting-solutions.js';
import { syntheticFixtures } from '../src/synthetic.js';
import { workLines, validateWork, hasGradingContent } from '../src/work-data.js';
import { evaluateWork, oracleWork, readWorkOptions } from '../src/work-eval.js';
import { renderClaims, wording } from '../src/work-wording.js';
import { devFamilies } from '../src/work-wording-dev.js';
import { testFamilies } from '../src/work-wording-test.js';
import { characterEdits, noisyLines } from '../src/work-noise.js';
import type { ConfusionTable } from '../src/work-noise.js';
import type { WorkSampleMeta } from '../src/work-generate.js';
const root = repositoryRoot;
const families = [...devFamilies, ...testFamilies];
describe('work truth and measuring instrument', () => {
  it.each(syntheticFixtures.flatMap((fixture) => handwritingStyles.map((style) => ({ fixture, style }))))('$fixture/$style preserves student errors, raw lines and grade', async ({ fixture, style }) => {
    const folder = join(root, 'testdata/images-synthetic-hw', `${fixture}-${style}`);
    const spec = await readJson(join(folder, 'truth.json')) as ProblemSpec;
    const work = await readJson(join(folder, 'work.json')) as WorkTruth;
    const lines = workLines(await readJson(join(folder, 'lines.json')) as TruthLine[]);
    const meta = await readJson(join(folder, 'meta.json')) as { studentErrors: { written: string }[]; handwritingHashes: Record<string, string> };
    expect(work).toEqual(buildHandwritingCase(spec, style).work);
    expect(() => validateWork(spec, work, lines, true)).not.toThrow();
    expect(grade(spec, work.claims).verdict).toBe(meta.studentErrors.length ? 'SAI' : 'DUNG');
    if (meta.studentErrors.length) expect(work.claims.find((c) => c.step === work.expected.firstErrorStep)!.raw.replace(/\s+/gu, ' ')).toBe(meta.studentErrors[0]!.written);
    expect(createHash('sha256').update(await readFile(join(folder, 'work.json'))).digest('hex')).toBe(meta.handwritingHashes['work.json']);
    const comparison = compareWork(oracleWork(spec, work, lines), { ...work, lines });
    expect(comparison).toMatchObject({ completeCorrect: true, verdictCorrect: true, struckAsContent: 0, silentFalseCorrect: false, silentFalseWrongParse: false, silentFalseWrongReading: false, proseAsUnchecked: 0 });
    const claimed = new Set(Object.values(work.lineOf).flat());
    expect(work.prose).toEqual(lines.filter((l) => l.region === 'solution' && !l.struck && !claimed.has(l.index)).map((l) => l.index));
    for (const index of work.prose!) expect(hasGradingContent(lines[index]!.text, spec)).toBe(false);
    expect(work.claims.length).toBeGreaterThan(0);
    if (spec.task.type === 'shortest_path') {
      expect(work.claims.filter((c) => c.type === 'dijkstra_select').map((c) => c.v)).toEqual(['A', 'B', 'C', 'D']);
      expect(work.claims.some((c) => c.type === 'dijkstra_label')).toBe(true);
      expect(lines.some((l) => l.text.startsWith('Cập nhật nhãn')) ? Object.values(work.lineOf).flat().includes(lines.findIndex((l) => l.text.startsWith('Cập nhật nhãn'))) : false).toBe(false);
    }
  });
  it('keeps all 60 source fixtures across separate wording families and four deterministic noise variants', async () => {
    const manifest = await readJson(join(root, 'testdata/work-text/manifest.json')) as WorkSampleMeta[];
    const confusions = await readJson(join(root, 'testdata/work-text/confusions.json')) as ConfusionTable;
    expect(manifest).toHaveLength(60 * families.length * 4); expect(new Set(manifest.map((m) => m.id)).size).toBe(60 * families.length * 4);
    expect(new Set(manifest.map((m) => m.coreFixture)).size).toBe(60);
    expect(new Set(manifest.filter((m) => m.split === 'dev').map((m) => m.family))).toEqual(new Set(devFamilies.map((f) => f.id)));
    expect(new Set(manifest.filter((m) => m.split === 'test').map((m) => m.family))).toEqual(new Set(testFamilies.map((f) => f.id)));
    let changed = 0; let accents = 0; let fallbacks = 0;
    for (const fixture of [...new Set(manifest.map((m) => m.coreFixture))]) {
      const folder = join(root, 'testdata/core', fixture);
      const spec = await readJson(join(folder, 'spec.json')) as ProblemSpec;
      const claims = await readJson(join(folder, 'claims.json')) as Claim[];
      for (const family of families) {
        const clean = renderClaims(claims, spec, family, family.split === 'dev' ? devFamilies[0] : testFamilies[0]);
        if (clean.tableFallback) fallbacks++;
        const earlierSelections = new Set<string>();
        for (const line of clean.lines.filter((l) => l.region === 'table' && l.index !== 0)) {
          const [selected, ...cells] = line.text.split(' ');
          for (const [column, cell] of cells.entries()) if (cell === '-') expect(earlierSelections.has(spec.graph.vertices[column]!.id)).toBe(true);
          const selection = clean.claims.find((c) => c.type === 'dijkstra_select' && clean.lineOf[String(c.step)]!.includes(line.index));
          expect(selection).toBeDefined();
          if (selection?.type === 'dijkstra_select') earlierSelections.add(selection.v);
          expect(selected).toBe(spec.graph.vertices.find((v) => selection?.type === 'dijkstra_select' && v.id === selection.v)?.label);
        }
        for (const meta of manifest.filter((m) => m.coreFixture === fixture && m.family === family.id)) {
          const directory = join(root, 'testdata/work-text', meta.split, meta.id);
          const lines = await readJson(join(directory, 'lines.json')) as WorkLine[];
          const work = await readJson(join(directory, 'work.json')) as WorkTruth;
          expect(await readdir(directory)).toEqual(['lines.json', 'vocab.json', 'work.json']);
          expect(lines).toEqual(noisyLines(clean.lines, meta.variant, meta.seed, confusions, meta.noiseEngine));
          expect(work.claims.map(claimKey)).toEqual(clean.claims.map(claimKey));
          expect(work.claims.map((c) => c.conf)).toEqual(claims.map((c) => c.conf));
          const expected = grade(spec, clean.claims);
          expect(work.expected.verdict).toBe(expected.verdict);
          expect(work.expected.firstErrorStep).toBe(expected.firstErrorStep ?? null);
          expect(work.expected.errorCode).toBe(expected.errorCode ?? null);
          expect(await readJson(join(directory, 'vocab.json')) as WorkVocabulary).toEqual(vocabularyOf(spec));
          expect(() => validateWork(spec, work, clean.lines, true)).not.toThrow();
          if (meta.variant === 'c') changed += lines.filter((l, i) => l.text !== clean.lines[i]!.text).length;
          if (meta.variant === 'b') accents += lines.filter((l, i) => l.text !== clean.lines[i]!.text).length;
          expect(meta.tableFallback).toBe(clean.tableFallback);
          expect(work.prose).toEqual([]);
          for (const [i, line] of lines.entries()) {
            expect(line.charConf).toHaveLength([...line.text.normalize('NFC')].length);
            expect(line.charConf!.every((c) => Number.isFinite(c) && c >= 0 && c < 1)).toBe(true);
            expect(line.conf).toBe(line.charConf!.length ? Math.min(...line.charConf!) : 0);
            if (meta.variant === 'a') expect(line.conf).toBeGreaterThanOrEqual(0.85);
            expect(new Set(line.alternatives).size).toBe(line.alternatives.length);
            expect(line.alternatives).not.toContain(line.text);
            if (meta.variant === 'd' && line.text !== clean.lines[i]!.text) expect(line.alternatives.slice(0, 2)).toContain(clean.lines[i]!.text);
          }
          expect(compareWork(oracleWork(spec, work, lines), { ...work, lines }).completeCorrect).toBe(true);
        }
      }
    }
    expect(changed).toBeGreaterThan(100); expect(accents).toBeGreaterThan(100); expect(fallbacks).toBeGreaterThan(0);
  }, 30000);
  it('records measured B/C character substitutions, insertions and deletions with reproducible provenance', async () => {
    const table = await readJson(join(root, 'testdata/work-text/confusions.json')) as ConfusionTable;
    expect(table.sources.map((s) => [s.engine, s.pages])).toEqual([['B', 36], ['C', 40]]);
    expect(table.sources[0]!.failedIds).toHaveLength(4);
    for (const source of table.sources) {
      expect(source.sha256).toMatch(/^[a-f0-9]{64}$/);
      const measured = table.engines[source.engine];
      expect(measured.confusions.reduce((n, c) => n + c.count, 0)).toBe(source.edits);
      expect(Object.values(measured.occurrences).reduce((n, c) => n + c, 0)).toBe(source.referenceCharacters);
      expect(measured.confusions.some((c) => c.from && c.to)).toBe(true);
      expect(measured.confusions.some((c) => !c.from)).toBe(true);
      expect(measured.confusions.some((c) => !c.to)).toBe(true);
    }
    for (const source of table.sources) expect(source.referenceSha256).toMatch(/^[a-f0-9]{64}$/);
    const c = table.sources.find((s) => s.engine === 'C')!;
    expect(createHash('sha256').update(await readFile(join(root, c.report!))).digest('hex')).toBe(c.reportSha256);
    expect(characterEdits('Ađ2', 'Ab2x')).toEqual([{ from: 'đ', to: 'b' }, { from: '', to: 'x' }]);
    expect(characterEdits('v₁', 'v')).toEqual([{ from: '₁', to: '' }]);
  });
  it('measures engine-specific silent confidence rates and generates both low and silent noise deterministically', async () => {
    const table = await readJson(join(root, 'testdata/work-text/confusions.json')) as ConfusionTable;
    const lines: WorkLine[] = Array.from({ length: 1000 }, (_, index) => ({ text: 'A', conf: 1, alternatives: [], page: 0, index }));
    for (const engine of ['B', 'C'] as const) {
      const c = table.confidence.engines[engine];
      expect(c.silentRate).toBe(c.wrongHighLines / c.wrongLines);
      expect(c.correctHigh.every((v) => v >= 0.85 && v < 1)).toBe(true);
      expect(c.wrongHigh).toHaveLength(c.wrongHighLines);
      expect(c.wrongLow.length + c.wrongHigh.length).toBe(c.wrongLines);
      const controlled = { ...table, engines: { ...table.engines, [engine]: { occurrences: { A: 1 }, confusions: [{ from: 'A', to: 'B', count: 1 }] } } };
      const generated = noisyLines(lines, 'c', 123, controlled, engine);
      expect(generated).toEqual(noisyLines(lines, 'c', 123, controlled, engine));
      expect(generated.every((l) => l.text === 'B')).toBe(true);
      expect(generated.filter((l) => l.conf >= 0.85).length / generated.length).toBeCloseTo(c.silentRate, 1);
      expect(generated.some((l) => l.conf < 0.85)).toBe(true);
      expect(generated.some((l) => l.conf >= 0.85)).toBe(true);
      const deletion = { ...controlled, engines: { ...controlled.engines, [engine]: { occurrences: { A: 1 }, confusions: [{ from: 'A', to: '', count: 1 }] } } };
      expect(noisyLines(lines.slice(0, 1), 'c', 123, deletion, engine)[0]).toMatchObject({ text: '', charConf: [], conf: 0 });
    }
  });
  it('renders complete table claims and uses minus only for selections in earlier rows', async () => {
    const spec: ProblemSpec = { graph: { directed: false, vertices: ['A', 'B', 'C'].map((id) => ({ id, label: id })), edges: [] }, task: { type: 'shortest_path', from: 'A', to: 'C' }, questionFormat: 'tu_luan' };
    const bodies = [ { type: 'dijkstra_select', v: 'A' }, { type: 'dijkstra_label', v: 'B', value: 1 }, { type: 'dijkstra_label', v: 'C', value: 2 },
      { type: 'dijkstra_select', v: 'B' }, { type: 'dijkstra_label', v: 'C', value: 2 }, { type: 'dijkstra_select', v: 'C' } ] as Claim[];
    const claims = bodies.map((c, i) => ({ ...c, step: i + 1, raw: 'source' }));
    const rendered = renderClaims(claims, spec, devFamilies[2]!, devFamilies[0]);
    expect(rendered.tableFallback).toBe(false);
    expect(rendered.lines.map((l) => l.text)).toEqual(['Chọn A B C', 'A 0 1 2', 'B - 1 2', 'C - - 2']);
    const earlier = new Set<string>();
    for (const line of rendered.lines.slice(1)) {
      const [selected, ...cells] = line.text.split(' ');
      for (const [i, cell] of cells.entries()) if (cell === '-') expect(earlier.has(spec.graph.vertices[i]!.id)).toBe(true);
      const rowClaims = rendered.claims.filter((c) => rendered.lineOf[String(c.step)]!.includes(line.index));
      expect(rowClaims[0]).toMatchObject({ type: 'dijkstra_select', v: selected });
      expect(rowClaims.filter((c) => c.type === 'dijkstra_label')).toHaveLength(cells.filter((c, i) => c !== '-' && spec.graph.vertices[i]!.id !== selected).length);
      earlier.add(selected!);
    }
    const folder = join(root, 'testdata/core/12-dijkstra-tied-order');
    const sparse = renderClaims(await readJson(join(folder, 'claims.json')) as Claim[], await readJson(join(folder, 'spec.json')) as ProblemSpec, devFamilies[2]!, devFamilies[0]);
    expect(sparse.tableFallback).toBe(true);
    expect(sparse.lines.every((l) => l.region === 'solution')).toBe(true);
  });
  it('rejects grading content in prose while allowing labels and their numeric subscripts', () => {
    const spec: ProblemSpec = { graph: { directed: false, vertices: ['A', 'B', 'S', 'v1'].map((id) => ({ id, label: id })), edges: [] }, task: { type: 'elements' }, questionFormat: 'tu_luan' };
    for (const text of ['Cập nhật nhãn S qua cạnh AS.', 'Dùng thuật toán láng giềng gần nhất.', 'Cập nhật nhãn v1 qua cạnh AB.', 'Em đi qua cạnh AA rồi AB.', 'Ghép cặp: (A, B).']) expect(hasGradingContent(text, spec)).toBe(false);
    for (const text of ['Có 2 cạnh.', 'A = B', 'A → B', 'A-B', 'Vậy liên thông.', 'KL: liên thông.', 'Đáp số vô hạn.', 'Đáp án A.', 'a) Đ', 'b) S', 'Chọn A.']) expect(hasGradingContent(text, spec)).toBe(true);
    const prose: WorkLine[] = [{ text: 'Có 2 cạnh.', region: 'solution', index: 0, page: 0, conf: 1, alternatives: [] }];
    const work: WorkTruth = { claims: [], lineOf: {}, prose: [0], expected: { verdict: 'KHONG_DU_CAN_CU' } };
    expect(() => validateWork(spec, work, prose, true)).toThrow();
    const { prose: _prose, ...withoutProse } = work;
    expect(() => validateWork(spec, withoutProse, [], true)).toThrow();
    expect(() => validateWork(spec, withoutProse, [])).not.toThrow();
  });
  it('writes multi-edge postman duplicate paths with the same vertex order as their claims', () => {
    const spec: ProblemSpec = { graph: { directed: false, vertices: ['A', 'B', 'C', 'D'].map((id) => ({ id, label: id })),
      edges: [{ id: 'ab', u: 'A', v: 'B', w: 1 }, { id: 'bc', u: 'B', v: 'C', w: 1 }, { id: 'cd', u: 'C', v: 'D', w: 1 }] }, task: { type: 'postman', start: 'A' }, questionFormat: 'tu_luan' };
    for (const incorrect of [false, true]) {
      const solution = handwritingSolution(spec, incorrect);
      expect(solution.prose[2]).toBe('Lặp lại đường A → B → C → D.');
      expect(solution.proseClaims[2]).toEqual([{ type: 'postman_duplicate', vertices: ['A', 'B', 'C', 'D'] }]);
    }
  });
  it('covers the five added claims in every wording family without adding them to source core data', async () => {
    const spec = (await loadCases(join(root, 'testdata/images-synthetic-hw'), 1))[0]!.truth;
    for (const body of [{ type: 'vertex_list', vertices: ['A', 'B'] }, { type: 'edge_list', edges: [{ u: 'A', v: 'B' }] }, { type: 'loop_count', value: 1 }, { type: 'odd_count', value: 2 }, { type: 'component_count', value: 1 }] as Claim[])
      for (const family of families) expect(wording(body, spec, family)).toMatch(/[đĐỉốạ]/u);
  });
  it('rejects dangling, question, struck and incorrectly graded labels', () => {
    const spec: ProblemSpec = { graph: { directed: false, vertices: [], edges: [] }, task: { type: 'elements' }, questionFormat: 'tu_luan' };
    const lines: WorkLine[] = [{ index: 0, page: 0, text: 'Số đỉnh = 0.', conf: 1, alternatives: [], region: 'solution' }];
    const work: WorkTruth = { claims: [{ type: 'vertex_count', value: 0, step: 1, raw: lines[0]!.text }], lineOf: { '1': [0] }, expected: { verdict: 'DUNG' } };
    validateWork(spec, work, lines);
    for (const mutation of [ { ...work, lineOf: { '1': [9] } }, { ...work, expected: { verdict: 'SAI' as const } }, { ...work, lineOf: {} } ]) expect(() => validateWork(spec, mutation, lines)).toThrow();
    expect(() => validateWork(spec, work, [{ ...lines[0]!, struck: true }])).toThrow();
    expect(() => validateWork(spec, work, [{ ...lines[0]!, region: 'question' }])).toThrow();
    expect(() => validateWork(spec, work, [{ ...lines[0]!, box: [0, 0, 1001, 500] }])).toThrow();
  });
  it('runs oracle reports for both text splits with 100% exact claims, source lines and comparable grades', async () => {
    const temporary = await mkdtemp(join(tmpdir(), 'mathtwin-work-'));
    try {
      for (const split of ['dev', 'test']) {
        const report = await evaluateWork(['--set', 'work-text', '--lines', 'truth', '--split', split], root, '2000-01-01', {}, temporary);
        expect(report.summary.completeRate).toBe(1);
        expect(report.summary.claimMatched).toBe(report.summary.claimReference);
        expect(report.summary.sourceCorrect).toBe(report.summary.sourceMatched);
        expect(report.summary.verdictCorrect).toBe(report.summary.verdictComparable);
        expect(report.summary.firstErrorCorrect).toBe(report.summary.firstErrorReference);
        expect(report.summary.silentFalseCorrect + report.summary.silentFalseWrongParse + report.summary.silentFalseWrongReading).toBe(0);
        expect(report.summary.confirmations).toBeGreaterThan(0);
        expect(report.fixtureOnly).toBe(true);
      }
      expect((await readdir(join(temporary, 'reports'))).length).toBe(4);
      const report = await evaluateWork(['--set', 'synthetic-hw', '--lines', 'engine', 'oracle'], root, '2000-01-01', {}, temporary);
      expect(report.summary).toMatchObject({ total: 40, completeRate: 1, verdictCorrect: 40, firstErrorCorrect: 20, struckAsContent: 0 });
    } finally {
      if (!resolve(temporary).startsWith(resolve(tmpdir(), 'mathtwin-work-'))) throw new Error('Unexpected temporary path');
      await rm(temporary, { recursive: true, force: true });
    }
  }, 30000);
  it('validates CLI options and refuses empty real data and unregistered engines', async () => {
    expect(readWorkOptions(['--set', 'synthetic-hw', '--lines', 'device', 'input.json'])).toEqual({ set: 'synthetic-hw', source: 'device', file: 'input.json' });
    for (const args of [[], ['--set', 'bad', '--lines', 'truth'], ['--set', 'work-text', '--lines', 'device'], ['--set', 'real', '--lines', 'truth', '--split', 'test']]) expect(() => readWorkOptions(args)).toThrow();
    await expect(evaluateWork(['--set', 'real', '--lines', 'truth'], root, '2000-01-01')).rejects.toThrow('rỗng');
    await expect(evaluateWork(['--set', 'synthetic-hw', '--lines', 'engine', 'unknown'], root, '2000-01-01')).rejects.toThrow('Engine');
  });
});
