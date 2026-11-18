import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { repositoryRoot } from './cli.js';
import type { evaluateWork } from './work-eval.js';

type Report = Awaited<ReturnType<typeof evaluateWork>>;
type Row = Report['rows'][number];
const date = process.argv[2] ?? new Date().toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) throw new Error('Ngày phải là YYYY-MM-DD.');
const root = repositoryRoot;
const sources = [
  ['work-text test', 'work-text-truth-test-real'],
  ['work-text bảng test', 'work-text-tables-truth-test-real'],
  ['synthetic-hw truth', 'synthetic-hw-truth-real'],
  ['synthetic-hw B', 'synthetic-hw-device-real'],
  ['synthetic-hw C Node', 'synthetic-hw-engine-offline-vietocr-onnx-real'],
];
const reports: { name: string; file: string; sha256: string; report: Report }[] = [];
for (const [name, source] of sources) {
  const file = `work-eval-${source}-${date}.json`;
  const bytes = await readFile(join(root, 'reports', file));
  const report = JSON.parse(bytes.toString('utf8')) as Report;
  if (report.parser !== 'real' || report.rows.length !== report.summary.total) throw new Error('Báo cáo nguồn không hợp lệ.');
  reports.push({ name: name!, file, sha256: createHash('sha256').update(bytes).digest('hex'), report });
}
const pct = (a: number, b: number) => b ? `${(a / b * 100).toFixed(1)}%` : 'N/A';
function summary(rows: Row[], after: boolean) {
  const cs = rows.map((r) => after ? r.afterComparison : r.comparison);
  const sum = (fn: (c: Row['comparison']) => number) => cs.reduce((n, c) => n + fn(c), 0);
  const n = rows.length;
  const correct = sum((c) => Number(c.verdictCorrect === true));
  const comparable = sum((c) => Number(c.verdictCorrect !== null));
  const silent = ['silentFalseCorrect', 'silentFalseWrongParse', 'silentFalseWrongReading'] as const;
  return { n, complete: pct(sum((c) => Number(c.completeCorrect)), n),
    claim: `${pct(sum((c) => c.claims.matched), sum((c) => c.claims.predicted))} / ${pct(sum((c) => c.claims.matched), sum((c) => c.claims.reference))}`,
    source: `${sum((c) => c.sourceLines.correct)}/${sum((c) => c.sourceLines.matched)}`,
    verdict: `${correct}/${comparable} (${pct(correct, comparable)}); /N ${pct(correct, n)}`,
    first: `${sum((c) => Number(c.firstErrorCorrect === true))}/${sum((c) => Number(c.firstErrorCorrect !== null))}`,
    silent: silent.map((key) => sum((c) => Number(c[key]))).join('/'),
    confirmation: sum((c) => Number(c.confirmation)), insufficient: sum((c) => Number(c.insufficient)),
    prose: sum((c) => c.proseAsUnchecked), struck: sum((c) => c.struckAsContent),
    questions: `${(sum((c) => c.questions) / n).toFixed(2)}/${Math.max(0, ...cs.map((c) => c.questions))}`,
    reasons: Object.fromEntries([...new Set(cs.flatMap((c) => c.insufficientReasons))].map((reason) => [reason, cs.filter((c) => c.insufficientReasons.includes(reason)).length])),
  };
}
const parts = [
  `# Lô 3.6 — Đo bài làm và quyết định đi/dừng (${date})`,
  'Nền: 677d02b2 (Lô 3.1–3.5). Chỉ bổ sung adapter CLI và chẩn đoán/báo cáo sau inference; không sửa parser, không sinh corpus, không tải model, không adb. Chưa có ảnh bài làm real.',
  '## Phương pháp và giới hạn',
  'Chữ truth/oracle ở đây là transcription chuẩn **qua parser real**, không phải parser oracle trả thẳng claims. work-text và work-text-tables dùng toàn bộ split test, đủ a–d; không xem wording hay mẫu test. synthetic-hw gồm 40 trang, mỗi trang tính một bài đo; không phải 40 bài học sinh độc lập. B dùng duy nhất linePasses[0] của file vivo đã chỉ định. B chưa có charConf: dùng conf dòng, không điền charConf giả. C dùng adapter Node PP-OCRv6 + VietOCR, model hiện có .models/c được adapter kiểm kích thước/SHA-256; không đổi model hay tham số.',
  'Hiểu hoàn toàn so dãy ClaimBody; claim precision/recall dùng LCS. Kết luận đúng chỉ so verdict; CAN_XAC_NHAN đếm riêng, mẫu số “so được” loại bài còn hỏi; kèm đúng/N. Lỗi đầu phải giao dòng truth và trùng errorCode trên mọi bài truth SAI. Sai thầm lặng i = DUNG/truth SAI; ii = SAI sai dòng hoặc truth DUNG, chữ đúng; iii = như ii với chữ đọc sai. Đổi nguồn dự đoán sang tọa độ truth bằng căn dòng trước khi so nguồn/lỗi đầu. readingMismatch so chữ NFC, gộp khoảng trắng trên nhóm căn dòng chứa dòng lỗi được báo, đúng định nghĩa (ii)/(iii); sai đọc trước đó chỉ dùng chẩn đoán nguyên nhân. OCR thừa không có truth là đọc khác, không gán chữ truth theo index OCR.',
  'B/C căn đơn điệu bằng DP edit distance trên chữ bỏ dấu/chữ thường/bỏ dấu câu; bỏ trống hai phía, nhóm 1:N/N:1 tối đa 4 dòng. Khoảng cách chuẩn hóa ≤0,6, gap 0,7, phạt mỗi dòng thêm 0,7 (bằng gap để nhóm không thắng chỉ nhờ nuốt nhiều dòng). Bỏ một mảnh không được làm số phép sửa giảm; không gộp nội dung khác region/trạng thái gạch. Truth gạch rỗng giữa nhóm được giữ như gap, không phục hồi thành chữ/nguồn claim. IoU box nếu có hai phía góp tối đa 0,04; không ghép xuyên trang. Chỉ chữ/box dùng căn dòng, không dùng claim/expected/conf. Fixture chữ có index nguồn chuẩn giữ ánh xạ sẵn có. Căn dòng vẫn là ước lượng chưa kiểm chứng trên ảnh thật; nhãn hình đảo thứ tự có thể thành dòng thừa.',
  'Hỏi lại dùng căn dòng cố định trước trả lời, gồm readingCheck của mọi SAI. OCR khớp nhiều truth: nối chữ; OCR thừa: skip; truth gạch: struck. Nhiều OCR khớp một truth: khôi phục ở mảnh đầu, skip mảnh còn lại trong cùng lượt, tránh nhân đôi claim. Mỗi dòng OCR trả lời tối đa một lần; truth còn chưa hiểu không tự bỏ qua. Q TB/max sau là tổng lượt hỏi thực tế; trước là số câu đang chờ. Đây là mô phỏng thuận lợi, không phải hành vi người dùng thật.',
  'eval:work đo chữ → parse → grade, không gọi readWork/detectStrikes. Truth giữ cờ gạch chuẩn; B/C chỉ có bằng chứng gạch do reader cung cấp. Số bước từ dòng gạch không chứng minh chất lượng detector đầu-cuối. Sai nhãn/số là đối chiếu token trên nhóm căn dòng; dòng mất đếm riêng, không gán thành lỗi token. Chẩn đoán không tự chứng minh quan hệ nhân quả.',
  '## Tổng hợp trước/sau hỏi lại',
  '| Nguồn | N | Hiểu hoàn toàn trước → sau | Kết luận đúng/so được; đúng/N trước → sau | Đúng lỗi đầu trước → sau | Sai thầm lặng i/ii/iii trước → sau | Còn hỏi trước → sau | Q TB/max thực tế |',
  '| --- | ---: | --- | --- | --- | --- | --- | --- |',
];
const safe = (s: string) => s.replaceAll('|', '\\|').replaceAll('\n', ' ↵ ').replaceAll('\r', '');
const aggregate = reports.flatMap(({ name, report }) => report.set.startsWith('work-text')
  ? ['a', 'b', 'c', 'd'].map((variant) => ({ name: `${name} ${variant}`, rows: report.rows.filter((r) => r.variant === variant) }))
  : [{ name, rows: report.rows }]);
for (const { name, rows } of aggregate) {
  const b = summary(rows, false), a = summary(rows, true);
  parts.push(`| ${name} | ${b.n} | ${b.complete} → ${a.complete} | ${b.verdict} → ${a.verdict} | ${b.first} → ${a.first} | ${b.silent} → ${a.silent} | ${b.confirmation} → ${a.confirmation} | ${a.questions} |`);
}
parts.push('\n## Theo nguồn chữ × dạng bài',
  '| Nguồn | Dạng bài | Lượt | N | Hiểu hoàn toàn | Claim P/R | Đúng dòng/claim ghép | Kết luận đúng/so được; đúng/N | Đúng lỗi đầu/bài SAI | i/ii/iii | Còn hỏi | Không đủ căn cứ | Văn xuôi unchecked | Bước từ dòng gạch | Q TB/max |',
  '| --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- |');
for (const { name, rows } of aggregate) for (const task of [...new Set(rows.map((r) => r.task))].sort()) {
  const subset = rows.filter((r) => r.task === task);
  for (const after of [false, true]) {
    const s = summary(subset, after);
    parts.push(`| ${name} | ${task} | ${after ? 'sau' : 'trước'} | ${s.n} | ${s.complete} | ${s.claim} | ${s.source} | ${s.verdict} | ${s.first} | ${s.silent} | ${s.confirmation} | ${s.insufficient} (${pct(s.insufficient, s.n)}) | ${s.prose} | ${s.struck} | ${s.questions} |`);
  }
}
parts.push('\n## Bảng lỗi hay gặp',
  'Đếm nhóm căn dòng chứa nội dung truth (các cờ có thể chồng lấn), riêng gạch đếm bước. Sai số: dãy token số khác. Sai nhãn: token bằng nhãn vocabulary hoặc nhãn A–Z khác; không tách nhãn dính, nên có thể bỏ sót. Mất dấu làm hỏng: chữ khác nhưng bỏ dấu bằng nhau và claim truth thiếu hoặc dòng unchecked. Sai bảng: dòng table có claim truth thiếu/unchecked. Cách viết không hiểu: chữ đúng nguyên văn nhưng thiếu claim truth/unchecked; có thể bao gồm thiếu trường claim không biểu diễn trong chữ. Đây là cờ chẩn đoán tự động, không phải các nhóm nguyên nhân đã review thủ công.',
  '| Nguồn | Sai số | Sai nhãn | Mất dấu làm hỏng | Sai bảng | Gạch thành nội dung | Cách viết không hiểu |',
  '| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
for (const { name, rows } of aggregate) {
  const keys = ['numberMismatch', 'labelMismatch', 'accentDamage', 'tableFailure', 'struckAsContent', 'unsupportedWording'] as const;
  parts.push(`| ${name} | ${keys.map((key) => `${rows.reduce((n, r) => n + r.audit.diagnostics[key], 0)} → ${rows.reduce((n, r) => n + r.afterAudit.diagnostics[key], 0)}`).join(' | ')} |`);
}
parts.push('\n## Nguyên nhân sai thầm lặng B/C và region',
  'Mỗi ca nhận một nhóm theo ưu tiên bằng chứng: (a) mất dòng claim chứa lỗi truth; (c) dòng hình/đề tham gia claim hoặc unchecked trước lỗi dự đoán; (b) đọc sai dòng nội dung/gạch với conf dòng ≥0,85 trong prefix lỗi (với DUNG sai: ở dòng lỗi truth); (a) mất claim khác; còn lại (d) pipeline. Đây là quy tắc quy nguyên nhân sau đo; JSON giữ bằng chứng để reviewer kiểm. Nhãn hình xuất sau lời giải có thể không căn đơn điệu: chỉ nhận diện vùng hình/đề khi khớp nguyên văn truth vùng đó; OCR thừa khác vẫn chưa rõ vùng. (d) cần kiểm tra chữ và cờ gạch, không sửa parser ở lô này.',
  '| Nguồn | Lượt | (a) Mất dòng | (b) Đọc sai conf cao | (c) Hình/đề lẫn | (d) Pipeline |',
  '| --- | --- | ---: | ---: | ---: | ---: |');
const ocrReports = reports.filter(({ report }) => report.source !== 'truth');
for (const { name, report } of ocrReports) for (const after of [false, true]) {
  const audits = report.rows.map((r) => after ? r.afterAudit : r.audit);
  parts.push(`| ${name} | ${after ? 'sau' : 'trước'} | ${['a', 'b', 'c', 'd'].map((cause) => audits.filter((a) => a.cause === cause).length).join(' | ')} |`);
}
parts.push('\nSố bài B/C hiểu hoàn toàn trước nhưng sai sau hỏi lại: ' + ocrReports.map(({ name, report }) => `${name} = ${report.rows.filter((r) => r.comparison.completeCorrect && !r.afterComparison.completeCorrect).length}`).join('; ') + '.');
const example = ocrReports.find(({ report }) => report.source === 'device')?.report.rows.find((r) => r.id === '01-elements-multigraph-patrick-perspective');
if (example) {
  const matched = example.alignment.groups.filter((g) => g.truth.some((i) => example.expectedErrorLines.includes(i))).flatMap((g) => g.observed);
  parts.push(`\nKiểm lại ví dụ B 01-elements-multigraph-patrick-perspective trong review: dòng lỗi truth [${example.expectedErrorLines}] khớp OCR [${matched}]. ${matched.length ? 'Dòng lỗi có trong OCR ở vị trí khác, không tính là mất dòng theo căn dòng mới.' : 'Không có OCR khớp dòng lỗi; tính vào nhóm mất dòng nếu ra DUNG sai.'}`);
}
parts.push('\nDòng hình/đề “vào lời giải” là dòng không được reader gắn region question/figure, nên parser nhận như đầu vào bài làm. Cột “tham gia” chỉ đếm dòng sinh claim hoặc nằm unchecked; không tính prose/empty bị bỏ qua. Không suy tất cả OCR thừa thành dòng hình.',
  '| Nguồn | Có region / tổng OCR | Giá trị region | Hình vào trước → sau | Hình tham gia trước → sau | Hình/đề vào trước → sau | Hình/đề tham gia trước → sau | OCR chưa căn được trước | Dòng claim truth mất |',
  '| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |');
for (const { name, report } of ocrReports) {
  const sum = (key: 'figureLines' | 'figureUsed' | 'intrusionLines' | 'intrusionUsed' | 'unmatchedLines' | 'missingClaimLines', after = false) => report.rows.reduce((n, r) => n + (after ? r.afterAudit : r.audit)[key].length, 0);
  const regions: Record<string, number> = {};
  for (const r of report.rows) for (const [key, value] of Object.entries(r.audit.region.values)) regions[key] = (regions[key] ?? 0) + value;
  parts.push(`| ${name} | ${report.rows.reduce((n, r) => n + r.audit.region.present, 0)}/${report.rows.reduce((n, r) => n + r.audit.region.total, 0)} | ${JSON.stringify(regions)} | ${sum('figureLines')} → ${sum('figureLines', true)} | ${sum('figureUsed')} → ${sum('figureUsed', true)} | ${sum('intrusionLines')} → ${sum('intrusionLines', true)} | ${sum('intrusionUsed')} → ${sum('intrusionUsed', true)} | ${sum('unmatchedLines')} | ${sum('missingClaimLines')} |`);
}
parts.push('\n## Kiểm toán và tái lập',
  'Lệnh: `npm run eval:work -- --set work-text --lines truth --split test --parser real`; tương tự `work-text-tables` (không lọc variant = đủ a–d). `npm run eval:work -- --set synthetic-hw --lines truth --parser real`; thay truth bằng `device reports/.debug/device-vivo-app-b768-2026-11-17-40.json` hoặc `engine offline:vietocr-onnx`. Cuối cùng `node tools/eval/dist/work-report-cli.js ' + date + '` sinh báo cáo này. Các danh sách từng bài phía dưới do công cụ sinh; chỉ xem số tổng hợp và chi tiết B/C synthetic-hw, không xem chi tiết từng bài split test.',
  '| JSON nguồn | SHA-256 | Dòng có charConf / tổng dòng | Vi phạm trần câu hỏi | KHONG_DU_CAN_CU trước → sau (lý do) |',
  '| --- | --- | --- | ---: | --- |');
for (const { file, sha256, report } of reports) parts.push(`| ${file} | ${sha256} | ${report.rows.reduce((n, r) => n + r.charConfidenceLines, 0)}/${report.rows.reduce((n, r) => n + r.observedLines, 0)} | ${report.afterSummary.questionBoundViolations} | ${JSON.stringify(summary(report.rows, false).reasons)} → ${JSON.stringify(summary(report.rows, true).reasons)} |`);
const device = await readFile(join(root, 'reports/.debug/device-vivo-app-b768-2026-11-17-40.json'));
parts.push(`\nSHA-256 file B: ${createHash('sha256').update(device).digest('hex')}.`);
const gates = await readFile(join(root, `reports/.debug/work-gates-${date}.json`), 'utf8');
parts.push('\n## Cổng kiểm tra', '```json\n' + gates.trim() + '\n```',
  '\n## Quyết định & giả định',
  'Không chỉnh parser theo test. Bổ sung task và nhóm task, charConfidenceLines, audit/afterAudit vào JSON eval chỉ để đo; không ảnh hưởng inference. Chạy thêm split test bảng hiện có để phủ Dijkstra, không sinh mẫu. Các cách viết/corpus/model được giữ nguyên. Không có nguồn real: N=0, tất cả chỉ số real N/A. Không suy rộng tỷ lệ trên ảnh tổng hợp thành nghiệm thu. Không làm Lô 3.7.',
  '\n<!-- BEGIN AUTO-GENERATED PER-CASE DETAILS: DO NOT INSPECT DURING THIS BATCH -->',
  '## Danh sách từng bài sai thầm lặng (tự sinh)',
  'Chỉ dữ liệu tổng hợp. Dòng 0-based; dòng lỗi dự đoán, dòng lỗi truth, các dòng thiếu claim/unchecked và chữ trước/sau được giữ để reviewer kiểm. Với (i), dòng gây ra có thể là dòng truth bị bỏ; đây là bằng chứng nghi vấn, chưa phải chẩn đoán thủ công. Mọi bài đều có trong JSON nguồn; danh sách dưới gồm đầy đủ từng bài có i/ii/iii ở từng lượt.');
let silentCount = 0;
for (const { name, report } of reports) for (const row of report.rows) for (const after of [false, true]) {
  const c = after ? row.afterComparison : row.comparison;
  const type = c.silentFalseCorrect ? 'i' : c.silentFalseWrongParse ? 'ii' : c.silentFalseWrongReading ? 'iii' : null;
  if (!type) continue;
  silentCount++;
  parts.push(`\n### ${safe(name)} / ${safe(row.id)} / ${after ? 'sau' : 'trước'} / (${type})`,
    `Dòng lỗi OCR: [${after ? row.afterFirstErrorLines : row.firstErrorLines}]; truth: [${row.expectedErrorLines}]. Nhóm nguyên nhân: ${(after ? row.afterAudit : row.audit).cause ?? 'N/A'}.`,
    '| Dòng OCR | Dòng truth | Chữ quan sát hiện tại | Chữ truth |', '| --- | --- | --- | --- |');
  for (const e of (after ? row.afterAudit : row.audit).evidence) parts.push(`| ${e.observedIndices} | ${e.truthIndices} | ${safe(e.observed ?? '[thiếu dòng]')} | ${safe(e.truth ?? '[không có dòng truth]')} |`);
}
if (!silentCount) parts.push('Không có bài sai thầm lặng.');
parts.push('\n<details><summary>Danh sách từng bài split test (tự sinh, chưa đọc)</summary>\n',
  '| Nguồn | Bài | Biến thể | Dạng bài | Hiểu hoàn toàn trước/sau | Verdict trước/sau | Câu hỏi thực tế |',
  '| --- | --- | --- | --- | --- | --- | ---: |');
for (const { name, report } of reports.filter(({ report }) => report.split === 'test')) for (const row of report.rows) {
  parts.push(`| ${name} | ${safe(row.id)} | ${row.variant} | ${row.task} | ${row.comparison.completeCorrect}/${row.afterComparison.completeCorrect} | ${row.predictedVerdict}/${row.afterVerdict} | ${row.questionsAsked} |`);
}
parts.push('\n</details>');
parts.push('\n<!-- END AUTO-GENERATED PER-CASE DETAILS -->',
  '\n## Kết luận đi/dừng',
  '**Chưa đủ căn cứ; chưa đề xuất bật chấm tự động từ ảnh.** Ngưỡng “Xong giai đoạn” giữ nguyên: trên ảnh bài làm viết tay thật, kết luận đúng/sai ≥95%, đúng bước sai đầu tiên ≥90%, và 0 bài sai thầm lặng. Chưa có ảnh thật nên không thể xác nhận các ngưỡng này; ảnh tổng hợp không đủ căn cứ, kể cả nếu một nhóm đạt tỷ lệ cao sau trả lời truth.',
  ocrReports.map(({ name, report }) => `${name}: ${report.rows.reduce((n, r) => n + r.audit.missingClaimLines.length, 0)} dòng claim truth không ghép được OCR; ${report.rows.reduce((n, r) => n + r.audit.figureLines.length, 0)} dòng hình vào đầu vào lời giải. Sai thầm lặng (a)/(b)/(c)/(d) trước → sau: ${['audit', 'afterAudit'].map((key) => ['a', 'b', 'c', 'd'].map((cause) => report.rows.filter((r) => r[key as 'audit' | 'afterAudit'].cause === cause).length).join('/')).join(' → ')}.`).join(' '),
  'Mất dòng → DUNG sai là rủi ro không bắt được bằng conf: dòng bị bỏ không có conf. Số nhóm (a)–(c) và số dòng hình/đề ở trên chỉ đo ảnh tổng hợp; tần suất trên bài thật, chữ gạch khó thấy, bố cục nhiều trang và mức người dùng phát hiện/sửa nhầm chỉ ảnh thật mới đo được. Đề xuất (không triển khai): đếm dòng theo bố cục ảnh để phát hiện dòng bị bỏ, hoặc màn soát “máy đọc được” cho cả kết quả DUNG. Nếu (d)>0, kiểm tra từng ca đó, gồm xử lý gạch xóa và giữ đúng nguồn, ở lô riêng trước khi bật tự động. Thu thập/gán nhãn ≥30 bài học sinh thật đa nét chữ/dạng bài; cân nhắc đọc lại crop, đọc chéo engine hoặc giới hạn dạng bài sau review. Không sửa parser theo danh sách test ở lô đo này.');
const markdown = parts.map((part, index) => part.startsWith('|') && parts[index - 1]?.startsWith('|') ? part : '\n' + part).join('\n');
await writeFile(join(root, 'reports', `work-eval-${date}.md`), markdown.trimStart() + '\n');
await writeFile(join(root, 'reports', `work-summary-3.6-${date}.json`), JSON.stringify({ date,
  sources: reports.map(({ name, report }) => ({ name, before: report.summary, after: report.afterSummary })),
  ocrAudit: ocrReports.map(({ name, report }) => ({ name, before: report.rows.map((r) => r.audit.cause).reduce<Record<string, number>>((a, c) => { if (c) a[c] = (a[c] ?? 0) + 1; return a; }, {}), after: report.rows.map((r) => r.afterAudit.cause).reduce<Record<string, number>>((a, c) => { if (c) a[c] = (a[c] ?? 0) + 1; return a; }, {}) })),
  variants: aggregate.map(({ name, rows }) => ({ name, before: summary(rows, false), after: summary(rows, true) })),
}, null, 2) + '\n');
console.log(`Đã sinh reports/work-eval-${date}.md; không in danh sách từng bài.`);
