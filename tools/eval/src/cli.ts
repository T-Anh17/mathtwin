import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { compareRead, compareText, readProblem, ocrMessages } from '@mathtwin/reader';
import type { TextReader } from '@mathtwin/reader';
import { loadCases, prepareImages, setFolders } from './dataset.js';
import type { DatasetSet } from './dataset.js';
import { evaluateDevice } from './device.js';
import { evaluateFigure } from './figure-eval.js';
import { fakeReader } from './fake-reader.js';
import { makeReport, renderReport } from './report.js';
import type { EvaluationRow } from './report.js';
import { debugLines, loadUnsupportedSymbols, symbolTruthLineCount, truncatedLineCount } from './ocr-diagnostics.js';

export const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export function readOptions(args: string[]) {
  const { values } = parseArgs({ args, options: { engine: { type: 'string' }, passes: { type: 'string', default: '2' },
    glyph: { type: 'string' }, geometry: { type: 'string' }, 'llama-server': { type: 'string' }, set: { type: 'string' }, mode: { type: 'string' }, 'from-device': { type: 'string' }, threshold: { type: 'string', default: '0.85' },
    limit: { type: 'string' }, split: { type: 'string' }, confirm: { type: 'boolean', default: false }, 'dump-lines': { type: 'boolean', default: false } } });
  if (values['from-device'] ? values.engine !== undefined || args.includes('--passes') || args.some((a) => a.startsWith('--passes=')) : !['fake', 'offline:vietocr-onnx', 'offline:figure-cv'].includes(values.engine ?? '')) throw new Error('Chọn --engine fake, offline:vietocr-onnx hoặc --from-device; cấu hình thiết bị lấy từ file.');
  if (values.passes !== '1' && values.passes !== '2') throw new Error('--passes phải là 1 hoặc 2.');
  if (values.set !== undefined && !Object.hasOwn(setFolders, values.set)) throw new Error('--set phải là synthetic, synthetic-hw, synthetic-fig hoặc real.');
  if (values.split !== undefined && (!['dev', 'test'].includes(values.split) || values.set !== 'synthetic-fig')) throw new Error('--split dev|test cần --set synthetic-fig.');
  const figure = values.engine === 'offline:figure-cv';
  if (figure && (values.set !== 'synthetic-fig' || !['oracle', 'c', 'b'].includes(values.glyph ?? ''))) throw new Error('D requires --set synthetic-fig --glyph oracle|c|b.');
  if (values.geometry !== undefined && (!figure || values.geometry !== 'oracle' || values.glyph !== 'oracle' || values.split !== 'dev')) throw new Error('--geometry oracle requires D, --glyph oracle and --split dev.');
  if (figure && !values.split) throw new Error('D requires an explicit --split dev|test.');
  if (!figure && (values.glyph || values['llama-server'])) throw new Error('--glyph/--llama-server requires D.');
  if (figure && (values.mode && values.mode !== 'graph' || values['dump-lines'] || (args.some(a => a === '--passes' || a.startsWith('--passes=')) && values.passes !== '1'))) throw new Error('D uses graph mode, one pass.');
  if (values['llama-server'] && values.glyph !== 'b') throw new Error('--llama-server requires --glyph b.');
  const mode = values.mode ?? (values['from-device'] ? 'both' : values.engine === 'offline:vietocr-onnx' ? 'lines' : 'graph');
  if (mode !== 'graph' && mode !== 'lines' && mode !== 'both') throw new Error('--mode phải là graph, lines hoặc both.');
  if (values.engine === 'offline:vietocr-onnx' && mode !== 'lines') throw Object.assign(new Error(ocrMessages.unsupported_mode), { code: 'unsupported_mode' });
  if (values['dump-lines'] && (values['from-device'] || mode === 'graph')) throw new Error('--dump-lines cần đo lines/both bằng --engine.');
  const passes = figure || values.engine === 'offline:vietocr-onnx' ? 1 : Number(values.passes) as 1 | 2;
  if (values.engine === 'offline:vietocr-onnx' && values.passes === '2' && args.some((arg) => arg === '--passes' || arg.startsWith('--passes='))) throw new Error('C chỉ có một lượt đọc; dùng --passes 1.');
  const threshold = Number(values.threshold);
  if (!values.threshold?.trim() || !Number.isFinite(threshold) || threshold < 0 || threshold > 1) throw new Error('--threshold phải nằm trong [0,1].');
  if (values.limit !== undefined && (!/^[1-9]\d*$/.test(values.limit) || !Number.isSafeInteger(Number(values.limit)))) throw new Error('--limit phải là số nguyên dương.');
  return { geometry: values.geometry as 'oracle' | undefined, glyph: values.glyph as 'oracle' | 'c' | 'b' | undefined, serverPath: values['llama-server'], engine: values.engine, passes: passes as 1 | 2, set: (values.set ?? 'synthetic') as DatasetSet, mode: mode as 'graph' | 'lines' | 'both', threshold, dumpLines: values['dump-lines'],
    ...(values.split === undefined ? {} : { split: values.split as 'dev' | 'test' }),
    ...(values['from-device'] === undefined ? {} : { fromDevice: values['from-device'] }), explicitSet: values.set !== undefined,
    ...(values.limit === undefined ? {} : { limit: Number(values.limit) }) };
}
export async function evaluate(args: string[], root = repositoryRoot, date = new Date().toISOString().slice(0, 10), deps: {
  createOcrReader?: () => Promise<TextReader & { close(): Promise<void> }>;
} = {}) {
  const options = readOptions(args);
  if (options.fromDevice) throw new Error('Dùng evaluateDevice cho file thiết bị.');
  if (options.engine === 'offline:figure-cv') return evaluateFigure(root, date, { glyph: options.glyph!, ...(options.geometry ? { geometry: options.geometry } : {}), ...(options.split ? { split: options.split } : {}), ...(options.limit ? { limit: options.limit } : {}), ...(options.serverPath ? { serverPath: resolve(options.serverPath) } : {}) });
  const cases = (await loadCases(join(root, 'testdata', setFolders[options.set]))).filter(c => options.set !== 'synthetic-fig' || c.meta.hasFigure !== false).filter((c) => !options.split || c.meta.split === options.split).slice(0, options.limit);
  if (cases.length === 0) throw new Error('Chưa có ảnh đã gán nhãn trong bộ dữ liệu được chọn.');
  if (cases.some((sample) => sample.meta.synthetic !== (options.set !== 'real'))) throw new Error('Nguồn ảnh không khớp --set.');
  const rows: EvaluationRow[] = [];
  const dumps: ReturnType<typeof debugLines> = [];
  const unsupported = options.engine === 'offline:vietocr-onnx' ? await loadUnsupportedSymbols() : undefined;
  if (options.mode !== 'graph' && cases.some((sample) => !sample.lines)) throw new Error('Đánh giá chữ cần lines.json cho từng đề.');
  const ocr = options.engine === 'offline:vietocr-onnx'
    ? await (deps.createOcrReader ?? (async () => {
      const { createNodeOcrReader } = await import('@mathtwin/reader-ocr');
      return createNodeOcrReader({ modelRoot: join(root, '.models/c') });
    }))() : undefined;
  try {
    for (const sample of cases) {
      const images = await prepareImages(sample);
      const start = performance.now();
      if (ocr) {
        const unsupportedSymbolTruthLines = symbolTruthLineCount(sample.lines!, unsupported!);
        try {
          const result = await ocr.readLines(images);
          if (options.dumpLines) dumps.push(...debugLines(sample.id, result.lines));
          rows.push({ id: sample.id, meta: sample.meta, usage: result.usage, nodeLatencyMs: performance.now() - start, issueCodes: [],
            truncatedLineCount: truncatedLineCount(result.lines), unsupportedSymbolTruthLines,
            textComparisons: [compareText(result.lines, sample.lines!, sample.truth.graph.vertices.map((v) => v.label), options.threshold)] });
        } catch (error) {
          const code = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : 'read_failed';
          rows.push({ id: sample.id, meta: sample.meta, usage: { engine: ocr.engine, passes: 1, latencyMs: performance.now() - start }, errorCode: code, issueCodes: [code],
            truncatedLineCount: 0, unsupportedSymbolTruthLines,
            textComparisons: [compareText([], sample.lines!, sample.truth.graph.vertices.map((v) => v.label), options.threshold)] });
        }
        continue;
      }
      const reader = fakeReader(sample.truth);
      const outcome = options.mode === 'lines' ? undefined : await readProblem(images, { reader, passes: options.passes });
      const nodeLatencyMs = performance.now() - start;
      rows.push({ id: sample.id, meta: sample.meta, ...(outcome ? { comparison: compareRead(outcome, sample.truth) } : {}),
        usage: outcome?.usage ?? { engine: 'fake', passes: options.passes, latencyMs: 0 }, nodeLatencyMs,
        issueCodes: outcome?.issues.map((issue) => issue.code) ?? [],
        ...(options.mode === 'graph' ? {} : { textComparisons: Array.from({ length: options.passes }, (_, pass) => {
          const lines = sample.lines!.flatMap((line) => line.struck ? [] : [{ ...line, text: line.text!, conf: 1, alternatives: [] }]);
          if (options.dumpLines) dumps.push(...debugLines(sample.id, lines, pass + 1));
          return compareText(lines, sample.lines!, sample.truth.graph.vertices.map((v) => v.label), options.threshold);
        }) }) });
    }
  } finally { await ocr?.close(); }
  const report = makeReport(options.engine!, options.set, options.passes, date, rows, { mode: options.mode,
    ...(unsupported ? { unsupportedSymbols: unsupported } : {}) });
  if (ocr) report.downloadBytes = 99_388_430;
  const reportDirectory = options.engine === 'fake' ? 'reports/.fake' : 'reports';
  const directory = join(root, reportDirectory); await mkdir(directory, { recursive: true });
  const basename = `read-eval-${options.engine!.replaceAll(':', '-')}-${date}`;
  await writeFile(join(directory, `${basename}.json`), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(directory, `${basename}.md`), renderReport(report));
  if (options.dumpLines) {
    const debugDirectory = join(root, 'reports/.debug');
    await mkdir(debugDirectory, { recursive: true });
    await writeFile(join(debugDirectory, `${basename}-${options.set}.json`), `${JSON.stringify(dumps, null, 2)}\n`);
  }
  return { report, basename, reportDirectory };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const run = async (): Promise<void> => {
    const args = process.argv.slice(2); const options = readOptions(args);
    console.log('Dung lượng model sẽ tải: 0 byte.');
    if (options.engine === 'offline:vietocr-onnx') console.log(ocrMessages.weightsWarning);
    const results = options.fromDevice ? await evaluateDevice(resolve(options.fromDevice), repositoryRoot, new Date().toISOString().slice(0, 10), {
      mode: options.mode, threshold: options.threshold, ...(options.explicitSet ? { set: options.set } : {}), ...(options.split ? { split: options.split } : {}), ...(options.limit ? { limit: options.limit } : {}) }) : [await evaluate(args)];
    for (const { report, basename, reportDirectory } of results) console.log(`Đã đánh giá ${report.summary.evaluatedImages} ảnh. Báo cáo: ${reportDirectory}/${basename}.md và .json`);
  };
  run().catch((error: unknown) => {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'unsupported_mode') console.error(`unsupported_mode: ${ocrMessages.unsupported_mode}`);
    else console.error('Không thể đánh giá: kiểm tra tham số, model cục bộ, id, cấu hình và nhãn theo tools/eval/README.md.');
    process.exitCode = 1;
  });
}
