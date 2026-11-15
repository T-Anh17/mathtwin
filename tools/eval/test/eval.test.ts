import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { validateSpec } from '@mathtwin/core';
import { compareRead, readProblem } from '@mathtwin/reader';
import { evaluate, readOptions, repositoryRoot } from '../src/cli.js';
import { checkedTruth, loadCases, prepareImages, readJson } from '../src/dataset.js';
import { fakeReader } from '../src/fake-reader.js';
import { makeReport, percentile, renderReport } from '../src/report.js';
import type { EvaluationRow } from '../src/report.js';
import { buildSyntheticCase, syntheticFixtures, variants } from '../src/synthetic.js';

const temporary: string[] = [];
afterEach(async () => { for (const path of temporary.splice(0)) await rm(path, { recursive: true, force: true }); });
async function temporaryRoot(): Promise<string> { const path = await mkdtemp(join(tmpdir(), 'mathtwin-eval-')); temporary.push(path); return path; }

describe('stored synthetic corpus provenance', () => {
  it('contains 50 valid labeled cases with all four question formats and no fabricated real images', async () => {
    const cases = await loadCases(join(repositoryRoot, 'testdata/images-synthetic'));
    expect(cases).toHaveLength(50);
    expect(new Set(cases.map((c) => c.truth.questionFormat)).size).toBe(4);
    expect(cases.every((c) => c.meta.synthetic && validateSpec(c.truth).ok && !Object.hasOwn(c.truth, 'uncertain'))).toBe(true);
  });
  it.each(syntheticFixtures.flatMap((fixture) => variants.map((variant) => ({ fixture, variant }))))('$fixture/$variant uses the rendered graph as its truth', async ({ fixture, variant }) => {
    const input = checkedTruth(await readJson(join(repositoryRoot, 'testdata/core', fixture, 'spec.json')), fixture);
    const directory = join(repositoryRoot, 'testdata/images-synthetic', `${fixture}-${variant}`);
    const { truth, svg } = buildSyntheticCase(input, variant);
    expect(await readJson(join(directory, 'truth.json'))).toEqual(truth);
    expect(await readFile(join(directory, 'source.svg'), 'utf8')).toBe(svg);
    expect((svg.match(/<path /g) ?? []).length).toBe(truth.graph.edges.length);
    expect((svg.match(/<circle /g) ?? []).length).toBe(truth.graph.vertices.length);
    const meta = (await loadCases(join(repositoryRoot, 'testdata/images-synthetic'))).find((c) => c.directory === directory)!.meta;
    const png = await readFile(join(directory, '1.png'));
    // Hashes recorded by the generator tie the stored raster and SVG to the same generation.
    // Re-rendering text here would make tests depend on the host's installed fonts.
    expect(meta.artifactHashes).toEqual({ svgSha256: createHash('sha256').update(svg).digest('hex'),
      pngSha256: createHash('sha256').update(png).digest('hex') });
    const image = await sharp(png).metadata();
    expect(image.format).toBe('png');
    expect(image.width).toBe(variant === 'low-resolution' ? 360 : variant === 'tilted' ? 1060 : 1000);
    expect(image.height).toBeGreaterThan(0);
    const outcome = await readProblem([{ pixels: new Uint8ClampedArray([0, 0, 0, 255]), width: 1, height: 1 }], { reader: fakeReader(truth) });
    expect(compareRead(outcome, truth).completeCorrect).toBe(true);
  }, 20000);
});

describe('evaluation CLI and data boundary', () => {
  it('accepts documented flags and rejects unsupported engines and invalid limits/passes', () => {
    expect(readOptions(['--engine', 'fake'])).toMatchObject({ engine: 'fake', set: 'synthetic', passes: 2, mode: 'graph', threshold: 0.85 });
    expect(readOptions(['--engine', 'fake', '--passes', '1', '--set', 'real', '--limit', '2', '--confirm'])).toMatchObject({ engine: 'fake', set: 'real', passes: 1, limit: 2 });
    for (const args of [['--engine', 'cloud'], ['--engine', 'model', '--confirm'], ['--engine', 'fake', '--passes', '3'],
      ['--engine', 'fake', '--limit', '0'], ['--engine', 'fake', '--limit', '2.5'], ['--engine', 'fake', '--set', 'other'], []]) expect(() => readOptions(args)).toThrow();
  });
  it('writes Markdown and JSON with graph-only metrics, respects limit and pass count', async () => {
    const root = await temporaryRoot();
    const directory = join(root, 'testdata/images-synthetic/01-case'); await mkdir(directory, { recursive: true });
    const sample = (await loadCases(join(repositoryRoot, 'testdata/images-synthetic'), 1))[0]!;
    for (const file of ['truth.json', 'meta.json', '1.png']) await writeFile(join(directory, file), await readFile(join(sample.directory, file)));
    const { report, basename, reportDirectory } = await evaluate(['--engine', 'fake', '--limit', '1', '--passes', '1'], root, '2026-11-15');
    expect(report).toMatchObject({ fixtureOnly: true, downloadBytes: 0, phoneMeasurements: null, passes: 1,
      summary: { total: 1, fullyFlagged: 0, completeRate: 1, graphRate: 1, silentErrors: [], graphSilentErrors: [],
        coverage: { precise: 0, coarse: 0, none: 0 } } });
    expect(reportDirectory).toBe('reports/.fake');
    expect(await readdir(join(root, 'reports'))).toEqual(['.fake']);
    expect(await readJson(join(root, reportDirectory, `${basename}.json`))).toEqual(report);
    const markdown = await readFile(join(root, reportDirectory, `${basename}.md`), 'utf8');
    expect(markdown).toContain('không đọc pixel');
    expect(markdown).toContain('Sai thầm lặng chỉ đồ thị');
    expect(markdown).toContain('| Nhóm | precise | coarse | none |');
    const ignore = await readFile(join(repositoryRoot, '.gitignore'), 'utf8');
    expect(ignore.split(/\r?\n/)).toContain('/reports/.fake/');
  });
  it('validates truth and metadata and loads multiple images in numeric page order', async () => {
    const root = await temporaryRoot(); const directory = join(root, '01-case'); await mkdir(directory);
    const sample = (await loadCases(join(repositoryRoot, 'testdata/images-synthetic'), 1))[0]!;
    await writeFile(join(directory, 'truth.json'), JSON.stringify(sample.truth));
    await writeFile(join(directory, 'meta.json'), JSON.stringify({ ...sample.meta, synthetic: false }));
    await sharp({ create: { width: 2, height: 3, channels: 3, background: 'white' } }).jpeg().toFile(join(directory, '1.jpg'));
    await sharp({ create: { width: 4, height: 5, channels: 3, background: 'black' } }).png().toFile(join(directory, '2.png'));
    const loaded = (await loadCases(root))[0]!; expect(loaded.files).toEqual(['1.jpg', '2.png']);
    const prepared = await prepareImages(loaded);
    expect(prepared.map((p) => [p.width, p.height, p.pixels.length])).toEqual([[2, 3, 24], [4, 5, 80]]);
    await writeFile(join(directory, 'truth.json'), JSON.stringify({ ...sample.truth, uncertain: [] }));
    await expect(loadCases(root)).rejects.toThrow('truth.json');
    await writeFile(join(directory, 'truth.json'), JSON.stringify(sample.truth));
    await writeFile(join(directory, 'meta.json'), JSON.stringify({ ...sample.meta, questionFormat: 'invalid' }));
    await expect(loadCases(root)).rejects.toThrow('meta.json');
  });
  it('rejects an empty dataset without emitting a successful zero-sample report', async () => {
    const root = await temporaryRoot(); await mkdir(join(root, 'testdata/images'), { recursive: true });
    await expect(evaluate(['--engine', 'fake', '--set', 'real'], root)).rejects.toThrow('Chưa có ảnh');
  });
});

describe('report aggregation', () => {
  it('uses incorrect samples as the flagged denominator, lists silent ids and separates overlapping groups', () => {
    const base: EvaluationRow = { id: 'ok', meta: { source: 'printed', capture: 'straight', blurred: false, synthetic: true, notes: '', questionFormat: 'tu_luan' },
      usage: { engine: 'fake', passes: 2, latencyMs: 4 }, nodeLatencyMs: 10, issueCodes: [],
      comparison: { completeCorrect: true, graphCorrect: true, fullyFlagged: true, silentError: false, graphSilentError: false,
        coverage: { precise: 0, coarse: 0, none: 0 }, extraFlags: 1, differences: [], errorCounts: {} } };
    const flagged: EvaluationRow = { ...structuredClone(base), id: 'blocked', meta: { ...base.meta, capture: 'tilted', blurred: true }, nodeLatencyMs: 20,
      comparison: { ...base.comparison!, completeCorrect: false, fullyFlagged: true, coverage: { precise: 1, coarse: 1, none: 0 } } };
    const silent: EvaluationRow = { ...structuredClone(base), id: 'silent', nodeLatencyMs: 30,
      comparison: { ...base.comparison!, completeCorrect: false, graphCorrect: false, fullyFlagged: false, silentError: true, graphSilentError: true,
        coverage: { precise: 0, coarse: 0, none: 1 }, errorCounts: { weight: 1 } } };
    const questionOnly: EvaluationRow = { ...structuredClone(base), id: 'question-only', nodeLatencyMs: 40,
      comparison: { ...base.comparison!, completeCorrect: false, fullyFlagged: false, silentError: true,
        coverage: { precise: 0, coarse: 0, none: 1 }, errorCounts: { question_format: 1 } } };
    const report = makeReport('fake', 'synthetic', 2, '2026-11-15', [base, flagged, silent, questionOnly]);
    expect(report.summary).toMatchObject({ total: 4, incorrect: 3, fullyFlagged: 1, flaggedRate: 1 / 3,
      silentErrors: ['silent', 'question-only'], graphSilentErrors: ['silent'], coverage: { precise: 1, coarse: 1, none: 2 },
      extraFlagsPerProblem: 1, nodeLatencyMs: { p50: 20, p90: 40 }, errors: { weight: 1, question_format: 1 } });
    expect(report.groups.tilted.total).toBe(1); expect(report.groups.blurred.total).toBe(1);
    expect(report.groups.tilted.coverage).toEqual({ precise: 1, coarse: 1, none: 0 });
    expect(report.groups.handwritten.completeRate).toBeNull();
    const markdown = renderReport(report);
    expect(markdown).toContain('Sai thầm lặng toàn bài');
    expect(markdown).toContain('Sai thầm lặng chỉ đồ thị');
    expect(markdown).toContain('| all | 1 | 1 | 2 |');
    expect(markdown.match(/- silent/g)).toHaveLength(2);
    expect(markdown.match(/- question-only/g)).toHaveLength(1);
    expect(percentile([], 0.5)).toBeNull();
  });
});
