# Lô 3.3 — sửa review 3.3-r3, vòng 4 — 2026-11-18

Chỉ thu gọn corpus theo hai mục review 3.3-r3. Parser, core và ngưỡng giữ nguyên so với đầu phiên; giữ các sửa đổi Lô 3.3 đã có trong working tree. Không làm Lô 3.4, không commit.

## Trả lời từng điểm review 3.3-r3

1. **Đã sửa kích thước corpus.** Tách 225 tổ hợp select/topic/final/label khỏi danh sách ghi đĩa; vẫn render và kiểm parse/truth đầy đủ trong bộ nhớ ở `work-paraphrase.test.ts`. Trên đĩa chỉ thêm bốn họ `dev-paraphrase-select`, `dev-paraphrase-topic`, `dev-paraphrase-final`, `dev-paraphrase-label`. Chọn tổ hợp từ số thứ tự trong id nguồn, xoay với bước 37 (nguyên tố cùng nhau với kích thước mỗi nhóm); a–d dùng cùng câu sạch. Test xác nhận 60 id phủ mọi giá trị khe của mỗi nhóm và lựa chọn lặp lại xác định.
   - Manifest: **60.000 → 6.960 mẫu**, gồm 6.480 dev (27 họ) + 480 test (2 họ), đủ a–d.
   - Giữ nguyên 6.000 mẫu cũ (5.520 dev + 480 test); 960 mẫu thuộc bốn họ mới.
   - Xóa **54.000 thư mục dev sinh dư**, không còn thư mục dev ngoài manifest. Bộ sinh chỉ dọn thư mục trực tiếp trong `testdata/work-text/dev/` khớp tên họ Cartesian cũ và chứa đúng ba file JSON được sinh; kiểm đường dẫn tuyệt đối, bỏ qua liên kết và nội dung lạ.
   - Đối chiếu SHA-256 tổng hợp trước/sau: nội dung byte của 6.000 mẫu cũ và metadata manifest (gồm seed/noiseEngine) giữ nguyên. File parser/core/reader, dữ liệu core và các file bảo vệ giữ nguyên so với đầu phiên.
   - Thêm assert manifest ≤ 8.000; hai test duyệt corpus trở về timeout 60 giây. Chạy toàn bộ npm test với giới hạn cứng 180 giây.
2. **Đã sinh lại và đo lại.** Sinh work-text trước khi chạy npm test, giới hạn lệnh sinh 300 giây (thực tế 120,66 giây). Đo dev a/b, test a/b đúng một lượt mỗi cấu hình, rồi synthetic-hw truth; chỉ xem summary của split test. Cập nhật năm cặp báo cáo eval và summary r4. Không sinh lại hay đo lại bảng vì review vòng này chỉ yêu cầu thu gọn work-text; kết quả bảng được chấp nhận ở r3 vẫn là 100%.

## File tạo/sửa trong phiên vòng 4

- `tools/eval/src/work-wording-dev.ts`, `tools/eval/src/work-generate.ts`.
- `tools/eval/test/work-paraphrase.test.ts`, `tools/eval/test/work.test.ts`.
- `testdata/work-text/manifest.json`, 960 mẫu dev mới; dọn 54.000 thư mục dev Cartesian sinh dư. Các mẫu cũ và split test giữ nguyên byte.
- `reports/work-eval-work-text-truth-{dev,test}-{a,b}-real-2026-11-18.{md,json}` và `reports/work-eval-synthetic-hw-truth-real-2026-11-18.{md,json}`.
- `reports/work-summary-3.3-r4-2026-11-18.json` và báo cáo này.

## Kết quả đo vòng 4

Build, sinh dữ liệu bằng `node tools/eval/dist/work-generate-cli.js`; đo bằng evaluateWork với `--lines truth --parser real`. Chỉ xuất summary ra console, không xem từng bài test. Đây vẫn là chấm chẩn đoán trực tiếp bằng core.grade; chưa có pipeline hỏi lại của Lô 3.4.

| Tập / split / biến thể | Hiểu hoàn toàn | Precision / recall | Kết luận đúng / so được | Đúng lỗi đầu / truth SAI | Sai thầm lặng i/ii/iii | Hỏi lại | Không đủ căn cứ | Prose unchecked |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| work-text/dev/a | 1620/1620 | 100% / 100% | 1566/1593 | 729/729 | 0/0/0 | 27 | 324 | 0 |
| work-text/dev/b | 1620/1620 | 100% / 100% | 1020/1023 | 183/729 | 0/0/0 | 597 | 324 | 0 |
| work-text/test/a | 120/120 | 100% / 100% | 116/118 | 54/54 | 0/0/0 | 2 | 24 | 0 |
| work-text/test/b | 120/120 | 100% / 100% | 67/68 | 5/54 | 0/0/0 | 52 | 24 | 0 |
| synthetic-hw/truth | 40/40 | 100% / 100% | 40/40 | 20/20 | 0/0/0 | 0 | 0 | 2 |

Mọi lượt có độ chính xác gắn dòng 100%, không có bước từ dòng gạch; số câu hỏi trung bình/tối đa bằng 0 (chưa triển khai hỏi lại). Hai dòng prose unchecked của synthetic-hw tiếp tục báo riêng. Không đổi ngưỡng nghiệm thu.

**Giới hạn độc lập:** split test `work-text` không còn hoàn toàn giữ kín với Dijkstra văn xuôi vì reviewer đã xem ca trượt. Số test chỉ mang tính tham khảo; đánh giá độc lập thật cần bài viết tay thật của người dùng. Chưa đủ căn cứ bật chấm tự động từ ảnh thật.

## Cổng kiểm tra cuối

- `npm test`: **1941 pass, 0 fail**, toàn lệnh **87.89 giây < 180 giây** (gồm typecheck).
- `npx tsc --noEmit -p packages/core/tsconfig.json`: exit 0.
- `npx tsc --noEmit -p packages/reader/tsconfig.json`: exit 0.
- `npx tsc --noEmit -p packages/work/tsconfig.json`: exit 0.
- `npx tsc --noEmit -p tools/eval/tsconfig.json`: exit 0.
- Kiểm tra byte/seed cũ, thư mục dev so với manifest và file bảo vệ: đạt. Kiểm tra whitespace các file nguồn sửa: sạch.

## Quyết định & giả định

- Chỉ xử lý kích thước corpus và các kiểm tra/báo cáo bắt buộc của review 3.3-r3; các sửa đổi có sẵn được giữ nguyên. Không sửa parser, core hay ngưỡng.
- Dùng id nguồn chung cho a–d để truth và câu sạch nhất quán khi đối chiếu nhiễu; các họ cũ giữ nguyên vị trí và công thức seed.
- Không mở `work-wording-test.ts`, `work-table-test.ts`, không xem nội dung mẫu test hoặc phần từng bài trong báo cáo test. Chỉ máy chạy sinh/kiểm tra/hash dữ liệu test.
- Không sửa docs/spec.md, docs/prompts/, CLAUDE.md, AGENTS.md; không adb, không tải model, không làm Lô 3.4, không commit.
