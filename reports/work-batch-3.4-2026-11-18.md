# Lô 3.4 — sửa review 3.4-r1 (2026-11-18)

Trạng thái hiện tại sau sửa review, chưa commit, dừng chờ Claude review. Nền lô vẫn là 464e9cb. Không làm Lô 3.5. Số đo r1 giữ trong work-summary-3.4-2026-11-18.json; số mới trong [work-summary-3.4-r2-2026-11-18.json](work-summary-3.4-r2-2026-11-18.json). Chỉ file r2 đại diện cho code hiện tại.

Đã đọc AGENTS.md, docs/spec.md, docs/prompts/00-context.md, Prompt 03 (quy tắc 3/6/7, Lô 3.4, định nghĩa chỉ số), review 3.4-r1 và diff working tree. Không mở work-wording-test.ts/work-table-test.ts, không xem mẫu test hoặc phần từng bài của báo cáo test. Chốt code sau kiểm thử/dev; đo split test đúng một lần, chỉ xem tổng, không sửa code sau đó. Không adb, không tải model, không thêm dependency hay thay grammar theo test.

## Trả lời từng điểm review

1. **Đã sửa — prose làm mất dòng đọc không chắc.** Dòng chưa hiểu chỉ được prose/empty khi mọi charConf hợp lệ ≥ ngưỡng; thiếu/sai charConf thì dùng conf dòng. Dòng chưa chắc vào unchecked, hỏi kind reading dù không còn số/từ khóa. Đề/hình/gạch vẫn được lọc trước. Có test dòng rác, trống, charConf thấp, ngưỡng tùy chọn và ngoại lệ question/struck. contentAsProse conf dòng thấp = 0 ở mọi biến thể dev/test, trước và sau hỏi lại.
2. **Đã sửa — conf thiếu bằng chứng loại claim.** Thêm chủ đề/từ khóa, động từ chọn, kết luận, dấu = và mũi tên vào min charConf; giữ nhãn/số/phủ định. Khớp xấp xỉ bị chặn dưới ngưỡng, alternative/inferred giữ chặn cũ. Conf dòng < 0,5 luôn là trần kể cả khi đã cắt bằng chứng theo ô/mệnh đề. Bậc danh sách giữ từ khóa chung. Test riêng cho từng loại ký tự, padding không quyết định và khớp xấp xỉ.
3. **Đã sửa — vòng trả lời.** Mỗi vòng applyWorkAnswers → parseWork toàn bộ → gradeWork → câu hỏi/readingCheck mới cho dòng chưa hỏi. Hỏi cả bước conf thấp được core chấp nhận trước/tại lỗi đầu để xác nhận trạng thái làm nền. Không DUNG nếu còn bước/dòng chưa chắc. Truth chưa hiểu vẫn CAN_XAC_NHAN, không auto-skip. Tổng câu hỏi ≤ số dòng solution, mỗi dòng trả lời tối đa một lần; không tính question/figure/gạch/skip. questionBoundViolations = 0 mọi tập. Test hồi quy nhiều vòng và truth vẫn chưa hiểu.
4. **Đã sửa — phân loại ii/iii.** compareWork xét mọi nguồn claim đến lỗi đầu dự đoán, cộng nội dung truth bị mất trước đó theo page/index. Chỉ cần một dòng khác chữ là readingMismatch=true; thiếu bằng chứng mà chưa thấy khác chữ thì null, đếm bảo thủ vào ii. Test 2 dòng (dòng 1 sai chữ, dòng 2 bị chấm), nội dung mất vào prose, đọc đúng nhưng hiểu sai, và nhiễu sau lỗi không ảnh hưởng prefix. Vì thay bộ đo, không so trực tiếp ii/iii r1 như cùng một định nghĩa prefix.
5. **Đã đo lại.** Đủ work-text và work-text-tables × dev/test × a–d, synthetic-hw truth 40 trang; thêm contentAsProse và chia sai thầm lặng có/không dòng đọc sai conf dòng ≥ 0,85. Nhóm “không có” = 0 ở tất cả lượt. Còn 7 bài dev c và 1 bài dev d thuộc nhóm “có”; ghi thực đo, không ép về 0. Test a–d đều không sai thầm lặng. Không có phép đo ảnh viết tay thật trong lô này.

## Kiểm tra

- npm test: **65 files passed; 1.962 tests passed, 0 failed**. Vitest 58,11 giây; toàn lệnh gồm typecheck **63,54 giây < 3 phút**. Chạy không chồng eval.
- npx tsc --noEmit -p packages/core/tsconfig.json, packages/reader/tsconfig.json, packages/work/tsconfig.json, tools/eval/tsconfig.json: exit 0. Typecheck apps/mobile: exit 0.
- npm run build: exit 0 trước đo. git diff --check: sạch. Không chạy lại native build trong vòng sửa review này; mobile không bị sửa thêm.
- Corpus không đổi: work-text **6.960 ≤ 8.000**, work-text-tables **2.300**. SHA-256 manifest lần lượt 53f3bbf36aca20004a764a5cdedd9d7ecebd0fd1f26ce819342fe0107fa3e3b8 và 7c38c96620c787f94d20c25e7de0d7dac90e3f233c5bf0bf17626ae4bb0b560f (trùng r1). Git xác nhận testdata và docs/spec.md, docs/prompts/, CLAUDE.md, AGENTS.md không đổi.

## Cách đo

Dùng evaluateWork thật sau build, tương đương npm run eval:work -- --set work-text|work-text-tables --lines truth --split dev|test --parser real (không lọc variant, đo đủ a–d), thêm --set synthetic-hw --lines truth --parser real. Thứ tự: dev → cổng kiểm tra → test một lần → synthetic-hw. Báo cáo chi tiết nằm trong reports/.debug/r2/reports; chỉ lấy summary/variants trước và sau vào JSON r2, không đọc rows/silentErrors của test.

Mọi mũi tên dưới đây là trước → sau hỏi lại trên code r2. CAN_XAC_NHAN loại khỏi mẫu số kết luận và đếm riêng; lỗi đầu đo trên mọi truth SAI, cần giao dòng và đúng mã lỗi. Số câu hỏi tính cả readingCheck, gộp theo nhóm dòng nguồn của câu hỏi. Chữ sai conf cao xét trên các dòng solution còn sai sau sửa; dòng đã sửa đúng không được tính là lỗi bộ đọc còn lại. Conf cho chỉ số nhóm là conf dòng, không phải conf claim.

## Hiểu bài

| Tập | N | Trùng toàn bộ | Precision claim | Recall claim | Đúng dòng claim ghép |
| --- | ---: | ---: | ---: | ---: | ---: |
| work-text dev/a | 1620 | 1620 → 1620 | 100.00% → 100.00% | 100.00% → 100.00% | 100.00% → 100.00% |
| work-text dev/b | 1620 | 1620 → 1620 | 100.00% → 100.00% | 100.00% → 100.00% | 100.00% → 100.00% |
| work-text dev/c | 1620 | 385 → 1555 | 85.64% → 99.86% | 16.36% → 97.36% | 97.06% → 100.00% |
| work-text dev/d | 1620 | 1521 → 1606 | 96.86% → 99.72% | 96.26% → 99.45% | 99.96% → 100.00% |
| work-text-tables dev/a | 345 | 345 → 345 | 100.00% → 100.00% | 100.00% → 100.00% | 100.00% → 100.00% |
| work-text-tables dev/b | 345 | 345 → 345 | 100.00% → 100.00% | 100.00% → 100.00% | 100.00% → 100.00% |
| work-text-tables dev/c | 345 | 0 → 345 | 0.00% → 100.00% | 0.00% → 100.00% | 100.00% → 100.00% |
| work-text-tables dev/d | 345 | 301 → 338 | 98.54% → 99.78% | 96.13% → 99.78% | 100.00% → 100.00% |
| work-text test/a | 120 | 120 → 120 | 100.00% → 100.00% | 100.00% → 100.00% | 100.00% → 100.00% |
| work-text test/b | 120 | 120 → 120 | 100.00% → 100.00% | 100.00% → 100.00% | 100.00% → 100.00% |
| work-text test/c | 120 | 27 → 117 | 82.05% → 100.00% | 14.81% → 98.61% | 93.75% → 100.00% |
| work-text test/d | 120 | 113 → 118 | 96.30% → 99.07% | 96.30% → 99.07% | 100.00% → 100.00% |
| work-text-tables test/a | 230 | 230 → 230 | 100.00% → 100.00% | 100.00% → 100.00% | 100.00% → 100.00% |
| work-text-tables test/b | 230 | 230 → 230 | 100.00% → 100.00% | 100.00% → 100.00% | 100.00% → 100.00% |
| work-text-tables test/c | 230 | 0 → 230 | 0.00% → 100.00% | 0.00% → 100.00% | 100.00% → 100.00% |
| work-text-tables test/d | 230 | 203 → 224 | 99.43% → 99.80% | 96.65% → 99.80% | 100.00% → 100.00% |
| synthetic-hw truth | 40 | 40 → 40 | 100.00% → 100.00% | 100.00% → 100.00% | 100.00% → 100.00% |

Đúng dòng có mẫu số là số claim LCS ghép được. Khi không ghép được claim nào, aggregate trả 100% ở cột này; không diễn giải là đã hiểu đúng (precision/recall và số trùng cho biết phần thiếu).

## Chấm và hỏi lại

| Tập | Kết luận đúng / so được | Lỗi đầu đúng / truth SAI | CAN_XAC_NHAN | Sai thầm lặng i/ii/iii | Q sau TB / tối đa |
| --- | ---: | ---: | ---: | ---: | ---: |
| work-text dev/a | 1566/1593 → 1566/1593 | 729/729 → 729/729 | 27 → 27 | 0/0/0 → 0/0/0 | 0.483 / 1 |
| work-text dev/b | 434/438 → 1566/1593 | 71/729 → 729/729 | 1182 → 27 | 0/0/0 → 0/0/0 | 1.340 / 5 |
| work-text dev/c | 342/343 → 1561/1594 | 5/729 → 718/729 | 1277 → 26 | 0/0/0 → 3/0/4 | 1.661 / 6 |
| work-text dev/d | 342/343 → 1566/1593 | 5/729 → 725/729 | 1277 → 27 | 0/0/0 → 0/0/1 | 1.613 / 6 |
| work-text-tables dev/a | 345/345 → 345/345 | 228/228 → 228/228 | 0 → 0 | 0/0/0 → 0/0/0 | 0.661 / 1 |
| work-text-tables dev/b | 208/208 → 345/345 | 138/228 → 228/228 | 137 → 0 | 0/0/0 → 0/0/0 | 1.481 / 8 |
| work-text-tables dev/c | 0/0 → 345/345 | 0/228 → 228/228 | 345 → 0 | 0/0/0 → 0/0/0 | 4.826 / 9 |
| work-text-tables dev/d | 0/0 → 345/345 | 0/228 → 228/228 | 345 → 0 | 0/0/0 → 0/0/0 | 2.846 / 8 |
| work-text test/a | 116/118 → 116/118 | 54/54 → 54/54 | 2 → 2 | 0/0/0 → 0/0/0 | 0.483 / 1 |
| work-text test/b | 28/29 → 116/118 | 0/54 → 54/54 | 91 → 2 | 0/0/0 → 0/0/0 | 1.425 / 5 |
| work-text test/c | 24/24 → 116/118 | 0/54 → 54/54 | 96 → 2 | 0/0/0 → 0/0/0 | 1.758 / 6 |
| work-text test/d | 24/24 → 116/118 | 0/54 → 53/54 | 96 → 2 | 0/0/0 → 0/0/0 | 1.667 / 6 |
| work-text-tables test/a | 230/230 → 230/230 | 152/152 → 152/152 | 0 → 0 | 0/0/0 → 0/0/0 | 0.661 / 1 |
| work-text-tables test/b | 159/159 → 230/230 | 105/152 → 152/152 | 71 → 0 | 0/0/0 → 0/0/0 | 1.178 / 6 |
| work-text-tables test/c | 0/0 → 230/230 | 0/152 → 152/152 | 230 → 0 | 0/0/0 → 0/0/0 | 4.826 / 9 |
| work-text-tables test/d | 0/0 → 230/230 | 0/152 → 152/152 | 230 → 0 | 0/0/0 → 0/0/0 | 2.887 / 8 |
| synthetic-hw truth | 40/40 → 40/40 | 20/20 → 20/20 | 0 → 0 | 0/0/0 → 0/0/0 | 0.500 / 1 |

## Dòng bị bỏ, sai thầm lặng còn lại và độ bao phủ

contentAsProse hiển thị thấp/cao theo conf dòng < / ≥ 0,85; “Có/không cao” là số bài sai thầm lặng sau hỏi lại có/không dòng đọc sai conf ≥ 0,85. Mục tiêu cột “không” bằng 0, không ép cột “có”.

| Tập | ContentAsProse thấp/cao | Có/không cao sau hỏi | Prose unchecked | KHONG_DU_CAN_CU (tỉ lệ) | Bước từ dòng gạch | Vượt giới hạn Q |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| work-text dev/a | 0/0 → 0/0 | 0/0 | 0 → 0 | 324 (20.00%) → 324 (20.00%) | 0 → 0 | 0 |
| work-text dev/b | 0/0 → 0/0 | 0/0 | 0 → 0 | 324 (20.00%) → 324 (20.00%) | 0 → 0 | 0 |
| work-text dev/c | 0/22 → 0/22 | 7/0 | 0 → 0 | 324 (20.00%) → 324 (20.00%) | 0 → 0 | 0 |
| work-text dev/d | 0/0 → 0/0 | 1/0 | 0 → 0 | 324 (20.00%) → 324 (20.00%) | 0 → 0 | 0 |
| work-text-tables dev/a | 0/0 → 0/0 | 0/0 | 0 → 0 | 0 (0.00%) → 0 (0.00%) | 0 → 0 | 0 |
| work-text-tables dev/b | 0/0 → 0/0 | 0/0 | 0 → 0 | 0 (0.00%) → 0 (0.00%) | 0 → 0 | 0 |
| work-text-tables dev/c | 0/0 → 0/0 | 0/0 | 0 → 0 | 0 (0.00%) → 0 (0.00%) | 0 → 0 | 0 |
| work-text-tables dev/d | 0/0 → 0/0 | 0/0 | 0 → 0 | 0 (0.00%) → 0 (0.00%) | 0 → 0 | 0 |
| work-text test/a | 0/0 → 0/0 | 0/0 | 0 → 0 | 24 (20.00%) → 24 (20.00%) | 0 → 0 | 0 |
| work-text test/b | 0/0 → 0/0 | 0/0 | 0 → 0 | 24 (20.00%) → 24 (20.00%) | 0 → 0 | 0 |
| work-text test/c | 0/1 → 0/1 | 0/0 | 0 → 0 | 24 (20.00%) → 24 (20.00%) | 0 → 0 | 0 |
| work-text test/d | 0/0 → 0/0 | 0/0 | 0 → 0 | 24 (20.00%) → 24 (20.00%) | 0 → 0 | 0 |
| work-text-tables test/a | 0/0 → 0/0 | 0/0 | 0 → 0 | 0 (0.00%) → 0 (0.00%) | 0 → 0 | 0 |
| work-text-tables test/b | 0/0 → 0/0 | 0/0 | 0 → 0 | 0 (0.00%) → 0 (0.00%) | 0 → 0 | 0 |
| work-text-tables test/c | 0/0 → 0/0 | 0/0 | 0 → 0 | 0 (0.00%) → 0 (0.00%) | 0 → 0 | 0 |
| work-text-tables test/d | 0/0 → 0/0 | 0/0 | 0 → 0 | 0 (0.00%) → 0 (0.00%) | 0 → 0 | 0 |
| synthetic-hw truth | 0/0 → 0/0 | 0/0 | 2 → 2 | 0 (0.00%) → 0 (0.00%) | 0 → 0 | 0 |

KHONG_DU_CAN_CU đều có lý do no_solution_lines: work-text dev mỗi biến thể 324, test mỗi biến thể 24; bảng và synthetic-hw không có. Truth CAN_XAC_NHAN của core làm một số bài sạch chưa đạt 100% kết luận: dev 27 bài vẫn hỏi, 27 bài truth CAN_XAC_NHAN ra SAI; test tương ứng 2 và 2. Không thay expected để làm đẹp số.

## Nhận định

- Test c sau hỏi: hiểu hoàn toàn 117/120, lỗi đầu 54/54, sai thầm lặng 0/0/0; r1 là 67/120, 24/54, 9/11/0. Câu hỏi tăng từ 1,008 lên 1,758/bài, tối đa từ 5 lên 6. Đây là chi phí hỏi các dòng bộ đọc đã báo không chắc.
- Dev c sau hỏi còn 3/0/4 sai thầm lặng; dev d còn 0/0/1. Cả 8 bài có dòng đọc sai conf cao; không còn sai thầm lặng thuộc nhóm chỉ sai chữ conf thấp. Trước/sau có thể khác số sai thầm lặng vì sửa một phần làm lộ trạng thái khác, nên không suy an toàn tuyệt đối từ riêng hiệu số.
- Test d lỗi đầu 53/54, kết luận đúng 116/118, không sai thầm lặng theo định nghĩa; không gọi đây là đạt mọi chỉ số tuyệt đối. Bảng a–d sau hỏi đúng kết luận và lỗi đầu 100%, nhưng d chưa khớp mọi claim (dev 338/345, test 224/230).
- Synthetic-hw truth hiểu 40/40, kết luận 40/40, lỗi đầu 20/20; 2 dòng prose còn unchecked, không có sai thầm lặng. Không chạy B/C ảnh hay đo điện thoại.
- **Chưa đủ căn cứ bật chấm tự động từ ảnh:** chưa có ≥30 bài viết tay thật; vẫn còn lỗi bộ đọc conf cao ở dev. Giữ ngưỡng 95%/90%/0 của giai đoạn, không tự làm Lô 3.5.

## File tạo/sửa

Vòng sửa review: packages/work/src/parse/{primary,confidence}.ts; packages/work/src/{grade,compare,types}.ts; packages/work/test/{confirmation,work}.test.ts; packages/work/README.md; tools/eval/src/work-eval.ts; tools/eval/test/work-parser.test.ts; tools/eval/README.md; báo cáo này và work-summary-3.4-r2-2026-11-18.json. Các file primary/confidence/grade/confirmation và báo cáo vẫn untracked từ lô chưa commit; work.test.ts là file sửa thêm so với r1.

Giữ phần Lô 3.4 có sẵn: charConf reader B/C và test, tương thích xuất mobile, parse/index/table, answers, messages, compare/index/types cùng test và README; không sửa lại các điểm review đã đạt. work-summary-3.4-2026-11-18.json giữ số r1 làm lịch sử.

## Quyết định & giả định

1. Ngoài dòng prose, dòng solution trống nhưng conf thấp cũng phải hỏi: chữ bị mất hết vẫn có thể chứa claim. Dòng người dùng skip được giữ theo hành động rõ ràng trước đó.
2. Hỏi bước conf thấp được core chấp nhận khi bước đó đứng trước/tại lỗi đầu, hoặc khi chưa có lỗi đầu; đây là chặn trạng thái đọc sai ở bước trước, không dùng truth/đúng sai để chọn chữ. Unchecked đọc chắc tiếp tục kind unparsed.
3. Giữ các trường mở rộng r1: ParsedWork.sourceLines, ParsedStep.candidateTexts, WorkLine.skipped; thêm WorkComparison.contentAsProse và opts.confThreshold tùy chọn cho phép đo. Không đổi API core hay nhãn expected.
4. Lặp toàn bài mỗi vòng, chỉ trả lời dòng chưa hỏi. Câu hỏi nhiều dòng tính một lần nhưng từng index đều được đánh dấu đã hỏi; phép đo kiểm cả số câu hỏi và số dòng trả lời so với số dòng solution.
5. Phân nhóm conf cao dùng chữ quan sát sau các câu trả lời đã áp dụng, so với truth NFC/trim; không dùng claim/expected để chữa chữ. Chỉ số này phục vụ chẩn đoán, không đưa vào parser hay gradeWork.
6. Chưa có ảnh thật, không hạ tiêu chí nghiệm thu. Dừng tại sửa Lô 3.4, chờ review.
