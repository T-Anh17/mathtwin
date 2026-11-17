# Đo B bằng app trên thiết bị — vivo X100s Pro — 2026-11-17

Lần đầu đo **qua màn Đo của app**, end-to-end, sau Lô 2.7b (c15b8d8) và 2.7c (ea4349c). So với lần đo bằng script hôm 2026-11-16: [device-bench-vivo-2026-11-16.md](device-bench-vivo-2026-11-16.md).

## Cấu hình

- **Thiết bị:** vivo V2324HA, Android 16, Dimensity 9300, RAM 11,9 GB, CPU `android_armv8.6_1`.
- **App:** APK debug 2.7c; llama.cpp b12388, CPU, ctx 8192.
- **Đọc:** B (Qwen3-VL-2B Q4_K_M), chế độ dòng chữ, 1 lượt, 8 luồng, ảnh 768 px, `maxTokens` 1536, `readTimeout` 300 s, DRY 0,8 / 1,75 / 2 / 64.
- **Bộ đo:** `synthetic-hw`, 40 ảnh viết tay **tổng hợp**, không phải bài thật của học sinh.
- **Chấm:** `npm run eval:read -- --from-device … --set synthetic-hw --mode lines` → [read-device-2026-11-17-28082d558775.md](read-device-2026-11-17-28082d558775.md).

### Cách chạy

Lượt đo bị ngắt hai lần, rồi đo bổ sung:

1. **Lần 1 (mất hết):** chạy được 38 ảnh thì màn hình tắt. App ra nền và bị hệ thống giết (`am_kill … bg anr`). Kết quả chỉ nằm trong bộ nhớ nên mất cả 38.
2. **Lần 2:** máy được giữ sáng màn hình (gửi phím Shift qua adb mỗi 30 s).
   - Đo được 17 ảnh.
   - Ở ảnh 18, Android gọi `onLowMemory`; app dừng cả lượt với `memory_pressure`, đúng theo thiết kế.
3. **Đo bổ sung:** tạo bộ `synthetic-hw-rest` gồm 23 ảnh còn lại (từ ảnh 18) và chạy tiếp, không mất thêm.
   - App giữ cả kết quả cũ, nên file xuất có 41 bản ghi.
   - Bỏ bản ghi `memory_pressure` của ảnh 18, vì đây là lỗi máy và ảnh đã được đo lại → còn 40 ảnh, mỗi id một lần.

File thô (gitignore):
- `reports/.debug/device-vivo-app-b768-2026-11-17-rest.json` (41 bản ghi);
- `reports/.debug/device-vivo-app-b768-2026-11-17-40.json` (40 bản ghi, đem chấm).

## Kết quả

### Lỗi

- **4/40 trang (10%) `repetition_loop`:** 3 trang Dijkstra và `20-four-choice-question-dancing-straight`. Cả 4 đều chạm `finish_reason=length` ở 1536 token.
- Mỗi trang lỗi dừng sau 134–212 s, nằm trong giới hạn chờ.
- **Không còn** `http_error` hay `timeout`. Không có ảnh nào phải chờ request cũ.
- Hôm 2026-11-16, lần đo bằng script hỏng 5/40 trang, 3/4 Dijkstra; lần đo bằng app hỏng 2 `http_error` và 1 `aborted` trên 20 ảnh.

### Độ chính xác chữ

CER tính bằng tổng lỗi chia tổng ký tự, không lấy trung bình phần trăm.

| Tập ảnh | Tất cả | Đề | Bài làm | Bảng | Hình | Bỏ vùng hình |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 40 ảnh, trang lỗi tính là rỗng | 23,4% | 13,9% | 24,6% | 76,0% | 135% | 20,5% |
| 36 trang đọc được | **14,0%** | **4,1%** | **18,5%** | **3,8%** | 139% | **10,8%** |
| Cùng 35 trang với lần đo script | 15,8% | 7,9% | 18,3% | 3,8% | 126% | 12,6% |

- Lần đo script (35 trang): CER 16,1%, đề 4,5%, bài làm 24,3%, bảng 1,9%. Như vậy app cho CER tương đương script, vùng bài làm tốt hơn.
- **Sai thầm lặng** (dòng sai nhưng `conf` đủ cao, không bị gắn cờ): 21/275 dòng (7,6%); riêng bài làm 11/99 (11,1%).
- Lần này đo được chỉ số này vì `conf` có thật; lần đo script đặt `conf = 0` nên không đo được.
- Recall dòng (khớp nguyên dòng, đúng thứ tự): 26%.
- **Vùng hình đồ thị:** CER > 100%. B vẫn đọc lộn nhãn và trọng số. Không dùng B để đọc hình theo kiểu dòng chữ.

### Hiệu năng

| Chỉ số | Giá trị |
| --- | --- |
| Tổng mỗi trang, 36 trang đọc được | p50 49 s, p90 54 s, tối đa 70 s |
| Tổng mỗi trang, cả 40 trang | p50 49 s, p90 70 s |
| Server: xử lý prompt + sinh chữ | p50 48 s, p90 52 s; prompt khoảng 33–45 s, sinh 4–21 s |
| Nạp model mới | 3,4–5,9 s |

Model được nạp lại 5 lần: lần đầu, sau `memory_pressure`, và sau mỗi lần lỗi parse (app vẫn `stop()` server khi gặp lỗi parse).

### RAM

- RSS đỉnh của server lúc đầu là 3,8 GB.
- Nếu server không khởi động lại, RSS đỉnh tăng dần khoảng 80 MB mỗi ảnh, tới **4,76 GB** sau 21 ảnh liên tiếp.
  - Có thể là cache đa phương tiện của llama-server, hoặc trang mmap của model; cần kiểm.
  - Đây là ứng viên gây ra `onLowMemory` trên máy 12 GB.
- Lần đo script hôm 2026-11-16 ghi khoảng 2,1 GB, nhưng cách đo khác (đo một lần, không chạy liên tục); hai con số không so trực tiếp được.

## Kết luận cho B

- **Chạy được end-to-end trong app** trên máy mạnh: có `conf` thật, lựa chọn thay thế từng dòng, lỗi lặp dừng gọn, không treo hàng đợi.
- **Chưa đạt để dùng thật:**
  - khoảng 49 s/trang;
  - 10% trang hỏng vì lặp chữ (Dijkstra gần như luôn hỏng);
  - CER vùng bài làm khoảng 18%, và 11% dòng bài làm sai mà không bị gắn cờ;
  - không đọc được hình đồ thị;
  - RAM tăng dần khi chạy liên tục.
- Mọi con số đều trên ảnh tổng hợp. **Chưa đủ căn cứ** cho ảnh viết tay thật: vẫn cần ≥ 30 ảnh thật có nhãn.

## Việc cần làm trong app (lô sau)

1. **Lưu từng kết quả ra file ngay khi xong mỗi ảnh** (ghi nối tiếp), không đợi bấm Xuất. Đã mất 38 kết quả vì việc này.
2. **Giữ màn hình sáng khi đang đo** (`FLAG_KEEP_SCREEN_ON`) và chạy tiếp được từ ảnh chưa đo.
3. **Không `stop()` server khi lỗi parse** (`repetition_loop`, `logprob_alignment`): request đã xong, server không có lỗi.
4. Trong nhánh slot bận, `stop()` cần `.catch` (điểm nhẹ từ review 2.7c).
5. **Theo dõi RSS tăng dần**; cân nhắc khởi động lại server sau N ảnh hoặc khi RSS vượt ngưỡng.
6. Màn Đo nên xóa kết quả cũ khi bắt đầu lượt đo mới, hoặc xuất theo từng lượt.
