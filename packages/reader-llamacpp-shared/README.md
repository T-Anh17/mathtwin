# Giao thức llama.cpp dùng chung — TS thuần

Lô 2.4 vòng 2 chuẩn bị phần dùng lại cho app Android của Lô 2.5. Package này **không có API Node, HTTP client,
quản lý tiến trình hay mã hóa PNG**. App cung cấp transport và data URL ảnh; adapter Node chỉ là công cụ phát triển.
Không tạo Termux hay app trong lô này.

API xuất tại `@mathtwin/reader-llamacpp-shared`:

- `completionRequest(model, mode, imageUrls, maxTokens?)`: dựng body; chỉ nhận ảnh data URL, không nhận URL mạng/file.
  B có mode `edges`, `neighbors`, `lines`; A có `spotting` và `ocr`.
- `parseCompletion(raw)`: kiểm output hoàn chỉnh, byte UTF-8, logprobs và `timings` nếu có.
- `graphResult(completion, threshold?, originalImages?)`, `lineResult(completion, originalWidth, originalHeight, threshold?)`:
  dựng drafts/dòng chữ, confidence, top-k, box. `plainLines` xử lý OCR thuần; `spottingLines` xử lý Paddle LOC.
- `LlamaCppReadError`, `LlamaFailureReason`: mã lỗi dùng chung; không chứa nội dung ảnh/đề/phản hồi.
- `resizeImage(image, maxLongEdge?)` ở **`@mathtwin/reader`**, để app và adapter cùng chính sách ảnh.

## Điểm tin cậy từng giá trị

`parseCompletion` giữ khoảng byte `[start,end)` và `exp(logprob)` của từng token đã sinh, cùng top-k.
Byte token phải nối lại đúng toàn bộ UTF-8 của `message.content`; hỗ trợ token bị cắt giữa chữ Việt hoặc emoji.
Không đủ byte/điểm, điểm không hữu hạn hoặc > 0 → `missing_probs`; không thay bằng 1.

Bộ quét JSON xác định khoảng byte **giá trị**, không lấy khóa, dấu phẩy, dấu ngoặc hay dấu nháy bao ngoài chuỗi.
Giá trị escape (`\u1ec1`, `\"`) giữ vị trí theo cách viết thô trong JSON; chuẩn hóa NFC sau khi lấy điểm.
Khóa trùng bị từ chối để không gắn điểm vào nhầm lần xuất hiện.

- Đỉnh: min điểm token phủ `label`.
- Cạnh: `uConf`, `vConf`, `wConf` lấy riêng từ token phủ từng giá trị. `conf` cho tồn tại cạnh là min của
  `uConf`, `vConf` và điểm `name` nếu tên khác null; không gồm trọng số. Điểm trường thấp tạo cờ đúng `.u`/`.v`/`.w`,
  kể cả khi chưa có ứng viên thay thế. `w: null` vẫn theo quy tắc `missing_weight`.
- Câu hỏi: min điểm phủ `rawText`, `format`, các giá trị task; mỗi option lấy riêng `text` và các giá trị `check`.
- Dòng B: chỉ token phủ `lines[i].text`; không tính tọa độ/region/cú pháp JSON.
- Dòng A OCR: chỉ byte của dòng đó, bỏ CR/LF. Spotting: chỉ văn bản, không tính marker/LOC.

Một token có thể chứa cả giá trị lẫn cú pháp; token đó vẫn đóng góp cho giá trị nó phủ vì chỉ có **một** xác suất token,
không bịa xác suất riêng cho từng byte. Token chỉ chứa cú pháp không đóng góp.
Giá trị chuỗi rỗng không có bằng chứng → conf 0. Đây chưa phải xác suất phần tử đúng đã hiệu chuẩn.

## Top-k và ứng viên

Ngưỡng mặc định **0,1**, cấu hình bằng `alternativesThreshold` trong adapter hoặc đối số `threshold` ở API thuần.
Với từng token phủ giá trị, thử **một** thay thế top-k/lần, không ghép tổ hợp, không dùng `solve`/`grade` để lọc.
Nếu token tràn sang cú pháp ngoài giá trị, phần ngoài đó phải giữ nguyên byte; nội dung thay thế phải còn UTF-8/JSON hợp lệ.

- `w`: giữ số hữu hạn **> 0**, khác số đã chọn, thêm vào `wAlternatives` và bỏ trùng.
- Nhãn: giữ chuỗi không rỗng vào `vertices[].alternatives`, `edges[].uAlternatives`/`vAlternatives`.
- Dòng: giữ nguyên dòng với một token đổi, không rỗng, vào `TextLine.alternatives`.
- Các cách đọc đo được không thay giá trị đang dùng. Reader đưa chúng vào `uncertain`; không chọn cách làm bài đúng hơn.
- Ứng viên đầu mút `.u`/`.v` chỉ được đưa vào cờ khi ánh xạ được về đỉnh hiện có của đồ thị;
  chuẩn hóa nhãn và bỏ trùng trước xác nhận. Nhãn không tồn tại không trở thành lựa chọn gây lỗi khi xác nhận.

## Grammar và logprobs trước grammar — bằng chứng đúng b12388

B gửi **`response_format: { type: "json_schema", schema }`**, không yêu cầu model tự giữ cú pháp bằng lời nhắc.
A giữ đầu ra OCR/Spotting nguyên bản, không ép JSON. Không bóc chữ giải thích hoặc nhiều JSON tùy tiện.
Output sai schema vẫn là `invalid_json`, output do hết token là `truncated`.

Request có `logprobs:true`, `top_logprobs:5`, **`post_sampling_probs:false`**, temperature 0, seed 0,
`cache_prompt:false`. Đã kiểm mã đúng tag/commit, không suy từ API bản khác:

1. [server-context.cpp L2071–2083](https://github.com/ggml-org/llama.cpp/blob/1c2adc75f619d05efc5d49ce08eaaa96272ebfa2/tools/server/server-context.cpp#L2071-L2083)
   tắt backend sampling khi cần logits trước sampling.
2. [server-context.cpp L2272–2330](https://github.com/ggml-org/llama.cpp/blob/1c2adc75f619d05efc5d49ce08eaaa96272ebfa2/tools/server/server-context.cpp#L2272-L2330)
   nhánh `post_sampling == false` gọi `get_token_probabilities(ctx_tgt, idx, n_probs_request)`;
   không đọc phân phối đã mask ở `common_sampler_get_candidates` như nhánh true.
3. [server-common.cpp L1733–1782](https://github.com/ggml-org/llama.cpp/blob/1c2adc75f619d05efc5d49ce08eaaa96272ebfa2/tools/server/server-common.cpp#L1733-L1782)
   đọc `llama_get_logits_ith`, softmax trên **toàn vocabulary** rồi mới chọn top-k để xuất;
   token đã sinh vẫn được tìm trong toàn phân phối. Vì vậy grammar có thể chọn token ngoài top-5 mà vẫn có điểm gốc.
4. [server-context.cpp L4900–4930](https://github.com/ggml-org/llama.cpp/blob/1c2adc75f619d05efc5d49ce08eaaa96272ebfa2/tools/server/server-context.cpp#L4900-L4930)
   sampler chọn token trước, nhưng `populate_token_probs` đọc lại logits của context qua nhánh trên,
   không dùng điểm sau ép grammar. [common/sampling.cpp](https://github.com/ggml-org/llama.cpp/blob/1c2adc75f619d05efc5d49ce08eaaa96272ebfa2/common/sampling.cpp)
   thao tác grammar trên bộ candidate của sampler.

## Box và ảnh

Qwen3-VL dùng **0–1000 tương đối**, được xác nhận trong [cookbook grounding chính thức](https://github.com/QwenLM/Qwen3-VL/blob/main/cookbooks/2d_grounding.ipynb).
Prompt ghi rõ hệ tọa độ đó. Đổi `x / 1000 * originalWidth`, `y / 1000 * originalHeight`;
đây cũng là phép đổi qua ảnh co rồi về ảnh gốc, giữ độ chính xác số thực.
Box không đủ 4 tọa độ, ngoài [0,1000], hoặc đảo/không có diện tích → **bỏ box, giữ dòng**.
Graph một ảnh đổi box đỉnh tương tự; nhiều ảnh bỏ box đỉnh vì interface chưa có số trang, không đoán ảnh tương ứng.

A mặc định **`Spotting:`** theo [card GGUF đúng revision](https://huggingface.co/PaddlePaddle/PaddleOCR-VL-1.5-GGUF/blob/cc977c16989848c264d813ec1705cb181b7a21ee/README.md).
Parser nhận `<|TEXT_START|>…<|TEXT_END|><|LOC_BEGIN|>…<|LOC_END|>` và dạng văn bản + 8 `<|LOC_n|>`.
Định dạng và phép chia 1000 dựa trên [post_process_for_spotting chính thức](https://github.com/PaddlePaddle/PaddleX/blob/4c968d30b9d0d4a693d9eaaef0881c20f8d7d0e0/paddlex/inference/pipelines/paddleocr_vl/uilts.py#L1111-L1184).
Box bao 4 đỉnh polygon; polygon ngoài phạm vi → bỏ box. Marker hỏng/mất văn bản → lỗi, không biến marker thành chữ.
Chế độ `paddleTextMode:'ocr'` dùng `OCR:`, tách xuống dòng và **không có box**.

Card A yêu cầu `clip.vision.image_max_pixels = 1605632` cho spotting.
Lô này chưa tải/chỉnh projector và không thay hash đã duyệt. Cấu hình projector/runtime đó phải được kiểm trong tích hợp Android
trước phép đo spotting thật; parser hiện kiểm bằng phản hồi giả. Không âm thầm sửa GGUF trong adapter.
Không tự upscale gấp đôi như ví dụ Paddle để giữ chung chính sách ảnh A/B đã yêu cầu; cần ghi khác biệt này khi đo thật.

Ảnh RGBA được co xác định bằng bilinear, cạnh dài tối đa **1536 px** mặc định, không phóng to, kích thước ngắn làm tròn gần nhất.
App/adapter phải áp dụng chính sách trước mã hóa ảnh. `usage.sentImages` ghi kích thước gốc/thực gửi, nên không giấu bước co ảnh.

## Kiểm tra và Quyết định & giả định

`npm test` kiểm trực tiếp các hàm khi `Buffer`, `process`, `require` và các global mạng không tồn tại,
kèm scan import và `tsconfig` có `types: []`. Chỉ dùng Zod đã được duyệt, không thêm dependency ngoài hệ hiện có.

Trường bổ sung tương thích ngược:

- `ReadUsage.serverTimings?: { promptMs, predictedMs, promptTokens, predictedTokens }`, lấy nguyên số từ
  `timings.{prompt_ms,predicted_ms,prompt_n,predicted_n}`. Thiếu không bịa 0; nhiều request/lượt chỉ cộng khi tất cả có số đo.
- `ReadUsage.sentImages?: { originalWidth, originalHeight, width, height }[]`, theo thứ tự ảnh/lượt thực gửi.
- `ReadDraft.vertices[].alternatives?`, `edges[].uAlternatives?` và `vAlternatives?` để giữ top-k nhãn/đầu mút và gắn cờ trong reader.
- `ReadDraft.edges[].wConf?`, `uConf?`, `vConf?` trong [0,1], tương thích drafts cũ chưa có điểm theo trường.
  Không đổi thuật toán reconcile hoặc định nghĩa `compareRead`: cờ `.w` chứa `[9]` mà truth là 7 vẫn có coverage `none`
  theo chỉ số hiện tại; thay đổi này sửa đúng mục cần hỏi, không tự tuyên bố ứng viên đúng đã có.
- `LlamaCppReadError.reason?`: `timeout`, `server_exit`, `truncated`, `invalid_json`, `missing_probs`, `http_error`, `aborted`.
  Nội dung lỗi là thông báo cố định tiếng Việt. Các lỗi IO/cấu hình ảnh khác vẫn `read_failed`, không giả mã mạng.

`latencyMs` là tổng trên bên gọi, tách với prompt/prediction trên server; `promptMs + predictedMs` không mặc nhiên
gồm thời gian nạp model, hàng đợi hoặc toàn bộ thời gian mã hóa vision của runtime. Không suy ra thời gian Wi-Fi bằng cách trừ đơn giản.
Chưa đo độ chính xác, tốc độ hay RAM thật. Lô 2.5 mới dựng app Android.
