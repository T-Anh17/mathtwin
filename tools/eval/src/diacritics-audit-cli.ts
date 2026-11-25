import { readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { editDistance, stripDiacritics } from '@mathtwin/reader';
import type { TextLine } from '@mathtwin/reader';
import { inspectLostDiacritics, parseWork } from '@mathtwin/work';
import type { WorkLine, WorkVocabulary } from '@mathtwin/work';

interface Label {
  image: string;
  bai_id: number;
  text: string;
  question?: string;
  graph?: { vertices?: { label?: unknown }[]; edges?: { name?: unknown }[] };
  task?: { type?: unknown };
  question_format?: unknown;
}
interface ReportRow { image: string; sha256: string }
interface CheckpointReport { fingerprint: string; checkpointFingerprint?: string; rows: ReportRow[] }
interface Observation { lines: TextLine[] }
interface Pair { truth: string; actual: TextLine }

const emptyVocabulary: WorkVocabulary = {
  vertexLabels: [], edgeNames: [], task: 'path', questionFormat: 'tu_luan', statementIds: [], questionText: [],
};
const clean = (text: string): string => text.normalize('NFC').trim().replace(/\s+/gu, ' ');
const hasVietnameseDiacritic = (text: string): boolean => /đ|[\u0300-\u036f]/u.test(text.normalize('NFD').toLocaleLowerCase('vi-VN'));

function referenceLines(label: Label): string[] {
  return label.text.normalize('NFC').split(/\r?\n/u).map((raw) => clean(raw.replace(/^\|\s*|\s*\|$/gu, '').replace(/\s*\|\s*/gu, ' '))).filter(Boolean);
}

/** Reporting-only alignment; it never changes OCR output or supplies a correction. */
function align(lines: readonly TextLine[], truth: readonly string[]): Pair[] {
  const observed = lines.filter((line) => !line.struck);
  const n = truth.length, m = observed.length;
  const cost = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  const action = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 1; i <= n; i++) { cost[i]![0] = i; action[i]![0] = 1; }
  for (let j = 1; j <= m; j++) { cost[0]![j] = j; action[0]![j] = 2; }
  const folded = (text: string): string => stripDiacritics(clean(text)).toLowerCase();
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    const left = [...folded(truth[i - 1]!)], right = [...folded(observed[j - 1]!.text)];
    const substitution = editDistance(left, right) / Math.max(1, left.length, right.length);
    const choices = [cost[i - 1]![j - 1]! + substitution, cost[i - 1]![j]! + 1, cost[i]![j - 1]! + 1];
    cost[i]![j] = Math.min(...choices); action[i]![j] = choices.indexOf(cost[i]![j]!);
  }
  const pairs: Pair[] = [];
  for (let i = n, j = m; i || j;) {
    const step = action[i]![j];
    if (step === 0) { pairs.push({ truth: truth[i - 1]!, actual: observed[j - 1]! }); i--; j--; }
    else if (step === 1) i--;
    else j--;
  }
  return pairs;
}

function vocabulary(label: Label): WorkVocabulary | undefined {
  if (!label.graph || !label.task || typeof label.task.type !== 'string') return undefined;
  const vertexLabels = (label.graph.vertices ?? []).flatMap((vertex) => typeof vertex.label === 'string' ? [vertex.label] : []);
  const edgeNames = (label.graph.edges ?? []).flatMap((edge) => typeof edge.name === 'string' ? [edge.name] : []);
  if (!vertexLabels.length) return undefined;
  return { vertexLabels, edgeNames, task: label.task.type as WorkVocabulary['task'],
    questionFormat: label.question_format === 'trac_nghiem' || label.question_format === 'dung_sai' ? label.question_format : 'tu_luan',
    statementIds: [], questionText: typeof label.question === 'string' ? [label.question] : [] };
}

function asLabels(value: unknown): Label[] {
  if (!Array.isArray(value)) throw new Error('labels.json phải là một mảng.');
  return value.map((item): Label => {
    if (!item || typeof item !== 'object') throw new Error('Nhãn trang không hợp lệ.');
    const label = item as Partial<Label>;
    if (typeof label.image !== 'string' || !Number.isSafeInteger(label.bai_id) || typeof label.text !== 'string') {
      throw new Error('Nhãn trang thiếu image, bai_id hoặc text.');
    }
    return label as Label;
  });
}

function asReport(value: unknown): CheckpointReport {
  if (!value || typeof value !== 'object') throw new Error('Báo cáo checkpoint không hợp lệ.');
  const report = value as Partial<CheckpointReport>;
  if (typeof report.fingerprint !== 'string' || !Array.isArray(report.rows)
    || !report.rows.every((row) => row && typeof row.image === 'string' && typeof row.sha256 === 'string')) {
    throw new Error('Báo cáo checkpoint thiếu fingerprint hoặc rows.');
  }
  if (report.checkpointFingerprint !== undefined && typeof report.checkpointFingerprint !== 'string') {
    throw new Error('checkpointFingerprint trong báo cáo checkpoint không hợp lệ.');
  }
  return report as CheckpointReport;
}

const { values } = parseArgs({ options: { labels: { type: 'string' }, report: { type: 'string', multiple: true }, output: { type: 'string' } } });
if (!values.labels || !values.report?.length || !values.output) {
  throw new Error('Dùng --labels <labels.json> --report <checkpoint.json> [--report <checkpoint.json>] --output <reports/tên-không-đuôi>.');
}
const root = resolve(process.cwd());
const labels = asLabels(JSON.parse(await readFile(values.labels, 'utf8')));
const labelsByImage = new Map(labels.map((label) => [label.image, label]));
// Multi-page labels repeat the case id; later pages can omit graph/task, so
// reuse the first complete case vocabulary rather than treating that page as
// a separate missing-label case.
const vocabularyByCase = new Map<number, WorkVocabulary | undefined>();
for (const label of labels) {
  const candidate = vocabulary(label);
  if (candidate || !vocabularyByCase.has(label.bai_id)) vocabularyByCase.set(label.bai_id, candidate);
}
const output = resolve(values.output);

const checkpoints = [] as {
  name: string; report: string; fingerprint: string; observationFingerprint: string; pages: number; missingVocabularyCases: number[];
  allAccentLossLines: number; highConfidenceAccentLossLines: number; definitionLines: number;
  unaskedDefinitionLines: number; unaskedAccentLossLines: number; nonSolutionDefinitionLines: number;
  nonQualifyingHighConfidenceLines: number; nonQualifyingReasons: Record<string, number>;
  falsePositiveLines: number;
}[];

for (const reportPath of values.report) {
  const report = asReport(JSON.parse(await readFile(reportPath, 'utf8')));
  const name = basename(reportPath, '.json');
  // A --rescore report has a new reporting fingerprint but reads observations
  // from its recorded original checkpoint. Prefer that explicit provenance.
  const observationFingerprint = report.checkpointFingerprint ?? report.fingerprint;
  const cache = join(root, 'reports/.debug', name, observationFingerprint);
  const files = await readdir(cache);
  let allAccentLossLines = 0, highConfidenceAccentLossLines = 0, definitionLines = 0;
  let unaskedDefinitionLines = 0, unaskedAccentLossLines = 0, nonSolutionDefinitionLines = 0;
  let nonQualifyingHighConfidenceLines = 0, falsePositiveLines = 0;
  const nonQualifyingReasons: Record<string, number> = {};
  const missingVocabularyCases = new Set<number>();
  for (const row of report.rows) {
    const label = labelsByImage.get(row.image);
    if (!label) throw new Error(`Không tìm thấy nhãn cho ${row.image}.`);
    const expected = `${row.image}-${row.sha256}.json`;
    if (!files.includes(expected)) throw new Error(`Thiếu checkpoint OCR ${expected}.`);
    const observation = JSON.parse(await readFile(join(cache, expected), 'utf8')) as Observation;
    if (!Array.isArray(observation.lines)) throw new Error(`Checkpoint ${expected} không có lines.`);
    const vocab = vocabularyByCase.get(label.bai_id);
    if (!vocab) missingVocabularyCases.add(label.bai_id);
    // Run the real work parser on the page: a line is "asked" when it ends in
    // unchecked or in a step whose confidence is below the threshold.
    const workLines: WorkLine[] = observation.lines.filter((line) => !line.struck).map((line, index) => ({ ...line, page: 0, index }));
    const indexOf = new Map(observation.lines.filter((line) => !line.struck).map((line, index) => [line, index]));
    const parsed = parseWork(workLines, vocab ?? emptyVocabulary);
    const asked = new Set([...parsed.unchecked, ...parsed.steps.filter((step) => (step.claim.conf ?? 1) < .85).flatMap((step) => step.lines)]);
    const solutionLine = (line: TextLine): boolean => line.region !== 'question' && line.region !== 'figure';
    for (const pair of align(observation.lines, referenceLines(label))) {
      const truthHasDiacritics = hasVietnameseDiacritic(pair.truth);
      const actualHasDiacritics = hasVietnameseDiacritic(pair.actual.text);
      const inspection = inspectLostDiacritics(pair.actual.text, vocab ?? emptyVocabulary);
      if (!truthHasDiacritics && inspection.lost) falsePositiveLines++;
      if (!truthHasDiacritics || actualHasDiacritics) continue;
      allAccentLossLines++;
      const highConfidence = pair.actual.conf >= .85;
      if (highConfidence) highConfidenceAccentLossLines++;
      const silent = solutionLine(pair.actual) && !asked.has(indexOf.get(pair.actual)!);
      if (silent && highConfidence) unaskedAccentLossLines++;
      if (inspection.lost) {
        definitionLines++;
        if (!solutionLine(pair.actual)) nonSolutionDefinitionLines++;
        if (silent) unaskedDefinitionLines++;
      } else if (highConfidence) {
        nonQualifyingHighConfidenceLines++;
        const reason = inspection.matchedWords.length === 0 ? 'no_familiar_word' : inspection.matchedWords.length < 3 ? 'one_or_two_familiar_words' : 'other';
        nonQualifyingReasons[reason] = (nonQualifyingReasons[reason] ?? 0) + 1;
      }
    }
  }
  checkpoints.push({ name, report: resolve(reportPath), fingerprint: report.fingerprint, observationFingerprint, pages: report.rows.length,
    missingVocabularyCases: [...missingVocabularyCases].sort((a, b) => a - b), allAccentLossLines, highConfidenceAccentLossLines,
    definitionLines, unaskedDefinitionLines, unaskedAccentLossLines, nonSolutionDefinitionLines, nonQualifyingHighConfidenceLines, nonQualifyingReasons, falsePositiveLines });
}

const json = { generatedAt: new Date().toISOString(), definition: 'OCR line has no Vietnamese diacritic (including đ) and matches at least three familiar accented Vietnamese words.',
  threshold: .85, labels: resolve(values.labels), checkpoints };
const atomicWrite = async (path: string, data: string): Promise<void> => {
  await writeFile(path + '.tmp', data); await rename(path + '.tmp', path);
};
await atomicWrite(output + '.json', JSON.stringify(json, null, 2) + '\n');
await atomicWrite(output + '.md', [
  '# Kiểm toán dòng OCR mất dấu', '',
  'Dữ liệu OCR được đọc lại từ checkpoint, không khởi động suy luận mới. Căn dòng chỉ phục vụ đo lường, không sửa OCR.', '',
  '| Checkpoint | Trang | Mất toàn bộ dấu | Conf ≥ 0,85 | Thỏa Lô 5.4 | Thỏa nhưng vùng đề/hình | Thỏa mà lọt không hỏi | Mất dấu conf cao lọt không hỏi | Không-thỏa nhưng conf cao | Báo nhầm |',
  '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ...checkpoints.map((item) => `| ${item.name} | ${item.pages} | ${item.allAccentLossLines} | ${item.highConfidenceAccentLossLines} | ${item.definitionLines} | ${item.nonSolutionDefinitionLines} | ${item.unaskedDefinitionLines} | ${item.unaskedAccentLossLines} | ${item.nonQualifyingHighConfidenceLines} | ${item.falsePositiveLines} |`),
  '',
  ...checkpoints.flatMap((item) => [
    `## ${item.name}`, '',
    `Fingerprint báo cáo: \`${item.fingerprint}\`; fingerprint checkpoint OCR: \`${item.observationFingerprint}\`. Vocab thiếu graph/task: ${item.missingVocabularyCases.length ? item.missingVocabularyCases.join(', ') : 'không có'}.`,
    `Các dòng mất dấu nhưng không thỏa định nghĩa và vẫn conf cao: ${item.nonQualifyingHighConfidenceLines}; lý do: ${Object.entries(item.nonQualifyingReasons).map(([reason, count]) => `${reason}=${count}`).join(', ') || 'không có'}.`,
    '“Lọt không hỏi” chạy `parseWork` thật trên cả trang (vocab của bài): dòng vùng lời giải không nằm trong `unchecked` và không thuộc bước có conf < 0,85. Dòng vùng đề/hình không vào chấm nên không tính lọt.', '',
  ]),
  '## Lệnh checkpoint Lượt B', '',
  'Checkpoint `…-2026-11-24-phase5` là lượt thử prompt `lines` có thêm câu giữ dấu tiếng Việt (`by-page`). Prompt đó đã được hoàn lại vì CER cả trang xấu hơn `lines` cũ; lệnh dưới đây đo lại một checkpoint mới theo cùng cách:', '',
  '```powershell',
  `npm run build; npm run build:mvp --workspace @mathtwin/eval; node tools/eval/dist/mvp/tools/eval/src/mvp-handwriting-cli.js --images "${resolve(join(dirname(values.labels), 'images/da-soat'))}" --labels "${resolve(values.labels)}" --date 2026-11-24 --run phase5 --line-prompt by-page`,
  `node tools/eval/dist/diacritics-audit-cli.js --labels "${resolve(values.labels)}" --report reports/read-eval-generated-handwriting-2026-11-19.json --report reports/read-eval-generated-handwriting-2026-11-19-reader-revision.json --report reports/read-eval-generated-handwriting-2026-11-24-phase5.json --output reports/diacritics-audit-2026-11-24`,
  '```', '',
].join('\n'));
console.log(`Đã ghi ${output}.json và ${output}.md.`);
