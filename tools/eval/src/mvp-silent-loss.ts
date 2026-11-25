import { lineCarriesClaim, vocabularyOf } from '@mathtwin/work';
import type { WorkLine, WorkTruth } from '@mathtwin/work';
import { alignMvpWork } from './mvp.js';
import type { MvpRow, MvpFailure } from './mvp-report.js';

/** Lô 5.3 evaluator: claim-bearing truth lines that the final session excluded without ever
 * asking (auto strike, or region exclusion), computed from the stored session and truth only. */
/** `regionNotClaim`: excluded, but the parser would not read a claim from it even as working
 * (a reading problem, not a region-filter loss). */
export interface SilentLoss { struck: number[]; region: number[]; regionNotClaim?: number[] }
type RowLike = Pick<MvpRow, 'session'>;

export function silentClaimLoss(row: RowLike, reference: WorkLine[], workTruth: WorkTruth): SilentLoss {
  const lines = row.session.workLines;
  const claimLines = new Set(Object.values(workTruth.lineOf).flat()
    .filter((index) => reference.some((line) => line.index === index && !line.struck)));
  const answered = new Set(row.session.workAnswers.map((answer) => answer.line));
  const struck = new Set<number>(), region = new Set<number>(), regionNotClaim = new Set<number>();
  const vocab = row.session.spec ? vocabularyOf(row.session.spec) : undefined;
  for (const group of alignMvpWork(lines, reference).groups) {
    const truths = group.truth.filter((index) => claimLines.has(index));
    if (!truths.length) continue;
    const observed = group.observed.map((index) => lines.find((line) => line.index === index))
      .filter((line): line is WorkLine => line !== undefined && !answered.has(line.index));
    if (observed.some((line) => line.struck === true)) truths.forEach((index) => struck.add(index));
    else {
      const excluded = observed.filter((line) => (line.region === 'question' || line.region === 'figure') && !line.regionConfirmed);
      if (!excluded.length) continue;
      const claim = !vocab || excluded.some((line) => lineCarriesClaim(lines, line.index, vocab, { unchecked: true }));
      truths.forEach((index) => (claim ? region : regionNotClaim).add(index));
    }
  }
  const sorted = (set: Set<number>) => [...set].sort((a, b) => a - b);
  return { struck: sorted(struck), region: sorted(region), regionNotClaim: sorted(regionNotClaim) };
}

export interface LossReportInput {
  date: string; label: string; planned: number; rows: MvpRow[]; failures: MvpFailure[];
  loss: Map<string, SilentLoss>;
}

const answerKind = (answer: MvpRow['session']['workAnswers'][number]): 'region' | 'struck' | 'text' | 'skip' =>
  'region' in answer ? 'region' : 'struck' in answer ? 'struck' : 'text' in answer ? 'text' : 'skip';

/** Numbers only from the rows; no constants describe a result. */
export function lossSummary(input: LossReportInput) {
  const { rows, failures, planned } = input;
  const sum = (fn: (row: MvpRow) => number) => rows.reduce((n, row) => n + fn(row), 0);
  const loss = (fn: (l: SilentLoss) => number[]) => rows.reduce((n, row) => n + fn(input.loss.get(row.id) ?? { struck: [], region: [] }).length, 0);
  const pages = (fn: (l: SilentLoss) => number[]) => rows.filter((row) => fn(input.loss.get(row.id) ?? { struck: [], region: [] }).length > 0).length;
  const phases = [...rows, ...failures];
  const wrong = rows.filter((r) => r.expected.verdict === 'SAI').length + failures.filter((f) => f.expected?.verdict === 'SAI').length;
  const kinds = { region: 0, struck: 0, text: 0, skip: 0 };
  for (const row of rows) for (const answer of row.session.workAnswers) kinds[answerKind(answer)]++;
  const questions = rows.map((row) => row.workQuestions);
  return {
    rows: rows.length, failures: failures.length, planned,
    struckSilent: loss((l) => l.struck), struckPages: pages((l) => l.struck),
    regionSilent: loss((l) => l.region), regionPages: pages((l) => l.region), regionNotClaim: loss((l) => l.regionNotClaim ?? []),
    workQuestions: sum((r) => r.workQuestions), maxQuestions: Math.max(0, ...questions),
    meanQuestions: questions.length ? questions.reduce((a, b) => a + b, 0) / questions.length : 0,
    cropQuestions: sum((r) => r.regionQuestions), answers: kinds,
    readCorrect: phases.filter((r) => r.readComparison?.completeCorrect === true).length,
    solvedCorrect: phases.filter((r) => r.confirmedCorrect === true && r.solutionCheck?.correct === true).length,
    confirmed: phases.filter((r) => r.confirmedCorrect === true).length,
    verdictCorrect: rows.filter((r) => r.comparison.verdictCorrect === true).length,
    firstErrorCorrect: rows.filter((r) => r.comparison.firstErrorCorrect === true).length, wrong,
    silentFalse: rows.filter((r) => r.comparison.silentFalseCorrect || r.comparison.silentFalseWrongParse || r.comparison.silentFalseWrongReading).length,
    verdicts: rows.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.finalVerdict]: (acc[r.finalVerdict] ?? 0) + 1 }), {}),
  };
}

const pct = (n: number, d: number) => d ? `${n}/${d} (${(n / d * 100).toFixed(1)}%)` : 'chưa đo (0 mẫu)';

export function lossReport(before: LossReportInput, after: LossReportInput): string {
  const b = lossSummary(before), a = lossSummary(after);
  const changed = after.rows.filter((row) => {
    const old = before.rows.find((r) => r.id === row.id);
    return old !== undefined && old.finalVerdict !== row.finalVerdict;
  }).map((row) => `${row.id}: ${before.rows.find((r) => r.id === row.id)!.finalVerdict} → ${row.finalVerdict} (truth ${row.expected.verdict})`);
  const remaining = after.rows.flatMap((row) => {
    const l = after.loss.get(row.id); if (!l || !l.struck.length && !l.region.length && !l.regionNotClaim?.length) return [];
    return [`${row.id}: gạch [${l.struck.join(', ')}], vùng [${l.region.join(', ')}], ngoài vùng không đọc ra mệnh đề [${(l.regionNotClaim ?? []).join(', ')}]`];
  });
  const line = (name: string, x: string | number, y: string | number) => `| ${name} | ${x} | ${y} |`;
  return `# Lô 5.3 — gạch xóa và lọc vùng không làm mất mệnh đề im lặng (${after.date})

Chấm lại synthetic-hw bằng \`--rescore\` trên cùng OCR B đã lưu (không suy luận B mới). **Trước** = ${before.label}, **sau** = ${after.label}. Mọi số dưới đây tính từ hai tệp JSON và truth \`testdata/images-synthetic-hw\`; không có số viết cứng.

"Dòng mệnh đề mất im lặng" = dòng truth mang claim (\`work.json\` \`lineOf\`, không bị gạch trong truth) mà ở phiên cuối (sau mô phỏng trả lời) mọi dòng OCR căn với nó (căn dòng Lô 3.6) đều không được hỏi/trả lời và: bị đánh gạch (**gạch**), hoặc nằm ngoài vùng bài làm (\`question\`/\`figure\`) chưa xác nhận (**vùng**).

| Chỉ số | Trước | Sau |
| --- | ---: | ---: |
${line('Bài hoàn tất / lỗi đọc giữ nguyên', `${b.rows} / ${b.failures}`, `${a.rows} / ${a.failures}`)}
${line('Dòng mệnh đề bị gạch tự động không hỏi (số trang)', `${b.struckSilent} (${b.struckPages})`, `${a.struckSilent} (${a.struckPages})`)}
${line('Dòng mệnh đề bị lọc vùng không hỏi (số trang)', `${b.regionSilent} (${b.regionPages})`, `${a.regionSilent} (${a.regionPages})`)}
${line('Dòng truth mang mệnh đề nằm ngoài vùng nhưng chữ OCR không đọc ra mệnh đề (lỗi đọc, không do lọc vùng)', b.regionNotClaim, a.regionNotClaim)}
${line('Câu hỏi bài làm (tổng / TB mỗi bài / max)', `${b.workQuestions} / ${b.meanQuestions.toFixed(2)} / ${b.maxQuestions}`, `${a.workQuestions} / ${a.meanQuestions.toFixed(2)} / ${a.maxQuestions}`)}
${line('Trả lời theo loại: vùng / gạch / gõ lại / bỏ qua', `${b.answers.region} / ${b.answers.struck} / ${b.answers.text} / ${b.answers.skip}`, `${a.answers.region} / ${a.answers.struck} / ${a.answers.text} / ${a.answers.skip}`)}
${line('Hỏi khoanh vùng trang', b.cropQuestions, a.cropQuestions)}
${line('8.2-1 Đọc đề đúng hoàn toàn', pct(b.readCorrect, b.planned), pct(a.readCorrect, a.planned))}
${line('8.2-2 Giải đúng khi đề đúng', pct(b.solvedCorrect, b.confirmed), pct(a.solvedCorrect, a.confirmed))}
${line('8.2-3 Kết luận đúng/sai', pct(b.verdictCorrect, b.planned), pct(a.verdictCorrect, a.planned))}
${line('8.2-4 Bước sai đầu + mã lỗi', pct(b.firstErrorCorrect, b.wrong), pct(a.firstErrorCorrect, a.wrong))}
${line('Sai thầm lặng (Lô 3.6)', b.silentFalse, a.silentFalse)}
${line('Kết luận cuối', JSON.stringify(b.verdicts), JSON.stringify(a.verdicts))}

Câu hỏi tăng thêm: ${a.workQuestions - b.workQuestions} (tổng bài làm). Kết luận đổi giữa trước/sau (${changed.length}):
${changed.map((c) => `- ${c}`).join('\n') || '- không có'}

Dòng mệnh đề còn mất im lặng sau Lô 5.3 (${remaining.length} trang):
${remaining.map((r) => `- ${r}`).join('\n') || '- không có'}
`;
}
