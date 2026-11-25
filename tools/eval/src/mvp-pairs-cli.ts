import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { arch, cpus, platform, totalmem } from 'node:os';
import { join, resolve } from 'node:path';
import { LlamaCppReader, LlamaCppReadError } from '@mathtwin/reader-llamacpp';
import { FigureReader, NoGlyphReader } from '@mathtwin/reader-figure';
import { compareText, readProblem } from '@mathtwin/reader';
import type { ReadDraft, TextLine, TextReader } from '@mathtwin/reader';
import type { WorkLine } from '@mathtwin/work';
import { defaultWorkLineStripConfig } from '@mathtwin/reader-llamacpp-shared';
import type { Readers } from '../../../apps/mobile/src/flow/reading.js';
import { loadPairs, pairWorkLines } from './pair-data.js';
import type { PairSource } from './pair-data.js';
import { pairInputHash, runMvpPair } from './mvp-pairs.js';
import { deviationReason } from './mvp-report.js';
import { alignWorkLines, joinedText } from './work-alignment.js';

const root = resolve(process.cwd()), args = process.argv.slice(2);
let source: PairSource | undefined, directory: string | undefined, date = new Date().toISOString().slice(0, 10), rescore = false, baseline: string | undefined, problemRead: 'none' | 'b' = 'none';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--rescore' && !rescore) { rescore = true; continue; }
  const flag = args[i], value = args[++i];
  if (flag === '--source' && (value === 'real' || value === 'generated')) source = value;
  else if (flag === '--dir' && value) directory = value;
  else if (flag === '--date' && /^\d{4}-\d{2}-\d{2}$/u.test(value ?? '')) date = value!;
  else if (flag === '--baseline' && value) baseline = value;
  else if (flag === '--problem-read' && (value === 'none' || value === 'b')) problemRead = value;
  else throw new Error('Dùng eval:mvp -- --source real|generated --dir <thư mục> [--date YYYY-MM-DD] [--baseline <report.json>] [--rescore] [--problem-read none|b].');
}
if (!source || !directory) throw new Error('Dùng eval:mvp -- --source real|generated --dir <thư mục> [--date YYYY-MM-DD] [--baseline <report.json>] [--rescore] [--problem-read none|b].');
const pairs = await loadPairs(directory, source);
if (!pairs.length) throw new Error('Thư mục cặp rỗng; không tạo kết quả độ chính xác giả.');
const workReader = { contextSize: 8192, maxTokens: 3072, readTimeout: 600_000, timeoutMs: 780_000 };
const config = { schema: 3, model: 'b', maxImageSide: 768, workLineStrips: defaultWorkLineStripConfig, workReader, threads: 4, gpuLayers: 0, passes: 1 };
const serverPath = join(root, '.build-cache/llama-win/bin/llama-server.exe'), modelsDirectory = join(root, '.models');
const identities = await Promise.all([serverPath, join(modelsDirectory, 'b/Qwen3VL-2B-Instruct-Q4_K_M.gguf'), join(modelsDirectory, 'b/mmproj-Qwen3VL-2B-Instruct-F16.gguf')]
  .map(async (path) => ({ path, size: (await stat(path)).size })));
const fingerprint = createHash('sha256').update(JSON.stringify({ config, identities })).update(await readFile(new URL(import.meta.url)))
  .update(await readFile(join(root, 'packages/reader-llamacpp-shared/src/line-strips.ts'))).update(await readFile(join(root, 'apps/mobile/src/flow/work-reading.ts'))).digest('hex');
const baselineCache = join(root, 'reports/.debug', `mvp-${source}-${date}`), cache = join(root, 'reports/.debug', `mvp-${source}-${date}${problemRead === 'none' ? '-none' : ''}`);
const output = join(root, 'reports', `mvp-${source}-${date}${problemRead === 'none' ? '-none' : ''}`);
await mkdir(cache, { recursive: true });
const atomic = async (path: string, value: unknown) => { await writeFile(path + '.tmp', JSON.stringify(value, null, 2) + '\n'); await rename(path + '.tmp', path); };
const llama = new LlamaCppReader({ model: 'b', serverPath, modelsDirectory, threads: 4, gpuLayers: 0, maxImageSide: 768, timeoutMs: 420_000, readTimeout: 300_000 });
const lineLlama = new LlamaCppReader({ model: 'b', serverPath, modelsDirectory, threads: 4, gpuLayers: 0,
  maxImageSide: config.workLineStrips.maxLongEdge, ...workReader });
const text: TextReader = { engine: lineLlama.engine, readLines: async (images, signal, options) => {
  const result = await lineLlama.readLines(images, signal, options), image = images[0]!;
  return { ...result, lines: result.lines.map((line) => ({ ...line, ...(line.box ? { box: line.box.map((value, axis) => value * 1000 / (axis % 2 ? image.height : image.width)) as [number, number, number, number] } : {}) })) };
} };
const figure = new FigureReader({ glyphReader: new NoGlyphReader() });
const readers: Readers = { text, problem: async (images, signal) => {
  const outcome = await readProblem(images, { reader: llama, passes: 1, ...(signal ? { signal } : {}) });
  for (const draft of outcome.drafts) for (const vertex of draft.vertices) if (vertex.box) vertex.box = vertex.box.map((value, axis) => value * 1000 / (axis % 2 ? images[0]!.height : images[0]!.width)) as [number, number, number, number];
  return outcome;
}, figure: async (image, signal): Promise<ReadDraft> => (await figure.read([image], 'edges', signal)).draft };
const rows: Awaited<ReturnType<typeof runMvpPair>>[] = [], failures: { id: string; error: string }[] = [];
const machine = `${platform()} ${arch()}; ${cpus()[0]?.model ?? 'CPU'}; ${cpus().length} logical CPUs; ${(totalmem() / 2 ** 30).toFixed(1)} GiB RAM; Node ${process.version}`;
interface PublicPairRow { id: string; expected: string; finalVerdict: string; workPages: number; machineMs: number; workReadMs: number; cerErrors: number; cerReference: number; digitLinesWrong: number; retriedBands: number; predictedTokens: number[] }
function rawWorkLines(row: Awaited<ReturnType<typeof runMvpPair>>): WorkLine[] {
  let index = 0;
  return [...(row.session.workPages ?? [])].sort((a, b) => a.page - b.page).flatMap((page) => page.raw.map((line) => ({ ...line, page: page.page, index: index++ })));
}
function digitLinesWrong(observed: WorkLine[], reference: WorkLine[]): number {
  const byObserved = new Map(observed.map((line) => [line.index, line]));
  const byTruth = new Map(reference.map((line) => [line.index, line]));
  return alignWorkLines(observed, reference).groups.filter((group) => {
    const truth = group.truth.map((index) => byTruth.get(index)).filter((line): line is WorkLine => Boolean(line));
    if (!truth.some((line) => (line.region === 'solution' || line.region === 'table') && /\d/u.test(line.text))) return false;
    const actual = group.observed.map((index) => byObserved.get(index)).filter((line): line is WorkLine => Boolean(line));
    return actual.map((line) => joinedText(actual, [line.index])).join(' ').match(/\d+/gu)?.join(',') !== truth.map((line) => line.text).join(' ').match(/\d+/gu)?.join(',');
  }).length;
}
async function publicRows(): Promise<PublicPairRow[]> {
  return Promise.all(rows.map(async (row) => {
    const pair = pairs.find((item) => item.id === row.id)!;
    const reference = await pairWorkLines(pair.lines, pair.workFiles.map((file) => join(pair.directory, file)));
    const truth = reference.map((line) => ({ text: line.text, region: line.region ?? 'solution' as const,
      ...(line.struck === undefined ? {} : { struck: line.struck }), ...(line.box ? { box: line.box } : {}) }));
    const score = compareText(rawWorkLines(row) as TextLine[], truth);
    return { id: row.id, expected: pair.teacher.verdict, finalVerdict: row.finalVerdict, workPages: pair.workFiles.length,
      machineMs: row.machineMs, workReadMs: row.timings.workRead, cerErrors: score.byRegion.solution.cer.errors,
      cerReference: score.byRegion.solution.cer.reference, digitLinesWrong: digitLinesWrong(rawWorkLines(row), reference),
      retriedBands: (row.session.workPages ?? []).reduce((total, page) => total + (page.lineStrips?.retriedBands ?? 0), 0),
      predictedTokens: (row.session.workPages ?? []).flatMap((page) => page.lineStrips?.predictedTokens ?? []) };
  }));
}
const baselineFailures = async (): Promise<number | undefined> => {
  if (!baseline) return undefined;
  const prior = JSON.parse(await readFile(resolve(baseline), 'utf8')) as { failures?: unknown[] };
  return Array.isArray(prior.failures) ? prior.failures.length : undefined;
};
const persist = async () => {
  const completed = rows.length, verdictCorrect = rows.filter((row) => row.finalVerdict === row.expected.verdict).length;
  const manualCrops = rows.reduce((count, row) => count + row.manualRegionPages.length, 0);
  const summaryRows = await publicRows(), before = await baselineFailures();
  const cer = summaryRows.reduce((total, row) => ({ errors: total.errors + row.cerErrors, reference: total.reference + row.cerReference }), { errors: 0, reference: 0 });
  const averageWorkSeconds = summaryRows.length ? summaryRows.reduce((sum, row) => sum + row.workReadMs, 0) / summaryRows.length / 1000 : 0;
  const stripTokens = summaryRows.flatMap((row) => row.predictedTokens).sort((a, b) => a - b);
  const percentile = (p: number): number => stripTokens.length ? stripTokens[Math.min(stripTokens.length - 1, Math.ceil(stripTokens.length * p) - 1)]! : 0;
  const retriedBands = summaryRows.reduce((sum, row) => sum + row.retriedBands, 0);
  const report = { date, source, problemRead, config, fingerprint, machine, planned: pairs.length, completed, readingFailures: failures.length,
    ...(before === undefined ? {} : { baselineReadingFailures: before }), verdictCorrect, manualCrops, cer, digitLinesWrong: summaryRows.reduce((sum, row) => sum + row.digitLinesWrong, 0), rows: summaryRows,
    retriedBands, stripTokens: { count: stripTokens.length, p50: percentile(.5), p90: percentile(.9) }, failures: failures.map((failure) => ({ id: failure.id, error: failure.error })) };
  await atomic(output + '.json', report);
  const attempted = completed + failures.length;
  await writeFile(output + '.md', `# Đo MVP cặp ${source} — ${date}\n\nChế độ đọc đề: **${problemRead}**. Đã hoàn tất ${completed}/${pairs.length} cặp; đã thử ${attempted}/${pairs.length}. Lỗi đọc lượt này: ${failures.length}/${attempted || 0}${before === undefined ? '' : `; mốc trước: ${before}/${pairs.length}`}. Không so trước/sau khi lượt mới chưa hoàn tất. Kết luận trùng nhãn nháp: ${verdictCorrect}/${pairs.length}.\n\nCER bài làm (chỉ vùng lời giải): ${(cer.reference ? cer.errors / cer.reference * 100 : 0).toFixed(2)}% (${cer.errors}/${cer.reference}); dòng mang số đọc sai số: ${report.digitLinesWrong}. Thời gian đọc bài trung bình: ${averageWorkSeconds.toFixed(1)} s/trang.\n\nBài đúng bị chấm oan thành SAI: ${rows.filter((row) => row.expected.verdict === 'DUNG' && row.finalVerdict === 'SAI').length}. CẦN XÁC NHẬN: ${rows.filter((row) => row.finalVerdict === 'CAN_XAC_NHAN').length}; KHÔNG ĐỦ CĂN CỨ: ${rows.filter((row) => row.finalVerdict === 'KHONG_DU_CAN_CU').length}.\n\nKhoanh vùng tay cần vì nhãn không có box: ${manualCrops} trang. Cấu hình đọc bài: ${config.workLineStrips.bands} dải ngang, chồng ${(config.workLineStrips.overlap * 100).toFixed(0)}%, cạnh dải ${config.workLineStrips.maxLongEdge}px. Nhãn ảnh thật là nhãn nháp, chưa giáo viên soát. Báo cáo không chứa chữ OCR/bài làm.\n\n| Cặp | Nhãn nháp | Kết quả | Trang bài | Đọc bài (s) | CER lời giải | Dòng số sai |\n| --- | --- | --- | ---: | ---: | ---: | ---: |\n${summaryRows.map((row) => `| ${row.id} | ${row.expected} | ${row.finalVerdict} | ${row.workPages} | ${(row.workReadMs / 1000).toFixed(1)} | ${row.cerReference ? (row.cerErrors / row.cerReference * 100).toFixed(2) + '%' : '—'} | ${row.digitLinesWrong} |`).join('\n')}\n${failures.length ? `\nLỗi: ${failures.map((failure) => `${failure.id}: ${failure.error}`).join('; ')}` : ''}\n`);
  const markdown = (await readFile(output + '.md', 'utf8')).replace('\n\nBài đúng bị chấm oan', `\n\nDải phải chia lại: ${retriedBands}; token sinh mỗi dải: p50 ${report.stripTokens.p50}, p90 ${report.stripTokens.p90} (${report.stripTokens.count} dải có đo). Context ${config.workReader.contextSize}, tối đa ${config.workReader.maxTokens} token/dải, chờ ${config.workReader.readTimeout / 1000} s/dải.\n\nBài đúng bị chấm oan`);
  const reasons = new Map(rows.map((row) => [row.id, row.deviation ? deviationReason(row.deviation)[0] : '—']));
  const withReasons = markdown
    .replace(' | Trang bài |', ' | Nguyên nhân | Trang bài |')
    .replace('| --- | --- | --- | ---:', '| --- | --- | --- | --- | ---:')
    .replace(/^(\| ((?:pair|real|generated|gen)-\d+) \| [^|]+ \| [^|]+ \|)/gmu, (_line, prefix: string, id: string) => `${prefix} ${reasons.get(id) ?? '—'} |`);
  await writeFile(output + '.md', withReasons);
};
const signal = AbortSignal.timeout(5 * 60 * 60_000);
for (const pair of pairs) {
  const path = join(cache, `${pair.id}.json`), priorPath = join(problemRead === 'none' && rescore ? baselineCache : cache, `${pair.id}.json`), inputHash = await pairInputHash(pair);
  let saved: { fingerprint: string; inputHash: string; session?: import('../../../apps/mobile/src/flow/types.js').Session; row?: Awaited<ReturnType<typeof runMvpPair>> } | undefined;
  try { saved = JSON.parse(await readFile(priorPath, 'utf8')) as typeof saved; } catch (error) { if (!(error instanceof Error) || !('code' in error) || (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (saved && saved.inputHash !== inputHash) throw new Error(`Checkpoint khác nhãn hoặc ảnh: ${pair.id}. Dùng --date mới.`);
  // A page-level checkpoint contains only raw reader state.  It is safe to
  // resume it after a local flow fix, and avoids spending a second B read.
  // Completed rows still remain tied to the exact implementation fingerprint.
  if (saved?.row && saved.fingerprint !== fingerprint && !rescore) throw new Error(`Checkpoint kết quả khác mã: ${pair.id}. Dùng --rescore hoặc --date mới.`);
  if (saved?.row && !rescore) { rows.push(saved.row); console.log(`${rows.length}/${pairs.length} ${pair.id}: đã lưu`); continue; }
  if (rescore && !saved?.row) throw new Error(`Thiếu checkpoint để chấm lại: ${pair.id}`);
  try {
    const active: Readers = rescore ? { text: { engine: 'cached-B', readLines: async () => { throw new Error('Chấm lại không được gọi suy luận.'); } },
      problem: async () => { throw new Error('Chấm lại không được gọi suy luận.'); }, ...(problemRead === 'none' ? { figure: readers.figure } : {}) } : readers;
    const row = await runMvpPair(pair, date, active, signal, async (session) => atomic(path, { fingerprint, inputHash, session }), saved?.session, saved?.row, problemRead);
    await atomic(path, { fingerprint, inputHash, row }); rows.push(row); console.log(`${rows.length}/${pairs.length} ${pair.id}: ${row.finalVerdict}; ${(row.machineMs / 1000).toFixed(1)} s`);
  } catch (error) {
    const message = error instanceof LlamaCppReadError ? `${error.message} [${error.code}/${error.reason ?? 'unknown'}]` : error instanceof Error ? error.message : String(error);
    failures.push({ id: pair.id, error: message }); console.error(`${pair.id}: lỗi đã lưu, tiếp tục cặp sau`);
  }
  await persist();
}
await persist();
if (failures.length || rows.length !== pairs.length) process.exitCode = 1;
