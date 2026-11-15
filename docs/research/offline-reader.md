# Đọc offline ảnh chụp bài viết tay — Lô 2.3 làm lại

Ngày khảo sát: **2026-11-15**. **Chưa chọn engine/nền tảng, chưa tải model, chưa cài dependency, chưa benchmark MathTwin trên điện thoại.**

**Viết tay là tiêu chí số 1:** chữ Việt có dấu, số, nhãn đỉnh, đồ thị vẽ tay, bảng kẻ tay, gạch xóa trên ảnh chụp vở. Luồng chính là **chụp → đọc → xác nhận nhanh vùng chưa chắc → chấm → nếu sai, giải thích như gia sư**, hoàn toàn trên máy. Nhập lại toàn bài là đường cuối. Theo quyết định 15/11 trong [prompt giai đoạn 2](../prompts/02-doc-anh-de.md), báo cáo này thay đề xuất ưu tiên hình in của vòng trước và hướng cloud trong [đặc tả](../spec.md); không sửa tài liệu nguồn.

**Kết luận:** chưa có bằng chứng đủ để nói một cấu hình offline nhiều khả năng đồng thời đạt đọc đúng toàn đề ≥ 90%, không sai thầm lặng và ≤ 15 giây trên ảnh viết tay Việt ở điện thoại tầm trung. Đề nghị cân nhắc **hai phép thử**, nếu người dùng chọn: **A — PaddleOCR-VL-1.5 theo dòng/vùng** và **B — Qwen3-VL-2B-Instruct cho cả chữ/hình**, theo hướng **Capacitor + runtime native**. OpenCV + Tesseract chỉ là **mốc hình in**, không là bộ đọc viết tay chính.

## Cách phân biệt thông tin

- **Đã xác minh từ nguồn:** tài liệu/model card/giấy phép của tác giả và metadata file. Không đọc binary trọng số. License được kiểm cho **kho phát hành chứa đúng file**, không suy từ license thư viện chạy model. Một mirror khác không tự có cùng quyền.
- **Chưa có bằng chứng:** chưa tìm được số đo đúng model/ngôn ngữ/nhóm ảnh trong nguồn đã đọc; không có nghĩa năng lực bằng không. Không dùng số của model lớn cho bản nhỏ, ảnh in cho viết tay, hoặc tiếng Anh cho tiếng Việt.
- **Ước tính của MathTwin:** RAM, độ trễ chưa đo, thời gian tích hợp/huấn luyện và dự phòng app. Ghi giả định và phép tính; không gán các con số đó cho nhà phát hành. Không thể xác minh tổng binary chưa build bằng số đo giả.
- Byte là metadata chưa nén; GB = 10⁹ byte, GiB = 2³⁰ byte. CER/WER là lỗi ký tự/từ; accuracy dòng, spotting và đúng toàn đề khác nhau. Không đổi `1 − CER` thành tỉ lệ đề đúng.

## 1. Các hướng khảo sát và bằng chứng viết tay

### 1.1 VLM/OCR thế hệ mới

| Model cụ thể | Bằng chứng viết tay và tiếng Việt | Top-k/conf; kết luận cho ảnh viết tay Việt |
| --- | --- | --- |
| **PaddleOCR-VL-1.5, 0.9B** | Benchmark spotting **nội bộ**, Table 4: Handwrite_ch **0,8952**, Handwrite_en **0,9163**, tác giả gọi là accuracy. Không phải CER/WER hoặc điểm cả đề. Appendix C liệt kê **Vietnamese**; **chưa có bằng chứng điểm viết tay Việt**. | Decoder có logits nếu instrument runtime; text/box trả ra không mặc nhiên có xác suất. Chọn để cân nhắc thử A vì có số đo viết tay và spotting, chưa hứa đạt Việt. [Paper, Table 4/Appendix C](https://arxiv.org/html/2601.21957v1). |
| **PaddleOCR-VL-1.6, 0.9B** | Có báo cáo nâng cấp; **chưa xác minh điểm CER/WER/accuracy viết tay Việt** trong khảo sát. Không coi điểm document tổng thể là HTR Việt. | Cùng yêu cầu instrument logits. Không thêm ứng viên thứ ba; chọn 1.5 cho phép thử có bảng viết tay truy nguyên, không gọi 1.5 là bản mới nhất. [Card](https://huggingface.co/PaddlePaddle/PaddleOCR-VL-1.6), [paper](https://arxiv.org/abs/2606.03264). |
| **Qwen3-VL-2B/4B-Instruct** | Có OCR/document benchmark, tuyên bố multilingual. **Chưa có bằng chứng CER/WER/accuracy tách viết tay Việt cho đúng bản 2B/4B** trong nguồn đã đọc. Không mượn số của 235B. | Có thể giữ logits/token alternatives; grounding có thể đề xuất box nhưng cần kiểm. Chọn 2B để cân nhắc thử B vì cùng engine có thể đọc chữ, bảng và hình. 4B chưa có bằng chứng riêng đủ bù chi phí. [Card 2B](https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct), [4B](https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct), [report](https://arxiv.org/html/2511.21631v1). |
| **Qwen2-VL-2B-Instruct** | Card **nêu Vietnamese trong chữ ở ảnh**; **chưa có bằng chứng số đo viết tay Việt riêng**. Không suy năng lực đời trước thành kết quả Qwen3. | Có logits/beam nếu giữ decoder. Không ưu tiên thay Qwen3 cho phép thử đầu. [Card tác giả](https://huggingface.co/Qwen/Qwen2-VL-2B-Instruct). |
| **Florence-2-large, 0.77B** | Có `<OCR_WITH_REGION>` với quad box; **chưa có bằng chứng viết tay Việt/có dấu**. Điểm caption/detection không phải HTR. | Có decoder logits nếu giữ tensor; nhỏ không đồng nghĩa HTR tốt. Không chọn. [Card large](https://huggingface.co/microsoft/Florence-2-large), [bảng tham số family](https://huggingface.co/microsoft/Florence-2-base). |
| **InternVL3-1B** | Card multilingual; **chưa có bằng chứng CER/WER viết tay Việt cho bản 1B**. | Có thể lấy logits decoder; box sinh ra chưa phải detector hiệu chuẩn. Chưa đủ căn cứ ưu tiên. [Card đúng bản 1B](https://huggingface.co/OpenGVLab/InternVL3-1B). |
| **Gemma 3n E2B-it** | **Chưa có bằng chứng viết tay Việt** trong model card đã đọc. “E2B” là tham số hoạt động hiệu dụng, không phải tổng file chỉ nặng như model 2B. | Có logits tùy runtime, có hướng LiteRT/mobile; chưa chọn do bằng chứng HTR và điều khoản riêng. [Model card](https://ai.google.dev/gemma/docs/gemma-3n/model_card), [weight](https://huggingface.co/google/gemma-3n-E2B-it). |

Spotting Anh/Trung của Paddle không chứng minh khả năng chép chữ Việt có dấu. Quantization/GGUF/backend khác bản đánh giá phải đo lại. VLM tổng quát có thể “sửa” phép tính học sinh thay vì chép; cần test bài cố ý sai, không chỉ prompt cấm giải.

### 1.2 Tách dòng → HTR xuất ONNX

| Cấu hình | Bằng chứng và khả năng lấy confidence | Đánh giá |
| --- | --- | --- |
| **PP-OCRv5_mobile_det → VietOCR vgg_seq2seq / vgg_transformer** | Tác giả báo precision **full sequence 0,8701 / 0,8800**, thời gian **12 / 86 ms trên GTX 1080 Ti**, trên tập hỗn hợp in/viết tay/tổng hợp; **không có điểm tách viết tay Việt** trong bảng. Có ví dụ chữ Việt có dấu. Attention decoder có phân phối token/beam nếu giữ trước argmax. | Hướng tài nguyên thấp đáng khảo sát, nhưng **chưa xác minh giấy phép riêng hai file `.pth` host ngoài repo**, nên không đề xuất tải. ONNX cần xuất CNN/encoder/decoder và vòng decode, chưa có artifact đã kiểm trong dự án. [README](https://github.com/pbcquoc/vietocr), [config weight](https://github.com/pbcquoc/vietocr/blob/master/config/vgg-transformer.yml). |
| **PP-OCRv5_mobile_det → TrOCR-base-handwritten** | Base **334M**, **CER có phân biệt hoa/thường 3,42% trên IAM**; Small 62M đạt 4,22%. Đây là tiếng Anh theo dòng, **chưa có bằng chứng viết tay Việt** cho weight này. Decoder có token logits/beam, box từ detector. | Base weight MIT có thể cân nhắc fine-tune trên dữ liệu Việt đủ quyền; chưa chọn dùng ngay. Không suy MIT từ Base sang Small khi card Small không khai license. [Bảng chính thức](https://github.com/microsoft/unilm/blob/master/trocr/README.md), [card Base](https://huggingface.co/microsoft/trocr-base-handwritten). |
| **PP-OCRv5_mobile_det → latin_PP-OCRv5_mobile_rec** | Card báo **84,7% đúng toàn dòng trên tập Latin**, không phải viết tay Việt. Kiểm **`PostProcess.character_dict` của chính artifact**: có `ă`, `ơ`, `ư` nhưng thiếu `ắ`, `ề`, `ở`, `ự` và không có combining marks để tạo chúng. CTC cho top-k timestep khi giữ tensor; `rec_score` trung bình không đủ. | **Không dùng làm HTR đủ dấu Việt** chỉ vì tên Latin. Dictionary chung trong repo khác dictionary nhúng ở model; phải kiểm đúng artifact. [Card](https://huggingface.co/PaddlePaddle/latin_PP-OCRv5_mobile_rec), [config đúng revision đã kiểm](https://huggingface.co/PaddlePaddle/latin_PP-OCRv5_mobile_rec/blob/ab2cd5cc5fa6309be2e5acdfe66eca2c2c127d57/config.json). |

Line HTR không tự phục hồi đồ thị/bảng hoặc lịch sử gạch xóa. Crop quá sát làm mất dấu. Hướng ONNX khả thi về kiến trúc: detector polygon → rectify crop → encoder → decoder/CTC → logits/top-k → box/order. PWA dùng ORT Web, native có thể ORT/LiteRT/Core ML sau conversion, nhưng **chưa có số đo điện thoại đúng pipeline**. Dự trù RAM của dự án: recognizer nhỏ **0,2–0,8 GiB**, TrOCR-Base **1,8–3,5 GiB** ở ngữ cảnh ngắn, dựa vào file weight cộng tensor/buffer. Không bịa % đúng/giây viết tay Việt để xếp hạng.

### 1.3 Đồ thị vẽ tay và kết hợp

- **CV:** OpenCV contour/chấm/ellipse + lần nét cong từ biên đỉnh, giữ khuyên quay về cùng đỉnh và từng đa cạnh. HoughLines/HoughCircles chỉ là tín hiệu ban đầu; đỉnh méo/hở không thể giải bằng chỉ tìm circle. Giao cắt không mặc định là đỉnh. [API OpenCV.js](https://docs.opencv.org/4.13.0/d5/d10/tutorial_js_root.html).
- **Detector/keypoint/segmentation:** học đỉnh/đầu mút/junction/crossover/mask nét rồi ghép bằng code xác định. **CGHD** là dữ liệu mạch điện vẽ tay có annotation cấu trúc, hợp để học giao cắt nhưng **không đại diện đồ thị THPT Việt**. Có công trình graph extraction; **chưa xác minh weight phát sẵn đủ quyền và năng lực khuyên/đa cạnh/nhãn Việt để dùng ngay**. [Dataset tác giả](https://zenodo.org/records/15333233), [modular graph extraction](https://arxiv.org/abs/2402.11093).
- **Tự train:** sinh graph từ truth core, render spline/nét méo/hở/khuyên/đa cạnh, giao cắt có/không có chấm, giữ mask/keypoint và connectivity. Có thể train detector nhỏ từ đầu; đây là hướng nghiên cứu, **chưa có weight/accuracy**. Node/edge box đúng không bảo đảm quan hệ nối đúng.
- **Hybrid:** kiểm ảnh → nắn trang → dòng/vùng → HTR/VLM → CV cấu trúc → ghép chữ/box/cạnh bằng hình học → kiểm chéo → reader. Hai cấu hình mục 8 dùng phần chung này; Tesseract không làm recognizer viết tay chính.

### 1.4 OCR của hệ điều hành: cần app native

| API | Bằng chứng, license và tài nguyên | Confidence / giới hạn |
| --- | --- | --- |
| **Android ML Kit Text Recognition v2, Latin bundled** | Danh sách hỗ trợ có **vi**; **chưa có điểm viết tay Việt** trong tài liệu. Bundled thêm **khoảng 4 MB/script/architecture**, unbundled khoảng 260 KB nhưng cần tải model. Là **SDK độc quyền theo ML Kit/Google APIs Terms**, không phải Apache cho weight, không được trích model ra PWA. [Cài Android](https://developers.google.com/ml-kit/vision/text-recognition/v2/android), [ngôn ngữ](https://developers.google.com/ml-kit/vision/text-recognition/v2/languages), [terms](https://developers.google.com/ml-kit/terms). | Có block/line/element/symbol/box; không có hợp đồng top-k ký tự như tensor CTC. Confidence cần kiểm từng mức/API. **Digital Ink nhận chuỗi nét trên màn hình, không nhận ảnh camera**, không thay thế. [Digital Ink](https://developers.google.com/ml-kit/vision/digital-ink-recognition). |
| **iOS Vision `VNRecognizeTextRequest`, accurate** | Apple xác nhận xử lý trên máy. **Chưa xác minh `vi` trên máy đích**; phải gọi `supportedRecognitionLanguages()` theo OS/revision. **Chưa có điểm viết tay Việt**. Model đi kèm OS: **0 byte weight do app phân phối**, không có artifact độc lập để xuất ONNX. SDK độc quyền theo Apple SDK agreements. [Offline](https://developer.apple.com/documentation/vision/recognizing-text-in-images.md), [API ngôn ngữ](https://developer.apple.com/documentation/vision/vnrecognizetextrequest/supportedrecognitionlanguages().md), [agreement](https://www.apple.com/legal/sla/docs/xcode.pdf). | Observation/box, **tối đa 10** ứng viên chuỗi theo confidence, không phân phối ký tự đầy đủ. Box substring không phải segmentation chính xác. [topCandidates](https://developer.apple.com/documentation/vision/vnrecognizedtextobservation/topcandidates(_:).md), [box](https://developer.apple.com/documentation/vision/vnrecognizedtext/boundingbox(for:).md). |

Nhận dạng miễn phí và dùng được trong app theo điều khoản nền tảng không đồng nghĩa weight mở hoặc quyền mang qua nền tảng khác. Không chọn làm hai engine chính: thiếu bằng chứng viết tay Việt, không đọc cấu trúc graph, không có cùng runtime Node để eval. ML Kit không gửi ảnh/kết quả tới Google, nhưng có thể liên lạc cập nhật và gửi metrics; **không hứa không có network request nào** chỉ vì OCR on-device. [Privacy chính thức](https://developers.google.com/ml-kit/terms).

Ước tính lập kế hoạch **chỉ text OS OCR**: RAM tạm **0,1–0,5 GiB**, cao cấp **0,2–2 s/trang**, tầm trung **0,5–5 s/trang**. Đây là **giả thuyết cần đo**, không benchmark Việt; cơ sở Google chỉ mô tả Latin “real-time on most devices”, Apple không có số trong nguồn trên. Không dùng các khoảng này để kết luận toàn pipeline đạt 15 s, không bao gồm graph, hai lượt hay xác nhận.

## 2. Giấy phép và byte của từng file trọng số

### 2.1 File đề nghị cho hai phép thử

Chỉ dùng **kho tác giả**, không mirror cộng đồng. Giấy phép được khai cho chính kho **GGUF** dưới đây, gồm language và vision; không suy MIT của llama.cpp thành license model. Kho Qwen GGUF không có LICENSE rời trong metadata đã đọc: căn cứ là **README của tác giả đúng revision**, không giả vờ đã kiểm LICENSE nhúng trong binary.

| Dùng | Kho/revision | File — byte chưa nén | Giấy phép và nguồn |
| --- | --- | --- | --- |
| A language | `PaddlePaddle/PaddleOCR-VL-1.5-GGUF`, `cc977c16989848c264d813ec1705cb181b7a21ee` | `PaddleOCR-VL-1.5.gguf` — **935.768.992** | **Apache-2.0**, [card GGUF đúng revision](https://huggingface.co/PaddlePaddle/PaddleOCR-VL-1.5-GGUF/blob/cc977c16989848c264d813ec1705cb181b7a21ee/README.md), [metadata byte/hash](https://huggingface.co/api/models/PaddlePaddle/PaddleOCR-VL-1.5-GGUF?blobs=true). |
| A vision | Cùng kho/revision A | `PaddleOCR-VL-1.5-mmproj.gguf` — **881.770.496** | **Apache-2.0**, cùng card GGUF A; không bỏ projector khi tính tổng. |
| B language | `Qwen/Qwen3-VL-2B-Instruct-GGUF`, `52d6c8ffea26cc873ac5ad116f8631268d7eb503` | `Qwen3VL-2B-Instruct-Q4_K_M.gguf` — **1.107.409.952** | **Apache-2.0**, [card GGUF đúng revision](https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct-GGUF/blob/52d6c8ffea26cc873ac5ad116f8631268d7eb503/README.md), [metadata byte/hash](https://huggingface.co/api/models/Qwen/Qwen3-VL-2B-Instruct-GGUF?blobs=true). |
| B vision | Cùng kho/revision B | `mmproj-Qwen3VL-2B-Instruct-F16.gguf` — **819.394.848** | **Apache-2.0**, cùng card GGUF B; chỉ decoder Q4_K_M, không gọi toàn VLM 4-bit. |
| Detector dòng chung, tùy chọn | `PaddlePaddle/PP-OCRv5_mobile_det`, `0d63e78e2b680928f6b1747d76a08db6e645efb7` | `inference.pdiparams` — **4.692.937** | **Apache-2.0**, [card đúng revision](https://huggingface.co/PaddlePaddle/PP-OCRv5_mobile_det/blob/0d63e78e2b680928f6b1747d76a08db6e645efb7/README.md), [metadata](https://huggingface.co/api/models/PaddlePaddle/PP-OCRv5_mobile_det?blobs=true). File Paddle, **chưa là ONNX**. |

SHA-256 từ metadata, để đối chiếu khi đã được duyệt tải:

| File | SHA-256 |
| --- | --- |
| A language | `299051d54faa065abc505cc39b8383ea338fd3020c775ea3e0ba514a7022328c` |
| A vision | `e7f1a72400fba517046f90d964e2fa0f4dac7781ee3b1bc5d2022f5f8cecbd87` |
| B language | `089d75c52f4b7ffc56ba998ffc50aae89fcafc755f9e7208aacca281dca6c2ae` |
| B vision | `c3d5afbef5287953acd57b4043d2269456e5761a4eaccb3b71b062996970aea5` |
| Detector | `afa1820cb16c1fd0dad589d0f8b389139061c1ef6d68019685fd07be997dda5b` |

Tổng weight **A: 1.817.539.488 byte; B: 1.926.804.800 byte**. A dùng nguyên GGUF tác giả phát, không tự gọi Q4 khi tên file không ghi Q4. B giữ vision FP16 gần cấu hình nguồn tốc độ hơn; bản Q8 vision không nằm trong phép thử đầu, muốn đổi phải đo chất lượng.

### 2.2 Weight khác đã đối chiếu, không chọn tải thử

Mỗi hàng dưới gắn đúng file với card/giấy phép **kho weight** và metadata tác giả. Byte là bản nguồn, **không gọi là ONNX/Q4 chưa tồn tại**. Revision pin nhằm tránh nhầm bản; các API metadata liên kết có thể thay đổi khi `main` đổi, nên khi tải phải kiểm lại revision.

| Kho/revision; file | License trọng số; byte nguồn và link | Kết quả |
| --- | --- | --- |
| `PaddlePaddle/PaddleOCR-VL-1.5`, `1e5216083435c7851caad5d691ef55aab81b5949`; `model.safetensors` | **Apache-2.0**, [LICENSE](https://huggingface.co/PaddlePaddle/PaddleOCR-VL-1.5/blob/1e5216083435c7851caad5d691ef55aab81b5949/LICENSE); **1.917.255.968**, [metadata](https://huggingface.co/api/models/PaddlePaddle/PaddleOCR-VL-1.5?blobs=true). | Hợp lệ; không tải thêm bản nguồn khi thử GGUF. |
| `PaddlePaddle/PaddleOCR-VL-1.6`, `132c45f52c0a26ed5a6b2f6bd8e3985794cc27dd`; `model.safetensors` | **Apache-2.0**, [LICENSE](https://huggingface.co/PaddlePaddle/PaddleOCR-VL-1.6/blob/132c45f52c0a26ed5a6b2f6bd8e3985794cc27dd/LICENSE); **1.917.255.968**, [metadata](https://huggingface.co/api/models/PaddlePaddle/PaddleOCR-VL-1.6?blobs=true). | Hợp lệ, chưa chọn. |
| `Qwen/Qwen3-VL-2B-Instruct`, `89644892e4d85e24eaac8bacfd4f463576704203`; `model.safetensors` | **Apache-2.0**, [card weight](https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct/blob/89644892e4d85e24eaac8bacfd4f463576704203/README.md); **4.255.140.312**, [metadata](https://huggingface.co/api/models/Qwen/Qwen3-VL-2B-Instruct?blobs=true). | Đề xuất GGUF thay bản này. |
| `Qwen/Qwen3-VL-4B-Instruct`, `ebb281ec70b05090aa6165b016eac8ec08e71b17`; `model-00001-of-00002.safetensors`, `model-00002-of-00002.safetensors` | **Apache-2.0**, [card](https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct/blob/ebb281ec70b05090aa6165b016eac8ec08e71b17/README.md); **4.967.229.296 + 3.908.490.048**, [metadata](https://huggingface.co/api/models/Qwen/Qwen3-VL-4B-Instruct?blobs=true). | Không chọn vì tài nguyên/bằng chứng HTR, không vì cấm thương mại. |
| `Qwen/Qwen2-VL-2B-Instruct`, `895c3a49bc3fa70a340399125c650a463535e71c`; hai shard `model-00001-of-00002.safetensors`, `model-00002-of-00002.safetensors` | **Apache-2.0**, [LICENSE](https://huggingface.co/Qwen/Qwen2-VL-2B-Instruct/blob/895c3a49bc3fa70a340399125c650a463535e71c/LICENSE); **3.988.609.112 + 429.441.656**, [metadata](https://huggingface.co/api/models/Qwen/Qwen2-VL-2B-Instruct?blobs=true). | Hợp lệ, chưa ưu tiên. |
| `microsoft/Florence-2-large`, `21a599d414c4d928c9032694c424fb94458e3594`; `model.safetensors` | **MIT**, [LICENSE đúng large](https://huggingface.co/microsoft/Florence-2-large/blob/21a599d414c4d928c9032694c424fb94458e3594/LICENSE); **1.553.563.458**, [metadata](https://huggingface.co/api/models/microsoft/Florence-2-large?blobs=true). | Không gán license của phiên bản Florence khác. |
| `OpenGVLab/InternVL3-1B`, `4415a3b810e636d11dfa86b0e9ba40bb00535aa8`; `model.safetensors` | **Apache-2.0**, [card đúng 1B](https://huggingface.co/OpenGVLab/InternVL3-1B/blob/4415a3b810e636d11dfa86b0e9ba40bb00535aa8/README.md); **1.876.463.472**, [metadata](https://huggingface.co/api/models/OpenGVLab/InternVL3-1B?blobs=true). | Không suy license từ InternVL đời/bản khác. |
| `google/gemma-3n-E2B-it`, `5e092ebca197cdcd8d8b195040accf22693501bc`; ba shard `model-00001-of-00003.safetensors` … `model-00003-of-00003.safetensors` | **Gemma Terms of Use**, không Apache/MIT hay research-only. **3.077.103.824 + 4.981.242.176 + 2.820.739.840**, [metadata](https://huggingface.co/api/models/google/gemma-3n-E2B-it?blobs=true), [terms áp dụng Gemma 3n](https://ai.google.dev/gemma/terms). | Cho dùng/phân phối theo restrictions, không tự chấp nhận điều khoản/gated download. Không chọn. |
| `microsoft/trocr-base-handwritten`, `eaacaf452b06415df8f10bb6fad3a4c11e609406`; `pytorch_model.bin` | **MIT**, [card Base](https://huggingface.co/microsoft/trocr-base-handwritten/blob/eaacaf452b06415df8f10bb6fad3a4c11e609406/README.md); **1.333.508.485**, [metadata](https://huggingface.co/api/models/microsoft/trocr-base-handwritten?blobs=true). | Dataset IAM cần kiểm quyền riêng, không suy từ MIT model. |
| `microsoft/trocr-small-handwritten`, `b4648cfa171985a6745f37ddd637e98c0da958ac`; `pytorch_model.bin` | **Chưa xác minh**: card metadata không khai license; **245.933.041**, [nguồn](https://huggingface.co/api/models/microsoft/trocr-small-handwritten?blobs=true). | Không đưa vào tập có thể tải thử; không suy từ Base. |
| VietOCR `vgg_seq2seq.pth`, `vgg_transformer.pth` do config trỏ host riêng | **Chưa xác minh license weight**, chưa có byte đáng tin đã kiểm. [README/LICENSE thư viện Apache-2.0](https://github.com/pbcquoc/vietocr), [config](https://github.com/pbcquoc/vietocr/tree/master/config). | Không tải; license thư viện không tự cấp quyền hai binary host ngoài. |
| `PaddlePaddle/latin_PP-OCRv5_mobile_rec`, `ab2cd5cc5fa6309be2e5acdfe66eca2c2c127d57`; `inference.pdiparams` | **Apache-2.0**, [card](https://huggingface.co/PaddlePaddle/latin_PP-OCRv5_mobile_rec/blob/ab2cd5cc5fa6309be2e5acdfe66eca2c2c127d57/README.md); **7.965.915**, [metadata](https://huggingface.co/api/models/PaddlePaddle/latin_PP-OCRv5_mobile_rec?blobs=true). | Chưa đủ dấu Việt; không dùng làm HTR Việt. |

NC/research-only/không xác minh được quyền không nằm trong tập đề xuất thương mại. License model không cấp lại quyền dataset; mirror tự khai CC BY không thay quyền gốc. Phát hành phải giữ LICENSE/NOTICE và kiểm dependency bắc cầu.

## 3. PWA thuần hay React/TS bọc Capacitor

| Lựa chọn | Được | Mất / phân phối | Mức máy để lập kế hoạch |
| --- | --- | --- | --- |
| **PWA — WASM/WebGPU** | React/TS/core giữ nguyên; camera, cài từ browser, không APK/store; tự phục vụ/cache để offline. | Không gọi Vision/ML Kit/Core ML/NPU trực tiếp. Cần ONNX hoặc runtime WASM tương thích, **GGUF không tự thành model WebGPU**. Operator/memory/cache/tab lifecycle có thể chặn. | Chrome Android WebGPU trên thiết bị phù hợp; Safari 26 có API nhưng không bảo đảm runtime/model. Với VLM này đề xuất thử từ **8 GB RAM**, ưu tiên 12 GB; là mốc dự án, **chưa phải minimum đã đo**. 4 GB không là mục tiêu thử VLM toàn trang. |
| **Capacitor + plugin native** | UI/core/parser TS giữ nguyên; Kotlin/Swift/C++ đọc file local, giữ model native, gọi camera/OS OCR. llama.cpp dùng CPU/Metal hoặc GPU Android phù hợp. | Build/ký app, bridge/lifecycle/cancel. Android APK thử hoặc Play; iOS Xcode/TestFlight/App Store, không APK. Cần Mac/Xcode cho iOS; tài khoản/phân phối store có thể tốn phí dù **OCR/suy luận không tính phí lượt**. | Shell Capacitor 8 hỗ trợ **Android API 24+ / iOS 15+**, không có nghĩa đủ chạy VLM. Mốc khảo sát: ARM64 **8–12 GB RAM**, chip lớp Snapdragon 7/8 hoặc Apple A17 Pro trở lên; **chưa chứng nhận thiết bị**. |

Nguồn: [Capacitor/plugin](https://capacitorjs.com/docs), [Android](https://capacitorjs.com/docs/android), [iOS](https://capacitorjs.com/docs/ios), [Chrome](https://developer.chrome.com/blog/new-in-webgpu-121), [Safari 26](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/), [ORT matrix](https://onnxruntime.ai/docs/get-started/with-javascript/web.html). WebGPU cần secure context; bench qua IP LAN HTTP không mặc nhiên đủ. Native C++ không phụ thuộc `navigator.gpu` của WebView.

Capacitor chỉ mở đường gọi, **không tự tăng tốc mọi model**:

- **llama.cpp (MIT):** hợp GGUF đề xuất; có hỗ trợ multimodal/Android. Không mặc định có NPU; GPU phải kiểm operator/driver. Tác giả runtime cảnh báo PaddleOCR có thể giảm chất lượng. [Multimodal](https://github.com/ggml-org/llama.cpp/blob/master/docs/multimodal.md), [Android](https://github.com/ggml-org/llama.cpp/blob/master/docs/android.md), [cảnh báo](https://huggingface.co/blog/ggml-org/using-ocr-models-with-llama-cpp).
- **LiteRT/Core ML/MLC:** mở GPU/NPU/mobile khi có conversion/model/backend thích hợp; không cấp GGUF trực tiếp cho Core ML/LiteRT. **NNAPI deprecated từ Android 15**, không chọn làm nền lâu dài; MLC cần biên dịch model/runtime. Chưa đề xuất cài các runtime này ở hai phép thử đầu. [LiteRT](https://developers.google.com/edge/litert/android), [NNAPI](https://developer.android.com/ndk/guides/neuralnetworks/migration-guide), [Core ML](https://developer.apple.com/documentation/coreml), [MLC](https://llm.mlc.ai/docs/deploy/android.html).

**Điểm cần người dùng chọn:** native khác yêu cầu Lô 2.4 hiện tại về engine chạy browser + Node. Node có thể dùng cùng C++/GGUF để eval, TS chung giữ nguyên; **browser thuần không chạy plugin native**. Không tự coi engine được chọn là đã cho phép sửa kiến trúc/prompt. Nếu bắt buộc PWA, phải duyệt riêng chuyển đổi/đo backend web; chưa hứa hai GGUF chạy nguyên vẹn trong bench tĩnh.

## 4. Ước tính độ trễ và RAM, ghi đúng giới hạn nguồn

Nguồn mobile tìm được: tutorial CVPR 2026 đo **Qwen3VL-2B**, ảnh **640 × 640**, tối đa **256 token**, vision **FP16**, quant **Q8_0/Q4_0/IQ4_NL**, **Snapdragon 8 Elite**, llama.cpp CPU/OpenCL/HTP. Biểu đồ throughput trải **8,8–41,6 token/s**. **Không phải Q4_K_M, không phải OCR Việt hoặc máy tầm trung**. [Nguồn tác giả, trang 3–5](https://www.fabricionarcizo.com/cvpr2026-edge-ai-in-action/pdfs/cvpr2026/06-Tiny_VLM_Models_on_Snapdragon_Chip_using_Llama-CPP.pdf).

Kịch bản nhỏ để dự toán: **một vùng ảnh, hai lượt độc lập, mỗi lượt 256 token**, tổng **512 token**. `T ≈ tiền xử lý + image/prompt prefill + 512 / tốc độ sinh`. Trang dài/nhiều crop còn tốn hơn; không cắt bài để đạt thời gian.

| Cấu hình | Giả định tính ngân sách | Dự toán workload trên |
| --- | --- | --- |
| **B native, cao cấp** | Tham khảo 8 Elite: 9–40 token/s + 3–12 s khâu khác; Q4_K_M/thiết bị iOS vẫn phải đo | **16–69 s**. |
| **A native, cao cấp** | Chưa có benchmark mobile đúng model; dùng cùng dải kịch bản 9–40 token/s + 3–12 s, **không suy nhanh gấp đôi vì ít tham số** | **16–69 s nếu giả định đúng**, độ chắc chắn thấp hơn B. |
| **A/B native, tầm trung** | **Giả định stress test của MathTwin**, chưa được nguồn đo: 2–10 token/s + 8–30 s | **59–286 s**, chưa đủ căn cứ hứa 15 s. |
| **PWA WASM nếu chuyển đổi chạy được** | **Giả định bảo thủ**, không phải benchmark: cao cấp 2–6 token/s + 8–30 s; tầm trung 0,5–2 token/s + 10–60 s | **93–286 s / 266–1.084 s**. WebGPU có thể khác lớn, chưa dự toán đáng tin. |

Nguồn throughput chỉ hỗ trợ tham khảo ở hàng B cao cấp; các hàng khác là **phân tích độ nhạy**, không số liệu do nguồn xác nhận. Workload trên muốn 15 s và mất 3 s khâu khác cần **trên khoảng 43 token/s**, cao hơn 41,6 trong nguồn; đây là phép tính, không chứng minh mọi tối ưu đều thất bại. Không dùng desktop GPU throughput để hứa điện thoại.

RAM A/B native **dự trù 3–6 GiB**: weight khoảng 1,82/1,93 GB + bản sao CPU/GPU, KV cache, activation vision, detector/pixel buffers, một engine/một crop/ngữ cảnh ngắn và hai lượt tuần tự. Không cộng RAM hai engine như phải chạy cùng lúc. Chưa có minimum máy được chứng nhận; chọn máy 8/12 GB để thử không bảo đảm OS không thu hồi app.

Ước lượng khả thi trên viết tay Việt theo bằng chứng: A đáng thử HTR, B đáng thử cấu trúc/bảng; HTR dòng cần dữ liệu/fine-tune; Florence/InternVL/Gemma thiếu bằng chứng ưu tiên; OS OCR không phủ toàn bài. **Chưa ứng viên nào được đánh giá nhiều khả năng đạt đủ ba ngưỡng trên nhóm viết tay chính.** Không tạo % chính xác hoặc giây cho các cấu hình chưa có dữ liệu.

## 5. Chất lượng ảnh trước khi đọc

Đề xuất kiểm hoàn toàn trên máy, chưa triển khai trong lô này:

| Vấn đề | Kiểm tra / xử lý | Chụp lại hoặc xác nhận |
| --- | --- | --- |
| Mờ/rung | Sắc nét cục bộ, năng lượng biên/variance Laplacian ở cả crop dấu/chữ nhỏ | Mất nét/dấu thì chụp lại vùng; sharpen không phục hồi thông tin đã mất. |
| Lóa/tối/bóng | Vùng bão hòa/tối, tương phản trên chữ; normalize nền khi còn nét | Cháy trắng/bóng che chữ hoặc đầu mút thì chụp lại, không đoán. |
| Nghiêng/phối cảnh/cong | Biên trang, homography bốn góc, deskew; trang cong cần dewarp riêng | Thiếu góc/mép, nắn làm dính dấu: sửa crop/góc hoặc chụp lại. |
| Độ phân giải/cắt thiếu | Chiều cao ký tự/dấu, mép chữ/bảng, trang thiếu. Google dùng khoảng **16 × 16 pixel/ký tự** cho text OCR, **không bảo đảm dấu viết tay Việt**. [Hướng dẫn](https://developers.google.com/ml-kit/vision/text-recognition/v2/android). | Chữ nhỏ/mất dòng thì chụp gần hoặc crop ảnh gốc chất lượng cao; upscale không thêm dữ liệu. |
| Kẻ dòng/ô li | Màu/tần suất/hình thái nền, so bản gốc với giảm dòng | Không xóa hàng loạt đường bảng Dijkstra/cạnh graph. Mất nét thì giữ gốc và gắn cờ. |
| Gạch xóa/viết đè | Giữ vùng sửa và các cách đọc, không dùng phép tính đúng để quyết định | Không rõ bản cuối thì hỏi đúng ô/dòng; không xóa “đáp án sai” của học sinh. |

Không có ngưỡng blur/glare chung đã xác minh cho mọi camera. Hiệu chỉnh trên ảnh thật/tập riêng, đo false accept/reject. Giữ phép biến đổi tọa độ để box trả về ảnh gốc sau crop/nắn trang, kể cả gốc tọa độ Vision khác canvas. Không lưu ảnh người dùng sau phiên khi chưa được yêu cầu.

## 6. Dữ liệu, tổng hợp đủ dấu và fine-tune cục bộ

### 6.1 Dữ liệu và quyền sử dụng

| Nguồn | License đã kiểm và quyết định |
| --- | --- |
| **CGHD**, Zenodo v15: mạch điện viết tay, text/box/junction/crossover | **CC BY 4.0**, dùng thương mại theo điều kiện ghi công. Có thể học cấu trúc nét; **không thay bài THPT Việt**. [Record](https://zenodo.org/records/15333233), [metadata license](https://zenodo.org/api/records/15333233). Không tải archive. |
| **5CD-AI/VietHTR-Line**, dòng Việt viết tay | **CC BY-NC-ND 4.0**, research/educational: **loại khỏi train/eval thương mại và đề xuất tải**. Gated/miễn phí không có nghĩa được thương mại. [Card tác giả](https://huggingface.co/datasets/5CD-AI/VietHTR-Line). |
| **UIT-HWDB**, dữ liệu Việt | Kho tác giả chưa có quyền thương mại rõ đã xác minh; paper phục vụ nghiên cứu. **Không dùng** trước xác nhận quyền gốc; mirror tự khai CC BY không thay quyền. [Kho tác giả](https://github.com/nghiangh/UIT-HWDB-dataset), [paper](https://arxiv.org/abs/2211.05407). |
| **HANDS-VNOnDB2018**, online ink Việt | Có đăng ký/thỏa thuận; **chưa xác minh quyền thương mại**, không dùng. Online ink cũng không là ảnh camera thật. [Nguồn TC11](https://tc11.cvc.uab.es/datasets/HANDS-VNOnDB2018_1.). |
| **ViCalligraphy** | Nguồn lab ghi **research & educational use only**: **loại**; thư pháp không thay chữ học sinh. [Nguồn](https://core.uit.edu.vn/datasets/vicalligraphy). |
| **MathWriting**, biểu thức viết tay | **CC BY-NC-SA 4.0 cho dữ liệu**, dù code Apache-2.0: **loại dữ liệu**. [README/license Google](https://github.com/google-research/google-research/blob/master/mathwriting/README.md). |
| **Ảnh thật do người dùng cung cấp có quyền dùng** | Quyền đánh giá **không mặc nhiên là quyền train/phân phối**. Cần quyền tương ứng và loại thông tin cá nhân; không tự cấp license cho ảnh học sinh. |

**Chưa tìm được bộ ảnh viết tay Việt của học sinh/đồ thị THPT có đủ quyền thương mại gốc đã xác minh để dùng ngay.** CGHD là dữ liệu viết tay có cấu trúc hợp lệ đã tìm được, nhưng lệch miền. Không lấp khoảng trống bằng NC hoặc mirror. Chưa có weight graph detector sẵn đủ cả bằng chứng quyền/chất lượng.

### 6.2 Sinh ảnh bổ sung

Font có metadata **vietnamese**, giấy phép **SIL Open Font License 1.1** cho thương mại:

- **Patrick Hand**, `PatrickHand-Regular.ttf`: [METADATA](https://github.com/google/fonts/blob/main/ofl/patrickhand/METADATA.pb), [OFL đúng font](https://github.com/google/fonts/blob/main/ofl/patrickhand/OFL.txt).
- **Dancing Script**, `DancingScript[wght].ttf`: [METADATA](https://github.com/google/fonts/blob/main/ofl/dancingscript/METADATA.pb), [OFL đúng font](https://github.com/google/fonts/blob/main/ofl/dancingscript/OFL.txt).

Dùng font render ảnh, không bán riêng font; giữ license khi phân phối font và tuân thủ reserved names nếu sửa. Kiểm glyph NFC/dấu kết hợp, không để font fallback giả năng lực đủ dấu. Không chuyển phong cách từ ảnh dataset NC.

Sinh từ câu/biểu thức do dự án viết và truth core: uốn baseline, méo/đậm/mảnh/đứt nét, lệch dấu, đỉnh hở, spline cạnh cong/khuyên/đa cạnh, junction/crossover; thêm bảng kẻ tay, dãy đỉnh/mũi tên, gạch xóa/viết đè có nhãn. Nền vở dòng/ô li tự tạo, bóng đổ, phối cảnh, mờ và ánh sáng không đều. Giữ truth dòng/ô/keypoint/connectivity qua biến đổi, không sửa truth theo dự đoán bộ đọc. `meta.json` ghi **`synthetic_handwriting`**, tách khỏi ảnh viết tay thật. Font chỉ bổ sung; **ảnh thật đa dạng người viết/vở/camera mới là thước đo**.

### 6.3 Fine-tune local: chỉ đánh giá

| Hướng | GPU/bộ nhớ đề xuất, chưa đo | Thời gian có giả định rõ |
| --- | --- | --- |
| Detector/keypoint hoặc HTR nhỏ | GPU **8–12 GB VRAM** để khởi đầu mạng nhỏ/crop dòng; NVIDIA 12 GB là mốc ngân sách, không minimum chứng nhận | Ví dụ **10.000 crop**, batch 16, 20 epoch → **12.500 step**. Nếu đo được **0,2–1 s/step**, train **0,69–3,47 giờ/run**, chưa gồm chuẩn bị/nhãn/ablation. |
| LoRA VLM A/B, khóa vision lúc đầu, context/crop ngắn | Dự trù **16–24 GB VRAM**, không bảo đảm mọi context. Full Adam khoảng **16 byte/tham số** trước activation: 2B đã ~32 GB; không hứa full fine-tune trên 12 GB. | Ví dụ **10.000 mẫu**, batch hiệu dụng 8, 3 epoch → **3.750 optimizer step**. Nếu tổng **2–20 s/step**, train **2,08–20,83 giờ/run**; accumulation làm step dài hơn. |

Cơ sở phương pháp: [recipe fine-tune/LoRA Qwen](https://github.com/QwenLM/Qwen3-VL/blob/main/qwen-vl-finetune/README.md). **Mọi lượng mẫu/batch/epoch/giây-step/GPU ở bảng là kịch bản MathTwin**, không được nguồn công bố như benchmark. Phép tính bộ nhớ giả định BF16 weight/gradient, FP32 master/Adam states; còn activation. Đo một run ngắn mới lập lịch đáng tin. Không cloud; không có GPU phù hợp thì chưa có đường đào tạo thực tế trong phạm vi này.

Chỉ train trên tổng hợp + ảnh thật được cấp quyền train, giữ người viết/trang/camera ngoài train để đánh giá. Loss chép nguyên văn, gồm bài sai; **không dùng đáp án đúng làm nhãn OCR**. Fine-tune có thể học sửa bài học sinh nên test cặp chỉ khác một số/dấu sai, đo lại sau quantization. Không có dữ liệu hợp lệ/ảnh thật thì không hứa đạt chuẩn.

## 7. Tích hợp cùng engine cho đề và bài làm, giữ chụp → chấm

Đây là thiết kế adapter, **không triển khai stage 3 hoặc đổi API trong lô này**:

1. Phân vùng đề/graph/lời giải/bảng khi chung một ảnh; giữ nhãn vùng và hỏi nếu mơ hồ, không lấy lời giải học sinh làm dữ kiện đề.
2. Engine nội bộ trả trang, polygon/box về ảnh gốc, thứ tự dòng/ô, nguyên văn, ứng viên khác và điểm đo. Stage 2 chọn vùng đề tạo `ReadDraft`; stage 3 dùng **cùng dòng/box/order** để dựng mệnh đề theo học sinh.
3. A dùng `Spotting:`/OCR crop, đối chiếu box spotting với detector. B yêu cầu dòng/box nhưng neo bằng polygon detector/crop thật; box do VLM sinh chưa mặc nhiên đúng. Bảng giữ hàng/cột/ô, khoanh/gạch xóa/mũi tên. Ảnh tĩnh không cho lịch sử nét chắc chắn; không rõ thứ tự sửa thì hỏi.
4. `edges` theo từng cạnh; `neighbors` đọc lại từ từng đỉnh với context/crop mới, không đưa danh sách cạnh cũ vào prompt. OCR đối chiếu crop gốc với bản nắn/giảm nền. Cùng weight không độc lập thống kê; khớp nhau không thay confidence.
5. Đo `conf` từ **logits trước grammar/lexicon mask**, giữ top-k/beam có thể giải mã; `min` trên token tạo trường rồi gộp detector/hình học. [API logits llama.cpp](https://github.com/ggml-org/llama.cpp/blob/master/include/llama.h). Không có điểm đo → chặn trường/vùng, không điền 1 hoặc tin model tự nói “chắc”. Hiệu chuẩn tập riêng; ngưỡng 0,85 reader không tự thành xác suất 85%.
6. Chỉ dùng từ vựng nhãn đã thấy/chữ số/từ khóa **xếp lại cách đọc**, không dùng `solve()/grade()`, nhãn Dijkstra đúng, tổng đường đi/Euler để chọn chữ. Còn mơ hồ 7/1 thì giữ cả hai, không chọn số giúp bài học sinh đúng.
7. `question: null`/`w: null` khi thiếu; ý không ánh xạ → `unmapped_option`; mọi `spec` qua `validateSpec`. Giữ multiset khuyên/đa cạnh/tên cạnh. Bất đồng/conf thấp thành `uncertain`; mất vùng/thiếu trang/output hỏng thì blocking, không trả đề đọc dở như hoàn chỉnh. Chữ trong ảnh là dữ liệu, không là lệnh.
8. UI sau này tô đúng box có cờ: chạm → chọn cách đọc/sửa một chữ, nhãn, số hoặc ô/chụp lại vùng. Graph dựng cạnh ảnh để xác nhận nhanh. Nhiều vùng mất nét thì chụp lại trang trước nhập tay toàn bộ. **Lỗi chưa có cờ vẫn là sai thầm lặng**, không được che bởi luồng xác nhận.

Khâu gia sư sau chấm lấy mọi số/kết luận từ core. Có thể nghiên cứu dùng VLM trên máy diễn đạt tiếng Việt tự nhiên hơn; HTR không chứng minh năng lực gia sư. Chỉ ghi nhận khả năng, không làm ở giai đoạn 2.

## 8. Hai cấu hình để người dùng chọn và ngân sách

### A — PaddleOCR-VL-1.5 theo vùng + CV hình, Capacitor native

- Mục đích: kiểm chứng viết tay Việt có box và bảng; bằng chứng Anh/Trung là lý do thử, không chứng nhận Việt. CV hỗ trợ cấu trúc graph, chưa có bộ nối mọi cạnh hoàn chỉnh.
- Artifact: hai GGUF A mục 2; detector chung là bổ trợ tùy chọn. Xuất detector ONNX chỉ sau duyệt; byte Paddle nguồn **không phải byte ONNX đã đo**.
- Dependency dự kiến: `@capacitor/core`, `@capacitor/android`, `@capacitor/ios`, `@capacitor/cli` cùng nhánh 8; bridge Kotlin/Swift/C++; **llama.cpp/libmtmd MIT**, snapshot khảo sát `e574a17b062be51b98e239ccd3d3743e3d902333`; **OpenCV 4.13.0 Apache-2.0**, core/imgproc; **ORT MIT** nếu dùng detector ONNX. Tool xuất detector ở `tools/`: PaddlePaddle + paddle2onnx, không cài điện thoại. Không dùng `sharp` ngoài tools. [Capacitor MIT](https://capacitorjs.com/docs/main/reference/support-policy), [llama.cpp LICENSE](https://github.com/ggml-org/llama.cpp/blob/master/LICENSE), [OpenCV](https://opencv.org/license/), [ORT](https://github.com/microsoft/onnxruntime/blob/main/LICENSE), [Paddle2ONNX](https://github.com/PaddlePaddle/Paddle2ONNX).
- **Tổng weight:** 1.817.539.488 + detector nguồn 4.692.937 = **1.822.232.425 byte**. App/runtime/config/ONNX sau build chưa có byte đo. **100 MB dự phòng do MathTwin chọn**, không metadata nhà phát hành; ngân sách điều kiện khoảng **1,95 GB**. Phải thay bằng manifest thật trước tải có `--confirm`.
- **RAM/máy:** dự trù **3–6 GiB**, máy thử **8–12 GB RAM**, ARM64; GPU Android/Metal iOS phải đo riêng. PWA chưa có artifact/backend được xác minh. Chi phí tích hợp dự án ước tính **3–6 tuần kỹ sư**, gồm bridge/logits/box/bảng/CV/đo máy, chưa gồm dữ liệu/fine-tune, không cam kết tiến độ.
- Dừng thử nếu runtime làm giảm chất lượng, thiếu điểm/box kiểm chứng, sai dấu/thiếu dòng hoặc không đạt RAM/tốc độ; không tự thay model/cloud.

### B — Qwen3-VL-2B Q4_K_M + vision FP16 + detector/CV, Capacitor native

- Mục đích: so cùng ảnh với A, kiểm cả chữ/bảng/dãy đỉnh/graph. Chưa có điểm HTR Việt riêng, là phép thử khả thi.
- Dependency: cùng shell/bridge/llama.cpp/libmtmd/OpenCV và detector/ORT tùy chọn như A; **không thêm Tesseract/Transformers.js vào đường viết tay chính**. Node eval dùng runtime C++/GGUF cục bộ, `VisionReader` TS bọc đọc; normalize/reconcile giữ reader hiện có.
- **Tổng weight:** 1.926.804.800 + detector nguồn 4.692.937 = **1.931.497.737 byte**; cộng **100 MB dự phòng app/runtime/config/conversion** như A → khoảng **2,05 GB**, chưa là build đã đo. Không tải cả F16/Q8/Q4 decoder cùng lúc.
- **RAM/máy:** dự trù **3–6 GiB**, thử **8–12 GB RAM**; Android cao cấp trước để đối chiếu nguồn 8 Elite, rồi bắt buộc iOS/tầm trung. Tích hợp ước tính **3–6 tuần** nếu làm riêng; chia sẻ bridge giảm phần lặp nhưng vẫn đo riêng logits/box/order/graph. PWA cần conversion/operator test, chưa cam kết chạy.
- Rủi ro: tự sửa số sai, box/đầu mút tưởng tượng, JSON hợp schema nhưng thiếu dòng/cạnh, hai lượt cùng sai, vượt thời gian.

Chọn cả hai: VLM **3.744.344.288 byte** + detector chung **4.692.937** + dự phòng chung 100 MB → khoảng **3,90 GB**, **không chạy đồng thời**. Dự phòng không gồm toolchain trên máy phát triển. Sau build cần manifest thực; dự trù không là dung lượng xác minh. Chọn native cần duyệt công việc bridge/build, không tự làm Lô 2.4 theo đường browser cũ.

### Mốc in — OpenCV + Tesseract, không là ứng viên viết tay thứ ba

Tesseract.js 6.0.1/core 6.0.0 và OpenCV 4.13.0 đều **Apache-2.0**. `tessdata_fast` snapshot `87416418657359cb625c412a48b6e1d6d41c29bd`: **`vie.traineddata` 531.275 byte**, **`eng.traineddata` 4.113.088 byte**, **từng file Apache-2.0** theo kho weight. [Model LICENSE](https://github.com/tesseract-ocr/tessdata_fast/blob/87416418657359cb625c412a48b6e1d6d41c29bd/LICENSE), [metadata vie](https://api.github.com/repos/tesseract-ocr/tessdata_fast/contents/vie.traineddata?ref=87416418657359cb625c412a48b6e1d6d41c29bd), [eng](https://api.github.com/repos/tesseract-ocr/tessdata_fast/contents/eng.traineddata?ref=87416418657359cb625c412a48b6e1d6d41c29bd), [JS license](https://github.com/naptha/tesseract.js/blob/v6.0.1/LICENSE.md).

JS/worker **174.382 byte**, bốn core `.wasm.js` nhúng **17.410.748 byte**, tổng OCR **22.229.493 byte**, không cộng WASM rời. [Manifest JS](https://unpkg.com/tesseract.js@6.0.1/dist/?meta), [core](https://unpkg.com/tesseract.js-core@6.0.0/?meta). OpenCV build chưa đo, giữ **20 MB dự phòng**, mốc in khoảng **45 MB**, RAM dự trù **0,2–0,6 GiB** một ảnh/worker. Không gọi khoản CV đó là byte đã xác minh. Tesseract chính thức định hướng chữ in, viết tay yếu. [FAQ](https://tesseract-ocr.github.io/tessdoc/FAQ.html#can-i-use-tesseract-for-handwriting-recognition). SmolVLM-256M vòng trước cũng không được đề xuất tiếp cho viết tay Việt khi chưa có bằng chứng.

## 9. Đánh giá sau lựa chọn và điểm dừng

- Trước tải: manifest byte/hash/revision/license, cờ `--confirm`; không cờ không tải. Pin dependency bắc cầu sau duyệt. Test thường fake reader, không mạng/model lớn. Tài nguyên app/model có thể cache; ảnh không tự lưu, log không chứa đề. Kiểm airplane mode/mở lại app, hủy/giải phóng tensor, không có CDN fallback.
- **Ảnh chụp viết tay đánh giá trước hết**, **≥ 30 ảnh thật có nhãn** người dùng cung cấp, nhiều người viết/vở/camera; tách in, synthetic_handwriting, viết tay thật, mờ/nghiêng/gạch xóa/graph/bảng. Stage 3 cần tập ảnh bài làm/chuỗi mệnh đề riêng; đọc đề đạt không là bằng chứng đọc bài làm đạt.
- Đo CER/WER nhạy dấu, số/nhãn, recall dòng/ô, box/order, graph multiset/khuyên/đa cạnh và đúng toàn đề theo `compareRead`. Tính mọi lỗi load/timeout/blocking vào mẫu số. Raw trước xác nhận và sau sửa báo riêng, số lần chạm/chụp lại riêng; **không dùng sửa tay để cộng vào ≥ 90% đọc tự động**.
- So `passes: 1/2`, cold/warm, p50/p90/từng ca; model máy/OS/backend thật, byte/RAM. RAM không đo được ghi vậy, không thay bằng JS heap; có chip NPU không nghĩa đang chạy NPU. Ghi máy không chạy được, nhiệt/pin sau nhiều lượt.
- Giữ **≥ 90% đúng toàn đề, không sai thầm lặng, ≤ 15 s trên điện thoại tầm trung**, áp dụng **trước hết nhóm viết tay**. Hiện nhóm này **chưa được chứng minh đạt**, chưa đủ dữ liệu bật, không hạ chuẩn. Xác nhận vùng giúp dùng được không thay nghiệm thu tự động.
- Sau xác nhận, core giải/chấm, bài sai mới diễn đạt gia sư theo facts. Chụp lại vùng/xác nhận nhanh giữ luồng chụp → chấm; nhập tay toàn bộ là cuối.

## Đối chiếu review vòng 1

| Yêu cầu làm lại | Đã xử lý |
| --- | --- |
| 1. VLM, line HTR, graph, OS, hybrid | Mục 1.1–1.4; model cụ thể và lý do không chọn. |
| 2. License từng weight, loại NC/research-only | Mục 2, 6.1, mốc in mục 8; không suy code → weight → dataset. |
| 3. Bằng chứng/metric Việt viết tay, top-k/conf | Mục 1, 7; thiếu ghi rõ, không mượn số model lớn/hình in. |
| 4. PWA/Capacitor, phân phối, máy/RAM/độ trễ | Mục 3–4, 8; chưa tự đổi kiến trúc. |
| 5. Chất lượng ảnh/chụp lại/dòng kẻ | Mục 5. |
| 6. Data hợp lệ/font đủ dấu/fine-tune local | Mục 6; chưa có bộ Việt đủ quyền xác minh, không lách NC/mirror. |
| 7. Trung thực khả thi, giữ chụp → chấm | Kết luận đầu, mục 4, 7, 9; nhập toàn bài không là luồng chính. |
| 8. Hai cấu hình + mốc in, dependencies/tổng tải/cả hai stage | Mục 7–8; byte weight xác minh riêng phần app dự trù. |
| 9. Không tải/cài, dừng để chọn | Chỉ thay báo cáo; chưa triển khai engine. |

## Quyết định & giả định

- Viết lại theo quyết định mới: ưu tiên viết tay và dùng cùng engine cho đọc đề/bài làm; OpenCV + Tesseract chỉ là mốc in.
- Chọn **hai phép thử để cân nhắc**, chưa chọn thay người dùng; native cần quyết định vì khác đường browser + Node của Lô 2.4 hiện tại.
- RAM/tốc độ/tuần kỹ sư/thời gian train/phần app dự phòng là ước tính có điều kiện, không benchmark. Không thể chứng nhận minimum máy, byte binary chưa build hoặc chất lượng HTR Việt trước phép thử; ghi khoảng trống thay bịa nguồn.
- License kiểm theo tuyên bố tác giả đúng artifact, không kiểm binary chưa được phép tải. Thiết bị, ảnh thật và quyền dùng/train ảnh do người dùng cung cấp/chọn.

**Kết thúc Lô 2.3 làm lại. Dừng chờ người dùng chọn ứng viên và nền tảng; chưa cài dependency, chưa tải model, chưa làm Lô 2.4.**
