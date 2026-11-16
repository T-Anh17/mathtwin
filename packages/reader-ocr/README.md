# Adapter OCR Node — chỉ phát triển và đo

`createNodeOcrReader({ modelRoot?, signal? })` dùng `onnxruntime-node` CPU,
pin cùng `onnxruntime-common` ở **1.31.1**, MIT. Không dùng trong app Android.
Mặc định đọc bốn file ở `.models/c/`; kiểm byte và SHA-256 bằng manifest trước
khi tạo session. Không tự tải hoặc dùng mạng khi thiếu model.

Pipeline, giao thức tensor, cách tính conf và hạn chế ở
[reader-ocr-shared](../reader-ocr-shared/README.md). Gọi `close()` khi đo xong.
Có thể truyền `lineMerge: { maxHorizontalGapRatio: 2.5 }` để đổi khoảng trống
ngang tối đa khi ghép mảnh cùng hàng; quyết định ghép luôn dựa trên box trước unclip.
Dòng vượt giới hạn giải mã được giữ prefix, `conf: 0`, `truncated: true`;
không làm mất các dòng khác. Lỗi session/tensor vẫn làm lượt đọc báo lỗi.

Lệnh đo sau khi reviewer duyệt code và model đã được cung cấp:

```sh
npm run eval:read -- --engine offline:vietocr-onnx --mode lines --set synthetic-hw
```

Mặc định một lượt đọc; `--passes 1` hợp lệ, `--passes 2` bị từ chối vì C không có
hai chiến lược đọc độc lập. `--mode graph|both` báo `unsupported_mode`.
Kết quả ở `reports/read-eval-offline-vietocr-onnx-<ngày>.md` và `.json`.
Thêm `--dump-lines` để ghi `id`, `pass`, `box`, `text`, `conf`, cờ `truncated`
vào JSON trong `reports/.debug/` (gitignore). Mặc định không ghi nội dung dòng.
Vocab thiếu `→ × ∞ ≥ ≤ ≠`; báo cáo đếm riêng dòng truth có các ký hiệu này,
giữ nguyên truth và các chỉ số lỗi đầy đủ.
Độ trễ Node chỉ tham khảo, không dùng để kết luận tốc độ Android.

`npm run models:fetch -- --model c` chỉ in danh sách, tổng **99.388.430 byte**,
SHA-256 và cảnh báo giấy phép, không tải. Nhánh tải có cờ xác nhận dành cho
reviewer sau khi người dùng đồng ý. Lô 2.8 không tải ba file `.onnx` và không
chạy lệnh xác nhận tải. Chỉ cấu hình JSON 712 byte được tải để đối chiếu.

ONNX Runtime là dependency runtime được duyệt; trên máy phát triển dùng
`ONNXRUNTIME_NODE_INSTALL=skip` để bỏ tải runtime CUDA không cần thiết khi cài npm.
Không thêm `onnxruntime-web` ở lô này.
