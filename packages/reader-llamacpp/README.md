# Adapter Node llama.cpp — chỉ để phát triển

Quyết định mới nhất: đo bằng **app Android thật**, không Termux, không benchmark nghiệm thu trên máy tính.
Lô 2.4 chỉ sửa nền dùng chung; **chưa làm app Lô 2.5**, chưa tải GGUF/mã nguồn/binary, chưa suy luận thật.

Package này Node-only (Node ≥ 22.12, ESM). App dùng [reader-llamacpp-shared](../reader-llamacpp-shared/README.md)
và `reader`, không import package Node. Phần dựng request, parse, điểm từng giá trị, top-k, đổi box và mã lỗi đã tách hết sang shared;
co ảnh là TS thuần ở `packages/reader/src/resize.ts`.

## Hai chế độ phát triển

```ts
import { LlamaCppReader } from '@mathtwin/reader-llamacpp';

// Server đã chạy, chỉ gọi HTTP nội bộ, không spawn/kiểm model trên máy bên gọi.
const connected = new LlamaCppReader({
  model: 'b', serverUrl: 'http://192.168.1.23:8080', apiKey: 'server-generated-key',
});

// Binary phát triển đã có sẵn; adapter sở hữu và tắt tiến trình đó.
const spawned = new LlamaCppReader({
  model: 'b', serverPath: 'D:/dev/llama.cpp/build/bin/llama-server.exe', threads: 4,
});
```

`serverUrl` và `serverPath` loại trừ nhau. `serverUrl` bắt buộc `apiKey` không rỗng;
chỉ chấp nhận `http://` tới **IP literal** 10/8, 172.16/12, 192.168/16, 127/8 hoặc IPv6 `::1`.
Không nhận DNS (kể cả `localhost`), IP công cộng, link-local, IPv4 rút gọn/hex/octal, credentials, path/query/fragment.
Mọi request có `Authorization: Bearer …`, `redirect:'error'`; không tự chuyển ảnh sang URL khác.
Chế độ này không tạo cổng/process, không kiểm file local và không tắt server bên ngoài khi hủy.
Đây chỉ là đường phát triển, không thay kiến trúc app Android đã chốt.

Spawn chỉ bind **127.0.0.1**, cổng rảnh OS cấp, khóa ngẫu nhiên mỗi process, `--offline`, `--no-webui`.
Adapter gọi `/health`, rồi `/v1/chat/completions`. Khi xong/lỗi/hủy/timeout luôn dừng process sở hữu;
chờ thoát, SIGKILL dự phòng sau 2 giây, tối đa 6 giây chờ tắt. Native stdout/stderr bị bỏ, không log ảnh/đề.
Không tự tải model, mã nguồn, binary hay driver. Manifest nay chỉ pin **mã nguồn** để Lô 2.5 build Android.

| Tùy chọn | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `model` | Bắt buộc `a`/`b` | `offline:paddleocr-vl-1.5` / `offline:qwen3-vl-2b` |
| `serverPath` | Một trong hai chế độ | Đường dẫn tuyệt đối binary phát triển đã có |
| `serverUrl` + `apiKey` | Một trong hai chế độ | Server riêng/loopback đang chạy |
| `modelsDirectory` | `<repo>/.models/` | Spawn dùng các file trong `a/` hoặc `b/` |
| `gpuLayers`, `mmprojGpu` | `0`, `false` | Chỉ spawn, CPU mặc định |
| `threads` | `os.availableParallelism()` | Chỉ spawn; thay số `--threads` cứng, có thể đặt rõ khi phát triển |
| `contextSize`, `maxTokens` | `8192`, `4096` | Context chỉ spawn; token output mọi mode |
| `timeoutMs`, `startupTimeoutMs` | `180000`, `120000` | Hạn thao tác và chờ `/health`; cùng áp dụng cho kết nối server có sẵn |
| `maxLongEdge` | `1536` | Bilinear RGBA giữ tỉ lệ trước gửi |
| `alternativesThreshold` | `0.1` | Ngưỡng ứng viên top-k, không dùng đáp án để lọc |
| `paddleTextMode` | `spotting` | `Spotting:` có LOC/box; chọn `ocr` để dùng OCR thuần không box |

Hai engine cài `TextReader`; Qwen cài đọc đồ thị với prompt `edges`/`neighbors` độc lập, không draft trước.
Paddle `read()` báo `text_only`; không dựng cạnh từ chữ OCR hoặc trả đồ thị rỗng giả thành công.

Ảnh `PreparedImage` RGBA đã xoay EXIF được co bằng `reader.resizeImage`, mã hóa PNG trong RAM bằng Node zlib.
Không đọc `source`, không lưu ảnh. `usage.sentImages` ghi kích thước thực gửi;
box normalized từ response đổi thẳng về kích thước ảnh gốc, box lỗi bỏ mà không mất dòng.
Nhiều trang text đọc theo thứ tự input; box thuộc trang tương ứng, interface hiện chưa có pageIndex.

`usage.serverTimings` giữ tổng prompt/predicted ms và token của server (chỉ nếu mọi request có `timings`),
`latencyMs` đo tổng thao tác trên bên gọi, gồm co/mã hóa/giao tiếp/chờ server/inference, chưa gồm dừng process.
Spawn cold-start và server có sẵn warm-start không phải cùng phép đo. `peakMemoryMb` chưa đo, không thay bằng JS heap.
`readProblem` cộng usage của các lượt; không cộng số đo server thiếu thành tổng đầy đủ.

`LlamaCppReadError` giữ `code` và `reason` an toàn để đếm lỗi.
Hủy luôn trả `reason:'aborted'`, không trả nguyên `signal.reason` có thể chứa dữ liệu.
Server do adapter sở hữu thoát bất ngờ → `server_exit`; kết nối server ngoài đứt → `http_error` vì không có thông tin tiến trình từ xa.
`readProblem` giữ hành vi blocking `read_failed` hiện có; bên cần đếm nguyên nhân có thể ghi mã lỗi từ các phương thức adapter.

## Kiểm tra, nguồn và Quyết định & giả định

Chi tiết ánh xạ byte/confidence, grammar trước sampling (kèm **link dòng code b12388**), top-k và nguồn hệ tọa độ
Qwen/Paddle ở [README shared](../reader-llamacpp-shared/README.md).
Đặc biệt spotting A còn cần kiểm cấu hình projector/runtime theo card chính thức khi tích hợp thật; không tự sửa hash GGUF.

`npm test` chỉ HTTP/process giả, không mở mạng/cổng, không cần model.
`npm run build` dựng workspace theo thứ tự reader → shared → Node; cả reader/shared có typecheck không Node types.
Không thêm thư viện mới. Đã thay manifest Windows bằng tag **b12388**, commit **1c2adc75f619d05efc5d49ce08eaaa96272ebfa2**;
không tạo `tools/phone/`, không sửa file bảo vệ, không triển khai UI/Capacitor/JNI/NDK ở lô này.
