# Lô 4.6 — Cài đặt, lỗi và hoàn thiện

Hoàn tất đúng Lô 4.6; dừng để review. Không thực hiện Lô 4.7.

## Kết quả

- Cài đặt hiển thị A/B: tình trạng tải/kiểm tra, byte đã tải/tổng dung lượng, SHA-256 dự kiến từng file, biến thể CPU thực sự đang nạp; có tải, hủy tải, tải tiếp và xóa model. D ghi rõ không cần model. C chỉ xuất hiện trong màn Đo với cờ **chỉ để đo**, có thao tác quản lý tại đó.
- Hiển thị dung lượng ảnh, số phiên và dung lượng lịch sử. **Xóa toàn bộ lịch sử** xóa đồng thời phiên và mọi ảnh, kể cả ảnh chưa gắn vào phiên; thu hồi URL cục bộ.
- Demo nằm trong Cài đặt, gắn nhãn dữ liệu mẫu và không ghi lịch sử. Màn Đo tiếp tục nằm trong Cài đặt.
- Lỗi thiếu bộ nhớ, server không khởi động/chết, quá hạn, ảnh hỏng, hủy đọc và mở lại phiên đều có thông báo tiếng Việt cùng đường thử lại/nhập tay. Không đưa thông báo thô hoặc id của adapter lên giao diện học sinh. Checkpoint trang đã đọc được giữ lại.
- Giữ màn sáng qua giải mã ảnh, B, D và lưu trang. Giữ nguyên server qua onPause và cơ chế dừng khi rảnh nền 5 phút. Lỗi cấp phát bộ nhớ ở tác vụ Kotlin được trả về nhóm thiếu bộ nhớ.
- Thời gian đọc đề, nháp hình, giải, đọc bài và chấm hiển thị trong phiên. Lớp gọi đo solve/grade; reducer vẫn thuần. Bài gõ tay dùng nhãn **Xem bài đã gõ**.

## Các cổng kiểm tra

| Cổng | Kết quả |
| --- | --- |
| `npm test` | **2230 pass / 0 fail**, 82 file; Vitest **81,81 giây**, toàn lệnh dưới 3 phút |
| `npx tsc --noEmit -p packages/core` | Sạch |
| `npx tsc --noEmit -p packages/reader` | Sạch |
| `npx tsc --noEmit -p packages/work` | Sạch |
| `npx tsc --noEmit -p tools/eval` | Sạch |
| Typecheck `apps/mobile` | Sạch; chạy trong `npm test` và web build |
| `npm run mobile:build` | Thành công; Gradle `BUILD SUCCESSFUL` |
| Giải + chấm trên `testdata/core` | Đủ 60 bài, mỗi bài dưới 1 giây trên máy tính |
| `git diff --check` | Sạch |

Build dùng JDK 21 có sẵn tại `C:/Program Files/Android/Android Studio/jbr`, đặt `JAVA_HOME` riêng cho tiến trình, và `MOBILE_BUILD_NO_PIPES=1` để dùng nhánh build có sẵn của repo khi Ninja bị treo bởi giới hạn pipe. Không sửa script build hay cấu hình Java toàn máy. APK: `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`.

Các ca lỗi được chạy với bộ đọc giả cho cả luồng đề và bài làm; có hạn chờ với adapter không hợp tác, ảnh giải mã hỏng, hủy và bỏ kết quả đến muộn, checkpoint rồi mở lại, thử lại và chuyển nhập tay. Test kiểm riêng thời gian solve/grade, vô hiệu hóa timings khi chụp lại, dung lượng UTF-8 và xóa ảnh/URL.

Preview Chrome headless ở 360 px kiểm: không tràn ngang kể cả khi mở SHA-256; vùng chạm Cài đặt đạt 44 px; demo có nhãn; xóa phiên/ảnh thật trong IndexedDB; C chỉ hiện ở Đo; điều khiển tải/hủy/tải tiếp/xóa bằng model giả; thông báo lỗi và đường nhập tay; không có exception trình duyệt. Bộ chạy preview tạm đã được dọn khỏi app.

Không gọi adb, không tải model, không mở các test/mẫu được yêu cầu giữ kín. Không sửa core/work, 60 bài `testdata/core`, `docs/spec.md`, `docs/prompts/`, `CLAUDE.md` hay `AGENTS.md`.

## File tạo mới

- `apps/mobile/src/SettingsScreen.tsx`
- `apps/mobile/src/DemoScreen.tsx`
- `apps/mobile/src/SessionTimings.tsx`
- `apps/mobile/src/session-runner.ts`
- `apps/mobile/src/settings.vi.ts`
- `apps/mobile/src/settings.css`
- `apps/mobile/src/flow/reading-error.vi.ts`
- `apps/mobile/test/completion.test.ts`
- `reports/mvp-batch-4.6-2026-11-18.md`

## File sửa

- `apps/mobile/src/App.tsx`
- `apps/mobile/src/SecondaryScreens.tsx`
- `apps/mobile/src/SessionScreen.tsx`
- `apps/mobile/src/ProblemFlowScreen.tsx`
- `apps/mobile/src/WorkFlowScreen.tsx`
- `apps/mobile/src/ResultScreen.tsx`
- `apps/mobile/src/BenchmarkScreen.tsx`
- `apps/mobile/src/contracts.ts`
- `apps/mobile/src/problem-readers.ts`
- `apps/mobile/src/messages.vi.ts`
- `apps/mobile/src/product-messages.vi.ts`
- `apps/mobile/src/result.vi.ts`
- `apps/mobile/src/flow/reading.ts`
- `apps/mobile/src/flow/work-reading.ts`
- `apps/mobile/src/flow/sessionReducer.ts`
- `apps/mobile/src/flow/store.ts`
- `apps/mobile/src/storage/indexeddb.ts`
- `apps/mobile/src/storage/memory.ts`
- `apps/mobile/android/app/src/main/java/vn/mathtwin/app/ModelStore.kt`
- `apps/mobile/android/app/src/main/java/vn/mathtwin/app/MathTwinPlugin.kt`
- `apps/mobile/android/app/src/main/java/vn/mathtwin/app/ServerRuntime.kt`
- `apps/mobile/test/benchmark.test.ts`
- `apps/mobile/test/problem-readers.test.ts`
- `apps/mobile/test/product-ui.test.ts`

## Quyết định & giả định

1. Dung lượng lịch sử là byte UTF-8 của JSON phiên, ảnh là tổng `Blob.size`; không ước lượng phần phụ trội vật lý của IndexedDB. Thêm `SessionStore.usage()` và `clear()` cho cả hai adapter; bản IndexedDB xóa hai store trong một transaction.
2. SHA-256 lấy từ manifest đã pin; tình trạng đã kiểm tra dựa trên ModelStore hiện có. Chỉ hiển thị biến thể CPU khi server đang sống và báo được backend thực tế của đúng model; chưa nạp thì ghi chưa xác định. Preview dùng bộ đọc giả không được xem như model đã tải.
3. Mặc định hạn chờ mỗi tác vụ đọc/tải ảnh/nháp là 180 giây; `timeoutMs` tiêm được cho test. Hủy/quá hạn truyền tín hiệu tới adapter và chặn kết quả đến muộn.
4. Thêm `Readers.activity` tùy chọn, đếm các lượt giữ trạng thái đọc để cờ màn sáng không bị tắt giữa B, D và checkpoint. Không thay chính sách vòng đời server.
5. Thêm đối số phụ thuộc thuần `SessionOperations` cho reducer; `session-runner.ts` truyền các hàm được đo bằng đồng hồ lớp gọi. Không thêm đồng hồ vào reducer hay thay hành vi solve/grade. Timings solve/grade phản ánh lần tính hiện tại và được lưu cùng phiên.
6. Demo là màn riêng không lưu phiên; không thay bộ đọc chính B hay bật C cho luồng sản phẩm. Số hiệu năng là kiểm thử trên máy tính, không phải kết quả đo điện thoại.
