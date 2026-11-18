import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { grade } from '@mathtwin/core';
import type { ProblemSpec } from '@mathtwin/core';
import type { TextReader } from '@mathtwin/reader';
import { compareWork, parseWork, vocabularyOf } from '@mathtwin/work';
import type { ParsedWork, WorkComparison, WorkGrade, WorkLine, WorkTruth } from '@mathtwin/work';
import { loadCases, prepareImages, readJson } from './dataset.js';
import { jsonText } from './work-generate.js';
import type { WorkSampleMeta } from './work-generate.js';
import { workLines } from './work-data.js';
export interface WorkOptions { set: 'work-text' | 'work-text-tables' | 'synthetic-hw' | 'real'; source: 'truth' | 'device' | 'engine'; file?: string; engine?: string; split?: 'dev' | 'test'; parser?: 'oracle' | 'real'; variant?: 'a' | 'b' | 'c' | 'd' }
export function readWorkOptions(args: string[]): WorkOptions {
  let set: WorkOptions['set'] | undefined; let source: WorkOptions['source'] | undefined;
  let parser: WorkOptions['parser']; let variant: WorkOptions['variant'];
  let file: string | undefined; let engine: string | undefined; let split: WorkOptions['split'];
  for (let i = 0; i < args.length; i++) {
    const flag = args[i]; const value = args[++i];
    if (flag === '--set' && ['work-text', 'work-text-tables', 'synthetic-hw', 'real'].includes(value ?? '') && !set) set = value as WorkOptions['set'];
    else if (flag === '--split' && ['dev', 'test'].includes(value ?? '') && !split) split = value as 'dev' | 'test';
    else if (flag === '--parser' && ['oracle', 'real'].includes(value ?? '') && !parser) parser = value as 'oracle' | 'real';
    else if (flag === '--variant' && ['a', 'b', 'c', 'd'].includes(value ?? '') && !variant) variant = value as 'a' | 'b' | 'c' | 'd';
    else if (flag === '--lines' && ['truth', 'device', 'engine'].includes(value ?? '') && !source) {
      source = value as WorkOptions['source'];
      if (source === 'device') file = args[++i];
      if (source === 'engine') engine = args[++i];
    } else throw new Error('Dùng --set work-text|work-text-tables|synthetic-hw|real --lines truth|device <file>|engine <tên> [--split dev|test] [--parser oracle|real] [--variant a|b|c|d].');
  }
  if (!set || !source || source === 'device' && (!file || file.startsWith('--')) || source === 'engine' && (!engine || engine.startsWith('--')) || (split || variant) && !['work-text', 'work-text-tables'].includes(set)) throw new Error('Thiếu hoặc sai tham số eval:work.');
  return { set, source, ...(file ? { file } : {}), ...(engine ? { engine } : {}), ...(split ? { split } : {}), ...(parser ? { parser } : {}), ...(variant ? { variant } : {}) };
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
/** Diagnostic core grading only; does not implement the batch 3.4 confirmation policy. */
export function realWork(spec: ProblemSpec, lines: WorkLine[]): { parsed: ParsedWork; grade: WorkGrade } {
  const parsed = parseWork(lines, vocabularyOf(spec));
  // Vocabulary contains display labels only. Map to core ids at the grading boundary.
  const ids = new Map(spec.graph.vertices.map((v) => [v.label, v.id]));
  const answerIds = (value: unknown, key = ''): unknown => {
    if (Array.isArray(value)) return value.map((v) => answerIds(v, key));
    if (typeof value === 'string' && ['vertices', 'oddVertices', 'isolatedVertices', 'components'].includes(key)) return ids.get(value) ?? value;
    if (typeof value === 'object' && value !== null) return Object.fromEntries(Object.entries(value).map(([k, v]) => [key === 'degrees' ? ids.get(k) ?? k : k, answerIds(v, k)]));
    return value;
  };
  const claims = parsed.steps.map(({ claim }) => {
    const id = (v: string): string => ids.get(v) ?? v;
    switch (claim.type) {
      case 'dijkstra_init': return { ...claim, source: id(claim.source) };
      case 'dijkstra_select': return { ...claim, v: id(claim.v) };
      case 'dijkstra_label': return { ...claim, v: id(claim.v), ...(claim.via ? { via: id(claim.via) } : {}) };
      case 'nn_step': return { ...claim, from: id(claim.from), to: id(claim.to) };
      case 'degree': return { ...claim, v: id(claim.v) };
      case 'postman_duplicate': case 'vertex_list': case 'odd_vertices': case 'walk': case 'length': return { ...claim, vertices: claim.vertices.map(id) };
      case 'edge_list': return { ...claim, edges: claim.edges.map((e) => ({ u: id(e.u), v: id(e.v) })) };
      case 'shortest_length': return { ...claim, from: id(claim.from), to: id(claim.to) };
      case 'final_answer': return { ...claim, value: answerIds(claim.value) };
      default: return claim;
    }
  });
  const result = grade(spec, claims);
  const gradedParsed: ParsedWork = { ...parsed, steps: parsed.steps.map((s, i) => ({ ...s, claim: claims[i]!, candidates: [claims[i]!] })) };
  return { parsed: gradedParsed, grade: { result, questions: [], ...(result.firstErrorStep === undefined ? {} : {
    firstErrorLines: parsed.steps.find((s) => s.claim.step === result.firstErrorStep)?.lines ?? [],
  }) } };
}
/** Diagnostics for rule 6 only; applying the confirmation policy belongs to 3.4. */
export function uncheckedGuard(comparison: WorkComparison, unchecked: number[], firstErrorLines: number[]) {
  const prior = firstErrorLines.length > 0 && unchecked.some((line) => line < Math.min(...firstErrorLines));
  return {
    silentFalseCorrectWithUnchecked: Number(comparison.silentFalseCorrect && unchecked.length > 0),
    silentFalseCorrectWithoutUnchecked: Number(comparison.silentFalseCorrect && unchecked.length === 0),
    silentFalseWrongParseWithPriorUnchecked: Number(comparison.silentFalseWrongParse && prior),
    silentFalseWrongParseWithoutPriorUnchecked: Number(comparison.silentFalseWrongParse && !prior),
  };
}
export async function evaluateWork(args: string[], root: string, date: string, readers: Record<string, TextReader> = {}, reportRoot = root) {
  const options = readWorkOptions(args);
  const samples: { id: string; spec: ProblemSpec; truth: WorkTruth; lines: WorkLine[]; observed: WorkLine[]; observedCount: number; group: string; variant: string }[] = [];
  let device: Map<string, WorkLine[]> | undefined;
  if (options.source === 'device') {
    const data = await readJson(options.file!) as { results: { id: string; linePasses: { lines: WorkLine[] }[] }[] };
    if (!Array.isArray(data.results) || new Set(data.results.map((r) => r.id)).size !== data.results.length) throw new Error('File thiết bị không hợp lệ.');
    device = new Map(data.results.map((r) => [r.id, r.linePasses[0]?.lines ?? []]));
  }
  if (options.set === 'work-text' || options.set === 'work-text-tables') {
    if (options.source !== 'truth') throw new Error('work-text chỉ có chữ; dùng --lines truth.');
    const folder = join(root, 'testdata', options.set);
    const manifest = await readJson(join(folder, 'manifest.json')) as WorkSampleMeta[];
    for (const meta of manifest.filter((m) => (!options.split || m.split === options.split) && (!options.variant || m.variant === options.variant))) {
      const directory = join(folder, meta.split, meta.id);
      const truth = await readJson(join(directory, 'work.json')) as WorkTruth;
      const lines = await readJson(join(directory, 'lines.json')) as WorkLine[];
      // Compare reading evidence against the clean transcription, not noisy input.
      const clean = manifest.find((m) => m.coreFixture === meta.coreFixture && m.family === meta.family && m.variant === 'a');
      if (!clean) throw new Error('Thiếu biến thể chữ chuẩn a để đối chiếu.');
      const reference = meta.variant === 'a' ? lines
        : await readJson(join(folder, clean.split, clean.id, 'lines.json')) as WorkLine[];
      samples.push({ id: meta.id, spec: await readJson(options.set === 'work-text-tables' ? join(directory, 'spec.json') : join(root, 'testdata/core', meta.coreFixture, 'spec.json')) as ProblemSpec,
        truth, lines: reference, observed: lines, observedCount: lines.length, group: meta.family, variant: meta.variant });
    }
  } else {
    if (options.source === 'engine' && options.engine !== 'oracle' && !readers[options.engine!]) throw new Error('Engine chưa được đăng ký. Lô 3.1 có engine oracle; không tải hay khởi chạy model.');
    for (const sample of await loadCases(join(root, options.set === 'real' ? 'testdata/images' : 'testdata/images-synthetic-hw'))) {
      const truth = await readJson(join(sample.directory, 'work.json')) as WorkTruth;
      const image = await sharp(join(sample.directory, sample.files[0]!)).metadata();
      const rotated = (image.orientation ?? 0) >= 5;
      const lines = workLines(sample.lines ?? [], (rotated ? image.height : image.width)!, (rotated ? image.width : image.height)!);
      let observedLines = lines;
      if (device) {
        const observed = device.get(sample.id); if (!observed) throw new Error('File thiết bị thiếu bài trong tập đã chọn.');
        observedLines = observed.map((l, index) => ({ ...l, index, page: l.page ?? 0 }));
      } else if (options.source === 'engine' && options.engine !== 'oracle') {
        observedLines = (await readers[options.engine!]!.readLines(await prepareImages(sample))).lines.map((l, index) => ({ ...l, page: 0, index }));
      }
      samples.push({ id: sample.id, spec: sample.truth, truth, lines, observed: observedLines, observedCount: observedLines.length, group: sample.truth.task.type, variant: sample.meta.variant ?? 'real' });
    }
  }
  if (!samples.length) throw new Error('Bộ bài làm rỗng; chưa đủ căn cứ để đo.');
  const rows = samples.map((s) => {
    const prediction = options.parser === 'real' ? realWork(s.spec, s.observed) : oracleWork(s.spec, s.truth, s.lines);
    return { id: s.id, group: s.group, variant: s.variant, observedLines: s.observedCount,
      comparison: compareWork(prediction, { ...s.truth, lines: s.lines }), expected: s.truth.expected,
      predictedClaimTypes: prediction.parsed.steps.map((step) => step.claim.type), unchecked: prediction.parsed.unchecked,
      issues: prediction.parsed.issues.map((issue) => ({ code: issue.code, lines: issue.lines })),
      firstErrorLines: prediction.grade.firstErrorLines ?? [],
      expectedErrorLines: s.truth.lineOf[String(s.truth.expected.firstErrorStep)] ?? [],
      predictedVerdict: prediction.grade.result.verdict, predictedErrorCode: prediction.grade.result.errorCode ?? null,
      deferredTruth: s.truth.claims.some((c) => ['dijkstra_init', 'dijkstra_select', 'dijkstra_label', 'nn_step', 'postman_duplicate'].includes(c.type)),
    };
  });
  const summarize = (subset: typeof rows) => {
    const comparison = subset.map((r) => r.comparison);
    const sum = (fn: (c: WorkComparison) => number): number => comparison.reduce((n, c) => n + fn(c), 0);
    const guards = subset.map((r) => uncheckedGuard(r.comparison, r.unchecked, r.firstErrorLines));
    const guardSum = (key: keyof ReturnType<typeof uncheckedGuard>) => guards.reduce((n, g) => n + g[key], 0);
    return { total: subset.length, completeCorrect: sum((c) => Number(c.completeCorrect)),
      claimMatched: sum((c) => c.claims.matched), claimPredicted: sum((c) => c.claims.predicted), claimReference: sum((c) => c.claims.reference),
      sourceCorrect: sum((c) => c.sourceLines.correct), sourceMatched: sum((c) => c.sourceLines.matched),
      verdictCorrect: sum((c) => Number(c.verdictCorrect === true)), verdictComparable: sum((c) => Number(c.verdictCorrect !== null)),
      confirmations: sum((c) => Number(c.confirmation)),
      firstErrorCorrect: sum((c) => Number(c.firstErrorCorrect === true)), firstErrorReference: sum((c) => Number(c.firstErrorCorrect !== null)),
      silentFalseCorrect: sum((c) => Number(c.silentFalseCorrect)), silentFalseWrongParse: sum((c) => Number(c.silentFalseWrongParse)),
      silentFalseWrongReading: sum((c) => Number(c.silentFalseWrongReading)), proseAsUnchecked: sum((c) => c.proseAsUnchecked),
      silentFalseCorrectWithUnchecked: guardSum('silentFalseCorrectWithUnchecked'),
      silentFalseCorrectWithoutUnchecked: guardSum('silentFalseCorrectWithoutUnchecked'),
      silentFalseWrongParseWithPriorUnchecked: guardSum('silentFalseWrongParseWithPriorUnchecked'),
      silentFalseWrongParseWithoutPriorUnchecked: guardSum('silentFalseWrongParseWithoutPriorUnchecked'),
      insufficientReasons: Object.fromEntries([...new Set(comparison.flatMap((c) => c.insufficientReasons))].map((reason) => [reason, comparison.filter((c) => c.insufficientReasons.includes(reason)).length])),
      struckAsContent: sum((c) => c.struckAsContent), insufficient: sum((c) => Number(c.insufficient)),
      questionsMean: subset.length ? sum((c) => c.questions) / subset.length : 0, questionsMax: Math.max(0, ...comparison.map((c) => c.questions)),
      completeRate: subset.length ? sum((c) => Number(c.completeCorrect)) / subset.length : 0 };
  };
  const withRates = (counts: ReturnType<typeof summarize>) => ({ ...counts,
    claimPrecision: counts.claimPredicted ? counts.claimMatched / counts.claimPredicted : counts.claimReference ? 0 : 1,
    claimRecall: counts.claimReference ? counts.claimMatched / counts.claimReference : counts.claimPredicted ? 0 : 1,
    sourceLineAccuracy: counts.sourceMatched ? counts.sourceCorrect / counts.sourceMatched : 1,
    verdictAccuracy: counts.verdictComparable ? counts.verdictCorrect / counts.verdictComparable : null,
    firstErrorAccuracy: counts.firstErrorReference ? counts.firstErrorCorrect / counts.firstErrorReference : null,
    insufficientRate: counts.total ? counts.insufficient / counts.total : 0,
  });
  const summary = withRates(summarize(rows));
  const groups = Object.fromEntries([...new Set(rows.map((r) => r.group))].map((g) => [g, withRates(summarize(rows.filter((r) => r.group === g)))]));
  const variants = Object.fromEntries([...new Set(rows.map((r) => r.variant))].map((v) => [v, withRates(summarize(rows.filter((r) => r.variant === v)))]));
  const silentErrors = rows.filter((r) => r.comparison.silentFalseCorrect || r.comparison.silentFalseWrongParse || r.comparison.silentFalseWrongReading)
    .map((r) => ({ id: r.id, type: r.comparison.silentFalseCorrect ? 'i' : r.comparison.silentFalseWrongParse ? 'ii' : 'iii',
      firstErrorLines: r.firstErrorLines, expectedErrorLines: r.expectedErrorLines, unchecked: r.unchecked }));
  const parser = options.parser ?? 'oracle';
  const report = { date, ...options, parser, fixtureOnly: true,
    note: parser === 'real' ? 'Parser Lô 3.3: văn xuôi, Dijkstra, nn_step, postman_duplicate, bảng và nhiều trang. Chấm trực tiếp bằng core.grade để đo; chưa có gradeWork, readingCheck hay nâng unchecked thành hỏi lại (Lô 3.4). Các chỉ số chấm là chẩn đoán, không phải pipeline an toàn hoàn chỉnh. Chưa đủ căn cứ trên bài thật.' : 'Parser oracle trả claims truth, bỏ qua chữ quan sát khi tạo claim. 100% chỉ kiểm bộ đo. Không phải độ chính xác đọc/hiểu, không mô phỏng hỏi lại (Lô 3.4). Chưa đủ căn cứ trên bài thật.',
    summary, proseOnly: withRates(summarize(rows.filter((r) => !r.deferredTruth))), groups, variants, silentErrors, rows };
  const source = `${options.set}-${options.source}${options.split ? '-' + options.split : ''}${options.engine ? '-' + options.engine.replace(/[^a-zA-Z0-9-]/g, '-') : ''}${options.variant ? '-' + options.variant : ''}${parser === 'real' ? '-real' : ''}`;
  const output = join(reportRoot, 'reports', `work-eval-${source}-${date}`); await mkdir(join(reportRoot, 'reports'), { recursive: true });
  const md = `# Đo bài làm — parser ${parser}\n\n${report.note}\n\nNguồn: ${options.set} / ${options.source}.\n\n| Nhóm | Bài | Hiểu hoàn toàn | Kết luận đúng / so được | Đúng lỗi đầu / bài SAI | Sai thầm lặng (i) | SAI hiểu sai (ii) | SAI đọc sai (iii) | Văn xuôi unchecked |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n`
    + Object.entries(groups).map(([g, s]) => `| ${g} | ${s.total} | ${s.completeCorrect} | ${s.verdictCorrect}/${s.verdictComparable} | ${s.firstErrorCorrect}/${s.firstErrorReference} | ${s.silentFalseCorrect} | ${s.silentFalseWrongParse} | ${s.silentFalseWrongReading} | ${s.proseAsUnchecked} |`).join('\n')
    + `\n\nTổng: ${summary.total}; hiểu hoàn toàn ${summary.completeRate * 100}%; claim ${summary.claimMatched}/${summary.claimReference}; đúng dòng ${summary.sourceCorrect}/${summary.sourceMatched}; hỏi lại ${summary.confirmations}; không đủ căn cứ ${summary.insufficient}; bước từ dòng gạch ${summary.struckAsContent}; sai thầm lặng (i)/(ii)/(iii): ${summary.silentFalseCorrect}/${summary.silentFalseWrongParse}/${summary.silentFalseWrongReading}; văn xuôi unchecked ${summary.proseAsUnchecked}.\n\nThiếu bằng chứng chữ (readingMismatch = null) được xếp bảo thủ vào (ii).\n`
    + `\nQuy tắc 6 (chỉ thống kê): (i) có/không unchecked ${summary.silentFalseCorrectWithUnchecked}/${summary.silentFalseCorrectWithoutUnchecked}; (ii) có/không unchecked trước dòng sai đầu tiên ${summary.silentFalseWrongParseWithPriorUnchecked}/${summary.silentFalseWrongParseWithoutPriorUnchecked}.\n`
    + (silentErrors.length ? '\n' + silentErrors.map((e) => `- ${e.id}: (${e.type}); dòng lỗi dự đoán [${e.firstErrorLines}], truth [${e.expectedErrorLines}]; unchecked [${e.unchecked}].`).join('\n') + '\n' : '');
  await writeFile(output + '.json', jsonText(report)); await writeFile(output + '.md', md);
  return report;
}
