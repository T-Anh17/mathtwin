# Lô 2.8 — sửa review vòng 1

Đã sửa đúng 5 điểm được giao. Không tải model, không chạy `--confirm`, không chạy
đánh giá lại bằng model thật; Claude sẽ chạy phép đo đó sau khi review code.
Số CER 92,4%, recall dòng 4,2%, 26/40 ảnh lỗi là kết quả trước sửa do reviewer
cung cấp, không phải số đo sau sửa.

## Trả lời từng điểm

1. **Đã sửa — gộp dòng.** Detector giữ box trước unclip để quyết định hàng.
   Từng cặp thành viên trong hàng phải chồng dọc ít nhất 50% chiều cao box thấp
   hơn; không so với union đã nở và không lan bắc cầu qua union. Trong hàng,
   sắp trái sang phải, chỉ ghép khi gap ngang ≤ k × chiều cao thấp hơn của hai
   mảnh, mặc định k = 2,5. `LineMergeOptions.maxHorizontalGapRatio` cấu hình k;
   reader chung và adapter Node đều nhận tùy chọn này. Vùng cắt vẫn giữ phần
   mở rộng unclip và lề dấu Việt. Có test ba dòng cách nhau 10 px; overlap sau
   unclip 30%; gap 1×/6× chiều cao; hàng rồi trái sang phải; chặn bắc cầu.

2. **Đã sửa — giữ trang khi một dòng bị cắt.** Hết số bước mà chưa EOS trả prefix
   đã đọc, `conf: 0`, `truncated: true`, `truncationReason: decode_limit`.
   Một phân phối hợp lệ chọn special token khác EOS cũng giữ prefix với
   `truncationReason: invalid_output`. Dòng sau vẫn đọc tiếp. Thiếu/sai tensor,
   thiếu/sai log-prob hoặc lỗi session vẫn ném lỗi; không che lỗi ORT bằng cờ
   truncated. Tensor vẫn được dispose. Báo cáo JSON/Markdown đếm số dòng bị cắt.
   Test dòng 2/3 không bao giờ trả EOS vẫn nhận đủ 3 dòng và chỉ dòng 2 có conf 0;
   có thêm test special token, session hỏng, shape log-prob/hidden sai, thiếu hidden.

3. **Đã sửa — điểm thành phần.** Tính score trong BFS trên pixel foreground của
   chính thành phần, không trên toàn hình chữ nhật. Dilation chỉ nối mảnh;
   pixel nền được thêm bởi dilation không làm loãng score. Test nét chéo 45°
   mảnh có xác suất 0,9 được giữ; test thành phần xác suất 0,4 vẫn bị loại.

4. **Đã sửa — giới hạn ký hiệu.** Thêm `unsupportedSymbols(vocab)`; trên JSON
   thật kết quả là `["→", "×", "∞", "≥", "≤", "≠"]`. Báo cáo C có tập thiếu và
   cột/chỉ số số dòng truth chứa ký hiệu ngoài từ vựng. Đếm từng dòng có hiệu lực
   một lần, không đếm dòng gạch xóa, vẫn đếm khi ảnh đọc lỗi. Truth giữ nguyên;
   CER/WER giữ đầy đủ các dòng, không thay mũi tên thành ASCII hoặc loại lỗi để
   làm đẹp kết quả. README ghi giới hạn cần model/vocab được huấn luyện tương ứng.

5. **Đã sửa — `--dump-lines`.** Trong phép đo bằng engine, mode lines/both,
   flag ghi JSON vào `reports/.debug/` (đã gitignore). Record gồm `id`, `pass`,
   `box` nếu có, `text`, `conf`, cờ `truncated` nếu bị cắt. Không chứa pixel.
   Mặc định không tạo file debug. Test đối chiếu đúng payload, truth bất biến,
   thư mục không được tạo khi thiếu flag và quy tắc gitignore. Đã chạy CLI fake
   thực tế trên 1 ảnh synthetic-hw để kiểm tra đường ghi, không chạy model thật.

## Kết quả kiểm tra

`npm test` (gồm typecheck root và mobile):

```text
Test Files  43 passed (43)
     Tests  1064 passed (1064)
```

**Pass: 1064; fail: 0.** `npm run build` thành công; `git diff --check` sạch.
Workspace có thay đổi mobile xuất hiện trong phiên từ ngoài phần sửa này;
không sửa hoặc hoàn tác các thay đổi đó. Kết quả test trên là toàn workspace
tại thời điểm kiểm tra, bao gồm các test mobile đang có.

Kiểm tra CLI không dùng model:

```sh
node tools/eval/dist/cli.js --engine fake --mode lines --set synthetic-hw --limit 1 --dump-lines
```

Lệnh thành công, in dung lượng tải 0 byte, ghi JSON debug trong thư mục đã ignore.
Kết quả fake chỉ kiểm pipeline, không dùng kết luận độ chính xác OCR.

## File tạo/sửa trong vòng này

Tạo:

```text
tools/eval/src/ocr-diagnostics.ts
reports/read-ocr-review-r1-2026-11-16.md
```

Sửa:

```text
.gitignore
packages/reader-ocr-shared/README.md
packages/reader-ocr-shared/src/config.ts
packages/reader-ocr-shared/src/detection.ts
packages/reader-ocr-shared/src/index.ts
packages/reader-ocr-shared/src/recognition.ts
packages/reader-ocr-shared/src/types.ts
packages/reader-ocr-shared/test/shared.test.ts
packages/reader-ocr/README.md
packages/reader-ocr/src/index.ts
tools/eval/README.md
tools/eval/src/cli.ts
tools/eval/src/report.ts
tools/eval/test/ocr.test.ts
```

Không sửa các file bảo vệ, manifest, dependency hoặc truth của bộ đo.

## Quyết định & giả định

- Chiều cao dùng giới hạn gap là chiều cao nhỏ hơn của hai box gốc; k mặc định
  2,5, đổi được bằng API. Row membership kiểm từng cặp box gốc để tránh bắc cầu.
- `truncated` chỉ đánh dấu prefix không hoàn chỉnh; `charConf`/`logProbs` của
  phần đã đọc được giữ, nhưng conf dòng luôn 0. Special token sai và lỗi tensor
  được phân biệt như mục 2; lỗi tensor/session vẫn làm lượt đọc báo lỗi.
- Số dòng truth có ký hiệu thiếu là chẩn đoán bổ sung; không thay đổi mẫu số
  CER/WER hoặc tự chọn cách đọc theo truth. Dòng gạch xóa không có hiệu lực.
- Dump chỉ được ghi khi bật flag rõ ràng; `--from-device` và graph chưa hỗ trợ
  flag này trong phạm vi C trên Node. Không đưa C vào app Android ở vòng này.

Đã dừng sau phần sửa review; chờ Claude đo lại trên model thật và duyệt.
