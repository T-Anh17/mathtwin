# Bộ đọc C dùng chung — Lô 2.8

TS thuần, ES2022, không API Node, không import ORT và không gọi mạng. Host cung cấp
`OrtLike` (tạo session, tensor, run, release). Node adapter ở `../reader-ocr`;
WebView/WASM thuộc Lô 2.9. Engine: `offline:vietocr-onnx`.

`VietOcrReader.create(ort, models, config, signal?, lineMerge?)` nạp ba session một lần;
`readLines(images, signal?)` trả dòng theo thứ tự trang, rồi trên xuống dưới.
`close()` giải phóng session. Không chạy đồng thời hai lượt trên một reader.
`read()` luôn ném `OcrError` có `code: unsupported_mode` vì C chỉ đọc chữ.

## Tiền xử lý và DB

Nguồn: [RapidOCR 3.9.2 config](https://github.com/RapidAI/RapidOCR/blob/v3.9.2/python/rapidocr/config.yaml)
và [DetPreProcess/DBPostProcess](https://github.com/RapidAI/RapidOCR/blob/v3.9.2/python/rapidocr/ch_ppocr_det/utils.py).
Ảnh RGBA được trộn alpha trên nền trắng. Detector nhận BGR, NCHW float32,
`(pixel / 255 - 0.5) / 0.5`. Cạnh ngắn tối thiểu 736, kích thước làm tròn bội 32.
Giới hạn cạnh dài 2000 (giới hạn toàn cục của RapidOCR) được ưu tiên để giữ RAM thấp;
ảnh rất dài có thể có cạnh ngắn dưới 736. Resize bilinear bằng TS.

DB: probability > 0.3, dilation 2×2, thành phần liên thông 8 hướng, score trung bình
trên pixel foreground của chính thành phần ≥ 0.5; không tính nền trong chữ nhật
hoặc pixel nền chỉ được thêm bởi dilation. Cạnh nhỏ nhất trước unclip ≥ 3 pixel. Unclip chữ nhật:
distance = area × 2.0 / perimeter; cạnh sau mở rộng ≥ 5 pixel. Dùng ratio 2.0 theo
[README bản chuyển đổi](https://github.com/duchoa1297/vietocr-onnx/tree/ocr-v1)
(RapidOCR mặc định 1.6). Giới hạn 1000 thành phần; vượt giới hạn thì báo lỗi,
không âm thầm bỏ phần còn lại.

Nhóm hàng trên box **trước unclip**: từng cặp thành viên phải chồng dọc ≥ 50%
chiều cao box thấp hơn, không so với box union đã nở. Trong từng hàng, sắp trái
sang phải và chỉ ghép mảnh có khoảng trống ngang ≤ k × chiều cao dòng (lấy chiều
cao thấp hơn của hai mảnh). `lineMerge.maxHorizontalGapRatio` cấu hình k, mặc định
2.5. Những mảnh quá xa vẫn thành các dòng riêng cùng hàng, theo trái sang phải;
các hàng theo trên xuống dưới. Vùng cắt dùng union của box đã unclip **sau** quyết định ghép.
Cắt thêm trên/dưới `max(2 px, ceil(15% chiều cao))`, trái/phải
2 pixel, chặn trong trang. Box kết quả dùng chính vùng cắt, đổi về hệ 0–1000.
Recognizer nhận RGB [0,1], cao 32; chiều rộng theo tỉ lệ, làm tròn lên bội 10,
chặn [32,512] đúng `vietocr.json`. Resize bilinear thay cho PIL LANCZOS trong ví dụ
upstream để giữ code thuần, không thêm dependency; cần đo sai khác khi có model.

Đây là DB xấp xỉ bằng chữ nhật, không phải contour xoay + polygon offset của
RapidOCR. Hạn chế: dòng cong/nghiêng/phối cảnh, hai dòng quá sát, nhiều cột và
bảng có thể bị gộp hoặc kéo theo hình đồ thị. Chưa nắn trang, xóa dòng vở, phát
hiện gạch xóa hay phân vùng. Không dùng truth/lời giải để chọn cách đọc.

## Giao thức model và độ tin cậy

Theo ví dụ chạy trong README release `ocr-v1`:

- Detector có một input/output; dùng tên thực từ metadata session.
- Encoder input `image`; hai output theo thứ tự `hidden`, `encoder_outputs`
  trong `enc.run(None, ...)`. Tên output lấy từ metadata.
- Decoder input `tgt` (int64 [1]), `hidden`, `encoder_outputs`; hai output theo
  thứ tự log-prob và hidden mới. Tên output lấy từ metadata.
- Bắt đầu SOS=1, dừng EOS=2, vocab offset=4, tối đa 128 bước. Không gặp EOS
  thì vẫn trả phần đã giải mã với `truncated: true`, `truncationReason: decode_limit`,
  `conf: 0` và tiếp tục dòng kế. Chọn special token khác EOS cũng giữ prefix,
  `truncated: true`, `truncationReason: invalid_output`, `conf: 0`.
  Lỗi session, thiếu/sai shape tensor, thiếu log-prob vẫn ném lỗi như trước;
  không biến lỗi ORT thành dòng truncated.

Greedy chọn argmax, hòa ưu tiên id nhỏ. Log-prob phải đúng kích thước vocab + offset,
không NaN/giá trị dương, tổng exp xấp xỉ 1; thiếu/sai thì `missing_log_probs`.
Không chuyển logits thành xác suất một cách phỏng đoán, không dùng conf mặc định.
`charConf = exp(logp)` của từng token chữ đã chọn; dòng hoàn chỉnh có `conf = min(charConf)`;
EOS không tham gia min. Dòng rỗng dùng xác suất EOS. `logProbs` giữ log-prob đã chọn
từng bước phát chữ; `charConf` tương ứng token trước chuẩn hóa NFC.
`text` và `alternatives` NFC. Tối đa hai alternatives (≤3): tại bước chữ có conf
thấp nhất, thay bằng token đứng thứ 2/3 nếu đó là chữ; bỏ special token và chuỗi trùng.
Không dùng xác suất detector làm xác suất chữ.

Hủy được trước/sau mỗi session run, giữa các bước giải mã và giữa các dòng;
không dừng được một lời gọi ORT đang chạy. Hủy không trả kết quả dở dang.
Tensor trung gian được dispose, session giữ cho lượt sau đến khi `close()`.
Usage mở rộng `ReadUsage`: `lineCount`, `detectionMs`, `recognitionMs`, tổng
`latencyMs`, `passes: 1`; không tính thời gian tạo session vào lượt đọc.

## Từ vựng thật

`tools/models/config/vietocr.json`: bản gốc 712 byte, SHA-256
`518345b7672fd36e534fb8ffcf6f6599c687793541259170834789fe2f7dd6e6`.
`missingVietnameseChars(config.vocab)` trả **[]**, đủ chữ Việt hoa/thường,
kể cả `đ/Đ` và các dấu. Chỉ chứng minh độ phủ từ vựng, chưa chứng minh nhận dạng.

`unsupportedSymbols(vocab)` trả **["→", "×", "∞", "≥", "≤", "≠"]** với cấu hình
thật. Bộ nhận dạng không thể phát đúng các ký hiệu này bằng vocab hiện tại;
cần model/từ vựng được huấn luyện tương ứng mới khắc phục được. Không sửa truth
hoặc tự thay bằng ký hiệu ASCII. Báo cáo C liệt kê tập thiếu và đếm riêng số dòng
truth có hiệu lực chứa ký hiệu thiếu (mỗi dòng một lần), cùng số dòng `truncated`.
CER/WER vẫn giữ mọi dòng để không làm đẹp kết quả.

Trọng số VietOCR gốc có `licenseStatus: weights-unverified`: chỉ đo;
chưa đưa vào sản phẩm cho đến khi người dùng xác minh với tác giả.
