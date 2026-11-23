import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { arch, cpus, platform, totalmem } from 'node:os';
import { join, resolve } from 'node:path';
import { LlamaCppReader, LlamaCppReadError } from '@mathtwin/reader-llamacpp';
import { FigureReader, NoGlyphReader } from '@mathtwin/reader-figure';
import { readProblem } from '@mathtwin/reader';
import type { ReadDraft, TextReader } from '@mathtwin/reader';
import type { Readers } from '../../../apps/mobile/src/flow/reading.js';
import { loadPairs } from './pair-data.js';
import type { PairSource } from './pair-data.js';
import { pairInputHash, runMvpPair } from './mvp-pairs.js';
import { deviationReason } from './mvp-report.js';

const root = resolve(process.cwd()), args = process.argv.slice(2);
let source: PairSource | undefined, directory: string | undefined, date = new Date().toISOString().slice(0, 10), rescore = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--rescore' && !rescore) { rescore = true; continue; }
  const flag = args[i], value = args[++i];
  if (flag === '--source' && (value === 'real' || value === 'generated')) source = value;
  else if (flag === '--dir' && value) directory = value;
  else if (flag === '--date' && /^\d{4}-\d{2}-\d{2}$/u.test(value ?? '')) date = value!;
  else throw new Error('Dùng eval:mvp -- --source real|generated --dir <thư mục> [--date YYYY-MM-DD] [--rescore].');
}
if (!source || !directory) throw new Error('Dùng eval:mvp -- --source real|generated --dir <thư mục> [--date YYYY-MM-DD] [--rescore].');
const pairs = await loadPairs(directory, source);
if (!pairs.length) throw new Error('Thư mục cặp rỗng; không tạo kết quả độ chính xác giả.');
const config = { schema: 1, model: 'b', maxImageSide: 768, threads: 4, gpuLayers: 0, passes: 1 };
const serverPath = join(root, '.build-cache/llama-win/bin/llama-server.exe'), modelsDirectory = join(root, '.models');
const identities = await Promise.all([serverPath, join(modelsDirectory, 'b/Qwen3VL-2B-Instruct-Q4_K_M.gguf'), join(modelsDirectory, 'b/mmproj-Qwen3VL-2B-Instruct-F16.gguf')]
  .map(async (path) => ({ path, size: (await stat(path)).size })));
const fingerprint = createHash('sha256').update(JSON.stringify({ config, identities })).update(await readFile(new URL(import.meta.url))).digest('hex');
const cache = join(root, 'reports/.debug', `mvp-${source}-${date}`), output = join(root, 'reports', `mvp-${source}-${date}`);
await mkdir(cache, { recursive: true });
const atomic = async (path: string, value: unknown) => { await writeFile(path + '.tmp', JSON.stringify(value, null, 2) + '\n'); await rename(path + '.tmp', path); };
const llama = new LlamaCppReader({ model: 'b', serverPath, modelsDirectory, threads: 4, gpuLayers: 0, maxImageSide: 768, timeoutMs: 420_000, readTimeout: 300_000 });
const text: TextReader = { engine: llama.engine, readLines: async (images, signal, options) => {
  const result = await llama.readLines(images, signal, options), image = images[0]!;
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
const persist = async () => {
  const completed = rows.length, verdictCorrect = rows.filter((row) => row.finalVerdict === row.expected.verdict).length;
  const manualCrops = rows.reduce((count, row) => count + row.manualRegionPages.length, 0);
  await atomic(output + '.json', { date, source, directory: resolve(directory!), config, identities, fingerprint, machine, planned: pairs.length, rows, failures });
  await writeFile(output + '.md', `# Đo MVP cặp ${source} — ${date}\n\nĐã hoàn tất ${completed}/${pairs.length} cặp; lỗi đọc ${failures.length}. Kết luận trùng nhãn giáo viên: ${verdictCorrect}/${pairs.length}.\n\nBài đúng bị chấm oan thành SAI: ${rows.filter((row) => row.expected.verdict === 'DUNG' && row.finalVerdict === 'SAI').length}. CẦN XÁC NHẬN: ${rows.filter((row) => row.finalVerdict === 'CAN_XAC_NHAN').length}; KHÔNG ĐỦ CĂN CỨ: ${rows.filter((row) => row.finalVerdict === 'KHONG_DU_CAN_CU').length}.\n\nKhoanh vùng tay cần vì nhãn không có box: ${manualCrops} trang. Máy: ${machine}. Ảnh chỉ đọc từ ${resolve(directory!)}; báo cáo chỉ dùng mã cặp.\n\n| Cặp | Giáo viên | Kết quả | Trang đề | Trang bài | Khoanh tay | Thời gian (s) |\n| --- | --- | --- | ---: | ---: | ---: | ---: |\n${rows.map((row) => { const pair = pairs.find((item) => item.id === row.id)!; return `| ${row.id} | ${row.expected.verdict} | ${row.finalVerdict} | ${pair.problemFiles.length} | ${pair.workFiles.length} | ${row.manualRegionPages.length} | ${(row.machineMs / 1000).toFixed(1)} |`; }).join('\n')}\n${failures.length ? `\nLỗi: ${failures.map((failure) => `${failure.id}: ${failure.error}`).join('; ')}` : ''}\n`);
  const report = await readFile(output + '.md', 'utf8');
  const reasons = new Map(rows.map((row) => [row.id, row.deviation ? deviationReason(row.deviation)[0] : '—']));
  const withReasons = report
    .replace(' | Trang đề |', ' | Nguyên nhân | Trang đề |')
    .replace('| --- | --- | --- | ---:', '| --- | --- | --- | --- | ---:')
    .replace(/^(\| ((?:pair|real|generated|gen)-\d+) \| [^|]+ \| [^|]+ \|)/gmu, (_line, prefix: string, id: string) => `${prefix} ${reasons.get(id) ?? '—'} |`)
    .replace('Khoanh vùng tay cần vì nhãn không có box:', 'Khoanh vùng tay cần vì nhãn không có box (giả định lạc quan: người dùng khoanh đúng vùng bài làm, không đọc lại B):');
  await writeFile(output + '.md', withReasons);
};
const signal = AbortSignal.timeout(4 * 60 * 60_000);
for (const pair of pairs) {
  const path = join(cache, `${pair.id}.json`), inputHash = await pairInputHash(pair);
  let saved: { fingerprint: string; inputHash: string; session?: import('../../../apps/mobile/src/flow/types.js').Session; row?: Awaited<ReturnType<typeof runMvpPair>> } | undefined;
  try { saved = JSON.parse(await readFile(path, 'utf8')) as typeof saved; } catch (error) { if (!(error instanceof Error) || !('code' in error) || (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (saved && saved.inputHash !== inputHash) throw new Error(`Checkpoint khác nhãn hoặc ảnh: ${pair.id}. Dùng --date mới.`);
  // A page-level checkpoint contains only raw reader state.  It is safe to
  // resume it after a local flow fix, and avoids spending a second B read.
  // Completed rows still remain tied to the exact implementation fingerprint.
  if (saved?.row && saved.fingerprint !== fingerprint && !rescore) throw new Error(`Checkpoint kết quả khác mã: ${pair.id}. Dùng --rescore hoặc --date mới.`);
  if (saved?.row && !rescore) { rows.push(saved.row); console.log(`${rows.length}/${pairs.length} ${pair.id}: đã lưu`); continue; }
  if (rescore && !saved?.row) throw new Error(`Thiếu checkpoint để chấm lại: ${pair.id}`);
  try {
    const active: Readers = rescore ? { text: { engine: 'cached-B', readLines: async () => { throw new Error('Chấm lại không được gọi suy luận.'); } }, problem: async () => { throw new Error('Chấm lại không được gọi suy luận.'); } } : readers;
    const row = await runMvpPair(pair, date, active, signal, async (session) => atomic(path, { fingerprint, inputHash, session }), saved?.session, saved?.row);
    await atomic(path, { fingerprint, inputHash, row }); rows.push(row); console.log(`${rows.length}/${pairs.length} ${pair.id}: ${row.finalVerdict}; ${(row.machineMs / 1000).toFixed(1)} s`);
  } catch (error) {
    const message = error instanceof LlamaCppReadError ? `${error.message} [${error.code}/${error.reason ?? 'unknown'}]` : error instanceof Error ? error.message : String(error);
    failures.push({ id: pair.id, error: message }); console.error(`${pair.id}: lỗi đã lưu, tiếp tục cặp sau`);
  }
  await persist();
}
await persist();
if (failures.length || rows.length !== pairs.length) process.exitCode = 1;
