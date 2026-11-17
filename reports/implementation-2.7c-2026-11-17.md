# Lô 2.7c — giới hạn token và hủy kết nối đọc ảnh

Phạm vi: `.ai/reviews/2.7c-request.md`, sau review `.ai/reviews/2.7b-r1.md`.
Chỉ triển khai Lô 2.7c; không đo lại trên thiết bị trong phiên này.

## Đối chiếu từng yêu cầu

1. **Đã làm — giới hạn token.** `defaultMaxTokens = 1536` ở shared/config, được dùng bởi
   `completionRequest`, màn Đo và adapter Node. Màn Đo chỉnh được từ 1 đến 8192 (context Android).
   Node giữ tùy chọn constructor `maxTokens`, kiểm giới hạn context như trước. Không còn 4096 cứng
   trong request Android hoặc `exportReport`.
2. **Đã làm — xuất và nhập cấu hình.** File xuất ghi giới hạn hiệu lực trên từng ảnh; runtime cấp file
   ghi cùng giá trị khi đồng nhất, hoặc `null` khi trộn cấu hình. `--from-device` tách nhóm theo
   `maxTokens`, ghi runtime của từng nhóm đúng giá trị đó. File cũ lấy `runtime.maxTokens` đã ghi,
   không thay số đo 4096 cũ bằng mặc định 1536 mới.
3. **Đã làm — phân loại output.** JSON chưa đóng khi `finish_reason=length` vẫn là
   `repetition_loop`, không sửa JSON cụt. Output rỗng/toàn khoảng trắng với `length` là `truncated`.
4. **Bỏ phần stream theo điều kiện của yêu cầu.** Đã đọc mã nguồn b12388 trong cache, commit
   `1c2adc75f619d05efc5d49ce08eaaa96272ebfa2`. `server-task.cpp:1119–1166` tạo delta đầu tiên
   hoặc từ `oaicompat_msg_diffs`; điều kiện `if (!deltas.empty())` ở dòng **1148** bao phần xuất
   `prob_output` tại **1152–1156**. Không bảo đảm token không sinh delta vẫn có logprob. Vì vậy giữ
   `stream:false`, không dùng SSE/cắt sớm khi đang sinh, không thay cách tính confidence.
   Giới hạn token và sampler DRY vẫn có hiệu lực. README shared có link nguồn pin theo dòng.
5. **Đã làm — POST native và hủy.** `native.ts` gọi `MathTwinPlugin.post`, dùng `HttpURLConnection`.
   Native chỉ chấp nhận đúng URL `http://127.0.0.1:<port>` của session, đúng endpoint và API key;
   không theo redirect. Giữ connect timeout 5000 ms, read timeout cấu hình như trước. Mỗi POST có
   `requestId`, `cancelRequest` đóng kết nối. `Connection: close`, không dùng cache và luôn
   `disconnect()` trong `finally`, kể cả lỗi/hết giờ. Executor HTTP riêng không chặn điều khiển hủy.
   Cờ hủy còn được kiểm khi mở output stream để xử lý hủy đến trước lúc socket tồn tại.
6. **Đã làm — kiểm slot sau timeout/hủy.** Gọi `cancelRequest`, rồi `GET /slots` kèm API key,
   tối đa 5 giây; từng phép thăm dò có connect/read timeout 500 ms. Chỉ giữ server khi mọi slot
   `is_processing:false`. Bận/không kiểm được thì `stop()`, ghi `serverRestarted:true`; lần đo sau
   khởi động lại qua `start()`. Không chờ promise POST cũ trả về mới bắt đầu lượt sau.
7. **Đã làm — mã lỗi.** HTTP native timeout và hạn tổng ảnh là `timeout`; người dùng hủy là
   `aborted`; lỗi kết nối khác là `http_error`. Giữ xử lý memory pressure và lỗi tiến trình đã có.
   JS cũng áp hạn mỗi POST nếu bridge native không trả promise. Hạn tổng ảnh vẫn
   `180000 + passes * readTimeout` ms.
8. **Đã làm — Node.** Truyền signal hủy trực tiếp tới fetch và giữ signal suốt đọc body;
   POST có `Connection: close`, `keepalive:false`. Test giả xác nhận abort đến fetch khi timeout,
   hủy từ người dùng và đang đọc body; lượt kế tiếp chạy được. Giữ `reason:timeout` đã có.
   Process do Node sở hữu vẫn stop trong `finally`; không điều khiển tắt server ngoài.
9. **Đã làm — README.** Cập nhật app, shared, Node và tools/eval.

## Kiểm chứng

- `npm test`: lần đầu sau phần triển khai chính **1121 pass, 0 fail**, 43 file.
- Sau hai ca bổ sung, `npm test -- --maxWorkers=1`: **1123 pass, 0 fail**, 43 file.
  Trích output: `Test Files 43 passed (43)`; `Tests 1123 passed (1123)`.
- `npx tsc --noEmit -p` sạch cho `packages/reader`, `packages/reader-llamacpp-shared`,
  `packages/reader-llamacpp`, `apps/mobile`, `tools/eval`, `packages/core`.
- **Build APK đã hoàn tất qua chạy lại giai đoạn Gradle.** Đã chạy `npm run mobile:build` với
  `JAVA_HOME=C:/Program Files/Android/Android Studio/jbr`, `ANDROID_HOME=%LOCALAPPDATA%/Android/Sdk`,
  `MOBILE_BUILD_NO_PIPES=1`. Lần chạy song song ban đầu thiếu bộ nhớ; chạy lại native với
  `MOBILE_BUILD_JOBS=1`, `GOMAXPROCS=2` hoàn thành 289/289 bước C++, build web và Capacitor sync,
  nhưng JVM Gradle heap 1536 MB bị OOM. Vì vậy lệnh npm nguyên khối vẫn trả exit 1 ở bước Gradle;
  không ghi nhận lệnh đó là xanh.
  Chạy tiếp đúng `assembleDebug` bằng wrapper/JDK/SDK/cache đã dùng, với
  `-Dorg.gradle.jvmargs="-Xmx512m -XX:ActiveProcessorCount=2 -XX:TieredStopAtLevel=1"`,
  `-Dorg.gradle.project.kotlin.compiler.execution.strategy=in-process`, `--no-daemon --max-workers=1`
  và cùng aapt2 override: **`BUILD SUCCESSFUL in 1m 18s`**, 129 tác vụ (39 chạy, 90 up-to-date).
  Kotlin và đóng gói APK thành công; không thay thiết lập Gradle trong repo.
  Log: `.build-cache/mobile-build-2.7c-retry.log`, `.build-cache/mobile-gradle-2.7c.log`.
- APK: `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`, **18.111.316 byte**.
  `apksigner verify --verbose` thành công, APK signature v2 hợp lệ, 1 signer.
  `git hash-object apps/mobile/android/debug.keystore` khớp object trong `HEAD`.
- Test plugin giả phủ timeout native/JS, cancel theo requestId, GET slots có key, slot tạm bận,
  bận quá 5 giây, slots lỗi/không trả promise, fallback stop, lượt tiếp theo, hủy khi slot bận,
  hạn tổng ảnh trước HTTP, cấu hình token và xuất/nhập nhóm token khác nhau.
- `git diff --check` sạch; **7/7** file trong `.ai/protected.sha1` khớp hash.
- Không gọi adb, không tải model, không thêm dependency. Giữ nguyên debug.keystore và các file bảo vệ.

## File đã tạo/sửa

Tạo báo cáo này: `reports/implementation-2.7c-2026-11-17.md`.

Sửa 22 file:

| Nhóm | File |
| --- | --- |
| Android | `apps/mobile/android/app/src/main/java/vn/mathtwin/app/MathTwinPlugin.kt` |
| Android | `apps/mobile/android/app/src/main/java/vn/mathtwin/app/ServerRuntime.kt` |
| App | `apps/mobile/src/BenchmarkScreen.tsx` |
| App | `apps/mobile/src/benchmark.ts` |
| App | `apps/mobile/src/contracts.ts` |
| App | `apps/mobile/src/messages.vi.ts` |
| App | `apps/mobile/src/native.ts` |
| App test | `apps/mobile/test/benchmark.test.ts` |
| App test | `apps/mobile/test/evaluation.test.ts` |
| App README | `apps/mobile/README.md` |
| Shared | `packages/reader-llamacpp-shared/src/config.ts` |
| Shared | `packages/reader-llamacpp-shared/src/index.ts` |
| Shared | `packages/reader-llamacpp-shared/src/request.ts` |
| Shared | `packages/reader-llamacpp-shared/src/response.ts` |
| Shared test | `packages/reader-llamacpp-shared/test/shared.test.ts` |
| Shared README | `packages/reader-llamacpp-shared/README.md` |
| Node | `packages/reader-llamacpp/src/index.ts` |
| Node test | `packages/reader-llamacpp/test/remote.test.ts` |
| Node README | `packages/reader-llamacpp/README.md` |
| Eval | `tools/eval/src/device.ts` |
| Eval | `tools/eval/src/report.ts` |
| Eval README | `tools/eval/README.md` |

Hai file `reports/read-device-2026-11-16-292923508d24.{json,md}` đã tồn tại dưới dạng untracked
trước phiên làm việc; chỉ đọc, không sửa.

## Quyết định & giả định

- Không dùng stream do không chứng minh được logprob đầy đủ trong nguồn pin, đúng điều kiện bỏ qua của yêu cầu.
- `serverRestarted` là marker đã stop để lượt sau nạp mới; không nạp lại trong cleanup ảnh lỗi.
  Đây là trường thêm tương thích ngược ở kết quả ảnh và row đánh giá. Kết quả chạy thực tế luôn có boolean;
  file cũ không có marker vẫn nhập được.
- `runtime.maxTokens:null` biểu thị file có nhiều giới hạn; config từng ảnh là nguồn giá trị cụ thể.
- Giữ chính sách loạt đo dừng khi `timeout`/`aborted`; phép đo tiếp theo luôn qua `start()`.
- Socket/slot Android được kiểm bằng plugin giả và kiểm biên dịch APK; chưa có số đo mới trên điện thoại.
  Không suy ra cải thiện CER/tỉ lệ lặp/tốc độ từ các kiểm thử này.

Dừng sau Lô 2.7c, chờ reviewer.
