# Lô 2.8 — ứng viên C qua ONNX

Đã triển khai bộ đọc chữ theo dòng, chưa đo độ chính xác/tốc độ bằng model thật.
Không tải `.onnx`, không chạy CLI với cờ xác nhận tải. Chưa làm Lô 2.9.

## Artifact và giấy phép

Đối chiếu [release ocr-v1](https://github.com/duchoa1297/vietocr-onnx/releases/tag/ocr-v1)
và [API metadata](https://api.github.com/repos/duchoa1297/vietocr-onnx/releases/tags/ocr-v1).
Release 2026-10-05; tag trỏ commit `b6733d5c250bf647cc8e13c303bf6622febee0cf`.
Manifest pin bốn file, byte, SHA-256; tổng 99.388.430 byte. Bản chuyển đổi bên
thứ ba, một tác giả, 0 sao tại thời điểm đối chiếu; giữ note này trong manifest.

Repo chuyển đổi và code VietOCR/PaddleOCR/RapidOCR khai Apache-2.0. Riêng điều
khoản trọng số gốc VietOCR vgg_seq2seq chưa xác minh: hai file encoder/decoder
đặt `licenseStatus: weights-unverified`. CLI và màn Model có cảnh báo một dòng;
chỉ dùng để đo, chưa đưa vào sản phẩm. Không dùng các checkpoint bị loại trong prompt.

Nguồn: [README bản chuyển đổi](https://github.com/duchoa1297/vietocr-onnx/tree/ocr-v1),
[VietOCR](https://github.com/pbcquoc/vietocr),
[RapidOCR config 3.9.2](https://github.com/RapidAI/RapidOCR/blob/v3.9.2/python/rapidocr/config.yaml).

## Từ vựng và kiểm thử

Đã tải duy nhất `vietocr.json` 712 byte, tính SHA-256:
`518345b7672fd36e534fb8ffcf6f6599c687793541259170834789fe2f7dd6e6`
(khớp digest release). File gốc được lưu tại `tools/models/config/vietocr.json`.
`missingVietnameseChars(vocab)` trên cấu hình này trả **[]**.
Bỏ `ự` khỏi vocab thì trả **["ự"]**. Không suy ra chất lượng nhận dạng từ độ phủ.

Test dùng session giả, log-prob dựng sẵn, không mạng/model thật. Kiểm tra conf,
alternatives, thứ tự/gộp dòng, dấu trên/dưới vùng cắt, hủy, giải phóng tensor,
unsupported_mode, CLI C không tải khi thiếu cờ, adapter không tự tải, lỗi đọc
vẫn vào mẫu số CER/recall. Phần shared không import Node hoặc ORT.

## Quyết định & giả định

- DB dùng thành phần liên thông + box thẳng trục; unclip chữ nhật ratio 2.0.
  Dòng cong/nghiêng, nhiều cột, bảng và dòng quá sát là hạn chế cần đo thật.
- Resize thuần TS bilinear; khác PIL LANCZOS trong ví dụ upstream ở recognizer.
  Ưu tiên giới hạn cạnh dài detector 2000 để giữ RAM; cần đo tác động độ chính xác.
- ABI input dựa trên README; tên output và tên input detector lấy từ metadata
  session, giữ thứ tự output đúng ví dụ upstream. Chưa mở ONNX để xác nhận bằng chạy thật.
- C chỉ một lượt, không tự giả hai lượt độc lập. Không dựng đồ thị, không dùng đáp án
  hoặc truth để chọn chữ. Truth chỉ dùng sau nhận dạng trong bộ đánh giá.
- `ReadUsage` thêm `lineCount`, `detectionMs`, `recognitionMs`. Dòng C thêm
  `charConf`, `logProbs`; text/alternatives NFC, box 0–1000.
- Không bật C chạy/tải trong app ở lô này; chỉ thêm cảnh báo giấy phép trên màn Model.

Chờ Claude review code. Đo synthetic-hw bằng model thật và đưa C vào Android
thuộc bước sau đã quy định, chưa có căn cứ kết luận C đạt ngưỡng nghiệm thu.

## Kết quả xác minh

`npm test` (gồm typecheck root và mobile):

```text
Test Files  42 passed (42)
     Tests  1033 passed (1033)
```

**Pass: 1033; fail: 0.** `npm run build` thành công cho mọi workspace trong lệnh.
Import runtime Node thành công, versions `common: 1.31.1`, `node: 1.31.1`.
`npm run models:fetch -- --model c` chỉ liệt kê bốn file/tổng byte/cảnh báo,
không tạo `.models/c/`. Không chạy cờ xác nhận tải. `git diff --check` sạch.

## File tạo/sửa

Tạo mới:

```text
packages/reader-ocr-shared/README.md
packages/reader-ocr-shared/package.json
packages/reader-ocr-shared/tsconfig.json
packages/reader-ocr-shared/src/config.ts
packages/reader-ocr-shared/src/detection.ts
packages/reader-ocr-shared/src/errors.ts
packages/reader-ocr-shared/src/image.ts
packages/reader-ocr-shared/src/index.ts
packages/reader-ocr-shared/src/recognition.ts
packages/reader-ocr-shared/src/types.ts
packages/reader-ocr-shared/test/browser.test.ts
packages/reader-ocr-shared/test/shared.test.ts
packages/reader-ocr/README.md
packages/reader-ocr/package.json
packages/reader-ocr/tsconfig.json
packages/reader-ocr/src/index.ts
packages/reader-ocr/test/node.test.ts
tools/eval/test/ocr.test.ts
tools/models/config/vietocr.json
reports/read-ocr-implementation-2026-11-16.md
```

Sửa:

```text
apps/mobile/src/BenchmarkScreen.tsx
package.json
package-lock.json
tsconfig.json
vitest.config.ts
packages/reader/src/index.ts
packages/reader/src/messages.vi.ts
packages/reader/src/types.ts
tools/eval/README.md
tools/eval/package.json
tools/eval/src/cli.ts
tools/models/README.md
tools/models/manifest.json
tools/models/src/cli.ts
tools/models/src/manifest.ts
tools/models/test/models.test.ts
```

Không sửa `docs/spec.md`, `docs/prompts/`, `CLAUDE.md` hoặc `AGENTS.md`.
