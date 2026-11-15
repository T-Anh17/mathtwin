# MathTwin Android — Lô 2.5

Khung app sản phẩm bằng Capacitor 8 + React + TypeScript + Vite, hiện có màn **Model** và **Đo**.
Chỉ Android **arm64-v8a**, Android 8 / API 26 trở lên. Backend CPU; Vulkan, OpenCL và GPU offload tắt.
Không có model trong APK. Không chạy `adb` hoặc tải trọng số khi chạy `npm test` / `mobile:build`.

## Build trên Windows

Node.js ≥ 22.12, JDK 21, SDK 36 / Build Tools 36.0.0, NDK **27.1.12297006**, CMake **3.22.1**.
PowerShell, tại thư mục gốc repo:

```powershell
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:npm_config_cache = "$PWD\.build-cache\npm"
npm install
npm test
npm run mobile:build
```

Script có giá trị mặc định như trên nếu chưa đặt biến môi trường. Build lần đầu cần mạng cho **mã nguồn**
llama.cpp, Gradle và dependency; không tải model A/B. Cache đặt ở `.build-cache/` trên ổ chứa repo,
không dùng cache mặc định ở ổ C. Có thể đặt `MOBILE_BUILD_JOBS=4` để giảm số tác vụ C++ đồng thời.
Nếu sandbox Windows chặn pipe tiến trình con của Ninja, đặt `$env:MOBILE_BUILD_NO_PIPES = '1'`
trước `npm run mobile:build`. Chế độ này lấy đúng các lệnh phụ thuộc do Ninja sinh rồi chạy với handle
kế thừa, chỉ song song hóa các lệnh compile; không đổi cờ compiler, source hoặc tập biến thể CPU.
Source pin lấy trực tiếp từ `tools/models/manifest.json`: tag `b12388`, commit
`1c2adc75f619d05efc5d49ce08eaaa96272ebfa2`; kiểm cả tag, HEAD và source không có thay đổi.
Clone mới dùng partial/sparse checkout, loại `models/` và `tests/` (có fixture từ vựng GGUF upstream).

Build bằng NDK, C++ shared, `BUILD_SHARED_LIBS=ON`, `GGML_BACKEND_DL=ON`, `GGML_CPU_ALL_VARIANTS=ON`,
`GGML_NATIVE=OFF`, `GGML_OPENMP=OFF`, `GGML_LLAMAFILE=OFF`,
`LLAMA_OPENSSL=OFF`, không tải web UI upstream. File thực thi PIE được bỏ debug symbols,
đổi tên `libllama_server.so`, đóng gói cùng các thư viện phụ thuộc `libggml*.so`, `libllama*.so`,
`libmtmd.so`, `libc++_shared.so` ở `jniLibs/arm64-v8a/`.
`extractNativeLibs=true` và `useLegacyPackaging=true` để Android giải nén file có quyền thực thi.
NDK bật `ANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES` cho thiết bị có trang nhớ 16 KB.
Manifest và giấy phép llama.cpp được copy vào assets khi build; không chỉnh các file này riêng trong Android.

Bảy module CPU lấy nguyên từ b12388, chọn bằng runtime feature score của ggml:

| Module `android_…` | Tập lệnh thêm so với baseline |
| --- | --- |
| `armv8.0_1` | Baseline ARMv8-A, cho cả Cortex-A53 |
| `armv8.2_1` | dotprod |
| `armv8.2_2` | dotprod, FP16 vector |
| `armv8.6_1` | dotprod, FP16 vector, i8mm |
| `armv9.0_1` | dotprod, FP16 vector, i8mm, SVE2 |
| `armv9.2_1` | dotprod, FP16 vector, i8mm, SVE, SME |
| `armv9.2_2` | dotprod, FP16 vector, i8mm, SVE, SVE2, SME |

NDK hiện dùng cờ `-march=armv8.6-a+dotprod+fp16+i8mm+sve2` cho module có tên `android_armv9.0_1`
theo CMake upstream; tên module và yêu cầu tính năng không được suy ra từ nhãn điện thoại.
Feature-score được biên dịch riêng ở baseline, không có LTO, nên việc thăm dò không cần chạy kernel
dotprod/SVE/SME trên máy cũ. Kiểm binary bằng `llvm-objdump -d` (module dotprod có `sdot`)
và `llvm-readelf -d` (mọi `NEEDED` đều phải có trong APK hoặc là thư viện hệ thống Android).

Đầu ra:

```text
apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

Build không tự cài. Khi đến lô thử thiết bị và đã được phép:

```powershell
npm run mobile:install
```

Lệnh trên chỉ `adb install -r` APK đã build, không build lại. **Không chạy trong phiên Lô 2.5 này.**
`npm run mobile:dev` chỉ xem giao diện; tải model và đo cần APK Android.

## Model

- Màn Model hiện số byte/dung lượng của từng file từ manifest, tiến độ đã nhận và dung lượng trống.
  Nút **Tải** là bước xác nhận trước khi có kết nối tải; mở app không tự tải.
- Tải HTTPS đúng URL chứa revision đã pin. Theo redirect HTTPS của Hugging Face tới CDN,
  không cho hạ xuống HTTP; không lấy model qua API inference.
- File dở lưu `.part`; lần bấm Tải tiếp gửi `Range`. Kiểm `Content-Range`; nếu server trả `200`
  thì ghi lại từ đầu. Mất mạng/hủy giữ phần đã nhận; byte thừa hoặc SHA sai thì xóa.
  Chỉ đổi tên sau khi đủ byte và SHA-256 khớp. File đã có cũng được kiểm trước khi khởi động model.
- Model thực dùng ở `filesDir/models/<a|b>/` trong sandbox riêng. Không cho người dùng nhập URL/model path
  hoặc tham số dòng lệnh tùy ý. Không đủ dung lượng (có dự phòng 64 MiB) thì chặn tải/import.
- Mặc định cảnh báo dưới **6 GB RAM vật lý**, có thể đổi ngưỡng trong màn Đo. Cần tích xác nhận
  trước khi chạy trên máy dưới ngưỡng. RAM khả dụng cũng được ghi trong thông tin thiết bị.
  Máy ít RAM chỉ dùng để kiểm chạy được; không suy ra hiệu năng của máy mục tiêu.

Nhà phát triển có thể đưa **file đã có**, không cần tải lại. Ví dụ sau khi được phép dùng thiết bị:

```powershell
adb shell mkdir -p /sdcard/Android/data/vn.mathtwin.app/files/import/b
adb push '<file Qwen3VL-2B-Instruct-Q4_K_M.gguf đã có>' /sdcard/Android/data/vn.mathtwin.app/files/import/b/
adb push '<file mmproj-Qwen3VL-2B-Instruct-F16.gguf đã có>' /sdcard/Android/data/vn.mathtwin.app/files/import/b/
```

Bấm **Kiểm tra file adb push** cho B. App kiểm SHA/byte nguồn, copy vào vùng riêng, kiểm SHA/byte bản copy.
Tương tự A dùng `import/a/` và đúng hai filename trong manifest. File sai bị xóa; nguồn hợp lệ giữ lại để
nhà phát triển tự dọn nếu muốn. Cần dung lượng cho cả nguồn và bản copy. Đường dẫn `/sdcard` có thể
hiện dưới dạng `/storage/emulated/0` trong kết quả Android.

## Bộ đo và màn Đo

Chọn A/B, 1/2 lượt, graph/lines và số luồng CPU. A hiện chỉ hỗ trợ chữ (`Spotting:`);
chọn graph với A trả `text_only`, không bịa đồ thị. B dùng edges/neighbors độc lập cho graph,
hoặc prompt dòng chữ cho lines. `passes=2` ở lines giữ **hai kết quả độc lập**, không tự chọn/chữa dòng.

Nút **Chụp ảnh** mặc định dùng camera hệ thống qua `Camera.getPhoto`, `CameraSource.Camera`,
`CameraResultType.Base64`, `quality:95`, `correctOrientation:true`, `saveToGallery:false`.
Không truyền width/height để giữ độ phân giải ảnh tĩnh gốc trước bước resize chung.
Phiên bản Camera 8.2.6 dùng legacy flow cho API này: camera hệ thống ghi JPEG tạm tại
`getExternalFilesDir(Environment.DIRECTORY_PICTURES)/JPEG_<yyyyMMdd_HHmmss>_<random>.jpg`,
tức thường là `/sdcard/Android/data/vn.mathtwin.app/files/Pictures/` (không phải thư viện ảnh công cộng).
Plugin tự xóa file sau khi chuyển Base64; app còn gọi cleanup trong `finally`, kể cả hủy/chụp lỗi,
chỉ xóa đúng mẫu tên ở thư mục riêng này. Khi mở app, cleanup dọn file cùng mẫu còn lại từ phiên bị ngắt.
Không lưu bản copy ảnh chụp lâu dài hoặc tự lưu vào gallery.
**Chụp WebView (phụ)** giữ lựa chọn `getUserMedia`/canvas; đây là khung video, có thể kém độ phân giải
camera tĩnh. Kết quả luôn phân biệt `imageSource:"camera"` và `captureMethod:"system"|"webview"`.
Chọn thư viện dùng file picker -> FileReader, chỉ giữ data URL trong bộ nhớ.
Nguồn thư viện ghi `imageSource:"gallery"`; bộ đo ghi `imageSource:"dataset"`.
PNG/JPEG tối đa 10 MiB, 40 triệu pixel; giải mã có EXIF orientation, resize TS về cạnh dài tối đa 1536.
Tọa độ kết quả quy về ảnh gốc đã xoay. Xóa ảnh khỏi bộ nhớ bằng nút trên màn Đo.

Thư mục bộ đo chứa ảnh và `ids.json` (mảng, id duy nhất, filename không có thư mục con):

```json
[
  { "id": "case-01", "file": "1.png" },
  { "id": "case-02", "file": "2.jpg" }
]
```

```powershell
adb shell mkdir -p /sdcard/Android/data/vn.mathtwin.app/files/datasets
adb push '<thư mục bộ đo đã có>/synthetic' /sdcard/Android/data/vn.mathtwin.app/files/datasets/
```

Nhập `synthetic` rồi bấm **Nhập bộ đo**. Chỉ nạp ảnh khi đến lượt xử lý, không đưa cả thư mục vào RAM.
Kết quả giữ theo id, không cần `truth.json` trên điện thoại. Đóng gói bằng
`npm run eval:pack -- --set synthetic-hw`; dùng thư mục `.build-cache/datasets/synthetic-hw` và nhập tên `synthetic-hw`.
Máy tính tính chỉ số bằng `npm run eval:read -- --from-device <file.json> --mode both`.
Xem [hướng dẫn bộ đo, truth và chỉ số](../../tools/eval/README.md).

Mỗi ảnh hiển thị kết quả graph/lines, cờ, tổng thời gian, thời gian kiểm file, thời gian nạp model,
timings prompt/prediction, RAM đỉnh server hoặc mã lỗi. Graph vẽ khuyên/đa cạnh; các cạnh chưa chắc
được tô vàng. Trên ảnh: box dòng/nhãn có `conf < 0.85` hoặc alternatives được tô vàng;
cờ cạnh chỉ có vùng **thô giữa box hai đầu mút** khi có đủ box, không giả vị trí trọng số/cạnh.
Các mục không có tọa độ được liệt kê trong kết quả; không bịa box. Preview bộ đo chỉ mở khi bấm xem.

## Tiến trình, đo đạc và riêng tư

- Kotlin giữ server giữa các ảnh cùng model/số luồng, đổi cấu hình thì dừng và khởi động lại.
  Bind duy nhất `127.0.0.1`, cổng trống, khóa 32 byte ngẫu nhiên mỗi tiến trình.
  `CapacitorHttp` gửi POST native để tránh mixed content/CORS; không mở mixed content cho WebView.
  Network security chỉ cho HTTP tới loopback; Internet model download dùng HTTPS.
- `modelVerifyMs`: thời gian kiểm SHA trước cold start, tách khỏi `modelLoadMs` (spawn -> health ready).
  Warm start trả `reusedModel=true`, `modelLoadMs=0`, `modelVerifyMs=0`.
  `totalMs` gồm chuẩn bị ảnh, kiểm file, nạp và đọc; `usage.latencyMs` là phần gọi đọc.
  `usage.serverTimings` lấy từ llama.cpp, không suy ra thời gian mạng bằng phép trừ.
  `--no-warmup`: khởi tạo kernel đầu tiên còn có thể nằm trong lượt inference đầu.
- Plugin lấy PID bằng shell cố định `echo $$; exec` (PID giữ nguyên qua exec), tránh hidden API
  và `Process.pid()` không có trên Android baseline. Đọc `/proc/<pid>/status` mỗi 100 ms và khi hỏi status;
  `VmHWM` là RAM đỉnh **của toàn phiên server**, không phải phần tăng riêng từng ảnh. Không đọc được thì
  để thiếu trường và báo trên màn hình, không ghi 0 giả. `VmRSS` là mẫu gần nhất.
- `onPause` không dừng server: mở camera hoặc bộ chọn ảnh vẫn giữ được model nóng.
  Suốt `runBatch`, plugin đặt `FLAG_KEEP_SCREEN_ON`; `finally` xóa cờ khi xong, hủy hoặc lỗi.
  Dừng khi người dùng bấm dừng, timeout, `onDestroy`, `onTrimMemory` mức `RUNNING_CRITICAL`/`COMPLETE`
  hoặc `onLowMemory`. Ở nền mà không đang đo, dừng sau khoảng rảnh cấu hình `backgroundIdleMinutes`
  (mặc định 5 phút, chọn 1–60 ở màn Đo); về foreground thì bỏ hẹn giờ. Khi kết thúc đo ở nền,
  bắt đầu tính khoảng rảnh từ lúc kết thúc, không cắt bộ đo đang chạy dù đã ở nền lâu.
  Lượt đang chạy phát hiện child chết;
  exit 137/9 báo `server_killed` (có thể OOM, không khẳng định nguyên nhân nếu OS không cho bằng chứng).
  Khi `exec_blocked`, dừng bộ đo và báo cần reviewer xem phương án JNI; không tự chuyển kiến trúc.
- Parser/prompt/confidence/top-k/resize dùng package TS thuần của Lô 2.4; không import adapter Node.
  Thiếu logprobs, JSON lỗi hay bị cắt trả mã lỗi; không dùng điểm đúng/sai bài làm để chọn cách đọc.
- `LD_LIBRARY_PATH` và working directory của child trỏ `nativeLibraryDir`; ggml tìm các backend tại
  thư mục executable/cwd, không ép một module bằng `GGML_BACKEND_PATH`.
  Đọc dòng upstream `load_backend: loaded CPU backend from …/libggml-cpu-<variant>.so` đầu tiên
  trước khi chấp nhận startup, chỉ giữ tên thuộc bảy biến thể đã build trong `status.cpuVariant`.
  Dùng `--verbosity 4 --no-log-prefix --no-log-timestamps --log-colors off`: tại commit đã pin,
  GGML INFO được ánh xạ sang mức trace 4 và `common_init` mặc định bật tiền tố/thời gian.
  Các dòng khác bị bỏ, bộ đệm dòng giới hạn 1024 byte, không lưu log ra file/Logcat hoặc chuyển tới UI.
  Không thu được tên backend thì trả `cpu_backend_unknown` và dừng, không bịa tên từ tập lệnh máy.
  Tên đã nhận không bị ghi đè bởi log của lượt inference sau.
- Tắt logging Capacitor/WebView debug; không log ảnh/nội dung đề/khóa.
  Không có cloud inference, upload ảnh, tài khoản hay telemetry.

## Xuất kết quả

Nút **Xuất kết quả** ghi JSON `version:1`, thông tin máy (model/Android/CPU/RAM/storage), từng id,
engine, cấu hình CPU (gồm `cpuVariant` thực nạp), `imageSource`/`captureMethod`, ReadOutcome hoặc các lượt
lines, usage (gồm kích thước gốc), timings, load/verify/total, RAM và mã lỗi.
**Không có ảnh, data URL, pixel, đường dẫn nguồn hoặc khóa server.** Có nội dung chữ/đồ thị đã đọc.
Màn hình trả đường dẫn file trong `Android/data/vn.mathtwin.app/files/results/`.

```powershell
adb pull /sdcard/Android/data/vn.mathtwin.app/files/results ./reports/device-results
```

Lệnh lấy về do reviewer chạy trong lô đo thiết bị; không chạy trong Lô 2.5.

## Kiểm tra

`npm test` typecheck strict TS và chạy Vitest với plugin/HTTP/decoder giả: graph hai lượt độc lập,
lines/A spotting, cold/warm, missing_probs/JSON, hủy cả khi native không trả, server bị giết, RAM thấp,
execution refusal, cấu hình không hợp lệ và JSON không chứa ảnh/khóa. Không cần SDK/NDK, thiết bị hoặc model.
Giao diện React dùng `App.tsx`/`main.tsx`, cùng logic nghiệp vụ đều được kiểm tra TypeScript strict,
không `any`; hai devDependency MIT `@types/react` và `@types/react-dom` được duyệt trong review vòng 1.
Test bổ sung kiểm yêu cầu camera hệ thống/cleanup khi thành công, hủy và lỗi, cờ đo/screen-on cả bộ ảnh,
dọn cờ khi hủy/lỗi, và xuất nguồn ảnh/CPU backend thực nạp bằng plugin giả.
Build APK là bước riêng, không thuộc `npm test`.

Tài liệu upstream dùng khi triển khai: [Capacitor Android](https://capacitorjs.com/docs/android),
[llama.cpp Android tại commit đã pin](https://github.com/ggml-org/llama.cpp/blob/1c2adc75f619d05efc5d49ce08eaaa96272ebfa2/docs/android.md).
Chưa có xác minh trên điện thoại: launch/SELinux, runtime chọn biến thể CPU, camera hệ thống/WebView,
tải/resume và inference thật chỉ có thể
nghiệm thu sau khi reviewer cài APK và người dùng chủ động tải model ở Lô 2.7.
