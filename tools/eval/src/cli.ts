import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { compareRead, readProblem } from '@mathtwin/reader';
import { loadCases, prepareImages } from './dataset.js';
import { fakeReader } from './fake-reader.js';
import { makeReport, renderReport } from './report.js';
import type { EvaluationRow } from './report.js';

export const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export function readOptions(args: string[]) {
  const { values } = parseArgs({ args, options: { engine: { type: 'string' }, passes: { type: 'string', default: '2' },
    set: { type: 'string', default: 'synthetic' }, limit: { type: 'string' }, confirm: { type: 'boolean', default: false } } });
  if (values.engine !== 'fake') throw new Error('Lô 2.2 hỗ trợ --engine fake; không tải model (0 byte).');
  if (values.passes !== '1' && values.passes !== '2') throw new Error('--passes phải là 1 hoặc 2.');
  if (values.set !== 'synthetic' && values.set !== 'real') throw new Error('--set phải là synthetic hoặc real.');
  if (values.limit !== undefined && (!/^[1-9]\d*$/.test(values.limit) || !Number.isSafeInteger(Number(values.limit)))) throw new Error('--limit phải là số nguyên dương.');
  return { engine: values.engine, passes: Number(values.passes) as 1 | 2, set: values.set,
    ...(values.limit === undefined ? {} : { limit: Number(values.limit) }) };
}
export async function evaluate(args: string[], root = repositoryRoot, date = new Date().toISOString().slice(0, 10)) {
  const options = readOptions(args);
  const cases = await loadCases(join(root, 'testdata', options.set === 'synthetic' ? 'images-synthetic' : 'images'), options.limit);
  if (cases.length === 0) throw new Error('Chưa có ảnh đã gán nhãn trong bộ dữ liệu được chọn.');
  if (cases.some((sample) => sample.meta.synthetic !== (options.set === 'synthetic'))) throw new Error('Nguồn ảnh không khớp --set.');
  const rows: EvaluationRow[] = [];
  for (const sample of cases) {
    const images = await prepareImages(sample);
    const reader = fakeReader(sample.truth);
    const start = performance.now();
    const outcome = await readProblem(images, { reader, passes: options.passes });
    const nodeLatencyMs = performance.now() - start;
    rows.push({ id: sample.id, meta: sample.meta, comparison: compareRead(outcome, sample.truth),
      usage: outcome.usage, nodeLatencyMs, issueCodes: outcome.issues.map((issue) => issue.code) });
  }
  const report = makeReport(options.engine, options.set, options.passes, date, rows);
  const reportDirectory = options.engine === 'fake' ? 'reports/.fake' : 'reports';
  const directory = join(root, reportDirectory); await mkdir(directory, { recursive: true });
  const basename = `read-eval-${options.engine}-${date}`;
  await writeFile(join(directory, `${basename}.json`), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(directory, `${basename}.md`), renderReport(report));
  return { report, basename, reportDirectory };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log('Dung lượng model sẽ tải: 0 byte (reader giả; không có tải model).');
  evaluate(process.argv.slice(2)).then(({ report, basename, reportDirectory }) => {
    console.log(`Đã đánh giá ${report.summary.total} đề. Báo cáo: ${reportDirectory}/${basename}.md và .json`);
  }).catch(() => { console.error('Không thể đánh giá: kiểm tra tham số CLI và bộ dữ liệu theo tools/eval/README.md.'); process.exitCode = 1; });
}
