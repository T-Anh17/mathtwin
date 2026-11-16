# Đo trên thiết bị — vivo X100s Pro — 2026-11-16

## Cấu hình đo

- **Thiết bị:** vivo V2324HA, Android 16.
  - Chip MediaTek Dimensity 9300 (MT6989): 8 nhân lớn.
  - RAM 11,9 GB.
  - Bản CPU llama.cpp được nạp: `android_armv8.6_1`, xác định qua `/proc/<pid>/maps`.
- **Bộ đo:** `testdata/images-synthetic-hw`, 40 ảnh viết tay tổng hợp. Đây **không phải ảnh thật của học sinh**.
- **Cách đo:**
  - `llama-server` (b12388, bản NDK trong APK) chạy **trên điện thoại** qua `run-as`, CPU, `--threads 8`, `--ctx-size 8192`.
  - Máy tính gửi đúng request của app (`completionRequest`) qua `adb forward`, rồi chấm bằng `compareText`.
  - Script: `reports/.debug/devbench-2026-11-16.mjs`. Dữ liệu thô: `reports/.debug/device-vivo-*.jsonl` (gitignore).
- **Lý do không dùng màn Đo của app:** app có 3 lỗi chặn, liệt kê ở cuối báo cáo.
- **Sai khác so với request của app:**
  - schema `box` được đổi từ `prefixItems` sang `items` + `minItems/maxItems`;
  - khi `parseCompletion` lỗi, lấy chữ thẳng từ JSON trả về và đặt `conf = 0`. Vì vậy chưa đo được chỉ số "sai thầm lặng".

## Kết quả

### B — Qwen3-VL-2B Q4_K_M, ảnh co về cạnh dài 768 px

Chỉ số chữ (35/40 ảnh đọc được), so với C (VietOCR ONNX, đo trên máy tính) trên cùng 35 ảnh:

| Chỉ số | B | C |
| --- | ---: | ---: |
| CER toàn bộ | **16,1%** | 26,3% |
| CER vùng đề | **4,5%** | 14,2% |
| CER vùng bài làm | **24,3%** | 41,0% |
| CER vùng bảng | **1,9%** | 9,6% |
| CER bỏ dấu | 14,2% | 22,7% |
| WER | 30,7% | 59,8% |
| Lỗi chữ số | 36,6% | 45,8% |
| Lỗi nhãn đỉnh | 34,0% | 57,3% |

Tách theo nhóm ảnh:
- Patrick Hand: CER 9,6%. Dancing Script: 23,1%.
- Chụp thẳng: 21,7%. Phối cảnh: 11,4%.
- Vùng hình đồ thị: CER > 100%. B đọc lộn thứ tự nhãn đỉnh và trọng số, nên không dùng B để đọc hình theo kiểu "dòng chữ".

Hiệu năng:

| Chỉ số | Giá trị |
| --- | --- |
| Thời gian/trang | p50 55 s, p90 138 s, tối đa 169 s |
| Xử lý prompt (gồm mã hóa ảnh) | trung vị 44 s |
| Sinh chữ | trung vị 10,6 s, khoảng 15 token/s |
| RAM server | khoảng 2,1 GB |

Thử riêng một ảnh để chọn cỡ ảnh và số luồng:

| Cỡ ảnh, số luồng | Thời gian |
| --- | ---: |
| 512 px, 4 luồng | 35 s |
| 768 px, 4 luồng | 42 s |
| 768 px, 8 luồng | 39 s |
| 1000×1440 (cỡ app đang gửi) | > 5 phút, không xong |

**Lỗi:** 5/40 ảnh (12,5%) hỏng hẳn vì model lặp chữ tới hết `max_tokens`, JSON bị cụt. Fixture Dijkstra hỏng 3/4 ảnh.

### A — PaddleOCR-VL-1.5 (BF16), ảnh 512 px, 8 ảnh đầu

- Thời gian: trung vị 114 s/trang. Riêng xử lý prompt khoảng 100 s; sinh chữ 8–9 token/s.
- CER theo từng ảnh: 707% (lặp chữ), 56%, 13%, 18%, 93%, 61%, 20%, 40%.
- Kết luận: chậm gấp khoảng 2 lần B dù ảnh nhỏ hơn, và đọc kém hơn rõ rệt. **Đề xuất dừng A.**

## Kết luận

- **B** là ứng viên đọc chữ viết tay tốt nhất hiện có. Nhưng **chưa đạt để dùng thật**:
  - 55 s/trang;
  - 12,5% trang hỏng vì lặp chữ;
  - vùng bài làm còn sai khoảng 1/4 ký tự trên ảnh tổng hợp.
- **C** nhẹ (≈99 MB), nhanh (khoảng 1,3 s/ảnh trên máy tính), nhưng sai nhiều hơn khoảng 1,6 lần. Hợp làm phương án dự phòng cho máy RAM thấp.
- Chưa đủ căn cứ để kết luận cho ảnh viết tay thật: vẫn cần ≥ 30 ảnh thật có nhãn.

## Lỗi chặn trong app (cần sửa trước khi đo bằng màn Đo)

1. App co ảnh về cạnh dài 1536 px. CPU điện thoại không mã hóa ảnh kịp mức chờ 180 s, nên mọi lượt đều `http_error`. Cạnh dài 768 px là mức dùng được.
2. Schema `lines` của B (`box` dạng tuple `prefixItems` + `items:false`) bị llama.cpp b12388 từ chối: HTTP 400 "schema must be an object".
3. Server trả `content` đã bóc fence ```` ```json ````, nhưng `logprobs` vẫn chứa token fence. `parseCompletion` không ghép được nên báo `read_failed`.
4. APK build trong phiên Codex được ký bằng khóa debug khác. Khi cài đè, Android gỡ app cũ và **xóa dữ liệu** (mất model đã nạp).
5. Chưa có biện pháp chống lặp chữ, như `repeat_penalty` hay giới hạn token theo số dòng.
