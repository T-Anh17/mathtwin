import { createHash } from 'node:crypto';
import { readFile, mkdir, readdir, rename, writeFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { cpus, totalmem, platform, arch } from 'node:os';
import { LlamaCppReader, LlamaCppReadError } from '@mathtwin/reader-llamacpp';
import { FigureReader, NoGlyphReader } from '@mathtwin/reader-figure';
import { readProblem, compareRead } from '@mathtwin/reader';
import type { ReadDraft, TextReader } from '@mathtwin/reader';
import type { WorkTruth } from '@mathtwin/work';
import type { Session } from '../../../apps/mobile/src/flow/types.js';
import type { Readers } from '../../../apps/mobile/src/flow/reading.js';
import { loadCases, readJson } from './dataset.js';
import type { ImageCase } from './dataset.js';
import { syntheticWorkPage } from './work-layout.js';
import type { FigureAnnotation, Point } from './figure-geometry.js';
import { validateWork } from './work-data.js';
import { runMvpSample, mvpReadComparisons, simulateProblemConfirmation, noneModeFromStoredRow } from './mvp.js';
import { checkMvpSolution } from './mvp-oracle.js';
import { graphEffort, mvpReport } from './mvp-report.js';
import type { MvpRow, MvpFailure } from './mvp-report.js';

const root = resolve(process.cwd());
const args = process.argv.slice(2);
let date = new Date().toISOString().slice(0, 10), limit = 40, rescore = false, problemRead: 'none' | 'b' = 'none';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--rescore' && !rescore) { rescore = true; continue; }
  const flag = args[i], value = args[++i];
  if (flag === '--date' && /^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) date = value!;
  else if (flag === '--limit' && Number.isSafeInteger(Number(value)) && Number(value) > 0 && Number(value) <= 40) limit = Number(value);
  else if (flag === '--problem-read' && (value === 'none' || value === 'b')) problemRead = value;
  else throw new Error('Dùng eval:mvp [--date YYYY-MM-DD] [--limit 1..40] [--rescore] [--problem-read none|b]. Chạy từ gốc repo.');
}
const config = { schema: 1, model: 'b', maxImageSide: 768, threads: 4, gpuLayers: 0, passes: 1 };
const serverPath = join(root, '.build-cache/llama-win/bin/llama-server.exe');
const baselineCache = join(root, 'reports/.debug', `mvp-${date}`);
const baselineOutput = join(root, 'reports', `mvp-eval-${date}`);
const cache = join(root, 'reports/.debug', `mvp-${date}${problemRead === 'none' ? '-none' : ''}`);
const output = join(root, 'reports', `mvp-eval-${date}${problemRead === 'none' ? '-none' : ''}`);
const atomicJson = async (path: string, value: unknown) => { await writeFile(path + '.tmp', JSON.stringify(value, null, 2) + '\n'); await rename(path + '.tmp', path); };
const machine = `${platform()} ${arch()}; ${cpus()[0]?.model ?? 'CPU'}; ${cpus().length} logical CPUs; ${(totalmem() / 2 ** 30).toFixed(1)} GiB RAM; Node ${process.version}`;
await mkdir(cache, { recursive: true });
type PreviousReport = { fingerprint: string; rescoredFrom?: string; config: unknown; identities: unknown; failures: MvpFailure[]; rows: unknown[]; planned: number };
async function rescoreBaseline(): Promise<PreviousReport> {
  const current = await readJson((problemRead === 'none' ? baselineOutput : output) + '.json') as PreviousReport;
  if (current.rows.length + current.failures.length >= current.planned) return current;
  const snapshots = await Promise.all((await readdir(problemRead === 'none' ? baselineCache : cache)).filter((name) => /^before-rescore-.*\.json$/u.test(name)).map(async (name) => {
    try { return await readJson(join(problemRead === 'none' ? baselineCache : cache, name)) as PreviousReport; } catch { return null; }
  }));
  const best = [current, ...snapshots.filter((value): value is PreviousReport => value !== null)]
    .sort((left, right) => right.rows.length + right.failures.length - left.rows.length - left.failures.length)[0]!;
  return best;
}
const previous = rescore ? await rescoreBaseline() : undefined;
// A rescore never initializes B.  Its identity is the one recorded by the
// original inference report, so an isolated worktree need not hold model files.
const identities = previous?.identities ?? await Promise.all([serverPath, join(root, '.models/b/Qwen3VL-2B-Instruct-Q4_K_M.gguf'), join(root, '.models/b/mmproj-Qwen3VL-2B-Instruct-F16.gguf')].map(async (path) => ({ path, size: (await stat(path)).size })));
const implementation = await Promise.all(['mvp.ts', 'mvp-oracle.ts', 'mvp-cli.ts', 'mvp-report.ts'].map((f) => readFile(join(root, 'tools/eval/src', f))));
const fingerprint = createHash('sha256').update(JSON.stringify({ config, identities })).update(Buffer.concat(implementation)).digest('hex');
if (previous && (JSON.stringify(previous.config) !== JSON.stringify(config) || JSON.stringify(previous.identities) !== JSON.stringify(identities)))
  throw new Error('Chỉ chấm lại OCR bằng cùng cấu hình B và cùng tệp model/server.');
if (rescore && problemRead === 'b') await atomicJson(join(cache, `before-rescore-${fingerprint.slice(0, 12)}.json`), await readJson(output + '.json'));
const llama = new LlamaCppReader({ model: 'b', serverPath, modelsDirectory: join(root, '.models'), threads: 4, gpuLayers: 0, maxImageSide: 768, timeoutMs: 420_000, readTimeout: 300_000 });
const text: TextReader = { engine: llama.engine, readLines: async (images, signal) => {
  const result = await llama.readLines(images, signal), image = images[0]!;
  return { ...result, lines: result.lines.map((l) => ({ ...l, ...(l.box ? { box: l.box.map((v, axis) => v * 1000 / (axis % 2 ? image.height : image.width)) as [number, number, number, number] } : {}) })) };
} };
const figure = new FigureReader({ glyphReader: new NoGlyphReader() });
const readers: Readers = { text, problem: async (images, signal) => {
  const outcome = await readProblem(images, { reader: llama, passes: 1, ...(signal ? { signal } : {}) });
  for (const draft of outcome.drafts) for (const v of draft.vertices) if (v.box) v.box = v.box.map((n, axis) => n * 1000 / (axis % 2 ? images[0]!.height : images[0]!.width)) as [number, number, number, number];
  return outcome;
}, figure: async (image, signal): Promise<ReadDraft> => (await figure.read([image], 'edges', signal)).draft };
const samples = await loadCases(join(root, 'testdata/images-synthetic-hw'), limit);
const rows: MvpRow[] = [], failures: MvpFailure[] = [], reusedWork = new Set<string>();
async function comparisonSection(): Promise<string> {
  if (problemRead !== 'none') return '';
  try {
    const baseline = await readJson(baselineOutput + '.json') as { rows: MvpRow[] };
    const totals = (list: MvpRow[]) => ({ form: list.reduce((n, row) => n + row.problemFormEdits, 0),
      manual: list.reduce((n, row) => n + row.effort.manualOps, 0), draft: list.reduce((n, row) => n + row.effort.draftOps, 0),
      read: list.reduce((n, row) => n + row.timings.problemRead, 0), confirmed: list.filter((row) => row.confirmedCorrect).length,
      verdict: list.filter((row) => row.comparison.verdictCorrect).length,
      total: list.reduce((n, row) => n + row.problemFormEdits + row.problemQuestions + row.workQuestions + graphEffort(row) + row.reviews, 0) });
    const none = totals(rows), b = totals(baseline.rows);
    const reused = reusedWork.size ? ` ${reusedWork.size}/${rows.length} mẫu none có fixture đổi sau checkpoint: phần bài làm (OCR, câu hỏi, soát, kết luận) và công đồ thị giữ nguyên như lượt b đã ghi; chỉ phần đề được thay bằng nhập form từ đầu theo đề đã xác nhận trong cùng checkpoint.` : '';
    return `\n\n## So sánh chế độ đọc đề\n\n| Chế độ | Công nhập form | Công đồ thị tự nhập | Công nháp D | Thời gian B đọc đề (ms) | Đề xác nhận khớp truth | Kết luận đúng | Tổng công |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n| none | ${none.form} | ${none.manual} | ${none.draft} | 0 | ${none.confirmed}/${rows.length} | ${none.verdict}/${rows.length} | ${none.total} |\n| b | ${b.form} | ${b.manual} | ${b.draft} | ${b.read.toFixed(1)} | ${b.confirmed}/${baseline.rows.length} | ${b.verdict}/${baseline.rows.length} | ${b.total} |\n\nTổng công = nhập form + câu đề + câu bài + công đồ thị (none: tự nhập từ đồ thị rỗng; b: sửa nháp D) + soát.${reused}\n`;
  } catch { return ''; }
}
async function failureDetails(failed: MvpFailure, sample: ImageCase, session?: Session): Promise<MvpFailure> {
  const detail: MvpFailure = { ...failed, expected: (await readJson(join(sample.directory, 'work.json')) as WorkTruth).expected };
  if (session?.problemRead) {
    const { draft: _draft, ...comparisons } = mvpReadComparisons(session, sample.truth);
    Object.assign(detail, comparisons, { timings: session.timings });
    if (session.spec && session.solution) {
      detail.confirmedCorrect = compareRead({ ...session.problemRead, spec: session.spec }, sample.truth).completeCorrect;
      if (detail.confirmedCorrect) detail.solutionCheck = checkMvpSolution(sample.truth, session.solution);
    }
  }
  return detail;
}
const persist = async () => {
  await atomicJson(output + '.json', { date, problemRead, config, fingerprint, identities, machine, ...(previous ? { rescoredFrom: previous.rescoredFrom ?? previous.fingerprint } : {}), planned: samples.length, rows, failures });
  await writeFile(output + '.md', `Chế độ đọc đề: **${problemRead}**. ${problemRead === 'none' ? 'Không gọi B đọc đề; người dùng nhập form và đồ thị.' : 'Dùng B đọc đề từ checkpoint đã có.'}\n\n` + mvpReport(date, rows, samples.length, machine, failures) + await comparisonSection() + (previous ? '\nĐã chạy lại flow xác nhận/chấm trên OCR gốc B và nháp D đã lưu của cùng phép đo. Không tái sử dụng chữ đã sửa của mô phỏng cũ. Thời gian đọc B/D giữ số thật lần suy luận, thời gian xử lý/soát/chấm đo lại; tổng là thời gian các khâu ghép lại, không phải một đồng hồ liên tục mới.\n' : ''));
};
const signal = AbortSignal.timeout(4 * 60 * 60_000);
for (const sample of samples) {
  const path = join(cache, sample.id + '.json');
  const priorPath = join(problemRead === 'none' && rescore ? baselineCache : cache, sample.id + '.json');
  const inputHash = createHash('sha256').update(await readFile(join(sample.directory, '1.png'))).update(JSON.stringify(sample.truth)).update(await readFile(join(sample.directory, 'work.json'))).digest('hex');
  let saved: { fingerprint: string; inputHash: string; session: Session; row?: MvpRow } | undefined;
  try { saved = await readJson(priorPath) as typeof saved; } catch (error) { if (objectCode(error) !== 'ENOENT') throw error; }
  if (problemRead === 'b' && rescore && saved?.row && saved.inputHash !== inputHash) {
    // The evaluation fixture may have moved after the OCR checkpoint was
    // recorded.  For this task-only rescore, use only the stored B outcome and
    // the confirmed spec already present in that same checkpoint; do not mix
    // it with a newer image/truth pair or invoke B.
    if (!saved.session.problemRead || !saved.session.spec) throw new Error(`Checkpoint thiếu đề đã xác nhận: ${sample.id}`);
    const confirmation = simulateProblemConfirmation(saved.session.problemRead, saved.session.spec);
    rows.push({ ...saved.row, problemFormEdits: confirmation.formEdits, problemSuggestion: confirmation.suggestion });
    console.log(`${rows.length}/${samples.length} ${sample.id}: chấm gợi ý từ checkpoint`);
    await persist(); continue;
  }
  if (problemRead === 'none' && rescore && saved?.row && saved.inputHash !== inputHash) {
    // Same moved-fixture rule as above: keep the recorded work side, replace
    // only the problem side by the default manual entry.  Never rerun the work
    // flow against a newer image/truth pair.
    rows.push(noneModeFromStoredRow(saved.row)); reusedWork.add(sample.id);
    console.log(`${rows.length}/${samples.length} ${sample.id}: phần bài làm giữ từ checkpoint, đề nhập tay`);
    await persist(); continue;
  }
  if (rescore && !saved?.row) {
    const failed = previous?.failures.find((entry) => entry.id === sample.id);
    if (!failed) throw new Error(`Chưa có kết quả hoặc lỗi đọc đã lưu để chấm lại: ${sample.id}`);
    // Keep a failed OCR row as recorded.  Its newer fixture counterpart is not
    // evidence about the older inference checkpoint.
    failures.push({ ...failed, ...(saved?.session ? { timings: saved.session.timings } : {}) });
    await persist(); console.log(`${sample.id}: giữ lỗi đọc đã lưu`); continue;
  }
  if (saved && (saved.inputHash !== inputHash || !rescore && saved.fingerprint !== fingerprint && (!previous || saved.fingerprint !== previous.fingerprint && saved.fingerprint !== previous.rescoredFrom))) throw new Error(`Checkpoint khác cấu hình/mã/ảnh: ${sample.id}. Dùng --date mới hoặc lưu trữ checkpoint cũ; --rescore chỉ dùng OCR gốc với cấu hình đọc không đổi.`);
  if (saved?.row && !rescore) { rows.push(saved.row); console.log(`${rows.length}/${samples.length} ${sample.id}: đã lưu`); continue; }
  try {
    const began = performance.now(); const page = await syntheticWorkPage(root, sample.id); const decode = performance.now() - began;
    const workTruth = await readJson(join(sample.directory, 'work.json')) as WorkTruth;
    validateWork(sample.truth, workTruth, page.lines);
    const svg = await readFile(join(sample.directory, 'source.svg'), 'utf8');
    const project = ([x, y]: Point): Point => sample.id.endsWith('perspective') ? [25 + 950 * (x / 1000 + .018 * y / 1440) / (1 + .035 * y / 1440), 16 + 1408 * (y / 1440) / (1 + .035 * y / 1440)] : [x, y];
    const annotation: FigureAnnotation = { version: 1, width: page.image.width, height: page.image.height, box: [0, 0, page.image.width, page.image.height], crossings: [],
      vertices: sample.truth.graph.vertices.map((v) => {
        const match = new RegExp(`data-vertex="${v.id}" d="M ([\\d.]+) ([\\d.]+)`).exec(svg);
        if (!match) throw new Error('Thiếu tọa độ data-vertex trong SVG truth.');
        const x = Number(match[1]) - 18, y = Number(match[2]) + 9, a = project([x - 9, y - 17]), b = project([x + 18, y + 10]);
        return { ...v, center: project([x, y]), labelBox: [a[0], a[1], b[0], b[1]], contours: [], style: 'synthetic-hw', gap: 0 };
      }), edges: sample.truth.graph.edges.map((e) => ({ ...e, w: e.w ?? null, name: e.name ?? null, polyline: [] })) };
    const activeReaders: Readers = rescore ? { text: { engine: 'cached-B', readLines: async () => { throw new Error('Chấm lại không được gọi suy luận.'); } },
      problem: async () => { throw new Error('Chấm lại không được gọi suy luận.'); }, ...(problemRead === 'none' ? { figure: readers.figure } : {}) } : readers;
    const row = await runMvpSample({ id: sample.id, date, image: page.image, truth: sample.truth, workTruth, reference: page.lines, region: page.region,
      figure: annotation, readers: activeReaders, signal, ...(saved && !rescore ? { saved: saved.session } : {}),
      ...(rescore && saved?.row ? { prior: saved.row } : {}), problemRead,
      checkpoint: async (session) => atomicJson(path, { fingerprint, inputHash, session }) });
    row.timings.decode = decode; row.machineMs += decode;
    await atomicJson(path, { fingerprint, inputHash, session: row.session, row });
    rows.push(row); console.log(`${rows.length}/${samples.length} ${sample.id}: ${row.finalVerdict}; ${(row.machineMs / 1000).toFixed(1)} s`);
  } catch (error) {
    let latest: Session | undefined;
    try { latest = (await readJson(path) as { session: Session }).session; } catch { /* Reading failed before the first checkpoint. */ }
    const message = error instanceof LlamaCppReadError ? `${error.message} [${error.code}/${error.reason ?? 'unknown'}; finish=${error.finish_reason ?? 'unknown'}]`
      : error instanceof Error ? error.message : JSON.stringify(error);
    failures.push(await failureDetails({ id: sample.id, error: message }, sample, latest));
    console.error(`${sample.id}: lỗi đã lưu, tiếp tục trang sau`);
  }
  await persist();
}
await persist();
if (failures.length || rows.length !== samples.length) process.exitCode = 1;
function objectCode(value: unknown): unknown { return value !== null && typeof value === 'object' && 'code' in value ? value.code : undefined; }
