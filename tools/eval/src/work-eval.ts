import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { grade } from '@mathtwin/core';
import type { ProblemSpec } from '@mathtwin/core';
import type { TextReader } from '@mathtwin/reader';
import { compareWork } from '@mathtwin/work';
import type { ParsedWork, WorkComparison, WorkGrade, WorkLine, WorkTruth } from '@mathtwin/work';
import { loadCases, prepareImages, readJson } from './dataset.js';
import { jsonText } from './work-generate.js';
import type { WorkSampleMeta } from './work-generate.js';
import { workLines } from './work-data.js';
export interface WorkOptions { set: 'work-text' | 'synthetic-hw' | 'real'; source: 'truth' | 'device' | 'engine'; file?: string; engine?: string; split?: 'dev' | 'test' }
export function readWorkOptions(args: string[]): WorkOptions {
  let set: WorkOptions['set'] | undefined; let source: WorkOptions['source'] | undefined;
  let file: string | undefined; let engine: string | undefined; let split: WorkOptions['split'];
  for (let i = 0; i < args.length; i++) {
    const flag = args[i]; const value = args[++i];
    if (flag === '--set' && ['work-text', 'synthetic-hw', 'real'].includes(value ?? '') && !set) set = value as WorkOptions['set'];
    else if (flag === '--split' && ['dev', 'test'].includes(value ?? '') && !split) split = value as 'dev' | 'test';
    else if (flag === '--lines' && ['truth', 'device', 'engine'].includes(value ?? '') && !source) {
      source = value as WorkOptions['source'];
      if (source === 'device') file = args[++i];
      if (source === 'engine') engine = args[++i];
    } else throw new Error('Dùng --set work-text|synthetic-hw|real --lines truth|device <file>|engine <tên> [--split dev|test].');
  }
  if (!set || !source || source === 'device' && (!file || file.startsWith('--')) || source === 'engine' && (!engine || engine.startsWith('--')) || split && set !== 'work-text') throw new Error('Thiếu hoặc sai tham số eval:work.');
  return { set, source, ...(file ? { file } : {}), ...(engine ? { engine } : {}), ...(split ? { split } : {}) };
}
/** Oracle checks the measuring instrument; it makes no claim about parsing observed text. */
export function oracleWork(spec: ProblemSpec, truth: WorkTruth, lines: WorkLine[]): { parsed: ParsedWork; grade: WorkGrade } {
  const parsed: ParsedWork = { steps: truth.claims.map((claim) => {
    const sources = truth.lineOf[String(claim.step)]!;
    const { step: _step, raw: _raw, conf: _conf, box: _box, ...body } = claim;
    return { claim: structuredClone(claim), lines: [...sources], page: lines.find((l) => l.index === sources[0])?.page ?? 0,
      candidates: [body], origin: sources.some((i) => lines.find((l) => l.index === i)?.region === 'table') ? 'table' : 'text' };
  }), ignored: [], unchecked: [], issues: truth.claims.length ? [] : [{ code: 'no_solution_lines', severity: 'blocking', message: 'Không có dòng bài làm.' }] };
  const result = grade(spec, truth.claims);
  return { parsed, grade: { result, questions: result.verdict === 'CAN_XAC_NHAN' ? (result.needsConfirmation ?? []).map((item) => ({
    kind: 'reading', lines: truth.lineOf[String(item.step)] ?? [], page: 0, shownText: truth.claims.find((c) => c.step === item.step)?.raw ?? '', options: [] })) : [],
    ...(result.firstErrorStep === undefined ? {} : { firstErrorLines: truth.lineOf[String(result.firstErrorStep)]! }) } };
}
export async function evaluateWork(args: string[], root: string, date: string, readers: Record<string, TextReader> = {}, reportRoot = root) {
  const options = readWorkOptions(args);
  const samples: { id: string; spec: ProblemSpec; truth: WorkTruth; lines: WorkLine[]; observedCount: number; group: string; variant: string }[] = [];
  let device: Map<string, WorkLine[]> | undefined;
  if (options.source === 'device') {
    const data = await readJson(options.file!) as { results: { id: string; linePasses: { lines: WorkLine[] }[] }[] };
    if (!Array.isArray(data.results) || new Set(data.results.map((r) => r.id)).size !== data.results.length) throw new Error('File thiết bị không hợp lệ.');
    device = new Map(data.results.map((r) => [r.id, r.linePasses[0]?.lines ?? []]));
  }
  if (options.set === 'work-text') {
    if (options.source !== 'truth') throw new Error('work-text chỉ có chữ; dùng --lines truth.');
    const folder = join(root, 'testdata/work-text');
    const manifest = await readJson(join(folder, 'manifest.json')) as WorkSampleMeta[];
    for (const meta of manifest.filter((m) => !options.split || m.split === options.split)) {
      const directory = join(folder, meta.split, meta.id);
      const truth = await readJson(join(directory, 'work.json')) as WorkTruth;
      const lines = await readJson(join(directory, 'lines.json')) as WorkLine[];
      samples.push({ id: meta.id, spec: await readJson(join(root, 'testdata/core', meta.coreFixture, 'spec.json')) as ProblemSpec,
        truth, lines, observedCount: lines.length, group: meta.family, variant: meta.variant });
    }
  } else {
    if (options.source === 'engine' && options.engine !== 'oracle' && !readers[options.engine!]) throw new Error('Engine chưa được đăng ký. Lô 3.1 có engine oracle; không tải hay khởi chạy model.');
    for (const sample of await loadCases(join(root, options.set === 'real' ? 'testdata/images' : 'testdata/images-synthetic-hw'))) {
      const truth = await readJson(join(sample.directory, 'work.json')) as WorkTruth;
      const image = await sharp(join(sample.directory, sample.files[0]!)).metadata();
      const rotated = (image.orientation ?? 0) >= 5;
      const lines = workLines(sample.lines ?? [], (rotated ? image.height : image.width)!, (rotated ? image.width : image.height)!);
      let observedCount = lines.length;
      if (device) {
        const observed = device.get(sample.id); if (!observed) throw new Error('File thiết bị thiếu bài trong tập đã chọn.');
        observedCount = observed.length;
      } else if (options.source === 'engine' && options.engine !== 'oracle') observedCount = (await readers[options.engine!]!.readLines(await prepareImages(sample))).lines.length;
      samples.push({ id: sample.id, spec: sample.truth, truth, lines, observedCount, group: sample.truth.task.type, variant: sample.meta.variant ?? 'real' });
    }
  }
  if (!samples.length) throw new Error('Bộ bài làm rỗng; chưa đủ căn cứ để đo.');
  const rows = samples.map((s) => ({ id: s.id, group: s.group, variant: s.variant, observedLines: s.observedCount,
    comparison: compareWork(oracleWork(s.spec, s.truth, s.lines), { ...s.truth, lines: s.lines }), expected: s.truth.expected }));
  const summarize = (subset: typeof rows) => {
    const comparison = subset.map((r) => r.comparison);
    const sum = (fn: (c: WorkComparison) => number): number => comparison.reduce((n, c) => n + fn(c), 0);
    return { total: subset.length, completeCorrect: sum((c) => Number(c.completeCorrect)),
      claimMatched: sum((c) => c.claims.matched), claimPredicted: sum((c) => c.claims.predicted), claimReference: sum((c) => c.claims.reference),
      sourceCorrect: sum((c) => c.sourceLines.correct), sourceMatched: sum((c) => c.sourceLines.matched),
      verdictCorrect: sum((c) => Number(c.verdictCorrect === true)), verdictComparable: sum((c) => Number(c.verdictCorrect !== null)),
      confirmations: sum((c) => Number(c.confirmation)),
      firstErrorCorrect: sum((c) => Number(c.firstErrorCorrect === true)), firstErrorReference: sum((c) => Number(c.firstErrorCorrect !== null)),
      silentFalseCorrect: sum((c) => Number(c.silentFalseCorrect)), silentFalseWrongParse: sum((c) => Number(c.silentFalseWrongParse)),
      silentFalseWrongReading: sum((c) => Number(c.silentFalseWrongReading)), proseAsUnchecked: sum((c) => c.proseAsUnchecked),
      insufficientReasons: Object.fromEntries([...new Set(comparison.flatMap((c) => c.insufficientReasons))].map((reason) => [reason, comparison.filter((c) => c.insufficientReasons.includes(reason)).length])),
      struckAsContent: sum((c) => c.struckAsContent), insufficient: sum((c) => Number(c.insufficient)),
      questionsMean: sum((c) => c.questions) / subset.length, questionsMax: Math.max(...comparison.map((c) => c.questions)),
      completeRate: sum((c) => Number(c.completeCorrect)) / subset.length };
  };
  const withRates = (counts: ReturnType<typeof summarize>) => ({ ...counts,
    claimPrecision: counts.claimPredicted ? counts.claimMatched / counts.claimPredicted : counts.claimReference ? 0 : 1,
    claimRecall: counts.claimReference ? counts.claimMatched / counts.claimReference : counts.claimPredicted ? 0 : 1,
    sourceLineAccuracy: counts.sourceMatched ? counts.sourceCorrect / counts.sourceMatched : 1,
    verdictAccuracy: counts.verdictComparable ? counts.verdictCorrect / counts.verdictComparable : null,
    firstErrorAccuracy: counts.firstErrorReference ? counts.firstErrorCorrect / counts.firstErrorReference : null,
    insufficientRate: counts.insufficient / counts.total,
  });
  const summary = withRates(summarize(rows));
  const groups = Object.fromEntries([...new Set(rows.map((r) => r.group))].map((g) => [g, withRates(summarize(rows.filter((r) => r.group === g)))]));
  const variants = Object.fromEntries([...new Set(rows.map((r) => r.variant))].map((v) => [v, withRates(summarize(rows.filter((r) => r.variant === v)))]));
  const silentErrors = rows.filter((r) => r.comparison.silentFalseCorrect || r.comparison.silentFalseWrongParse || r.comparison.silentFalseWrongReading)
    .map((r) => ({ id: r.id, type: r.comparison.silentFalseCorrect ? 'i' : r.comparison.silentFalseWrongParse ? 'ii' : 'iii' }));
  const report = { date, ...options, parser: 'oracle', fixtureOnly: true,
    note: 'Parser oracle trả claims truth, bỏ qua chữ quan sát khi tạo claim. 100% chỉ kiểm bộ đo. Không phải độ chính xác đọc/hiểu, không mô phỏng hỏi lại (Lô 3.4). Chưa đủ căn cứ trên bài thật.',
    summary, groups, variants, silentErrors, rows };
  const source = `${options.set}-${options.source}${options.split ? '-' + options.split : ''}${options.engine ? '-' + options.engine.replace(/[^a-zA-Z0-9-]/g, '-') : ''}`;
  const output = join(reportRoot, 'reports', `work-eval-${source}-${date}`); await mkdir(join(reportRoot, 'reports'), { recursive: true });
  const md = `# Kiểm bộ đo bài làm — parser oracle\n\n${report.note}\n\nNguồn: ${options.set} / ${options.source}.\n\n| Nhóm | Bài | Hiểu hoàn toàn | Kết luận đúng / so được | Đúng lỗi đầu / bài SAI | Sai thầm lặng (i) | SAI hiểu sai (ii) | SAI đọc sai (iii) | Văn xuôi unchecked |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n`
    + Object.entries(groups).map(([g, s]) => `| ${g} | ${s.total} | ${s.completeCorrect} | ${s.verdictCorrect}/${s.verdictComparable} | ${s.firstErrorCorrect}/${s.firstErrorReference} | ${s.silentFalseCorrect} | ${s.silentFalseWrongParse} | ${s.silentFalseWrongReading} | ${s.proseAsUnchecked} |`).join('\n')
    + `\n\nTổng: ${summary.total}; hiểu hoàn toàn ${summary.completeRate * 100}%; claim ${summary.claimMatched}/${summary.claimReference}; đúng dòng ${summary.sourceCorrect}/${summary.sourceMatched}; hỏi lại ${summary.confirmations}; không đủ căn cứ ${summary.insufficient}; bước từ dòng gạch ${summary.struckAsContent}; sai thầm lặng (i)/(ii)/(iii): ${summary.silentFalseCorrect}/${summary.silentFalseWrongParse}/${summary.silentFalseWrongReading}; văn xuôi unchecked ${summary.proseAsUnchecked}.\n\nThiếu bằng chứng chữ (readingMismatch = null) được xếp bảo thủ vào (ii).\n`
    + (silentErrors.length ? '\n' + silentErrors.map((e) => `- ${e.id}: (${e.type})`).join('\n') + '\n' : '');
  await writeFile(output + '.json', jsonText(report)); await writeFile(output + '.md', md);
  return report;
}
