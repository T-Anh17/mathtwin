# Mốc B chế độ đồ thị trên vivo — 2026-11-17 (dừng sớm ở 11/40 ảnh)

## Cấu hình

- Cùng APK, thiết bị và tham số như [device-bench-vivo-2026-11-17.md](device-bench-vivo-2026-11-17.md): 768 px, 8 luồng, 1536 token mỗi lượt, DRY 0,8.
- Khác ở chế độ: **đồ thị**, **2 lượt** (`edges` + `neighbors`, `reconcile`).
- **Dừng ở ảnh thứ 12** theo yêu cầu người dùng, vì quá chậm (3–4 phút/ảnh). Ảnh đang chạy dở bị hủy và bỏ khỏi kết quả.
- Kết quả gồm 11 ảnh của 3 fixture: `01-elements-multigraph`, `07-connectivity-components`, `09-euler-loop-parallel`. Đây là ba fixture đầu theo thứ tự bộ đo, không chọn lọc.
- Dữ liệu thô (gitignore): `reports/.debug/device-vivo-app-b768-graph-2026-11-17.json`.

## Cách chấm

- `eval:read --from-device --mode graph` **từ chối file**. B ghi `w: 0` cho đồ thị không trọng số. Reader báo đúng `nonpositive_weight`, nhưng `tools/eval/src/device.ts` (hàm `outcome`) bắt `outcome.graph` phải qua `validateSpec`, nên coi bản ghi là hỏng. Đây là **lỗi của công cụ chấm**, cần sửa ở lô sau.
- Tạm so phần đồ thị bằng script riêng: nhãn đỉnh không phân biệt hoa/thường; multiset cạnh `{u,v}`; trọng số so khi có, coi `0` là không có trọng số.

## Kết quả (phần đồ thị)

| Ảnh | Đỉnh | Cạnh đúng / truth | Cạnh thừa | Trọng số | Số cờ |
| --- | --- | ---: | ---: | --- | ---: |
| 01-multigraph × 4 | đúng 3/4 | 1–2 / 3 | 1–3 | — | 9–13 |
| 07-components × 4 | đúng 4/4 | 2 / 2 | 0 | đúng | 5–6 |
| 09-loop-parallel × 3 | sai 2/2 | 2 / 3 | 1 | — | 11–12 |
| 09 (ảnh thứ 3) | lỗi `repetition_loop` | | | | |

Tổng hợp:
- **Đồ thị đúng hoàn toàn: 4/11**, cả 4 đều thuộc fixture đơn giản nhất (2 cạnh, không khuyên, không đa cạnh).
- **Đa cạnh và khuyên: 0/7 đúng.**
- F1 cạnh 0,61 (precision 0,63, recall 0,59).
- Bài sai đều có cờ, nhưng **9–13 cờ mỗi đề**. Người dùng sẽ phải xác nhận gần như toàn bộ hình, nên không dùng được.
- Mọi đề có `unsupported_task`: B không ánh xạ được yêu cầu đề. Bảng trên không xét phần này.
- B ghi `w: 0` cho cạnh không trọng số, sinh `nonpositive_weight` giả. Cần sửa prompt hoặc chuẩn hóa nếu còn dùng B.

## Hiệu năng

- **134–228 s/ảnh** cho 2 lượt; khoảng 1 100–1 500 token sinh ra mỗi ảnh.
- Thời gian xử lý prompt tăng dần theo ảnh: 52 s → 88 s, cùng số token prompt. Nghi do **máy nóng lên và hạ xung** khi chạy liên tục. Chưa đo nhiệt độ.
- RSS server: 3,9 → 4,4 GB.

## Kết luận

- B **không dùng được để đọc hình đồ thị**, kể cả ở chế độ đồ thị có schema:
  - hỏng đúng các ca quan trọng (đa cạnh, khuyên);
  - quá nhiều cờ;
  - 2–4 phút/ảnh.
- Củng cố hướng D trong [nháp các lô đọc hình](../.ai/drafts/02-figure-batches.md): dựng cấu trúc bằng code hình học xác định, mô hình chỉ đọc ký tự trên vùng cắt, B chỉ còn làm lượt kiểm chéo (nếu còn giữ).
- Mẫu nhỏ (11 ảnh, 3 fixture, ảnh tổng hợp). Đủ để thấy hướng đi, chưa phải số đo nghiệm thu.
