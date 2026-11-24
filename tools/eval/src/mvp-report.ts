import type { runMvpSample } from './mvp.js';
import type { DeviationCause } from './mvp.js';
import type { ReadComparison } from '@mathtwin/reader';
import type { WorkTruth } from '@mathtwin/work';
import type { Session } from '../../../apps/mobile/src/flow/types.js';
export type MvpRow = Awaited<ReturnType<typeof runMvpSample>>;
export interface MvpFailure {
  id: string; error: string; expected?: WorkTruth['expected'];
  readComparison?: ReadComparison; bComparison?: ReadComparison; confirmedCorrect?: boolean;
  solutionCheck?: { correct: boolean; reason: string }; timings?: Session['timings'];
}
const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
const ratio = (n: number, d: number) => d ? `${n}/${d} (${(n / d * 100).toFixed(1)}%)` : 'chưa đo (0 mẫu)';
const causeText: Record<DeviationCause, [string, string]> = {
  pending_questions: ['Còn câu hỏi chưa trả lời được', 'sản phẩm (hỏi lại)'],
  strike_off_mark: ['Tự đánh gạch dòng lời giải không có nét gạch', 'sản phẩm (gạch xóa)'],
  strike_merged: ['Box B gộp dòng bị gạch với dòng lời giải, dòng lời giải mất theo', 'sản phẩm (box B + gạch xóa)'],
  region_excluded: ['Dòng học sinh bị đổi thành đề/hình (box B lệch vùng), không được hỏi', 'sản phẩm (bộ đọc + lọc vùng)'],
  claim_line_missing: ['Dòng chứa mệnh đề không có trong chữ máy đọc', 'sản phẩm (đọc)'],
  unclassified: ['Chưa phân loại được từ checkpoint', 'chưa rõ'],
};
/** Shared wording for every evaluator report that exposes a row deviation. */
export function deviationReason(deviation: MvpRow['deviation']): [string, string] {
  if (!deviation) return causeText.unclassified;
  const [reason, owner] = causeText[deviation.cause];
  return [`${reason} (dòng ${deviation.lines.join(', ') || '—'})`, owner];
}
export function mvpReport(date: string, rows: MvpRow[], planned: number, machine: string, failures: MvpFailure[] = []) {
  const n = rows.length;
  const count = (fn: (r: MvpRow) => boolean) => rows.filter(fn).length;
  const wrong = count((r) => r.expected.verdict === 'SAI') + failures.filter((r) => r.expected?.verdict === 'SAI').length;
  const phases = [...rows, ...failures];
  const phaseCount = (fn: (r: MvpRow | MvpFailure) => boolean) => phases.filter(fn).length;
  const silent = rows.filter((r) => r.comparison.silentFalseCorrect || r.comparison.silentFalseWrongParse || r.comparison.silentFalseWrongReading);
  const strictWrong = count((r) => r.finalVerdict === 'SAI' && r.comparison.firstErrorCorrect === false);
  const sums = (fn: (r: MvpRow) => number) => rows.reduce((s, r) => s + fn(r), 0);
  const unreadProblems = rows.filter((r) => r.session.problemRead?.spec === null);
  const problemIssues = unreadProblems.reduce((counts, row) => {
    for (const issue of row.session.problemRead?.issues ?? []) counts.set(issue.code, (counts.get(issue.code) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
  const taskResultChanges = rows.filter((r) => r.finalVerdict !== r.expected.verdict);
  const suggestions = rows.map((r) => r.problemSuggestion).filter((value): value is NonNullable<typeof value> => value !== undefined);
  const availableSuggestions = suggestions.filter((value) => value.available);
  const struckRows = sums((r) => r.strikes.onMark.length + r.strikes.offMark.length);
  const offMarkRows = sums((r) => r.strikes.offMark.length);
  const solutionRows = sums((r) => r.session.workLines.filter((l) => l.region === 'solution' || l.region === 'table').length);
  const cells = (list: MvpRow[]) => {
    const counts = (fn: (r: MvpRow) => boolean) => list.filter(fn).length;
    return `| synthetic-hw | ${list.length}/${planned} | ${ratio(phaseCount((r) => r.readComparison?.completeCorrect === true), planned)}; lỗi có cờ kiểm được ${phaseCount((r) => r.readComparison?.completeCorrect === false && r.readComparison.fullyFlagged)}/${planned - phaseCount((r) => r.readComparison?.completeCorrect === true)} | ${ratio(phaseCount((r) => r.confirmedCorrect === true && r.solutionCheck?.correct === true), phaseCount((r) => r.confirmedCorrect === true))} | ${ratio(counts((r) => r.comparison.verdictCorrect === true), planned)} | ${ratio(counts((r) => r.comparison.firstErrorCorrect === true), wrong)} |`;
  };
  const stats = (xs: number[]) => { const sorted = [...xs].sort((a, b) => a - b); return `${mean(xs).toFixed(1)} | ${(sorted[Math.max(0, Math.ceil(xs.length * .5) - 1)] ?? 0).toFixed(1)} | ${(sorted[Math.max(0, Math.ceil(xs.length * .9) - 1)] ?? 0).toFixed(1)} | ${Math.max(0, ...xs).toFixed(1)}`; };
  return `# Đo MVP đầu–cuối — ${date}

Kết luận nghiệm thu: **chưa đủ căn cứ**. Chưa có ≥30 cặp ảnh thật viết tay có nhãn. Hoàn thành đo ${n}/${planned} trang synthetic-hw; ${failures.length} lỗi chạy. Chỉ xem hoàn tất chức năng khi các cổng kiểm tra trong phần xác minh đều xanh; không tự hạ ngưỡng nghiệm thu.

B đọc yêu cầu hiện **chưa đóng góp được ProblemSpec nào**: ${ratio(rows.filter((r) => r.session.problemRead?.spec !== null).length, unreadProblems.length)} trong các trang đã có checkpoint đọc đề; ${unreadProblems.length}/${planned} trang phải nhập form dạng bài. Các issue trên ${unreadProblems.length} trang không có ProblemSpec: ${[...problemIssues.entries()].sort((a, b) => b[1] - a[1]).map(([code, total]) => `\`${code}\` ${total}`).join('; ') || 'không có checkpoint để đếm'}. Đây là rủi ro đọc đề, không được diễn giải thành B đã dựng được yêu cầu.

Gợi ý luật Lô 5.2 (chỉ từ chữ đề B đã lưu, luôn chờ xác nhận): có gợi ý ${availableSuggestions.length}/${suggestions.length}; đúng dạng ${availableSuggestions.filter((value) => value.typeCorrect).length}/${suggestions.length}; đúng cả tham số ${availableSuggestions.filter((value) => value.parametersCorrect).length}/${suggestions.length}; gợi ý sai ${availableSuggestions.filter((value) => !value.typeCorrect || !value.parametersCorrect).length}/${suggestions.length}. Công nhập form cho các trang có checkpoint: trước ${sums((r) => r.problemSuggestion?.formEditsBefore ?? r.problemFormEdits)}; sau ${sums((r) => r.problemSuggestion?.formEditsAfter ?? r.problemFormEdits)}. Gợi ý sai không tự vào spec; mô phỏng vẫn dùng thao tác sửa form theo truth.

Máy tính: ${machine}. **Mọi thời gian dưới đây là Node trên máy tính, không phải điện thoại.** B cục bộ Qwen3-VL-2B Q4_K_M + mmproj F16, cạnh ảnh tối đa 768, CPU 4 threads, GPU 0; llama-server khởi động/dừng theo mỗi lần gọi adapter. Không tải model mới, không adb. Số điện thoại cũ khoảng 49 s/trang (vivo X100s Pro), không suy ra từ số máy tính.

Nguồn: 40 ảnh 1000×1440, 10 đề gốc × 4 biến thể font/phối cảnh; 20 bài đúng, 20 bài sai. Mỗi ảnh chứa cả đề và bài, được dùng làm cả hai đầu vào; không phải 40 cặp độc lập hoặc 80 ảnh riêng, cũng chưa thay thế bộ chuẩn tối thiểu 100 cặp của đặc tả 8.1. Không cắt bỏ bài làm trước khi B đọc đề: có nguy cơ rò đáp án trong trang tổng hợp. real: 0 cặp, chưa đo.

| Nguồn | Hoàn tất | Đọc đề đúng hoàn toàn ≥90%; phần lỗi 100% gắn cờ | Giải đúng khi đề đúng 100% | Kết luận đúng/sai ≥95% | Bước sai đầu + mã lỗi ≥90% |
| --- | ---: | --- | --- | --- | --- |
${cells(rows)}
| real | 0 | chưa đo | chưa đo | chưa đo | chưa đo |

Chỉ số đọc đề đo **trước xác nhận**, với B đọc yêu cầu và D làm nháp hình; không tính đồ thị truth đã sửa thành đọc đúng. B riêng (trước chọn D): đúng hoàn toàn ${ratio(phaseCount((r) => r.bComparison?.completeCorrect === true), planned)}, lỗi có cờ kiểm được ${phaseCount((r) => r.bComparison?.completeCorrect === false && r.bComparison.fullyFlagged)}/${planned - phaseCount((r) => r.bComparison?.completeCorrect === true)}. Chưa có số khâu đọc đề cho ${planned - phaseCount((r) => r.readComparison !== undefined)} trang; các tỷ lệ là cận dưới nếu còn trang chưa đo. Nháp D không có glyph model như app, cần soát/sửa nhãn, cạnh, trọng số. Có cờ toàn đồ thị chỉ là cảnh báo thô, không đạt yêu cầu ≥90% đọc hoàn toàn.

Chỉ số 1 cần đọc là **${planned - phaseCount((r) => r.readComparison?.fullyFlagged === true)}/${planned} trang đề sai không gắn cờ đầy đủ**, không chỉ phần có cờ. Dù đồ thị D luôn qua màn soát và yêu cầu được nhập tay, điều đó chỉ chặn sai đầu–cuối trong phép mô phỏng; không làm B đọc đề đúng hơn.

Sau xác nhận: ${phaseCount((r) => r.confirmedCorrect === true)}/${planned} đề khớp truth (tính cả khâu đã hoàn tất trên trang lỗi đọc bài làm). Truth chỉ được dùng để trả lời uncertain, nhập form khi thiếu yêu cầu và sửa đồ thị D; yêu cầu sai mà tự tin không được tự sửa. Chỉ số giải kiểm đáp án bằng bộ đối chiếu độc lập trong mvp-oracle.ts (đếm, duyệt, Euler theo tập cạnh, hoán vị Hamilton/TSP, Floyd–Warshall, ghép cặp vét cạn, kiểm tính hợp lệ hành trình). Không dùng solve(truth) so với chính solve(truth). Không phải phép kiểm toàn bộ lời văn giải thích.

Mẫu số kết luận gồm **mọi cặp kế hoạch**, kể cả lỗi đọc, CẦN XÁC NHẬN/KHÔNG ĐỦ CĂN CỨ, không bỏ bài khó. Bước sai dùng dòng nguồn sau căn dòng + mã lỗi, cho phép tách/gộp dòng, không so số thứ tự bước parser với truth một cách máy móc. Bài SAI truth: ${wrong}; còn hỏi lại ${count((r) => r.finalVerdict === 'CAN_XAC_NHAN')}; không đủ căn cứ ${count((r) => r.finalVerdict === 'KHONG_DU_CAN_CU')}; không có kết luận vì lỗi đọc ${failures.length}. Các khâu trước lỗi được chấm độc lập từ checkpoint, không giả vờ đã đi tới kết quả cuối. Lệnh trả mã khác 0 khi còn lỗi; phép đo không đạt điều kiện hoàn tất trọn mọi trang.

Sai thầm lặng sau mô phỏng (định nghĩa Lô 3.6): (i) ĐÚNG sai ${count((r) => r.comparison.silentFalseCorrect)}; (ii) SAI hiểu/chấm sai ${count((r) => r.comparison.silentFalseWrongParse)}; (iii) SAI do đọc sai tại dòng báo lỗi ${count((r) => r.comparison.silentFalseWrongReading)}. Tổng ${silent.length} bài. Kiểm tra riêng chỉ số 4: ${strictWrong} bài báo SAI nhưng sai dòng/mã lỗi (có thể trùng nhóm sai thầm lặng; mã lỗi sai cùng dòng có thể không thuộc (ii)/(iii)).

Nguyên nhân loại trừ nhau theo audit Lô 3.6: (a) mất dòng ${silent.filter((r) => r.audit.cause === 'a').length}; (b) đọc sai conf cao ${silent.filter((r) => r.audit.cause === 'b').length}; (c) chữ hình/đề lẫn lời giải ${silent.filter((r) => r.audit.cause === 'c').length}; (d) hiểu/chấm/nguồn lỗi khác ${silent.filter((r) => r.audit.cause === 'd').length}. Đây là quy tắc quy nguyên nhân vận hành, không chứng minh nhân quả. Chi tiết chữ, căn dòng và bằng chứng trước/sau nằm trong JSON kèm báo cáo.
${silent.map((r) => `- ${r.id}: (${r.comparison.silentFalseCorrect ? 'i' : r.comparison.silentFalseWrongParse ? 'ii' : 'iii'}), nguyên nhân (${r.audit.cause}); dòng thiếu [${r.audit.missingClaimLines}], đọc sai conf cao [${r.audit.causalMisreads}], chữ hình/đề dùng [${r.audit.causalIntrusions}].`).join('\n') || '\nKhông có bài sai thầm lặng còn lại theo định nghĩa trên.'}

## Kết luận lệch theo nguyên nhân

| Bài | Truth → kết luận | Nguyên nhân chính | Thuộc |
| --- | --- | --- | --- |
${taskResultChanges.map((r) => { const [reason, owner] = deviationReason(r.deviation); return `| ${r.id} | ${r.expected.verdict} → ${r.finalVerdict} | ${reason} | ${owner} |`; }).join('\n') || '| Không có | — | — | — |'}

Nguyên nhân được tính từ phiên cuối và phép căn dòng Lô 3.6 trên từng dòng truth mang mệnh đề, không dựa vào tên bài; thứ tự ưu tiên: còn câu hỏi → gạch không có nét → box gộp dòng gạch → dòng bị đổi thành đề/hình → dòng vắng. Lỗi của bộ mô phỏng (placeholder/dòng đang hỏi bị bỏ qua) đã sửa ở vòng 2 nên không còn trong bảng; mọi hàng trên là rủi ro sản phẩm, chỉ ghi nhận ở lô này, không tự sửa ngoài phạm vi review.

Gạch xóa tự động trên ${n} bài hoàn tất: ${struckRows}/${solutionRows} dòng lời giải/bảng bị đánh gạch; ${struckRows - offMarkRows} dòng có nét gạch thật của truth (tâm dọc của dòng gạch truth nằm trong box và chồng theo chiều ngang), ${offMarkRows} dòng không có nét gạch nào. Dòng có nét gạch vẫn có thể làm mất chữ khi box B gộp dòng bị gạch với dòng lời giải bên cạnh. Đây là rủi ro sai thầm lặng: một dòng mệnh đề tự gạch với điểm ≥0,8 không qua cổng hỏi lại, và bài SAI không có bước soát nên kết luận có thể đổi mà không biết.

Công và thời gian đầy đủ bên dưới chỉ tính ${n} bài hoàn tất; ${failures.length} trang lỗi có công/thời gian dở dang, được tách riêng, không coi bằng 0.

| Công người dùng (mỗi bài hoàn tất) | Tổng | TB | Max |
| --- | ---: | ---: | ---: |
${[
    ['Câu uncertain đề', (r: MvpRow) => r.problemQuestions],
    ['Nhập form thiếu yêu cầu/dạng câu hỏi', (r: MvpRow) => r.problemFormEdits],
    ['Câu hỏi bài làm (gồm soát dòng SAI)', (r: MvpRow) => r.workQuestions],
    ['Khoanh vùng bài làm', (r: MvpRow) => r.regionQuestions],
    ['Soát trước kết luận (tính 1)', (r: MvpRow) => r.reviews],
    ['Nhóm dòng sửa trong soát', (r: MvpRow) => r.reviewEdits],
    ['Sửa đồ thị từ nháp D', (r: MvpRow) => r.effort.draftOps],
    ['Tự nhập đồ thị (đối chứng)', (r: MvpRow) => r.effort.manualOps],
    ['Tổng công theo định nghĩa (câu đề + câu bài + sửa đồ thị + soát)', (r: MvpRow) => r.problemQuestions + r.workQuestions + r.effort.draftOps + r.reviews],
  ].map(([name, fn]) => { const f = fn as (r: MvpRow) => number; return `| ${name} | ${sums(f)} | ${mean(rows.map(f)).toFixed(2)} | ${Math.max(0, ...rows.map(f))} |`; }).join('\n')}

Câu hỏi đề + bài trung bình ${mean(rows.map((r) => r.problemQuestions + r.workQuestions)).toFixed(2)}/bài. Khoanh vùng và nhập form được báo riêng, không giấu công ngoài công thức. Công D dùng nguyên figureEffort Lô 2.12: 1 lần chạm/ô gõ, ghép đỉnh theo vị trí, cạnh theo cặp đầu và bội số, cạnh gắn đỉnh xóa biến mất miễn phí, nhập mọi trọng số/tên; tự nhập có nhãn A… tự đặt. Tọa độ truth lấy từ đường data-vertex trong source.svg rồi áp biến đổi phối cảnh của bộ sinh; labelBox cao 27 px theo cỡ chữ layout (ước lượng hình học được khai báo). Đây là công mô phỏng, chưa đo thao tác người thật.

Giả định **lạc quan**: người dùng trả đúng mọi câu hỏi bằng chữ truth, giữ nguyên cả lỗi toán của học sinh; căn dòng text DP Lô 3.6 độc lập claims/grade. Chỉ placeholder mất dòng đã hiện thành câu hỏi dùng giao dải box với layout để trả lời. Không chèn dòng truth hoàn toàn vắng khỏi danh sách. Khi cổng soát xuất hiện, người dùng phát hiện đọc sai/nhầm gạch/vùng sai ở dòng thực sự hiện trong danh sách (kể cả danh sách bỏ qua mà UI cho mở); soát tính 1, số nhóm sửa báo riêng. Người dùng không tự sửa dòng chưa được hỏi trên bài SAI, trừ readingCheck tại dòng lỗi. Truth chưa hiểu sau một lần trả lời vẫn để CẦN XÁC NHẬN. Khoanh vùng chỉ khi flow yêu cầu; OCR thiếu box thì đọc crop thật bằng B, không gán box truth vào OCR.

| Thời gian máy tính (ms) | TB | p50 | p90 | Max |
| --- | ---: | ---: | ---: | ---: |
${(Object.keys(rows[0]?.timings ?? {}) as (keyof MvpRow['timings'])[]).map((key) => `| ${key} | ${stats(rows.map((r) => r.timings[key]))} |`).join('\n')}
| Tổng máy (không chờ người trả lời) | ${stats(rows.map((r) => r.machineMs))} |

solve/grade được đo bằng thao tác thật của sessionReducer; grade là tổng mọi lần chấm, gồm lần đầu và các lần trong replay (không cộng hai lần). region gồm xử lý/khi cần đọc crop, đã nằm trong workRead; inspection đo lại lọc vùng/mất dòng trên OCR gốc khi chấm lại. replay gồm căn dòng và mô phỏng, chưa gồm thời gian con người. decode gồm giải mã PNG và nạp chú thích bộ đo. Khởi động model nằm trong thời gian đọc. Tổng cộng các khâu, không gồm I/O ghi checkpoint và đối chiếu chỉ số sau chấm. Mục tiêu 15 s đầu–cuối: ${count((r) => r.machineMs < 15_000)}/${planned}; solve + tổng grade <1 s: ${count((r) => r.timings.solve + r.timings.grade < 1000)}/${n} bài đo đầy đủ (trang lỗi chưa có đủ thời gian grade).

| Bài | Đề đúng sau xác nhận | Kết luận / truth | Đúng lỗi đầu | Câu đề + bài | Sửa D | Soát | Tổng máy (s) |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: |
${rows.map((r) => `| ${r.id} | ${r.confirmedCorrect} | ${r.finalVerdict} / ${r.expected.verdict} | ${r.comparison.firstErrorCorrect ?? '—'} | ${r.problemQuestions + r.workQuestions} | ${r.effort.draftOps} | ${r.reviews} | ${(r.machineMs / 1000).toFixed(2)} |`).join('\n')}

${failures.length ? 'Lỗi chạy (giữ trạng thái chưa có kết luận, không tự retry hay nhập toàn bài bằng truth):\n' + failures.map((f) => `- ${f.id}: ${f.error}; thời gian khâu đã lưu (ms) ${JSON.stringify(f.timings ?? {})}. Thời gian lượt thất bại chưa có checkpoint hoàn tất không nằm trong bảng TB. Giới hạn cấu hình crop là 180 s, tổng lượt ngoài bị chặn bởi run-bounded. Log cũ chỉ có thông báo đọc tổng quát, không đủ để kết luận nguyên nhân cụ thể là timeout/JSON/xác suất token; bộ đo mới giữ code/reason khi có.`).join('\n') : ''}

Quyết định đi/dừng: **dừng ở Lô 4.7 để review; chưa đủ căn cứ nghiệm thu**. Chưa có ảnh thật và phải xét riêng từng ngưỡng đọc/giải/chấm/thời gian nêu trên; build/test xanh chỉ chứng minh cổng chức năng. Đề xuất tiếp: thu ≥30 cặp ảnh thật có nhãn; reviewer xét nguyên nhân sai, công xác nhận và độ chậm của B trước khi giao lô khác. Không tự sửa parser/core hoặc tự chạy bước đề xuất.

Xác minh cổng sẽ được ghi sau khi chạy; npm test chỉ dùng adapter giả lập, không suy luận thật.
`;
}
