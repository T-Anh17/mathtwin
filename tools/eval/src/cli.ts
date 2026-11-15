import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { compareRead, compareText, readProblem } from '@mathtwin/reader';
import { loadCases, prepareImages, setFolders } from './dataset.js';
import type { DatasetSet } from './dataset.js';
import { evaluateDevice } from './device.js';
import { fakeReader } from './fake-reader.js';
import { makeReport, renderReport } from './report.js';
import type { EvaluationRow } from './report.js';

export const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export function readOptions(args: string[]) {
  const { values } = parseArgs({ args, options: { engine: { type: 'string' }, passes: { type: 'string', default: '2' },
    set: { type: 'string' }, mode: { type: 'string' }, 'from-device': { type: 'string' }, threshold: { type: 'string', default: '0.85' },
    limit: { type: 'string' }, confirm: { type: 'boolean', default: false } } });
  if (values['from-device'] ? values.engine !== undefined || args.includes('--passes') || args.some((a) => a.startsWith('--passes=')) : values.engine !== 'fake') throw new Error('Chọn --engine fake hoặc --from-device; cấu hình thiết bị lấy từ file.');
  if (values.passes !== '1' && values.passes !== '2') throw new Error('--passes phải là 1 hoặc 2.');
  if (values.set !== undefined && !Object.hasOwn(setFolders, values.set)) throw new Error('--set phải là synthetic, synthetic-hw hoặc real.');
  const mode = values.mode ?? (values['from-device'] ? 'both' : 'graph');
  if (mode !== 'graph' && mode !== 'lines' && mode !== 'both') throw new Error('--mode phải là graph, lines hoặc both.');
  const threshold = Number(values.threshold);
  if (!values.threshold?.trim() || !Number.isFinite(threshold) || threshold < 0 || threshold > 1) throw new Error('--threshold phải nằm trong [0,1].');
  if (values.limit !== undefined && (!/^[1-9]\d*$/.test(values.limit) || !Number.isSafeInteger(Number(values.limit)))) throw new Error('--limit phải là số nguyên dương.');
  return { engine: values.engine, passes: Number(values.passes) as 1 | 2, set: (values.set ?? 'synthetic') as DatasetSet, mode: mode as 'graph' | 'lines' | 'both', threshold,
    ...(values['from-device'] === undefined ? {} : { fromDevice: values['from-device'] }), explicitSet: values.set !== undefined,
    ...(values.limit === undefined ? {} : { limit: Number(values.limit) }) };
}
export async function evaluate(args: string[], root = repositoryRoot, date = new Date().toISOString().slice(0, 10)) {
  const options = readOptions(args);
  if (options.fromDevice) throw new Error('Dùng evaluateDevice cho file thiết bị.');
  const cases = await loadCases(join(root, 'testdata', setFolders[options.set]), options.limit);
  if (cases.length === 0) throw new Error('Chưa có ảnh đã gán nhãn trong bộ dữ liệu được chọn.');
  if (cases.some((sample) => sample.meta.synthetic !== (options.set !== 'real'))) throw new Error('Nguồn ảnh không khớp --set.');
  const rows: EvaluationRow[] = [];
  for (const sample of cases) {
    const images = await prepareImages(sample);
    const reader = fakeReader(sample.truth);
    const start = performance.now();
    const outcome = options.mode === 'lines' ? undefined : await readProblem(images, { reader, passes: options.passes });
    const nodeLatencyMs = performance.now() - start;
    if (options.mode !== 'graph' && !sample.lines) throw new Error('Đánh giá chữ cần lines.json cho từng đề.');
    rows.push({ id: sample.id, meta: sample.meta, ...(outcome ? { comparison: compareRead(outcome, sample.truth) } : {}),
      usage: outcome?.usage ?? { engine: 'fake', passes: options.passes, latencyMs: 0 }, nodeLatencyMs,
      issueCodes: outcome?.issues.map((issue) => issue.code) ?? [],
      ...(options.mode === 'graph' ? {} : { textComparisons: Array.from({ length: options.passes }, () => compareText(sample.lines!.flatMap((line) => line.struck ? [] : [{ ...line, text: line.text!, conf: 1, alternatives: [] }]), sample.lines!, sample.truth.graph.vertices.map((v) => v.label), options.threshold)) }) });
  }
  const report = makeReport('fake', options.set, options.passes, date, rows, { mode: options.mode });
  const reportDirectory = options.engine === 'fake' ? 'reports/.fake' : 'reports';
  const directory = join(root, reportDirectory); await mkdir(directory, { recursive: true });
  const basename = `read-eval-${options.engine}-${date}`;
  await writeFile(join(directory, `${basename}.json`), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(directory, `${basename}.md`), renderReport(report));
  return { report, basename, reportDirectory };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const run = async (): Promise<void> => {
    const args = process.argv.slice(2); const options = readOptions(args);
    console.log('Dung lượng model sẽ tải: 0 byte.');
    const results = options.fromDevice ? await evaluateDevice(resolve(options.fromDevice), repositoryRoot, new Date().toISOString().slice(0, 10), {
      mode: options.mode, threshold: options.threshold, ...(options.explicitSet ? { set: options.set } : {}), ...(options.limit ? { limit: options.limit } : {}) }) : [await evaluate(args)];
    for (const { report, basename, reportDirectory } of results) console.log(`Đã đánh giá ${report.summary.evaluatedImages} ảnh. Báo cáo: ${reportDirectory}/${basename}.md và .json`);
  };
  run().catch(() => { console.error('Không thể đánh giá: kiểm tra tham số, id, cấu hình và nhãn theo tools/eval/README.md.'); process.exitCode = 1; });
}
