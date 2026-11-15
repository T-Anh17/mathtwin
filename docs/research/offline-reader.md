# Khảo sát bộ đọc ảnh đề offline trên điện thoại — Lô 2.3

Ngày khảo sát: **2026-11-15**. Trạng thái: **đề xuất để review, chưa triển khai, chưa đo trên điện thoại**.

Đề xuất thử tối đa hai ứng viên: **B — OpenCV.js + Tesseract.js** trước, **A — SmolVLM-256M + OCR riêng cho chữ đề** sau. B ưu tiên ảnh in sạch; A kiểm tra liệu mô hình nhỏ có đọc được cấu trúc hình mà B khó xử lý. Chưa có bằng chứng ứng viên nào đạt ngưỡng để bật trong sản phẩm.

## 1. Phạm vi và cách đọc số liệu

- Theo quyết định người dùng trong [prompt giai đoạn 2](../prompts/02-doc-anh-de.md), xử lý trên thiết bị, miễn phí, không gọi cloud; mạng chỉ dùng để tải ứng dụng và tài nguyên lần đầu. Quyết định này thay hướng cloud tại mục 7/10 của [đặc tả](../spec.md); không sửa các tài liệu đó.
- Chỉ khảo sát bộ đọc **ảnh đề**, không đọc bài làm, giải hoặc chấm. Cả hai hướng phải trả `ReadDraft` vào pipeline `normalizeDraft`/`reconcile`/`validateSpec` hiện có.
- **Đã xác minh**: thông tin từ tài liệu, giấy phép, metadata kho chính thức và manifest gói theo phiên bản. Chỉ đọc tài liệu/metadata nhỏ; không tải trọng số, traineddata, WASM hay cài dependency trong lô này.
- **Ước tính**: RAM, kích thước bản OpenCV tự build và ngân sách tải toàn ứng viên. Đây là dự toán để duyệt thử, không phải benchmark hay cam kết dung lượng tối đa. MB = 1.000.000 byte; GiB = 2³⁰ byte. Kích thước file chưa nén được dùng để dự toán bảo thủ; số byte truyền thực tế còn phụ thuộc HTTP compression.
- Không suy từ dung lượng trọng số ra RAM, hoặc từ benchmark GPU máy tính ra tốc độ điện thoại. Chưa có số đo độ chính xác, p50/p90 hay RAM đỉnh của MathTwin cho hai ứng viên.

## 2. Ứng viên A — SmolVLM-256M-Instruct + Tesseract cho chữ đề

### Nguồn, giấy phép và cấu hình cụ thể

Mô hình của Hugging Face, 256 triệu tham số, kiến trúc Idefics3; model card ghi ngôn ngữ **English**, giấy phép **Apache-2.0**. Vì vậy không coi việc đọc tiếng Việt hoặc chữ viết tay là năng lực đã được xác nhận. Model card có lưu ý về đánh giá cá nhân trong giáo dục: thử nghiệm ở đây chỉ trích xuất đề; giải/chấm vẫn thuộc core. [Model card chính thức](https://huggingface.co/HuggingFaceTB/SmolVLM-256M-Instruct).

Chốt snapshot khảo sát `d039ab0d4b9311b617e8ffec1d06c8464364aeb3`. Chọn **decoder q4, embedding q8, vision encoder q8**, không gọi toàn bộ mô hình là “4-bit”. Các artifact ONNX đã có sẵn ở kho tác giả; không cần Python/PyTorch để chuyển đổi trong lần thử. Kích thước dưới đây lấy từ metadata của snapshot, không lấy kích thước toàn repo chứa nhiều biến thể. [Danh sách artifact theo revision](https://huggingface.co/api/models/HuggingFaceTB/SmolVLM-256M-Instruct/tree/d039ab0d4b9311b617e8ffec1d06c8464364aeb3/onnx?recursive=false).

| Tài nguyên A | Kích thước chưa nén đã xác minh |
| --- | ---: |
| `decoder_model_merged_q4.onnx` | 86.562.901 byte |
| `embed_tokens_quantized.onnx` | 28.385.824 byte |
| `vision_encoder_quantized.onnx` | 94.247.969 byte |
| **Ba trọng số thực sự dùng** | **209.196.694 byte ≈ 209,20 MB** |
| Các file JSON/TXT ở gốc: tokenizer, vocab/merges, cấu hình, template; dự phòng cả file trùng chức năng | 4.858.012 byte ≈ 4,86 MB |

Metadata các file phụ cũng được kiểm tra tại [gốc snapshot](https://huggingface.co/api/models/HuggingFaceTB/SmolVLM-256M-Instruct/tree/d039ab0d4b9311b617e8ffec1d06c8464364aeb3?recursive=false). Không tải `model.safetensors` hay biến thể FP16/FP32 cùng lúc.

Dependency đề xuất: `onnxruntime-web@1.22.0` (**MIT**) và `@huggingface/tokenizers@0.2.0` (**Apache-2.0**), cộng bộ OCR chung ở mục 4. Đây là phiên bản cố định cho thử nghiệm, không khẳng định là bản mới nhất. Tokenizers.js là tokenizer JS/TS, không phải runtime VLM. [Giấy phép ORT](https://github.com/microsoft/onnxruntime/blob/main/LICENSE), [Tokenizers.js](https://github.com/huggingface/tokenizers.js), [manifest tokenizers 0.2.0](https://registry.npmjs.org/@huggingface/tokenizers/0.2.0).

Đề xuất gọi trực tiếp các session ONNX, dùng ảnh RGBA đầu vào và tiền xử lý TS dùng chung Node/trình duyệt. Phải tự nối vision → embedding → decoder, quản lý KV cache, token đặc biệt, resize/normalize và vòng sinh token. Đây là **chi phí tích hợp đáng kể**, chưa phải adapter có sẵn. Transformers.js là nguồn tham khảo về Idefics3 và lượng tử hóa theo module; không đề xuất cài package này trong cấu hình A vì manifest 3.8.1 kéo cả `sharp` và `onnxruntime-node`, trong khi prompt chỉ cho `sharp` ở `tools/`. [Dtypes theo module](https://huggingface.co/docs/transformers.js/v3.8.1/guides/dtypes), [manifest Transformers.js](https://github.com/huggingface/transformers.js/blob/3.8.1/package.json).

### Khả năng và rủi ro

| Nội dung | Đánh giá khảo sát / giả thuyết cần thử |
| --- | --- |
| Hình in, nhãn, trọng số, tên cạnh | Có thể yêu cầu chép đỉnh/cạnh thành JSON; chưa có phép đo về độ đầy đủ hoặc đúng cấu trúc. JSON đúng schema vẫn có thể sai hình. |
| Tiếng Việt | Dùng Tesseract `vie` cho nguyên văn chữ đề, rồi parser xác định ánh xạ task/ý lựa chọn. Nếu parser không hiểu, không để VLM tự bổ sung yêu cầu. |
| Hình vẽ tay | Có thể linh hoạt hơn dò đường thẳng/circle, nhưng chưa có bằng chứng riêng cho khuyên, đa cạnh, nét giao nhau và nhãn viết tay. Chữ viết tay vẫn là rủi ro của OCR. |
| Bảng/ma trận/lời văn | Chưa chứng minh; tách kết quả theo representation. Không suy năng lực đọc hình thành năng lực đọc bảng hoặc suy quan hệ từ lời văn. |
| Dung lượng | Khoảng **270,3 MB** cộng mã adapter; dự trù **280 MB** gồm OCR và cả backend GPU/CPU, xem mục 4. |
| RAM đỉnh | **Ước tính 0,8–1,8 GiB** tổng CPU/GPU với một ảnh, ngữ cảnh hữu hạn, hai lượt tuần tự; ảnh nhiều crop/trang có thể vượt khoảng này. |
| Rủi ro chính | Sai thầm lặng, bỏ cạnh/khuyên, sinh thêm cạnh, gán nhầm trọng số; q4/q8 làm giảm chất lượng; operator không chạy trên GPU; token JSON dài khiến vượt 15 giây. |

Ước tính RAM A gồm 0,21 GB trọng số trên đĩa, bản sao khi load CPU/GPU, tensor trung gian của vision, KV cache, tokenizer và OCR. Ví dụ cache FP32 ở 2.048 token: `2 × 30 lớp × 3 KV head × 64 × 2.048 × 4 byte ≈ 94,4 MB`; đây chỉ là cache, chưa tính các phần khác. Tham số lấy từ [config snapshot](https://huggingface.co/HuggingFaceTB/SmolVLM-256M-Instruct/blob/d039ab0d4b9311b617e8ffec1d06c8464364aeb3/config.json). Chạy một trang/lượt để tránh giữ nhiều activation. Giới hạn token phải tính cả prompt, token ảnh và đầu ra; chạm giới hạn/truncated JSON thì báo lỗi đọc, không trả một đồ thị thiếu như đã đọc xong.

### Hai lượt đọc và `conf`

- `edges`: yêu cầu liệt kê từng cạnh nhìn thấy. `neighbors`: ngữ cảnh sinh mới, đi từng đỉnh liệt kê các cạnh kề; không đưa kết quả lượt trước vào prompt. Với khuyên/đa cạnh, phải giữ từng cạnh riêng và quy tắc ghép hai nửa cạnh không làm mất multiplicity.
- Hai prompt trên cùng trọng số **không bảo đảm độc lập thống kê**. Nếu không thực hiện được hai cách đọc khác nhau, ghi rõ trong báo cáo thử và dùng hai mức crop/contrast khác nhau; không chạy lại cùng đầu ra rồi gọi đó là kiểm tra chéo.
- Đề xuất đo `conf` từ logits decoder: xác suất softmax của token được chọn **trước khi ép cú pháp**, lấy giá trị nhỏ nhất trên token nội dung của nhãn/đầu mút/trọng số. Gộp với OCR bằng `min`; không dùng chuỗi “tự đánh giá độ chắc chắn” do model viết. Đây là điểm đo, chưa phải xác suất đúng đã hiệu chuẩn.
- Lưu top-k token/giá trị thay thế chỉ khi giải mã được thành cách đọc hợp lệ; không tự bịa số thay thế. Không lấy được điểm đo hoặc không ánh xạ được token về trường → chặn vùng/bài, không điền `conf: 1`. Hai lượt đồng ý vẫn có thể cùng sai; phải đếm lỗi đó khi đánh giá.

## 3. Ứng viên B — OpenCV.js + Tesseract.js, xử lý ảnh cổ điển

### Nguồn và pipeline đề xuất

OpenCV **4.13.0**, giấy phép **Apache-2.0** (áp dụng từ 4.5.0). Dùng bản build WASM từ mã nguồn chính thức, tag 4.13.0 / commit `fe38fc608f6acb8b68953438a62305d8318f4fcd`, chỉ cần `core`/`imgproc`; không thêm wrapper npm không rõ nguồn. Có hướng dẫn build OpenCV.js bằng Emscripten và tách WASM khỏi JS. Công cụ build chỉ ở máy phát triển. [Giấy phép](https://opencv.org/license/), [hướng dẫn build](https://docs.opencv.org/4.13.0/d4/da1/tutorial_js_setup.html), [tag nguồn](https://github.com/opencv/opencv/tree/4.13.0).

Đây là thiết kế cần kiểm nghiệm, không phải chức năng “đọc đồ thị” có sẵn của OpenCV:

1. Chuẩn hóa sáng, nhị phân hóa, deskew; giữ tọa độ để ánh xạ box về ảnh gốc. Tách vùng chữ và vùng hình, không xóa chữ nhãn/trọng số trước khi OCR.
2. Dò đỉnh bằng thành phần liên thông/contour, hình tròn hoặc chấm đặc. Dò đoạn cạnh bằng Canny/HoughLinesP; dùng contour và lần theo nét cho cạnh cong, khuyên. API `HoughCircles`/`HoughLinesP` có trong tài liệu JS; chúng chỉ trả hình học, không tự nhận biết đầu mút cạnh của đồ thị. [Circle](https://docs.opencv.org/4.13.0/d3/de5/tutorial_js_houghcircles.html), [line](https://docs.opencv.org/4.13.0/d3/de6/tutorial_js_houghlines.html).
3. Theo vết từ biên đỉnh đến đỉnh khác; một khuyên phải trở lại chính đỉnh đó. Đa cạnh giữ từng nét riêng. Không mặc định chỗ hai nét cắt nhau là đỉnh, hoặc nhập hai cạnh gần nhau thành một. Không giải quyết được giao cắt/đầu mút → báo vùng không đọc được.
4. OCR crop nhãn đỉnh/tên cạnh/chữ số; ghép trọng số theo khoảng cách tới đường cạnh và độ tách biệt giữa các ứng viên. Giữ `a`, `b`, `m` như tên cạnh. Ký tự số có thể là trọng số hoặc nhãn; không quyết định chỉ bằng whitelist.
5. OCR riêng chữ đề bằng `vie`; parser xác định dựng `TaskDraft`/`StatementCheckDraft`. Bảng/ma trận cần xác định hàng/cột và ý nghĩa ô, không được xử lý lưới bảng như cạnh đồ thị. Chưa nhận diện được layout thì báo lỗi, chưa hỗ trợ thì không ép về hình.

Tesseract.js chạy được trong browser và Node, giấy phép **Apache-2.0**; dùng `tesseract.js@6.0.1` + pin `tesseract.js-core@6.0.0`. Model `tessdata_fast` dùng số nguyên, có `vie` (tiếng Việt) và `eng` (nhãn Latin/chữ số), cùng giấy phép **Apache-2.0**, dùng engine LSTM/OEM 1. Đây là model OCR, không có bước suy luận đáp án. [Tesseract.js](https://github.com/naptha/tesseract.js), [model và giấy phép](https://github.com/tesseract-ocr/tessdata_fast), [ngôn ngữ/OEM](https://github.com/tesseract-ocr/tessdoc/blob/main/Data-Files.md).

### Khả năng và rủi ro

| Nội dung | Đánh giá khảo sát / giả thuyết cần thử |
| --- | --- |
| Hình in sạch | Hướng ưu tiên: đỉnh/nhãn tách biệt, tương phản rõ, cạnh không dính chữ. Khuyên và đa cạnh vẫn cần xử lý riêng. |
| Tiếng Việt | Có traineddata `vie`; khả năng OCR không đồng nghĩa hiểu câu hỏi. Mất dấu, đơn vị, xuống dòng và bốn ý đúng/sai có thể làm parser sai. |
| Hình vẽ tay | Dò nét cong có thể xử lý hình đơn giản; vòng tròn hở, cạnh đứt/dính và chữ viết tay khó. Tesseract chính thức định hướng chữ in, cảnh báo chất lượng chữ viết tay thấp. [FAQ của Tesseract](https://tesseract-ocr.github.io/tessdoc/FAQ.html#can-i-use-tesseract-for-handwriting-recognition). |
| Dung lượng | Phần OCR **22,23 MB** xác minh bằng manifest; dự trù OpenCV **20 MB** và mã adapter, tổng ngân sách **45 MB**. |
| RAM đỉnh | **Ước tính 0,2–0,6 GiB** cho một ảnh xử lý tối đa khoảng 1.600 × 1.600, một OCR worker, hai lượt tuần tự. Ảnh lớn hơn có thể vượt mức này. |
| Rủi ro chính | Nhầm chữ O/0 với đỉnh; nhầm nét đôi thành đa cạnh; xóa trọng số khi bỏ nhiễu; nhầm khuyên với chữ; nối sai tại giao cắt; dấu tiếng Việt mất sau threshold. |

RAM B dự toán từ ảnh RGBA khoảng 10,24 MB ở 1.600², nhiều mask/buffer/contour, hai heap WASM cho CV và OCR, traineddata và bản sao qua worker. Phải giải phóng `cv.Mat`, tái dùng một OCR worker; không giữ toàn bộ ảnh nhiều trang cùng lúc. Giảm độ phân giải có thể mất chữ nhỏ, nên phải đo chất lượng cùng chi phí bộ nhớ; không coi resize là giải pháp luôn đúng.

### Hai lượt đọc và `conf`

- `edges`: dò toàn bộ nét/đoạn rồi nối đầu mút. `neighbors`: lần theo nét từ từng đỉnh trên mask thứ hai (ví dụ adaptive threshold so với threshold toàn cục). Hai lượt chạy lại nhận diện từ ảnh, không dùng lại danh sách cạnh lượt đầu. Cả hai cùng dựa trên CV/OCR nên lỗi vẫn tương quan.
- Đề xuất điểm hình học có thể đo: độ tròn/đặc của vùng đỉnh, tỉ lệ pixel nét liên tục dọc đường cạnh, độ gần đầu mút tới biên đỉnh, độ tách biệt phương án ghép chữ với cạnh. Chuẩn hóa mỗi điểm về [0,1]; ghi công thức/tham số cố định trong báo cáo thử, không coi nhị phân “tìm thấy” là chắc chắn 1.
- Điểm OCR lấy word/symbol confidence chia 100, clamp [0,1]; lấy `min` trên các ký tự cấu thành nhãn/trọng số, rồi `min` với điểm hình học. Bật đầu ra chi tiết cần thiết thay vì chỉ lấy text; API hỗ trợ cấu hình nhận dạng. [API v6.0.1](https://github.com/naptha/tesseract.js/blob/v6.0.1/docs/api.md).
- Không đọc được ký tự → `w: null` hoặc vùng không đọc được, không đổi O thành 0 hay 7 thành 1 bằng mẹo tính toán. Đường nối/khuyên bị che mà không có cách chọn đáng tin cậy phải chặn bài. Ngưỡng 0,85 của reader là điểm khởi đầu; điểm CV/OCR chưa hiệu chuẩn phải kiểm tra trên tập ảnh có nhãn.

## 4. Dependency và ngân sách tải để duyệt

### Bộ OCR dùng chung

Snapshot `tessdata_fast`: `87416418657359cb625c412a48b6e1d6d41c29bd`. Dùng file **chưa gzip** và cấu hình `gzip: false` để có con số tải tái lập; sau này muốn nén phải đo lại. Dữ liệu được tải về để tự phục vụ, không gọi API OCR. [Metadata `vie`](https://api.github.com/repos/tesseract-ocr/tessdata_fast/contents/vie.traineddata?ref=87416418657359cb625c412a48b6e1d6d41c29bd), [metadata `eng`](https://api.github.com/repos/tesseract-ocr/tessdata_fast/contents/eng.traineddata?ref=87416418657359cb625c412a48b6e1d6d41c29bd).

| File / nhóm OCR | Byte chưa nén |
| --- | ---: |
| `vie.traineddata` | 531.275 |
| `eng.traineddata` | 4.113.088 |
| `tesseract.esm.min.js` + `worker.min.js`, 6.0.1 | 174.382 |
| Bốn `tesseract-core*.wasm.js`, 6.0.0 (SIMD/non-SIMD, LSTM/legacy) | 17.410.748 |
| **Tổng dự trữ OCR cho mỗi ứng viên** | **22.229.493 ≈ 22,23 MB** |

Kích thước JS/core lấy từ [manifest phát hành Tesseract.js](https://unpkg.com/tesseract.js@6.0.1/dist/?meta) và [core](https://unpkg.com/tesseract.js-core@6.0.0/?meta), đối chiếu [manifest npm chính thức](https://registry.npmjs.org/tesseract.js/6.0.1). Dự trữ bốn core để offline khi loader chọn biến thể; không load bốn core vào RAM cùng lúc. Bản `.wasm.js` chứa WASM nhúng nên **không cộng thêm** các `.wasm` rời vào cấu hình này. OEM 1 không cần model legacy hoặc `osd`; không thêm chúng vào bộ tải.

### Tổng từng ứng viên

| Ứng viên | Dependency trực tiếp đề xuất, chỉ sau duyệt | Payload đã xác minh + ước tính | Ngân sách tải lần đầu để cân nhắc |
| --- | --- | --- | ---: |
| **B, ưu tiên** | `tesseract.js@6.0.1`, pin/override `tesseract.js-core@6.0.0`; asset OpenCV.js 4.13.0 build chính thức; `vie` + `eng` | OCR 22,23 MB + **ước tính** OpenCV JS/WASM 20 MB + mã adapter | **≈ 45 MB** |
| **A, thử thứ hai** | `onnxruntime-web@1.22.0`, `@huggingface/tokenizers@0.2.0`; cùng dependency/model OCR; ba ONNX và file phụ đã liệt kê | Model/phụ 214,05 MB + runtime/JS/tokenizer khoảng 34,01 MB + OCR 22,23 MB + mã adapter | **≈ 280 MB** |

Runtime A dự trữ cả CPU WASM `ort-wasm-simd-threaded.wasm` (11.210.254 byte) và GPU JSEP WASM (21.872.216 byte), hai loader `.mjs`, JS `ort.all.min.js` và tokenizer minified 36.601 byte. Đây là hai backend của cùng ứng viên, dùng tuần tự; không tải mọi biến thể trong npm package. Nguồn: [manifest ORT 1.22.0](https://unpkg.com/onnxruntime-web@1.22.0/dist/?meta), [manifest tokenizer](https://unpkg.com/@huggingface/tokenizers@0.2.0/dist/?meta), [manifest npm ORT](https://registry.npmjs.org/onnxruntime-web/1.22.0).

**OpenCV 20 MB là khoản dự trù, chưa phải kích thước artifact được xác minh.** HEAD tới bản dựng trên docs.opencv.org bị HTTP 403 trong phiên khảo sát. Bản build phụ thuộc toolchain/module/SIMD; không suy kích thước từ source archive. Sau duyệt cần build/freeze artifact và lập manifest byte/hash trước lệnh tải cho người dùng. Nếu khác ngân sách đã duyệt, trình lại tổng thực tế trước khi tải lớn. Toolchain Emscripten/CMake/Python trên máy phát triển không nằm trong payload điện thoại; lô này chưa tải chúng.

Nếu duyệt cả A và B, chia sẻ bộ OCR và cache tài nguyên: dự trù **khoảng 305 MB** tổng cho hai ứng viên, gồm khoản dự phòng; không cộng lặp OCR. Đây không phải lượng tải ở mọi lần đọc. Chỉ giữ một engine chạy mỗi lúc; không cộng RAM hai ứng viên như thể phải chạy đồng thời.

Apache-2.0 và MIT cho phép sử dụng thương mại với điều kiện của từng giấy phép. Khi đóng gói phải giữ LICENSE/NOTICE tương ứng cho code/model; pin cả dependency bắc cầu và lưu danh sách giấy phép trước phát hành. Không đề xuất model chỉ cho nghiên cứu hoặc dịch vụ có phí. Các số payload trên là tài nguyên gửi điện thoại, không phải dung lượng `node_modules` ở máy phát triển.

## 5. Android Chrome / iOS Safari và cách chạy offline

| Nền tảng | A — VLM + OCR | B — CV + OCR |
| --- | --- | --- |
| Android Chrome | Ưu tiên WebGPU nếu adapter, giới hạn bộ nhớ và operator đáp ứng; WASM một luồng là phương án thử khi GPU không chạy. Không bảo đảm máy tầm trung đạt thời gian. | WASM + Web Worker, không cần WebGPU; kiểm tra SIMD rồi chọn core phù hợp, có bản không SIMD. |
| iOS Safari | Safari 26 có WebGPU ở tầng trình duyệt, nhưng **chưa xác minh ORT 1.22.0 + các ONNX đã chọn hoạt động**. Coi WASM là cấu hình dự phòng cần đo, WebGPU là phép thử tương thích riêng; không hứa hỗ trợ model chỉ từ việc có `navigator.gpu`. | WASM + worker là hướng dự kiến; phải đo memory pressure và chọn core không SIMD nếu cần. Không suy khả năng chạy JS thành đủ RAM/đủ tốc độ. |
| Node ≥ 22.12 | Dùng cùng tiền xử lý/tensor/decoder, ORT Web backend WASM một luồng, không yêu cầu WebGPU Node hay runtime native. | Dùng cùng build CV, OCR và parser; truyền pixel vào WASM thay vì dựa vào DOM/camera. |

Chrome công bố WebGPU từ Chrome 121 trên Android 12+ với GPU Qualcomm/ARM hỗ trợ; đây không phải bảo đảm mọi điện thoại Android. WebKit công bố WebGPU trong Safari 26. Tài liệu ORT đang có bảng Safari WebGPU chưa hỗ trợ; phải phân biệt **browser có API** với **runtime đã xác nhận hỗ trợ**, và kiểm tra trên máy thật. [Chrome](https://developer.chrome.com/blog/new-in-webgpu-121), [Safari 26](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/), [bảng backend ORT](https://onnxruntime.ai/docs/get-started/with-javascript/web.html).

Kế hoạch offline sau khi được duyệt:

- Tự phục vụ JS, worker, WASM, ONNX, tokenizer và traineddata theo manifest revision/hash cố định; cache tài nguyên ứng dụng/model, không cache ảnh người dùng. Tesseract mặc định có thể lấy core/ngôn ngữ từ CDN, nên phải đặt `workerPath`/`corePath`/`langPath` cục bộ. [Cài Tesseract cục bộ](https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md).
- Với ORT đặt đường dẫn WASM tới tài nguyên cục bộ, dùng JS/WASM cùng phiên bản; không bật CDN fallback. Tài nguyên chưa cache đủ hoặc bị trình duyệt dọn cache → báo cần chuẩn bị lại khi có mạng, không âm thầm gửi ảnh đi. [Triển khai ORT](https://onnxruntime.ai/docs/tutorials/web/deploy.html).
- Dùng một luồng làm baseline để không bắt buộc SharedArrayBuffer/COOP/COEP. WebGPU cần secure context; trang bench qua IP LAN HTTP không đủ cho phép thử GPU: cần HTTPS được điện thoại tin cậy hoặc localhost qua cơ chế chuyển cổng phù hợp. CPU fallback phải được ghi riêng trong báo cáo. [Yêu cầu WebGPU của ORT](https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html).
- CLI chuẩn bị model chỉ chạy sau duyệt và phải in tổng byte rồi yêu cầu cờ `--confirm`; không có cờ thì không tải. Phiên bản/browser, cache đủ/chưa đủ, backend thật và lỗi load đều phải quan sát được. `npm test` không tải tài nguyên hay gọi mạng; log không chứa ảnh/nội dung đề. Kiểm thử airplane mode sau lần tải đầu và sau khi mở lại trang.

## 6. Từ kết quả đọc tới pipeline MathTwin

Đây là các ràng buộc cho cả hai thử nghiệm, không thêm API mới trong Lô 2.3:

- Chỉ chép dữ liệu nhìn thấy. Thiếu trọng số → `w: null`, `missing_weight` blocking với task cần trọng số; thiếu chữ đề → `question: null`, `missing_question`. Parser không ánh xạ được ý trắc nghiệm/đúng-sai → `check: null`, `unmapped_option` blocking. Không suy đáp án để chọn cách đọc.
- Không dùng ràng buộc toán học để tự “sửa” cạnh/nhãn. Đếm phần tử thực sự đọc được để đối chiếu `statedFacts` là việc của code xác định. Đọc thấy mũi tên, trên 20 đỉnh, trọng số không dương hoặc task ngoài phạm vi phải phát issue đúng quy tắc; không ép về đề hỗ trợ.
- `reconcile` dùng multiset cạnh, bảo toàn khuyên/đa cạnh/tên cạnh. Điểm thấp, cách đọc khác hoặc bất đồng phải đi vào `uncertain` đúng mã item/candidates. Mọi `spec` khác null phải qua `validateSpec`; vượt timeout, hủy, thiếu trang hoặc output hỏng thì chặn bằng issue phù hợp.
- Với A, chữ trong ảnh là dữ liệu, không phải lệnh; yêu cầu schema không có trường đáp án, bậc, độ dài hay kết luận Euler/Hamilton. Văn bản chỉ dẫn độc hại được giữ như nguyên văn nếu cần, không thay chỉ dẫn hệ thống.
- Điểm tin cậy cao và hai lượt khớp không bảo đảm không sai. Đánh giá phải bắt cả lỗi chung hai lượt, đặc biệt cạnh bị bỏ hoàn toàn vốn không có mục nào để gắn cờ. Không hứa rằng cờ từ logits/hình học tự động đạt 100% bao phủ lỗi.

## 7. Phép thử đề xuất sau duyệt và điều kiện quyết định

1. Thử **B trước** trên bộ tổng hợp hiện có, gồm khuyên, đa cạnh, tên cạnh, chữ tiếng Việt và biến thể nhiễu. Với A, trước tiên kiểm tra load cả ba session và một lần sinh ngắn trên Node/Android/iOS; lỗi operator hoặc không đủ RAM phải ghi nhận, không tự chuyển sang cloud hay tải thêm model.
2. Mỗi ứng viên một `VisionReader`, đo `passes: 1` và `passes: 2`, gộp đầy đủ thời gian OCR, tiền xử lý, sinh token, reconcile. Giới hạn ảnh/ngữ cảnh, backend và phiên bản phải ghi trong báo cáo. Không chỉ đo phần GPU kernel hoặc một crop thuận lợi.
3. Khi có **≥ 30 ảnh đề thật** được người dùng cung cấp và gán nhãn, tách ảnh in/vẽ tay/nghiêng/mờ và representation; không gọi nét giả vẽ tay trong bộ tổng hợp là ảnh viết tay thật. Dùng cùng `compareRead`/CLI đánh giá của Lô 2.2.
4. Đo điện thoại Android tầm trung và iPhone người dùng cung cấp: ghi model máy, OS/browser, backend, tải/cache, cold start và warm run; p50/p90 mỗi đề, tổng byte và RAM đỉnh nếu đo được. Nếu browser không cho đo RAM thì ghi “không đo được”, không thay bằng heap JS hoặc số RAM quảng cáo của máy. Node chỉ tham khảo.
5. Báo cáo đọc đúng hoàn toàn, đúng phần đồ thị, bài sai được gắn cờ đủ, cờ thừa, lỗi theo loại; liệt kê từng bài sai thầm lặng và bài bị chặn. Không bỏ failure/timeout khỏi mẫu số. Tập hiệu chỉnh điểm tin cậy phải tách khỏi tập đánh giá, giữ nguyên ngưỡng nghiệm thu.
6. Chỉ đề xuất bật cho nhóm ảnh đạt **đọc đúng hoàn toàn ≥ 90%, không có bài sai thầm lặng và độ trễ ≤ 15 giây trên điện thoại tầm trung**. Báo cáo cả p50/p90; không coi p50 đạt là mọi đề đạt. Không đủ dữ liệu hoặc không đạt → đề xuất nhập tay ở giai đoạn 4; bước xác nhận đề luôn tồn tại.

## 8. Quyết định & giả định

- Chọn đúng **hai cấu hình để cân nhắc thử**: B khoảng 45 MB và A khoảng 280 MB; tổng chia sẻ khoảng 305 MB. Ưu tiên B do ít tài nguyên và có OCR tiếng Việt; A là thử nghiệm rủi ro hơn, không mặc định cần bật cả hai.
- OCR chung đọc chữ đề; parser xác định ánh xạ task/ý lựa chọn theo những gì có trong ảnh. Chưa hiểu thì chặn/xác nhận, không để VLM suy yêu cầu. Khả năng đọc hình viết tay/ma trận chưa được xác nhận cho cấu hình nào.
- Dùng ORT trực tiếp để giữ `sharp` trong `tools/`; chấp nhận phải viết tiền xử lý/vòng decoder trong Lô 2.4 nếu A được duyệt. Nếu không khả thi, báo kết quả thất bại trước khi đề xuất dependency/model khác.
- Dung lượng OpenCV và RAM hai ứng viên là ước tính đã nêu cơ sở, cần đo; số byte model/OCR/runtime còn lại có manifest liên kết. Không công bố benchmark tưởng tượng hoặc kết luận đạt nghiệm thu.
- **Kết thúc Lô 2.3 tại báo cáo này. Chờ người dùng duyệt ứng viên và dependency trước khi cài thư viện, build/tải tài nguyên lớn hay làm Lô 2.4.**
