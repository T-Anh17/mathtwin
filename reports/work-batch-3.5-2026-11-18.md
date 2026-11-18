# Lô 3.5 — Phát hiện gạch xóa

Ngày: 2026-11-18. Chỉ triển khai Lô 3.5 trên nền 3.1–3.4 (179578b1).

## Kết quả

`detectStrikes` chạy TS thuần trên RGBA và box dòng: tìm nét dài giữa chữ, vùng bôi kín; loại kẻ nhạt và kẻ đậm lặp theo projection. Hai ngưỡng 0,3/0,8; công thức, lề crop và giới hạn ghi trong `packages/work/README.md`. Detector không đọc chữ, alternatives, cờ struck cũ, vocabulary hoặc đáp án.

`readWork` đọc từng trang, gán page/index, gọi detector sau đọc, lưu bằng chứng pixel rồi parse cả bài. Dòng chưa chắc không sinh bước, có issue `struck_uncertain` và câu hỏi `kind: struck`; trả lời struck xóa điểm tự động để không lặp câu hỏi. Luồng này cũng bảo vệ bảng và nối dòng/trang.

## Đo 40 trang synthetic-hw

Lệnh tái lập: `npm run build`, sau đó `node tools/eval/dist/work-strikes-cli.js`.

Ảnh PNG hiện có, không sinh thêm corpus. Chữ oracle cấp cho parser. Box **mọi dòng** được dựng từ layout hàng, gộp ô bảng cùng y và chiếu phối cảnh như renderer; không lấy cancellation box làm box riêng cho các dòng gạch trong phép đo này. Trước inference loại toàn bộ cờ struck và box từ lines.json. Detector chỉ nhận pixel/box. Sau inference mới đọc cancellation.json để so nhãn; kiểm nhất quán với struck trong lines.json. Test riêng dùng cancellation box để kiểm hồi quy cả hai phông/hai loại nét.

Mẫu số gồm toàn bộ dòng solution/table; đề/hình không cần chấm nên không tính. Đây là đo detector với chữ chuẩn và geometry layout, **chưa đo OCR bỏ sót dòng hoặc sai box**.

| Chỉ số | Kết quả |
| --- | ---: |
| Trang | 40 |
| Dòng solution/table | 168 |
| Dòng gạch / không gạch | 40 / 128 |
| TP / FP / FN | 40 / 0 / 0 |
| Precision = TP/(TP+FP) | 100% |
| Recall = TP/(TP+FN) | 100% |
| Gạch ngang nhận đúng | 20/20 |
| Bôi kín nhận đúng | 20/20 |
| Dòng chưa chắc | 0 |
| Bước sinh từ dòng truth struck | **0** |

FN tính cả dòng gạch có điểm chưa chắc. “Dòng gạch bị chấm thành nội dung” đếm **bước** có ít nhất một nguồn truth struck, không chỉ đếm dòng. Bôi kín có chữ truth null, nên riêng số bước lọt không chứng minh được detector tốt; phải xem cùng TP/recall. JSON từng dòng và score ở `reports/.debug/work-strikes-40.json` (ignored, có thể tái tạo bằng lệnh trên).

## Kiểm tra

- `npm test`: **68 file pass; 1.980 test pass / 0 fail**, Vitest 59,62 giây, tổng lệnh dưới 3 phút, gồm typecheck gốc và apps/mobile.
- `npx tsc --noEmit -p packages/core/tsconfig.json`: sạch.
- `npx tsc --noEmit -p packages/reader/tsconfig.json`: sạch.
- `npx tsc --noEmit -p packages/work/tsconfig.json`: sạch.
- `npx tsc --noEmit -p tools/eval/tsconfig.json`: sạch.
- `npm run typecheck --workspace @mathtwin/mobile`: sạch, được gọi trong npm test.
- Ca ảnh vẽ bằng code: chữ thường, gạch ngang hơi xiên, bôi kín, gạch một phần chưa chắc, gạch chân, `=`, `−`, mũi tên dài/có chữ hai đầu, kẻ vở đậm và ô nhạt. Có test alpha/box, abort/lỗi đọc, trả lời gạch và bỏ dòng, bảo vệ alternatives/bảng/nối dòng, và chạy runtime khi không có process/Buffer.
- Kiểm import toàn bộ runtime work không dùng API Node/mạng; giữ kiểm độc lập runtime core của parse và helper. `git diff --check`: sạch.

## File tạo/sửa

Tạo:

- `packages/work/src/strikes.ts`, `packages/work/src/read.ts`.
- `packages/work/test/strikes.test.ts`, `packages/work/test/browser.test.ts`.
- `tools/eval/src/work-strikes.ts`, `tools/eval/src/work-strikes-cli.ts`.
- `tools/eval/test/work-strikes.test.ts`.
- `reports/work-batch-3.5-2026-11-18.md`.

Sửa:

- `packages/work/src/types.ts`, `index.ts`, `messages.vi.ts`, `answers.ts`, `grade.ts`.
- `packages/work/src/parse/index.ts`, `primary.ts`.
- `packages/work/README.md`.

## Quyết định & giả định

- Thêm trường tùy chọn `WorkLine.strikeScore` và export hai ngưỡng; API bắt buộc giữ nguyên. `struck=false` giữa hai ngưỡng không được hiểu là chắc không: parser dựa thêm score, hỏi xác nhận. Box thiếu/sai có score=0,5.
- Xác nhận struck của người dùng thay bằng chứng tự động; sửa chữ không tự xác nhận việc gạch. Dòng gạch chưa chắc luôn hỏi, kể cả ở sau lỗi đầu. Đề/hình và dòng đã skip vẫn được lọc trước.
- Áp dụng nguyên tắc projection/lặp của reader-figure trong detector; không thêm dependency reader-figure hoặc chạy toàn bộ pipeline hình. Ngưỡng mực tối loại ô nhạt; projection loại kẻ đậm trục ngang/dọc lặp ít nhất bốn nét. Kẻ đậm nghiêng nhiều, mực nhạt, chữ quá nhỏ và box lẫn dòng khác chưa được bảo đảm. Hình giống hệt vùng bôi kín nhưng thực chất là một ký hiệu đặc có thể không phân biệt được chỉ bằng pixel.
- TextReader chưa trả page nên readWork gọi riêng từng trang. Usage cộng timing của reader, nối telemetry, lấy peak memory lớn nhất; latencyMs chưa gồm detector. Lỗi reader/abort truyền cho bên gọi.
- Kết quả tổng hợp với box layout **chưa đủ căn cứ cho ảnh học sinh thật**. Không đưa kết luận bật chấm tự động của Lô 3.6.
- Không thêm dependency, không sửa corpus/tài liệu bị cấm, không mở hai file test bị cấm hoặc đọc mẫu test work-text/work-text-tables; không adb, không tải model. Không làm Lô 3.6/3.7. Dừng chờ review.
