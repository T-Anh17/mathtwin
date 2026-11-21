import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { cpus, totalmem } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import sharp from 'sharp';
import { compareText, editDistance, stripDiacritics } from '@mathtwin/reader';
import type { TextLine, TruthLine } from '@mathtwin/reader';
import { LlamaCppReader, LlamaCppReadError } from '@mathtwin/reader-llamacpp';
import { completionRequest } from '@mathtwin/reader-llamacpp-shared';

interface Label {
  image: string;
  bai_id: number;
  page: number;
  total_pages: number;
  text: string;
  verified: boolean;
}

function parseLabel(value: unknown): Label {
  if (!value || typeof value !== 'object') throw new Error('Nhãn trang phải là một object.');
  const label = value as Partial<Label>;
  if (!Number.isSafeInteger(label.bai_id) || label.bai_id! < 1
    || !Number.isSafeInteger(label.page) || label.page! < 1
    || !Number.isSafeInteger(label.total_pages) || label.total_pages! < label.page!
    || label.image !== `bai_${String(label.bai_id).padStart(2, '0')}_p${label.page}.png`
    || typeof label.text !== 'string' || !label.text.trim() || typeof label.verified !== 'boolean') {
    throw new Error(`Nhãn trang không hợp lệ: ${label.image ?? '?'}`);
  }
  return label as Label;
}

function referenceLines(label: Label): TruthLine[] {
  let region: TruthLine['region'] = label.page === 1 ? 'question' : 'solution';
  return label.text.normalize('NFC').split(/\r?\n/u).flatMap((raw): TruthLine[] => {
    const text = raw.trim().replace(/^\|\s*|\s*\|$/gu, '').replace(/\s*\|\s*/gu, ' ');
    if (!text) return [];
    if (text.toLowerCase() === 'giải') region = 'solution';
    return [{ text, region }];
  });
}

const { values } = parseArgs({ options: { images: { type: 'string' }, labels: { type: 'string' }, date: { type: 'string' },
  run: { type: 'string' }, 'line-prompt': { type: 'string', default: 'by-page' }, 'retry-errors': { type: 'boolean' }, rescore: { type: 'boolean' } } });
if (!values.images || !values.labels || !values.date || !/^\d{4}-\d{2}-\d{2}$/u.test(values.date)
  || (values.run !== undefined && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(values.run))
  || !['standard', 'continuation', 'by-page'].includes(values['line-prompt'] ?? '')) {
  throw new Error('Dùng --images <thư mục PNG> --labels <labels.json> --date YYYY-MM-DD [--run tên-lượt] [--line-prompt standard|continuation|by-page].');
}
const root = resolve(process.cwd());
const source = 'generated_handwriting';
const labelBytes = await readFile(values.labels);
const raw: unknown = JSON.parse(labelBytes.toString('utf8'));
if (!Array.isArray(raw) || !raw.length) throw new Error('labels.json phải chứa danh sách trang.');
const labels = raw.map(parseLabel).sort((a, b) => a.bai_id - b.bai_id || a.page - b.page);
const files = (await readdir(values.images, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && /\.png$/iu.test(entry.name)).map((entry) => entry.name).sort();
if (files.join('\n') !== labels.map((label) => label.image).sort().join('\n')) throw new Error('Danh sách ảnh và nhãn không trùng nhau.');
const cases = new Map<number, Label[]>();
for (const label of labels) {
  const pages = cases.get(label.bai_id) ?? [];
  pages.push(label);
  cases.set(label.bai_id, pages);
}
for (const pages of cases.values()) {
  if (pages.some((label, i) => label.page !== i + 1 || label.total_pages !== pages.length)) {
    throw new Error(`Số trang không khớp: bài ${pages[0]!.bai_id}`);
  }
}
const config = { model: 'b', maxImageSide: 768, threads: 4, gpuLayers: 0, timeoutMs: 420_000, readTimeout: 300_000,
  linePrompt: values['line-prompt'] } as const;
const serverPath = join(root, '.build-cache/llama-win/bin/llama-server.exe');
const modelsDirectory = join(root, '.models');
const runtimeFiles = await Promise.all([serverPath, join(modelsDirectory, 'b/Qwen3VL-2B-Instruct-Q4_K_M.gguf'),
  join(modelsDirectory, 'b/mmproj-Qwen3VL-2B-Instruct-F16.gguf')].map(async (path) => {
  const info = await stat(path);
  return { path, size: info.size, modifiedMs: info.mtimeMs };
}));
const fingerprint = createHash('sha256').update(JSON.stringify({ config, runtimeFiles }))
  .update(JSON.stringify(completionRequest('b', 'lines', ['data:image/png;base64,AA=='])))
  .update(JSON.stringify(completionRequest('b', 'continuation-lines', ['data:image/png;base64,AA=='])))
  .update(await readFile(new URL(import.meta.url))).update(labelBytes).digest('hex');
const reader = new LlamaCppReader({ ...config, serverPath, modelsDirectory });
const machine = `${process.platform} ${process.arch}; ${cpus()[0]?.model ?? 'CPU'}; ${(totalmem() / 2 ** 30).toFixed(1)} GiB RAM; Node ${process.version}`;
const reportName = `read-eval-generated-handwriting-${values.date}${values.run ? `-${values.run}` : ''}`;
const artifacts = join(root, 'reports', reportName);
const cache = join(root, 'reports/.debug', reportName, fingerprint);
await mkdir(cache, { recursive: true });
const priorReport = values.rescore ? JSON.parse(await readFile(artifacts + '.json', 'utf8')) as { fingerprint?: unknown; config?: unknown } : undefined;
if (values.rescore && (typeof priorReport?.fingerprint !== 'string' || !/^[a-f0-9]{64}$/u.test(priorReport.fingerprint)
  || JSON.stringify(priorReport.config) !== JSON.stringify(config)))
  throw new Error('Báo cáo cũ không có fingerprint checkpoint OCR hợp lệ.');

interface Observation { lines: TextLine[]; elapsedMs: number; error?: string }
interface DiacriticLoss { lines: number; pages: number; highConfidenceLines: number; comparedLines: number }
interface CheckpointCache { fingerprint: string; hashes: Map<string, string> }
const atomicWrite = async (path: string, data: string) => {
  await writeFile(path + '.tmp', data);
  await rename(path + '.tmp', path);
};
const clean = (text: string) => text.normalize('NFC').trim().replace(/\s+/gu, ' ');
const hasVietnameseDiacritic = (text: string) => /[đĐ]|\p{M}/u.test(text.normalize('NFD'));
/** Ordered, text-only pairing is reporting-only and does not repair OCR. */
function diacriticLoss(lines: readonly TextLine[], truth: readonly TruthLine[]): { matches: { lost: boolean; highConfidence: boolean }[]; compared: number } {
  const reference = truth.filter((line) => !line.struck).map((line) => clean(line.text!));
  const observed = lines.filter((line) => !line.struck);
  const n = reference.length, m = observed.length;
  const cost = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  const action = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 1; i <= n; i++) { cost[i]![0] = i; action[i]![0] = 1; }
  for (let j = 1; j <= m; j++) { cost[0]![j] = j; action[0]![j] = 2; }
  const folded = (text: string) => stripDiacritics(clean(text)).toLowerCase();
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    const left = [...folded(reference[i - 1]!)], right = [...folded(observed[j - 1]!.text)];
    const substitutions = editDistance(left, right) / Math.max(1, left.length, right.length);
    const candidates = [cost[i - 1]![j - 1]! + substitutions, cost[i - 1]![j]! + 1, cost[i]![j - 1]! + 1];
    const best = Math.min(...candidates); cost[i]![j] = best; action[i]![j] = candidates.indexOf(best);
  }
  const matches: { lost: boolean; highConfidence: boolean }[] = [];
  for (let i = n, j = m; i || j;) {
    const step = action[i]![j];
    if (step === 0) {
      const expected = reference[i - 1]!, actual = observed[j - 1]!;
      matches.push({ lost: hasVietnameseDiacritic(expected) && !hasVietnameseDiacritic(actual.text), highConfidence: actual.conf >= .85 });
      i--; j--;
    } else if (step === 1) i--;
    else j--;
  }
  return { matches, compared: matches.length };
}
async function findCheckpointCache(): Promise<CheckpointCache> {
  const hashes = new Map(await Promise.all(labels.map(async (label) => [label.image,
    createHash('sha256').update(await readFile(join(values.images!, label.image))).digest('hex')] as const)));
  const cacheRoot = join(root, 'reports/.debug', reportName);
  const candidates = (await readdir(cacheRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory()
    && /^[a-f0-9]{64}$/u.test(entry.name));
  const complete = await Promise.all(candidates.map(async (candidate) => ({ candidate: candidate.name,
    complete: await Promise.all(labels.map(async (label) => stat(join(cacheRoot, candidate.name,
      `${label.image}-${hashes.get(label.image)!}.json`)).then(() => true, () => false))).then((found) => found.every(Boolean)) })));
  const matches = complete.filter((candidate) => candidate.complete).map((candidate) => candidate.candidate);
  if (matches.length !== 1) throw new Error(matches.length
    ? 'Có nhiều checkpoint OCR hoàn chỉnh; không tự chọn để tránh trộn lần đo.'
    : 'Không có checkpoint OCR hoàn chỉnh khớp toàn bộ ảnh để chấm lại.');
  return { fingerprint: matches[0]!, hashes };
}
const checkpointCache = values.rescore ? await findCheckpointCache() : undefined;
async function cachedObservation(label: Label, hash: string): Promise<Observation> {
  if (checkpointCache?.hashes.get(label.image) !== hash) throw new Error(`Hash ảnh đổi trong khi chấm lại: ${label.image}.`);
  const path = join(root, 'reports/.debug', reportName, checkpointCache!.fingerprint, `${label.image}-${hash}.json`);
  try { return JSON.parse(await readFile(path, 'utf8')) as Observation; }
  catch { throw new Error(`Thiếu checkpoint OCR đã ghi trong báo cáo cũ: ${label.image}.`); }
}
async function recognize(label: Label): Promise<Observation> {
  const png = await readFile(join(values.images!, label.image));
  const hash = createHash('sha256').update(png).digest('hex');
  const path = join(cache, `${label.image}-${hash}.json`);
  if (values.rescore) return cachedObservation(label, hash);
  const saved = await readFile(path, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
    return undefined;
  });
  if (saved) {
    const observation = JSON.parse(saved) as Observation;
    if (!observation.error || !values['retry-errors']) return observation;
  }
  const start = performance.now();
  let result: Observation;
  try {
    const { data, info } = await sharp(png).rotate().toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const continuation = config.linePrompt === 'continuation' || (config.linePrompt === 'by-page' && label.page > 1);
    const response = await reader.readLines([{ pixels: new Uint8ClampedArray(data), width: info.width, height: info.height, source: label.image }],
      undefined, { continuation });
    result = { lines: response.lines, elapsedMs: performance.now() - start };
  } catch (error) {
    result = { lines: [], elapsedMs: performance.now() - start, error: error instanceof LlamaCppReadError
      ? `${error.code}/${error.reason ?? 'unknown'}` : error instanceof Error ? error.message : String(error) };
  }
  await atomicWrite(path, JSON.stringify(result));
  return result;
}

const rows: { image: string; sha256: string; caseId: number; page: number; elapsedMs: number; error?: string; metrics: ReturnType<typeof compareText>; diacriticLoss: { lines: number; highConfidenceLines: number; comparedLines: number } }[] = [];
const percent = (errors: number, reference: number) => reference ? `${(100 * errors / reference).toFixed(2)}%` : '—';
async function persist() {
  const completeCases = [...cases.values()].filter((pages) => pages.every((label) => rows.some((row) => row.image === label.image && !row.error))).length;
  const aggregate = (series: ('cer' | 'wer' | 'digits'), region?: 'question' | 'solution') => {
    return rows.reduce((sum, row) => {
      const score = (region ? row.metrics.byRegion[region] : row.metrics)[series];
      return { errors: sum.errors + score.errors, reference: sum.reference + score.reference };
    }, { errors: 0, reference: 0 });
  };
  const metrics = (region?: 'question' | 'solution') => ({
    cer: aggregate('cer', region), wer: aggregate('wer', region), digits: aggregate('digits', region),
  });
  const scores = { all: metrics(), question: metrics('question'), solution: metrics('solution') };
  const diacritic: DiacriticLoss = rows.reduce((sum, row) => ({ lines: sum.lines + row.diacriticLoss.lines,
    pages: sum.pages + Number(row.diacriticLoss.lines > 0), highConfidenceLines: sum.highConfidenceLines + row.diacriticLoss.highConfidenceLines,
    comparedLines: sum.comparedLines + row.diacriticLoss.comparedLines }), { lines: 0, pages: 0, highConfidenceLines: 0, comparedLines: 0 });
  const latency = rows.filter((row) => !row.error).map((row) => row.elapsedMs).sort((a, b) => a - b);
  const quantile = (p: number) => latency[Math.ceil(latency.length * p) - 1] ?? null;
  const summary = { plannedPages: labels.length, attemptedPages: rows.length, successfulPages: latency.length,
    plannedCases: cases.size, completeCases, verifiedLabels: labels.filter((label) => label.verified).length,
    p50Ms: quantile(.5), p90Ms: quantile(.9), scores, diacriticLoss: diacritic };
  const provenance = { images: resolve(values.images!), labels: resolve(values.labels!),
    access: 'Người dùng cấp quyền chỉ đọc để đo; ảnh không được chép vào repo.', distributionRights: 'Chưa được xác minh.' };
  await atomicWrite(artifacts + '.json', JSON.stringify({ date: values.date, source, provenance, config, machine, fingerprint,
    ...(values.rescore ? { rescoredFromCheckpoint: true, checkpointFingerprint: checkpointCache!.fingerprint } : {}), summary, rows }, null, 2) + '\n');
  const scoreCell = ({ errors, reference }: { errors: number; reference: number }) => `${percent(errors, reference)} (${errors}/${reference})`;
  const seconds = (ms: number | null) => ms === null ? '—' : (ms / 1000).toFixed(1);
  await atomicWrite(artifacts + '.md', [
    `# Đo OCR trên ảnh mô phỏng chữ viết tay — ${values.date}`,
    '',
    `Đã thử **${rows.length}/${labels.length} trang**. Đọc được ${latency.length} trang và đủ trang của ${completeCases}/${cases.size} bài.`,
    '',
    `B cục bộ Qwen3-VL-2B Q4_K_M, CPU 4 luồng, cạnh ảnh tối đa 768 px. Máy tính ${machine}.`,
    `Thời gian đọc trang thành công gồm giải mã ảnh và suy luận. p50 ${seconds(summary.p50Ms)} s, p90 ${seconds(summary.p90Ms)} s.`,
    '',
    `Văn bản tham chiếu lấy từ labels.json (${summary.verifiedLabels}/${labels.length} nhãn có cờ verified). Các tỷ lệ đo mức khớp với văn bản này. Sai lệch giữa chữ trong ảnh và văn bản dùng để sinh ảnh cũng làm tăng số lỗi.`,
    `Nguồn ảnh: \`${provenance.images}\`; nhãn: \`${provenance.labels}\`. Quyền dùng: ${provenance.access} ${provenance.distributionRights} SHA-256 từng ảnh nằm ở trường \`rows[].sha256\` của JSON.`,
    'Chuẩn hóa NFC và khoảng trắng, bỏ vạch cột trong văn bản tham chiếu, giữ dấu tiếng Việt và dấu câu. So vùng bằng căn dòng theo văn bản. Nhãn và trọng số vẽ riêng trên hình có thể được tính như chữ thêm. Trang lỗi đọc được tính như đầu ra rỗng.',
    '',
    '| Phần | CER | WER | Lỗi token số |',
    '| --- | ---: | ---: | ---: |',
    ...([['Cả trang', scores.all], ['Đề', scores.question], ['Lời giải', scores.solution]] as const)
      .map(([name, score]) => `| ${name} | ${scoreCell(score.cer)} | ${scoreCell(score.wer)} | ${scoreCell(score.digits)} |`),
    '',
    `Dòng mất toàn bộ dấu tiếng Việt (căn dòng đơn điệu sau khi bỏ dấu, không dùng để sửa OCR): **${diacritic.lines}/${diacritic.comparedLines}** dòng trên **${diacritic.pages}/${rows.length}** trang; **${diacritic.highConfidenceLines}** dòng có conf ≥0,85. Đây là rủi ro đọc sai có conf cao.`,
    '',
    '| Trang | CER | WER | Thời gian (s) | Trạng thái |',
    '| --- | ---: | ---: | ---: | --- |',
    ...rows.map((row) => `| ${row.image} | ${scoreCell(row.metrics.cer)} | ${scoreCell(row.metrics.wer)} | ${seconds(row.elapsedMs)} | ${row.error?.replaceAll('|', '/').replace(/\s+/gu, ' ') ?? 'Đã đọc'} |`),
    '',
    'Phạm vi là đọc chữ trên trang. Đo cấu trúc đồ thị và các chỉ số chấm cần nhãn đồ thị, chuỗi bước và kết quả đã được đối chiếu với ảnh. Nghiệm thu MVP vẫn cần bài làm viết tay thật có nhãn.',
    '',
  ].join('\n'));
}
for (const label of labels) {
  const { lines, ...observation } = await recognize(label);
  const png = await readFile(join(values.images!, label.image));
  const reference = referenceLines(label), loss = diacriticLoss(lines, reference);
  rows.push({ image: label.image, sha256: createHash('sha256').update(png).digest('hex'), caseId: label.bai_id, page: label.page, ...observation,
    metrics: compareText(lines, reference), diacriticLoss: { lines: loss.matches.filter((match) => match.lost).length,
      highConfidenceLines: loss.matches.filter((match) => match.lost && match.highConfidence).length, comparedLines: loss.compared } });
  await persist();
  console.log(`${rows.length}/${labels.length} ${label.image}: ${observation.error ?? 'đã đọc'} (${(observation.elapsedMs / 1000).toFixed(1)} s)`);
}
if (rows.some((row) => row.error)) process.exitCode = 1;
