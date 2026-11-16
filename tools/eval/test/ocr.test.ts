import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { evaluate, readOptions, repositoryRoot } from '../src/cli.js';
import { loadCases } from '../src/dataset.js';
import { missingVietnameseChars, parseVietOcrConfig } from '@mathtwin/reader-ocr-shared';
import { loadManifest } from '../../models/src/manifest.js';
import { symbolTruthLineCount } from '../src/ocr-diagnostics.js';

const temporary: string[] = [];
afterEach(async () => {
  for (const path of temporary.splice(0)) {
    if (!resolve(path).startsWith(resolve(tmpdir(), 'mathtwin-ocr-eval-'))) throw new Error('Unsafe cleanup.');
    await rm(path, { recursive: true, force: true });
  }
});
async function dataset() {
  const root = await mkdtemp(join(tmpdir(), 'mathtwin-ocr-eval-')); temporary.push(root);
  const sample = (await loadCases(join(repositoryRoot, 'testdata/images-synthetic-hw'), 1))[0]!;
  const target = join(root, 'testdata/images-synthetic-hw', sample.id); await mkdir(target, { recursive: true });
  for (const filename of ['truth.json', 'meta.json', 'lines.json', ...sample.files]) await writeFile(join(target, filename), await readFile(join(sample.directory, filename)));
  return { root, sample };
}
it('C CLI supports only lines, defaults to one pass, and reports unsupported_mode for graph/both', () => {
  expect(readOptions(['--engine', 'offline:vietocr-onnx', '--set', 'synthetic-hw'])).toMatchObject({ engine: 'offline:vietocr-onnx', passes: 1, mode: 'lines' });
  for (const mode of ['graph', 'both']) {
    try { readOptions(['--engine', 'offline:vietocr-onnx', '--mode', mode]); throw new Error('Expected failure.'); }
    catch (error) { expect(error).toMatchObject({ code: 'unsupported_mode' }); }
  }
  expect(() => readOptions(['--engine', 'offline:vietocr-onnx', '--passes', '2'])).toThrow('một lượt');
  expect(readOptions(['--engine', 'offline:vietocr-onnx', '--dump-lines']).dumpLines).toBe(true);
  expect(() => readOptions(['--engine', 'fake', '--mode', 'graph', '--dump-lines'])).toThrow('--dump-lines');
  expect(() => readOptions(['--from-device', 'fixture.json', '--dump-lines'])).toThrow('--dump-lines');
});
it('C evaluation consumes pixel reader output, writes safe Windows filenames and closes reader', async () => {
  const { root, sample } = await dataset();
  const close = vi.fn(async () => {});
  const readLines = vi.fn(async () => ({ lines: [{ text: 'đọc sai ự', conf: 0.4, alternatives: [] }],
    usage: { engine: 'offline:vietocr-onnx', passes: 1, latencyMs: 12, lineCount: 1, detectionMs: 3, recognitionMs: 9 } }));
  const createOcrReader = vi.fn(async () => ({ engine: 'offline:vietocr-onnx', readLines, close }));
  const result = await evaluate(['--engine', 'offline:vietocr-onnx', '--mode', 'lines', '--set', 'synthetic-hw'], root, '2026-11-16', { createOcrReader });
  expect(result.report.engine).toBe('offline:vietocr-onnx'); expect(result.report.fixtureOnly).toBe(false);
  expect(result.report.downloadBytes).toBe(99_388_430); expect(result.report.passes).toBe(1);
  expect(result.report.rows[0]).toMatchObject({ id: sample.id, usage: { lineCount: 1, detectionMs: 3, recognitionMs: 9 } });
  expect(result.report.summary.textByPass['1']!.cer.errors).toBeGreaterThan(0);
  expect(result.report.unsupportedSymbols).toEqual(['→', '×', '∞', '≥', '≤', '≠']);
  expect(result.report.summary.unsupportedSymbolTruthLines).toBe(sample.lines!.filter((line) => !line.struck && /[→×∞≥≤≠]/u.test(line.text ?? '')).length);
  expect(result.report.summary.truncatedLines).toBe(0);
  expect(result.basename).not.toContain(':');
  expect(JSON.parse(await readFile(join(root, 'reports', `${result.basename}.json`), 'utf8'))).toEqual(result.report);
  expect(close).toHaveBeenCalledOnce(); expect(readLines).toHaveBeenCalledOnce();
  const call = readLines.mock.calls[0] as unknown[];
  expect(call).toHaveLength(1); // No truth or answer is sent to recognition.
  expect(call[0]).toEqual(expect.arrayContaining([expect.objectContaining({ pixels: expect.any(Uint8ClampedArray) })]));
  expect(await readdir(join(root, 'reports'))).not.toContain('.debug');
});
it('reports truncated counts and unsupported-symbol truth lines without altering the truth or omitting their errors', async () => {
  const { root, sample } = await dataset();
  const truthLines = [{ text: 'A → B × 2', region: 'solution' }, { text: 'D ≥ 3 và D ≠ ∞', region: 'solution' }, { text: 'cạnh AB', region: 'question' },
    { text: 'bỏ dòng ≤ 4', region: 'solution', struck: true }];
  const path = join(root, 'testdata/images-synthetic-hw', sample.id, 'lines.json');
  const content = `${JSON.stringify(truthLines)}\n`; await writeFile(path, content);
  const lines = [{ text: 'A B', conf: 0, alternatives: [], truncated: true, box: [10, 20, 80, 40] as [number, number, number, number] },
    { text: 'D 3', conf: 0.4, alternatives: [] }, { text: 'cạnh AB', conf: 0.9, alternatives: [] }];
  const { report, basename } = await evaluate(['--engine', 'offline:vietocr-onnx', '--set', 'synthetic-hw', '--dump-lines'], root, '2026-11-16', {
    createOcrReader: async () => ({ engine: 'offline:vietocr-onnx', close: async () => {}, readLines: async () => ({ lines, usage: { engine: 'offline:vietocr-onnx', passes: 1, latencyMs: 1 } }) }),
  });
  expect(report.summary).toMatchObject({ truncatedLines: 1, unsupportedSymbolTruthLines: 2, failedImages: [] });
  expect(report.groups.synthetic_handwriting).toMatchObject({ truncatedLines: 1, unsupportedSymbolTruthLines: 2 });
  expect(report.summary.textByPass['1']!.cer.errors).toBeGreaterThan(0);
  expect(report.summary.textByPass['1']!.referenceLines).toBe(3);
  expect(await readFile(path, 'utf8')).toBe(content);
  const markdown = await readFile(join(root, 'reports', `${basename}.md`), 'utf8');
  expect(markdown).toContain('Dòng truth chứa ký hiệu ngoài từ vựng'); expect(markdown).toContain('| all | 1 | 2 |');
  const dumped: unknown = JSON.parse(await readFile(join(root, 'reports/.debug', `${basename}-synthetic-hw.json`), 'utf8'));
  expect(dumped).toEqual([{ id: sample.id, pass: 1, box: [10, 20, 80, 40], text: 'A B', conf: 0, truncated: true },
    { id: sample.id, pass: 1, text: 'D 3', conf: 0.4 }, { id: sample.id, pass: 1, text: 'cạnh AB', conf: 0.9 }]);
  const ignore = await readFile(join(repositoryRoot, '.gitignore'), 'utf8'); expect(ignore.split(/\r?\n/)).toContain('/reports/.debug/');
});
it('counts missing-symbol truth lines once each, excluding struck and unreadable truth', () => {
  expect(symbolTruthLineCount([{ text: 'A → B × 2', region: 'solution' }, { text: 'A → B', region: 'figure' },
    { text: '∞', struck: true, region: 'table' }, { text: null, struck: true, region: 'solution' }], ['→', '×', '∞'])).toBe(2);
});
it('C read failures remain in metrics as missing text and close releases the runtime', async () => {
  const { root } = await dataset(), close = vi.fn(async () => {});
  const result = await evaluate(['--engine', 'offline:vietocr-onnx', '--set', 'synthetic-hw'], root, '2026-11-16', {
    createOcrReader: async () => ({ engine: 'offline:vietocr-onnx', close, readLines: async () => { throw Object.assign(new Error('No probabilities.'), { code: 'missing_log_probs' }); } }),
  });
  expect(result.report.summary.failedImages).toEqual([expect.objectContaining({ code: 'missing_log_probs' })]);
  expect(result.report.summary.textByPass['1']!.cer.rate).toBe(1); expect(result.report.summary.textByPass['1']!.lineRecall).toBe(0);
  expect(result.report.summary.unsupportedSymbolTruthLines).toBeGreaterThanOrEqual(0);
  expect(close).toHaveBeenCalledOnce();
});
it('pins all four C files and distinguishes conversion license from original weights status', async () => {
  const files = (await loadManifest()).filter((file) => file.model === 'c');
  expect(files).toHaveLength(4); expect(files.reduce((sum, file) => sum + file.bytes, 0)).toBe(99_388_430);
  for (const file of files) { expect(file.revision).toBe('ocr-v1'); expect(file.note).toContain('Third-party'); }
  expect(files.filter((file) => file.filename.startsWith('vietocr_')).every((file) => file.licenseStatus === 'weights-unverified')).toBe(true);
  const config = parseVietOcrConfig(JSON.parse(await readFile(join(repositoryRoot, 'tools/models/config/vietocr.json'), 'utf8')) as unknown);
  expect(missingVietnameseChars(config.vocab)).toEqual([]);
});
