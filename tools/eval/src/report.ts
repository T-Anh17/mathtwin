import type { ReadComparison, ReadUsage, TextComparison, TextMetrics, EditScore } from '@mathtwin/reader';
import type { ImageMeta } from './dataset.js';

export interface EvaluationRow {
  id: string; meta: ImageMeta; comparison?: ReadComparison; usage: ReadUsage; nodeLatencyMs?: number; issueCodes: string[];
  textComparisons?: TextComparison[]; errorCode?: string;
  serverRestarted?: boolean;
  truncatedLineCount?: number;
  unsupportedSymbolTruthLines?: number;
  memoryPressure?: { callback: 'onTrimMemory' | 'onLowMemory'; trimLevel: number | null };
  deviceTiming?: { totalMs: number; modelLoadMs: number; modelVerifyMs: number; reusedModel: boolean };
}
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)]!;
}
export function summarizeText(comparisons: TextMetrics[]) {
  const sum = (field: 'cer' | 'wer' | 'cerWithoutDiacritics' | 'digits' | 'vertexLabels'): EditScore => {
    const errors = comparisons.reduce((n, c) => n + c[field].errors, 0);
    const reference = comparisons.reduce((n, c) => n + c[field].reference, 0);
    return { errors, reference, rate: reference ? errors / reference : null };
  };
  const referenceLines = comparisons.reduce((n, c) => n + c.referenceLines, 0);
  const predictedLines = comparisons.reduce((n, c) => n + c.predictedLines, 0);
  const correctLines = comparisons.reduce((n, c) => n + c.correctLines, 0);
  const silentLines = comparisons.reduce((n, c) => n + c.silentLines, 0);
  const struckReferenceLines = comparisons.reduce((n, c) => n + c.struckReferenceLines, 0);
  const struckReadAsContent = comparisons.reduce((n, c) => n + c.struckReadAsContent, 0);
  const struckUnassessable = comparisons.reduce((n, c) => n + c.struckUnassessable, 0);
  const digitScore = sum('digits'); const labelScore = sum('vertexLabels');
  return { samples: comparisons.length, cer: sum('cer'), wer: sum('wer'), cerWithoutDiacritics: sum('cerWithoutDiacritics'),
    digits: { ...digitScore, accuracy: digitScore.rate === null ? null : Math.max(0, 1 - digitScore.rate) },
    vertexLabels: { ...labelScore, accuracy: labelScore.rate === null ? null : Math.max(0, 1 - labelScore.rate) },
    referenceLines, predictedLines, correctLines, lineRecall: referenceLines ? correctLines / referenceLines : null,
    silentLines, silentLineRate: predictedLines ? silentLines / predictedLines : null,
    struckReferenceLines, struckReadAsContent, struckUnassessable };
}
function summarizeTextPass(comparisons: TextComparison[]) {
  return { ...summarizeText(comparisons), byRegion: Object.fromEntries((['question', 'figure', 'table', 'solution'] as const).map((region) =>
    [region, summarizeText(comparisons.map((c) => c.byRegion[region]).filter((c) => c.referenceLines > 0 || c.predictedLines > 0 || c.struckReferenceLines > 0))])) };
}
export function summarize(all: EvaluationRow[]) {
  const rows = all.filter((r): r is EvaluationRow & { comparison: ReadComparison } => r.comparison !== undefined);
  const total = rows.length; const correct = rows.filter((r) => r.comparison.completeCorrect).length;
  const incorrect = total - correct;
  const flagged = rows.filter((r) => !r.comparison.completeCorrect && r.comparison.fullyFlagged).length;
  const graphCorrect = rows.filter((r) => r.comparison.graphCorrect).length;
  const coverage = { precise: 0, coarse: 0, none: 0 };
  for (const row of rows) for (const level of ['precise', 'coarse', 'none'] as const) coverage[level] += row.comparison.coverage[level];
  const errors: Record<string, number> = {};
  for (const row of rows) for (const [key, count] of Object.entries(row.comparison.errorCounts)) errors[key] = (errors[key] ?? 0) + count;
  return { total, correct, incorrect, graphCorrect, fullyFlagged: flagged,
    completeRate: total === 0 ? null : correct / total, graphRate: total === 0 ? null : graphCorrect / total,
    flaggedRate: incorrect === 0 ? null : flagged / incorrect,
    silentErrors: rows.filter((r) => r.comparison.silentError).map((r) => r.id),
    graphSilentErrors: rows.filter((r) => r.comparison.graphSilentError).map((r) => r.id), coverage,
    extraFlagsPerProblem: total === 0 ? null : rows.reduce((n, r) => n + r.comparison.extraFlags, 0) / total,
    evaluatedImages: all.length, failedImages: all.filter((r) => r.errorCode).map((r) => ({ id: r.id, code: r.errorCode })),
    memoryPressureCount: all.filter((r) => r.errorCode === 'memory_pressure').length,
    truncatedLines: all.some((r) => r.truncatedLineCount !== undefined) ? all.reduce((n, r) => n + (r.truncatedLineCount ?? 0), 0) : null,
    unsupportedSymbolTruthLines: all.some((r) => r.unsupportedSymbolTruthLines !== undefined) ? all.reduce((n, r) => n + (r.unsupportedSymbolTruthLines ?? 0), 0) : null,
    textByPass: Object.fromEntries(Array.from({ length: Math.max(0, ...all.map((r) => r.textComparisons?.length ?? 0)) }, (_, i) =>
      [String(i + 1), summarizeTextPass(all.flatMap((r) => r.textComparisons?.[i] ? [r.textComparisons[i]!] : []))])),
    nodeLatencyMs: { p50: percentile(all.flatMap((r) => r.nodeLatencyMs === undefined ? [] : [r.nodeLatencyMs]), 0.5), p90: percentile(all.flatMap((r) => r.nodeLatencyMs === undefined ? [] : [r.nodeLatencyMs]), 0.9) },
    readerLatencyMs: { p50: percentile(all.map((r) => r.usage.latencyMs), 0.5), p90: percentile(all.map((r) => r.usage.latencyMs), 0.9) },
    deviceTotalMs: { p50: percentile(all.flatMap((r) => r.deviceTiming ? [r.deviceTiming.totalMs] : []), 0.5), p90: percentile(all.flatMap((r) => r.deviceTiming ? [r.deviceTiming.totalMs] : []), 0.9) },
    serverMs: { p50: percentile(all.flatMap((r) => r.usage.serverTimings ? [r.usage.serverTimings.promptMs + r.usage.serverTimings.predictedMs] : []), 0.5), p90: percentile(all.flatMap((r) => r.usage.serverTimings ? [r.usage.serverTimings.promptMs + r.usage.serverTimings.predictedMs] : []), 0.9) },
    modelLoadMs: { cold: all.filter((r) => r.deviceTiming && !r.deviceTiming.reusedModel).map((r) => r.deviceTiming!.modelLoadMs), reused: all.filter((r) => r.deviceTiming?.reusedModel).map((r) => r.deviceTiming!.modelLoadMs) },
    peakMemoryMb: all.some((r) => r.usage.peakMemoryMb !== undefined) ? Math.max(...all.map((r) => r.usage.peakMemoryMb ?? 0)) : null, errors };
}
export interface ReportContext { mode?: 'graph' | 'lines' | 'both'; phoneMeasurements?: Record<string, unknown>; configuration?: Record<string, unknown>; unsupportedSymbols?: string[] }
export function makeReport(engine: string, set: string, passes: 1 | 2, date: string, rows: EvaluationRow[], context: ReportContext = {}) {
  const groups = {
    printed: summarize(rows.filter((r) => r.meta.source === 'printed')),
    handwritten: summarize(rows.filter((r) => r.meta.source === 'handwritten' && !r.meta.synthetic)),
    synthetic_handwriting: summarize(rows.filter((r) => r.meta.source === 'synthetic_handwriting')),
    legacy_synthetic_pen: summarize(rows.filter((r) => r.meta.source === 'handwritten' && r.meta.synthetic)),
    tilted: summarize(rows.filter((r) => r.meta.capture === 'tilted')),
    blurred: summarize(rows.filter((r) => r.meta.blurred)),
  };
  return { engine, set, passes, date, mode: context.mode ?? 'graph', fixtureOnly: engine === 'fake', downloadBytes: engine === 'fake' ? 0 : null,
    configuration: context.configuration ?? null, phoneMeasurements: context.phoneMeasurements ?? null, unsupportedSymbols: context.unsupportedSymbols ?? null, summary: summarize(rows), groups, rows };
}
export type EvaluationReport = ReturnType<typeof makeReport>;
export function renderReport(report: EvaluationReport): string {
  const percent = (value: number | null): string => value === null ? 'N/A' : `${(value * 100).toFixed(1)}%`;
  const ms = (value: number | null): string => value === null ? 'N/A' : value.toFixed(3);
  const lines = [`# Đánh giá đọc đề — ${report.engine} — ${report.date}`, '',
    `Bộ: ${report.set}; lượt đọc: ${report.passes}; chế độ: ${report.mode}; môi trường: ${report.phoneMeasurements ? 'Android (file xuất từ app)' : 'Node'}.`, '',
    ...(report.fixtureOnly ? ['**Reader giả dùng nhãn chuẩn, không đọc pixel. Các số này chỉ kiểm tra pipeline, không chứng minh chất lượng nhận dạng.**', ''] : []),
    '| Nhóm | Số đề | Đúng hoàn toàn | Chỉ đồ thị | Sai gắn cờ đủ / số sai | Sai thầm lặng toàn bài | Sai thầm lặng chỉ đồ thị | Cờ thừa/đề |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |'];
  for (const [name, group] of Object.entries({ all: report.summary, ...report.groups })) lines.push(
    `| ${name} | ${group.total} | ${percent(group.completeRate)} | ${percent(group.graphRate)} | ${group.fullyFlagged}/${group.incorrect} (${percent(group.flaggedRate)}) | ${group.silentErrors.length} | ${group.graphSilentErrors.length} | ${group.extraFlagsPerProblem ?? 'N/A'} |`);
  lines.push('', 'Nhóm nguồn ảnh có thể chồng lấn (ví dụ in + nghiêng + mờ). N/A = không có mẫu/mẫu sai.', '',
    '## Độ phủ từng phần tử lệch', '',
    '| Nhóm | precise | coarse | none |', '| --- | ---: | ---: | ---: |');
  for (const [name, group] of Object.entries({ all: report.summary, ...report.groups })) lines.push(
    `| ${name} | ${group.coverage.precise} | ${group.coverage.coarse} | ${group.coverage.none} |`);
  lines.push('', 'Mỗi phần tử lệch chỉ được tính một mức: precise (đúng mục và candidate), coarse (yêu cầu xem lại phần liên quan), none (không được phủ). Ưu tiên precise trước coarse. Có none là sai thầm lặng; chỉ số chỉ đồ thị bỏ qua phần câu hỏi.', '',
    `Độ trễ Node p50/p90 (ms, gồm đọc và chuẩn hóa, không gồm giải mã ảnh): ${ms(report.summary.nodeLatencyMs.p50)} / ${ms(report.summary.nodeLatencyMs.p90)}.`,
    `Bộ nhớ đỉnh do reader đo (MB): ${report.summary.peakMemoryMb ?? 'chưa đo'}. Dung lượng model tải (byte): ${report.downloadBytes ?? 'chưa đo'}.`,
    ...(report.phoneMeasurements ? [`Thiết bị và runtime: ${JSON.stringify(report.phoneMeasurements)}`, `Cấu hình: ${JSON.stringify(report.configuration)}`,
      `Biến thể CPU thực nạp (cpuVariant): ${report.configuration?.cpuVariant ?? 'chưa ghi nhận'}.`,
      `Tổng trên điện thoại p50/p90 (ms): ${ms(report.summary.deviceTotalMs.p50)} / ${ms(report.summary.deviceTotalMs.p90)}.`,
      `Server prompt + prediction p50/p90 (ms): ${ms(report.summary.serverMs.p50)} / ${ms(report.summary.serverMs.p90)}.`,
      `Thời gian nạp model (ms), nạp mới / dùng lại: ${JSON.stringify(report.summary.modelLoadMs.cold)} / ${JSON.stringify(report.summary.modelLoadMs.reused)}.`,
      'Thiết bị RAM < 6 GB chỉ chứng minh chạy được hay không; chưa dùng để kết luận cho máy mục tiêu.']
      : ['Điện thoại thật: chưa có số đo. Không suy ra ngưỡng 15 giây từ số đo Node.']), '', '## Chỉ số chữ theo lượt', '',
    '| Nhóm | Lượt | Vùng | Số ảnh | CER | WER | CER bỏ dấu | Đúng số | Đúng nhãn | Recall dòng | Sai thầm lặng/dòng dự đoán | Gạch xóa chép thành nội dung | Gạch xóa chưa đánh giá được |',
    '| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const [name, group] of Object.entries({ all: report.summary, ...report.groups })) for (const [pass, text] of Object.entries(group.textByPass)) {
    for (const [region, bucket] of Object.entries({ all: text, ...text.byRegion })) lines.push(
      `| ${name} | ${pass} | ${region} | ${bucket.samples} | ${percent(bucket.cer.rate)} | ${percent(bucket.wer.rate)} | ${percent(bucket.cerWithoutDiacritics.rate)} | ${percent(bucket.digits.accuracy)} | ${percent(bucket.vertexLabels.accuracy)} | ${percent(bucket.lineRecall)} | ${bucket.silentLines}/${bucket.predictedLines} (${percent(bucket.silentLineRate)}) | ${bucket.struckReadAsContent} | ${bucket.struckUnassessable} |`);
  }
  lines.push('', 'CER/WER cộng lỗi và mẫu số trên toàn nhóm; không lấy trung bình phần trăm. Recall dòng đòi hỏi khớp nguyên dòng đúng thứ tự. Mỗi lượt được báo cáo riêng, không chọn lượt tốt nhất bằng truth.', '');
  if (report.unsupportedSymbols !== null) {
    lines.push('## Giới hạn từ vựng và dòng bị cắt', '',
      `Ký hiệu ngoài từ vựng: ${report.unsupportedSymbols.join(' ') || 'không có'}.`, '',
      '| Nhóm | Dòng truncated | Dòng truth chứa ký hiệu ngoài từ vựng |', '| --- | ---: | ---: |');
    for (const [name, group] of Object.entries({ all: report.summary, ...report.groups })) lines.push(
      `| ${name} | ${group.truncatedLines ?? 'N/A'} | ${group.unsupportedSymbolTruthLines ?? 'N/A'} |`);
    lines.push('', 'Đếm mỗi dòng truth có hiệu lực một lần dù chứa nhiều ký hiệu thiếu. Truth giữ nguyên; CER/WER vẫn tính mọi dòng, kể cả dòng chứa ký hiệu thiếu và phần chữ truncated có conf = 0. Các bộ đếm này giúp phân biệt giới hạn từ vựng với lỗi đọc.', '');
  }
  lines.push(
    `Ảnh đã đánh giá: ${report.summary.evaluatedImages}; lỗi xử lý: ${report.summary.failedImages.length}.`,
    `Số ảnh dừng do memory_pressure: ${report.summary.memoryPressureCount}.`,
    ...report.summary.failedImages.map((r) => `- ${r.id}: ${r.code}`),
    ...report.rows.filter((r) => r.errorCode === 'memory_pressure' && r.memoryPressure).map((r) =>
      `- ${r.id}: ${r.memoryPressure!.callback}; trimLevel: ${r.memoryPressure!.trimLevel ?? 'không có (onLowMemory)'}.`), '', '## Lỗi theo loại và nguồn', '',
    '| Nhóm | Loại lỗi | Số phần tử lệch |', '| --- | --- | ---: |');
  for (const [name, group] of Object.entries({ all: report.summary, ...report.groups })) {
    for (const [type, count] of Object.entries(group.errors)) lines.push(`| ${name} | ${type} | ${count} |`);
  }
  if (Object.keys(report.summary.errors).length === 0) lines.push('| all | Không có lỗi | 0 |');
  lines.push('', '## Các bài sai thầm lặng toàn bài', '', ...(
    report.summary.silentErrors.length ? report.summary.silentErrors.map((id) => `- ${id}`) : ['Không có.']), '',
    '## Các bài sai thầm lặng chỉ đồ thị', '', ...(
      report.summary.graphSilentErrors.length ? report.summary.graphSilentErrors.map((id) => `- ${id}`) : ['Không có.']), '',
    'Chi tiết sai lệch theo mã mục, cờ và issue của từng đề nằm trong báo cáo JSON. Không ghi pixel, draft hay nguyên văn đề vào log.', '');
  return lines.join('\n');
}
