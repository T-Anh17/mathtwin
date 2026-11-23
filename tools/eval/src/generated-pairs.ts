import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSpec } from '@mathtwin/core';
import type { ProblemSpec } from '@mathtwin/core';
import type { PairLine } from './pair-data.js';

interface GeneratedLabel { image: string; bai_id: number; page: number; total_pages: number; text: string; graph?: ProblemSpec['graph']; task?: ProblemSpec['task']; question_format?: ProblemSpec['questionFormat'] }
const json = async (path: string): Promise<unknown> => JSON.parse(await readFile(path, 'utf8')) as unknown;
const text = (value: unknown): string => JSON.stringify(value, null, 2) + '\n';
function label(value: unknown): GeneratedLabel {
  if (!value || typeof value !== 'object') throw new Error('Nhãn generated không hợp lệ.');
  const item = value as Partial<GeneratedLabel>;
  if (!Number.isInteger(item.bai_id) || !Number.isInteger(item.page) || !Number.isInteger(item.total_pages) || typeof item.image !== 'string' || typeof item.text !== 'string') throw new Error('Nhãn generated không hợp lệ.');
  return item as GeneratedLabel;
}
function linesOf(item: GeneratedLabel): PairLine[] {
  let solution = item.page > 1;
  return item.text.normalize('NFC').split(/\r?\n/u).flatMap((raw): PairLine[] => {
    const value = raw.trim();
    if (!value) return [];
    if (/^giải$/iu.test(value)) { solution = true; return []; }
    return [{ text: value, region: value.includes('|') ? 'table' : solution ? 'solution' : 'question', page: item.page - 1 }];
  });
}
export async function generatePairs(images: string, labelsFile: string, output: string): Promise<{ created: number; skipped: { baiId: number; reason: string }[] }> {
  const labelsRaw = await json(labelsFile);
  if (!Array.isArray(labelsRaw)) throw new Error('labels.json phải là mảng.');
  const labels = labelsRaw.map(label).sort((a, b) => a.bai_id - b.bai_id || a.page - b.page);
  const byCase = new Map<number, GeneratedLabel[]>();
  for (const item of labels) byCase.set(item.bai_id, [...(byCase.get(item.bai_id) ?? []), item]);
  await mkdir(output, { recursive: true });
  const skipped: { baiId: number; reason: string }[] = [];
  let created = 0;
  for (const [baiId, pages] of byCase) {
    const first = pages[0];
    if (!first || pages.some((page, index) => page.page !== index + 1 || page.total_pages !== pages.length)) { skipped.push({ baiId, reason: 'Số trang không liên tục hoặc không khớp total_pages.' }); continue; }
    if (!first.graph || !first.task || !first.question_format) { skipped.push({ baiId, reason: 'Thiếu graph, task hoặc question_format trong labels.json.' }); continue; }
    const truth: ProblemSpec = { graph: first.graph, task: first.task, questionFormat: first.question_format };
    if (!validateSpec(truth).ok) { skipped.push({ baiId, reason: 'graph/task không qua validateSpec.' }); continue; }
    const id = `generated-${String(baiId).padStart(2, '0')}`, folder = join(output, id);
    try { await readdir(folder); throw new Error(`Cặp đã tồn tại: ${id}; không ghi đè.`); } catch (error) { if (!(error instanceof Error) || !('code' in error) || (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    await mkdir(folder);
    const hashes: Record<string, string> = {};
    for (const page of pages) {
      const source = join(images, page.image), bytes = await readFile(source), extension = page.image.split('.').at(-1)!;
      for (const stem of ['de', 'bai']) { const file = `${stem}-${page.page}.${extension}`; await copyFile(source, join(folder, file)); hashes[file] = createHash('sha256').update(bytes).digest('hex'); }
    }
    const lines = pages.flatMap(linesOf);
    await Promise.all([
      writeFile(join(folder, 'truth.json'), text(truth)), writeFile(join(folder, 'lines.json'), text(lines)),
      writeFile(join(folder, 'ket-qua-giao-vien.json'), text({ verdict: 'DUNG', dongSaiDau: null, lyDo: 'Bài do bộ sinh tạo, đã soát là đúng.' })),
      writeFile(join(folder, 'meta.json'), text({ source: 'generated', capture: 'ai_generated_handwriting', labeler: 'labels.json', independentlyChecked: false,
        sha256: hashes, generatedFrom: resolve(labelsFile), imageSource: resolve(images) })),
    ]);
    created++;
  }
  await writeFile(join(output, 'generated-skipped.json'), text(skipped));
  return { created, skipped };
}

async function main() {
  const args = process.argv.slice(2); let images: string | undefined, labels: string | undefined, output: string | undefined;
  for (let i = 0; i < args.length; i++) { const flag = args[i], value = args[++i]; if (flag === '--images') images = value; else if (flag === '--labels') labels = value; else if (flag === '--out') output = value; else throw new Error('Dùng generated-pairs --images <dir> --labels <labels.json> --out <dir>.'); }
  if (!images || !labels || !output) throw new Error('Dùng generated-pairs --images <dir> --labels <labels.json> --out <dir>.');
  const result = await generatePairs(images, labels, output); console.log(`Đã tạo ${result.created} cặp; bỏ ${result.skipped.length} bài (xem generated-skipped.json).`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
