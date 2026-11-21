import { createHash } from 'node:crypto';
import { readFile, mkdir, rename, writeFile, stat } from 'node:fs/promises';
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
import { runMvpSample, mvpReadComparisons } from './mvp.js';
import { checkMvpSolution } from './mvp-oracle.js';
import { mvpReport } from './mvp-report.js';
import type { MvpRow, MvpFailure } from './mvp-report.js';

const root = resolve(process.cwd());
const args = process.argv.slice(2);
let date = new Date().toISOString().slice(0, 10), limit = 40, rescore = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--rescore' && !rescore) { rescore = true; continue; }
  const flag = args[i], value = args[++i];
  if (flag === '--date' && /^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) date = value!;
  else if (flag === '--limit' && Number.isSafeInteger(Number(value)) && Number(value) > 0 && Number(value) <= 40) limit = Number(value);
  else throw new Error('Dùng eval:mvp [--date YYYY-MM-DD] [--limit 1..40] [--rescore]. Chạy từ gốc repo.');
}
const config = { schema: 1, model: 'b', maxImageSide: 768, threads: 4, gpuLayers: 0, passes: 1 };
const serverPath = join(root, '.build-cache/llama-win/bin/llama-server.exe');
const cache = join(root, 'reports/.debug', `mvp-${date}`);
const output = join(root, 'reports', `mvp-eval-${date}`);
const atomicJson = async (path: string, value: unknown) => { await writeFile(path + '.tmp', JSON.stringify(value, null, 2) + '\n'); await rename(path + '.tmp', path); };
const machine = `${platform()} ${arch()}; ${cpus()[0]?.model ?? 'CPU'}; ${cpus().length} logical CPUs; ${(totalmem() / 2 ** 30).toFixed(1)} GiB RAM; Node ${process.version}`;
await mkdir(cache, { recursive: true });
// No fetch/download path: all three files must already exist.
const identities = await Promise.all([serverPath, join(root, '.models/b/Qwen3VL-2B-Instruct-Q4_K_M.gguf'), join(root, '.models/b/mmproj-Qwen3VL-2B-Instruct-F16.gguf')].map(async (path) => ({ path, size: (await stat(path)).size })));
const implementation = await Promise.all(['mvp.ts', 'mvp-oracle.ts', 'mvp-cli.ts', 'mvp-report.ts'].map((f) => readFile(join(root, 'tools/eval/src', f))));
const fingerprint = createHash('sha256').update(JSON.stringify({ config, identities })).update(Buffer.concat(implementation)).digest('hex');
const previous = rescore ? await readJson(output + '.json') as { fingerprint: string; rescoredFrom?: string; config: unknown; identities: unknown; failures: MvpFailure[] } : undefined;
if (previous && (JSON.stringify(previous.config) !== JSON.stringify(config) || JSON.stringify(previous.identities) !== JSON.stringify(identities)))
  throw new Error('Chỉ chấm lại OCR bằng cùng cấu hình B và cùng tệp model/server.');
if (rescore) await atomicJson(join(cache, `before-rescore-${fingerprint.slice(0, 12)}.json`), await readJson(output + '.json'));
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
const rows: MvpRow[] = [], failures: MvpFailure[] = [];
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
  await atomicJson(output + '.json', { date, config, fingerprint, identities, machine, ...(previous ? { rescoredFrom: previous.rescoredFrom ?? previous.fingerprint } : {}), planned: samples.length, rows, failures });
  await writeFile(output + '.md', mvpReport(date, rows, samples.length, machine, failures) + (previous ? '\nĐã chạy lại flow xác nhận/chấm trên OCR gốc B và nháp D đã lưu của cùng phép đo. Không tái sử dụng chữ đã sửa của mô phỏng cũ. Thời gian đọc B/D giữ số thật lần suy luận, thời gian xử lý/soát/chấm đo lại; tổng là thời gian các khâu ghép lại, không phải một đồng hồ liên tục mới.\n' : ''));
};
const signal = AbortSignal.timeout(4 * 60 * 60_000);
for (const sample of samples) {
  const path = join(cache, sample.id + '.json');
  const inputHash = createHash('sha256').update(await readFile(join(sample.directory, '1.png'))).update(JSON.stringify(sample.truth)).update(await readFile(join(sample.directory, 'work.json'))).digest('hex');
  let saved: { fingerprint: string; inputHash: string; session: Session; row?: MvpRow } | undefined;
  try { saved = await readJson(path) as typeof saved; } catch (error) { if (objectCode(error) !== 'ENOENT') throw error; }
  if (saved && (saved.inputHash !== inputHash || saved.fingerprint !== fingerprint && (!previous || saved.fingerprint !== previous.fingerprint && saved.fingerprint !== previous.rescoredFrom))) throw new Error(`Checkpoint khác cấu hình/mã/ảnh: ${sample.id}. Dùng --date mới hoặc lưu trữ checkpoint cũ; --rescore chỉ dùng OCR gốc với cấu hình đọc không đổi.`);
  if (rescore && !saved?.row) {
    const failed = previous?.failures.find((f) => f.id === sample.id);
    if (!failed) throw new Error(`Chưa có kết quả hoặc lỗi đọc đã lưu để chấm lại: ${sample.id}`);
    failures.push(await failureDetails(failed, sample, saved?.session));
    await persist(); console.log(`${sample.id}: giữ lỗi đọc, chấm các khâu đã lưu`); continue;
  }
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
      problem: async () => { throw new Error('Chấm lại thiếu checkpoint đề.'); } } : readers;
    const row = await runMvpSample({ id: sample.id, date, image: page.image, truth: sample.truth, workTruth, reference: page.lines, region: page.region,
      figure: annotation, readers: activeReaders, signal, ...(saved && !rescore ? { saved: saved.session } : {}),
      ...(rescore && saved?.row ? { prior: saved.row } : {}),
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
