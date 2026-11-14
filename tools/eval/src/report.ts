import type { ReadComparison, ReadUsage } from '@mathtwin/reader';
import type { ImageMeta } from './dataset.js';

export interface EvaluationRow { id: string; meta: ImageMeta; comparison: ReadComparison; usage: ReadUsage; nodeLatencyMs: number; issueCodes: string[] }
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)]!;
}
export function summarize(rows: EvaluationRow[]) {
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
    nodeLatencyMs: { p50: percentile(rows.map((r) => r.nodeLatencyMs), 0.5), p90: percentile(rows.map((r) => r.nodeLatencyMs), 0.9) },
    readerLatencyMs: { p50: percentile(rows.map((r) => r.usage.latencyMs), 0.5), p90: percentile(rows.map((r) => r.usage.latencyMs), 0.9) },
    peakMemoryMb: rows.some((r) => r.usage.peakMemoryMb !== undefined) ? Math.max(...rows.map((r) => r.usage.peakMemoryMb ?? 0)) : null, errors };
}
export function makeReport(engine: string, set: string, passes: 1 | 2, date: string, rows: EvaluationRow[]) {
  const groups = {
    printed: summarize(rows.filter((r) => r.meta.source === 'printed')),
    handwritten: summarize(rows.filter((r) => r.meta.source === 'handwritten')),
    tilted: summarize(rows.filter((r) => r.meta.capture === 'tilted')),
    blurred: summarize(rows.filter((r) => r.meta.blurred)),
  };
  return { engine, set, passes, date, fixtureOnly: engine === 'fake', downloadBytes: 0,
    phoneMeasurements: null, summary: summarize(rows), groups, rows };
}
export type EvaluationReport = ReturnType<typeof makeReport>;
export function renderReport(report: EvaluationReport): string {
  const percent = (value: number | null): string => value === null ? 'N/A' : `${(value * 100).toFixed(1)}%`;
  const ms = (value: number | null): string => value === null ? 'N/A' : value.toFixed(3);
  const lines = [`# Đánh giá đọc đề — ${report.engine} — ${report.date}`, '',
    `Bộ: ${report.set}; lượt đọc: ${report.passes}; môi trường: Node.`, '',
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
    `Bộ nhớ đỉnh do reader đo (MB): ${report.summary.peakMemoryMb ?? 'chưa đo'}. Dung lượng model tải: ${report.downloadBytes} byte.`,
    'Điện thoại thật: chưa có số đo. Không suy ra ngưỡng 15 giây từ số đo Node.', '', '## Lỗi theo loại và nguồn', '',
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
