# Manifest model và mã nguồn Android

## Bổ sung Lô 2.8 — C

Manifest thêm bốn artifact C từ release `duchoa1297/vietocr-onnx`, tag `ocr-v1`:
detector, VietOCR encoder, decoder, cấu hình; tổng **99.388.430 byte**.
`npm run models:fetch -- --model c` chỉ xem danh sách, không tải.
Nhánh tải có xác nhận dùng lại downloader resume/kiểm SHA-256 vào `.models/c/`.
Trọng số VietOCR có `licenseStatus: weights-unverified`: chỉ dùng để đo,
chưa đưa vào sản phẩm. Bản JSON gốc 712 byte (không phải model) được lưu trong
`config/`; hash đã đối chiếu release. Chi tiết tại
[báo cáo Lô 2.8](../../reports/read-ocr-implementation-2026-11-16.md).
Quyết định Lô 2.8 cho phép đo C trên PC sau khi review; luồng A/B Android bên dưới giữ nguyên.

## Lịch sử Lô 2.4 vòng 2

Theo quyết định cuối: phép đo dùng app Android ở các lô tiếp, **không tải model về máy tính**, không Termux.
Manifest [manifest.json](manifest.json) giữ đúng bốn GGUF A/B (revision, byte, SHA-256, license, link);
mục binary Windows đã được thay bằng `llamaCppSource`:

```json
{
  "repository": "ggml-org/llama.cpp",
  "revision": "b12388",
  "commit": "1c2adc75f619d05efc5d49ce08eaaa96272ebfa2",
  "url": "https://github.com/ggml-org/llama.cpp.git",
  "license": "MIT"
}
```

Tag→commit đã đối chiếu qua [GitHub ref chính thức](https://api.github.com/repos/ggml-org/llama.cpp/git/ref/tags/b12388),
[mã nguồn pin commit](https://github.com/ggml-org/llama.cpp/tree/1c2adc75f619d05efc5d49ce08eaaa96272ebfa2),
[LICENSE](https://github.com/ggml-org/llama.cpp/blob/1c2adc75f619d05efc5d49ce08eaaa96272ebfa2/LICENSE).
Workflow build Android ở **Lô 2.5** phải checkout tag và xác minh HEAD bằng commit này, không bám `master`/`latest`.
Không gán byte/hash binary Windows cho mục source. CLI không clone hay build source.

| Nhóm GGUF | Byte |
| --- | ---: |
| A | 1.817.539.488 |
| B | 1.926.804.800 |
| Tổng A+B | 3.744.344.288 |

GGUF Apache-2.0 giữ từ [khảo sát đã duyệt](../../docs/research/offline-reader.md#2-giấy-phép-và-byte-của-từng-file-trọng-số).
Metadata chính thức đúng revision: [A](https://huggingface.co/api/models/PaddlePaddle/PaddleOCR-VL-1.5-GGUF/revision/cc977c16989848c264d813ec1705cb181b7a21ee?blobs=true),
[B](https://huggingface.co/api/models/Qwen/Qwen3-VL-2B-Instruct-GGUF/revision/52d6c8ffea26cc873ac5ad116f8631268d7eb503?blobs=true).

## CLI phát triển còn giữ

`models:fetch -- --model a|b` vẫn có nhánh xem danh sách khi không `--confirm`, chỉ tải khi có cờ xác nhận.
`--model llama` nay chỉ in tag/commit nguồn và **0 byte tải qua CLI**; với `--confirm` báo không hỗ trợ clone/build.
Không tự chạy lệnh này trên máy tính theo luồng đo Android mới; Lô 2.4 chỉ test hàm bằng fake transport.
Màn tải model trong app chưa làm, thuộc Lô 2.5; app sẽ dùng manifest này.

Downloader phát triển giữ `.models/a/`, `.models/b/` (gitignore), streaming vào `.part`, có Range/resume,
kiểm `Content-Range`, đủ byte/hash mới rename. Sai SHA-256 xóa file và báo lỗi; kết nối ngắt giữ `.part` để tiếp tục.
HTTP 200 khi đang resume thì ghi lại từ đầu, không append. File đầy đủ đúng hash không tải lại.
Không chạy hai lệnh tải cùng nhóm đồng thời. Không có dependency tải/giải nén mới.

## Quyết định & giả định

Tách source ra `llamaCppSource` thay vì giả làm file tải có byte/hash chưa biết; giữ `files` chỉ cho bốn artifact GGUF.
Không đổi revision hay SHA-256 GGUF, không chỉnh weight/projector, chưa tải model/source/binary.
Không tạo script Termux, không build app Android trước Lô 2.5.
