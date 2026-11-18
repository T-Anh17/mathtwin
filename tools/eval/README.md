# Đánh giá đọc ảnh — Lô 2.6

Yêu cầu Node ≥ 22.12; cài bằng `npm install` ở repo gốc. `sharp` chỉ nằm trong workspace công cụ Node; `@types/node` chỉ phục vụ kiểm tra kiểu. Không thêm runtime OCR/model, không gọi dịch vụ mạng khi chạy.

```sh
npm run eval:generate
npm run eval:generate -- --set synthetic-hw
npm run eval:pack -- --set synthetic-hw
npm run eval:read -- --engine fake [--passes 1|2] [--set synthetic|synthetic-hw|real] [--mode graph|lines|both] [--limit n]
npm run eval:read -- --from-device device.json [--set synthetic|synthetic-hw|real] [--mode graph|lines|both] [--threshold 0.85] [--limit n]
npm run eval:validate -- synthetic
npm run eval:validate -- synthetic-hw
```

Chế độ Node mặc định hai lượt, bộ tổng hợp, `graph` và toàn bộ mẫu. Engine `fake` chuyển nhãn chuẩn thành draft/dòng chữ. Không phân tích pixel; `conf = 1` là giá trị cố định của fixture, không phải độ tin cậy OCR đo được. Hai lượt không phải hai phương pháp nhận dạng. Chỉ dùng để kiểm tra pipeline, không dùng kết quả để quyết định bật đọc ảnh. Chế độ chữ cần `lines.json`; bộ tổng hợp cũ và bộ viết tay mới đều đã có.

CLI Node chỉ nhận `--engine fake`, kể cả có `--confirm`. Đánh giá engine thật dùng `--from-device`, không đọc pixel, không khởi động server và không tải model. Hai cách gọi loại trừ nhau. Adapter Node của Lô 2.4 chỉ phục vụ phát triển.

Đọc từng đề tuần tự, giải mã tất cả trang RGBA và xoay EXIF bằng `sharp`. Báo cáo gồm:

- `reports/.fake/read-eval-fake-YYYY-MM-DD.md` và `.json`; thư mục `.fake` được `.gitignore` loại khỏi repo vì reader giả không cung cấp số đo nhận dạng. Ngày theo UTC. Chạy lại cùng engine/ngày sẽ thay cặp báo cáo đó; `set` và `passes` nằm trong nội dung. Lưu bản báo cáo trước nếu cần giữ cả hai lượt.
- Đúng hoàn toàn và chỉ đồ thị; tỉ lệ gắn cờ đủ trên mẫu sai; số/mã mẫu sai thầm lặng toàn bài và chỉ đồ thị; số phần tử lệch ở từng mức `precise`/`coarse`/`none`; cờ thừa trung bình; bảng lỗi theo nguồn ảnh. Nhóm nguồn có thể chồng lấn.
- p50/p90 Node bằng nearest rank, đo `readProblem` gồm chuẩn hóa/đối chiếu, không gồm I/O/giải mã ảnh; usage do reader trả được ghi riêng. Bộ nhớ đỉnh để `null` nếu reader không đo; không gán số 0 giả. Chưa có số đo điện thoại.
- JSON lưu sai lệch theo mã mục và issue code, không lưu pixel hay draft. CLI chỉ log số đề và đường dẫn báo cáo.

`compareRead` trong package reader là hàm thuần, không có API Node. So tập nhãn đỉnh đã chuẩn hóa và multiset cạnh vô hướng `{u,v,w,name}`, bỏ qua id và thứ tự cạnh; giữ số lượng cạnh trùng. Ghép cạnh bằng chi phí tối thiểu để tránh ghép sai cạnh song song. Sai khuyên/đa cạnh được gắn thêm loại lỗi tương ứng. Task chuẩn hóa tham chiếu đỉnh/edgeIds và các tập không có thứ tự; `text` của statement không tham gia so sánh vì ý nghĩa nằm ở `check`. Tên cạnh vẫn phân biệt hoa/thường. `graphCorrect` dùng `spec.graph` hoặc `ReadOutcome.graph` khi spec bị chặn.

Theo định nghĩa review Lô 2.2 vòng 1, mỗi phần tử lệch chỉ nhận một mức phủ, ưu tiên theo thứ tự:

1. `precise`: có cờ đúng phần tử (theo quy tắc `affects`, trừ cờ `graph`) và candidate chứa giá trị chuẩn. Cờ tồn tại cạnh không bao phủ sai trọng số.
2. `coarse`: có cờ `graph` cho phần đồ thị (không cần candidate chứa đồ thị chuẩn), hoặc issue blocking có `item` trùng phần tử; blocking `item: "graph"` chỉ phủ phần đồ thị. Các blocking `missing_question`, `unmapped_option`, `unsupported_task` chỉ phủ task/dạng câu hỏi, không phủ đồ thị. Blocking không có mục liên quan không tự động phủ lỗi khác.
3. `none`: không có hai mức phủ trên.

`coverage` đếm số phần tử lệch theo ba mức, không cộng lặp. `silentError` là có ít nhất một phần tử `none`; `graphSilentError` chỉ xét phần tử đồ thị, là chỉ số chính khi người dùng chọn tay câu hỏi. `fullyFlagged` là không có `none`, kể cả bài không có sai lệch; khi tổng hợp tỉ lệ gắn cờ đủ, chỉ đếm các bài sai. Cờ trên phần tử thực ra đúng vẫn tính cờ thừa. Khi `spec === null`, bài không bao giờ đúng hoàn toàn; đồ thị vẫn được chấm độc lập. Không có mẫu sai thì tỉ lệ gắn cờ là `null`/N/A, không phải 100%.

Chưa có ảnh thật trong repo; xem [quy trình giáo viên gán nhãn](../../testdata/images/README.md). Đo thiết bị và kết luận đi/dừng thuộc Lô 2.7.

## Bộ viết tay và bộ đo Android

`testdata/images-synthetic-hw/` có 40 ảnh: 10 truth core × hai font × hai góc chụp. **Cả 40 ảnh đều có bài làm**, gồm đếm đỉnh/cạnh, tổng bậc, liên thông, dãy Euler/Hamilton, bảng Dijkstra, tour TSP và phép cộng, ghép cặp đỉnh lẻ/cạnh lặp người đưa thư, đánh dấu đúng/sai và chọn phương án. Có 20 bài đúng và 20 bài có lỗi cố ý (sai số học, đỉnh hoặc kết luận); mỗi fixture có cả hai loại và ít nhất hai cách diễn đạt tiếng Việt khác nhau ngoài chỗ lỗi. Không có tiêu đề hoặc câu đệm chung; cách viết `AB` nằm trong bước đi Euler, cập nhật Dijkstra, giải thích phương án trắc nghiệm; `(A, B)` nằm trong ghép cặp/cạnh lặp người đưa thư, dựa trên cạnh thực của đồ thị. Test chặn dòng văn xuôi vùng solution lặp giữa các fixture khác nhau. Đây là 10 nội dung đề với biến thể cách viết/câu trả lời, không phải 40 bài thật độc lập.

Mỗi ảnh gồm PNG, truth đề core hợp lệ, `lines.json` NFC, `meta.json` với `source: "synthetic_handwriting"`, `hasSolution: true`, `studentErrors` (kind, written, expected, description), SVG nét vẽ, `layout.json` lệnh đặt chữ và `cancellation.json` hình học nét gạch. **Chữ sai của học sinh giữ nguyên trên ảnh và trong lines**, không thay bằng giá trị expected trong metadata. Nhãn chuẩn bài toán vẫn giữ nguyên; metadata đáp án không được đóng gói vào bộ đo app. Chữ render bằng fontfile đã kèm repo, không cần cài font hệ thống. Biến đổi phối cảnh áp dụng lên toàn ảnh sau khi render; baseline uốn theo vị trí từ và cạnh có nhiễu xác định. Mỗi ảnh có một chỗ viết rồi gạch, tiếp ngay bằng dòng viết lại trong mạch giải (10 nội dung gạch khác nhau theo dạng bài): 20 gạch một nét còn đọc được và 20 bôi kín. Nét đơn hơi nghiêng/run xuyên giữa chiều cao raster chữ đo bằng sharp, bao phủ hết chiều rộng; test kiểm giao giữa box nét và dải giữa box chữ. Box truth bao vùng chữ/nét sau phối cảnh; `cancellation.json` lưu hình học trước biến đổi và box ảnh để kiểm toán, có hash trong metadata. Đây là ảnh kiểu viết tay, không thay thế bài học sinh thật.

Font và giấy phép: [Patrick Hand](fonts/patrickhand/OFL.txt), [Dancing Script](fonts/dancingscript/OFL.txt); nguồn và revision ở [fonts/README.md](fonts/README.md). Không tải font/model trong test hoặc khi sinh lại ảnh.

`eval:pack` chép ảnh nguyên byte vào `.build-cache/datasets/<set>/`, tạo `ids.json` đúng giao thức app. Không chép truth hay đáp án. Id giữ nguyên tên thư mục corpus; filename `sample-001.png`… Chạy lại chỉ thay file sinh tự động, từ chối thư mục có file lạ. App v1 chỉ nhận một ảnh/id nên bộ nhiều trang bị từ chối, không tự bỏ trang. Muốn đo chữ nhiều trang, giáo viên tách mỗi trang thành một id, lặp truth đề và gán lines riêng; đo graph chỉ dùng trang có đủ đề và hình.

```powershell
adb shell mkdir -p /sdcard/Android/data/vn.mathtwin.app/files/datasets
adb push .build-cache/datasets/synthetic-hw /sdcard/Android/data/vn.mathtwin.app/files/datasets/
```

Nhập `synthetic-hw` trên màn Đo. Với `--set synthetic`, lệnh đóng gói tương tự. Bộ cũ có 10 ảnh nét bút giả bằng font hệ thống: báo cáo để riêng `legacy_synthetic_pen`, không gộp thành viết tay thật hay bộ font mới.

## Bộ hình khó — Lô 2.10

[synthetic-fig](../../testdata/images-synthetic-fig/README.md) gồm 320 ảnh tổng hợp
(240 vùng hình, 80 trang), lấy toàn bộ 60 fixture core và 20 đồ thị có seed.
`figure.json` lưu nét và box theo pixel ảnh sau biến đổi; `meta.json` có tham số,
hash và split theo đồ thị gốc. **Không phải ảnh thật.** Test chỉ dùng báo cáo,
không dùng chỉnh ngưỡng. Các biến thể của cùng đồ thị, kể cả trùng giữa nhiều
fixture core, luôn ở cùng split.

```powershell
npm run eval:generate -- --set synthetic-fig
npm run eval:validate -- synthetic-fig
npm run eval:pack -- --set synthetic-fig
npm run eval:pack -- --set synthetic-fig --split test
npm run eval:read -- --engine fake --set synthetic-fig --split dev --mode graph
```

Sinh ảnh không cần model/mạng. Pack chỉ chứa ảnh và `ids.json`, không chứa truth,
chú thích hoặc đáp án; pack theo split nằm trong `.build-cache/datasets/synthetic-fig-<split>/`.
Reader `fake` chỉ kiểm pipeline, không phải số đo nhận dạng.

`compareRead().graphMetrics` và báo cáo JSON/Markdown thêm precision/recall đỉnh
theo nhãn chuẩn hóa, F1 multiset cạnh theo cặp đầu mút vô hướng, độ đúng trọng số
trên cạnh khớp đầu mút, khuyên/đa cạnh đúng/sai. Ghép các trọng số bằng nhau trước
trong mỗi nhóm cạnh song song; không trọng số là `null`, `0` vẫn là sai. Chỉ số
khuyên/đa cạnh đòi hỏi đủ số lượng, trọng số và tên của mọi nhóm tương ứng; tính
cả khuyên/đa cạnh đọc thừa. Tỉ lệ đúng đồ thị và sai thầm lặng đồ thị được giữ
riêng với phần câu hỏi. Cộng tử/mẫu số trước khi tính tỉ lệ; mẫu số 0 là N/A.
Nhóm `variant:*` và `split:*` tách các biến thể và tập dữ liệu, nhóm có thể chồng lấn.

Nhập `--from-device` vẫn kiểm `spec` bằng `validateSpec`; graph giữ lại chỉ được
kiểm cấu trúc/id/đầu mút và kiểu trọng số hữu hạn. Trọng số ≤ 0 được giữ nguyên để
chấm sai, không từ chối cả file. Ca hồi quy là một bản ghi thật từ file xuất vivo
đã có sẵn, xem [nguồn fixture](test/fixtures/README.md). Không cần kết nối thiết bị.

## Công sửa bản nháp D — Lô 2.12

`npm run eval:effort -- --split test` chạy D **không có glyph model** (như app) trên `synthetic-fig` và đếm số thao tác
(chạm hoặc gõ một ô) để biến bản nháp thành đồ thị chú thích, so với tự nhập từ đầu trong màn sửa.
Đỉnh nháp ghép với đỉnh chú thích theo vị trí; cạnh nối vào đỉnh bị xoá mất theo, không tính thêm.
Tự nhập: app tự đặt nhãn A, B, C…, nên đồ thị nhãn liền từ A chỉ tốn 1 thao tác/đỉnh. Báo cáo: `reports/figure-effort-<ngày>-<split>.md`.

## Đo C trên Node — Lô 2.8

`npm run eval:read -- --engine offline:vietocr-onnx --mode lines --set synthetic-hw`
dùng model đã có ở `.models/c/`, không tự tải. Mặc định một lượt; chỉ chấp nhận
`--passes 1`. Graph/both trả `unsupported_mode`. Cùng bộ dữ liệu, truth và chỉ số
chữ của A/B; truth không truyền vào bộ nhận dạng. Lỗi đọc vẫn so như chữ rỗng,
không loại ảnh lỗi khỏi mẫu số. Usage có số dòng, ms tách dòng/nhận dạng.
Báo cáo dùng tên an toàn trên Windows: `read-eval-offline-vietocr-onnx-<ngày>.md/json`.
JSON có `unsupportedSymbols`, mỗi row có `truncatedLineCount` và
`unsupportedSymbolTruthLines`; summary/nhóm có `truncatedLines` và
`unsupportedSymbolTruthLines`. Markdown có bảng tương ứng. Đếm mỗi dòng truth
có hiệu lực chứa `→ × ∞ ≥ ≤ ≠` thiếu trong vocab một lần, kể cả khi đọc ảnh lỗi;
không tính dòng gạch xóa. Không thay ký hiệu trong truth, không bỏ dòng khỏi CER/WER.
Prefix truncated vẫn vào chỉ số chữ với conf = 0 và không làm thất bại cả trang.

Tùy chọn `--dump-lines` trong chế độ lines/both với `--engine` ghi file
`reports/.debug/read-eval-<engine>-<ngày>-<set>.json` (gitignore), mỗi record có
`id`, `pass`, `box` nếu reader trả, `text`, `conf`, `truncated` nếu bị cắt.
Chỉ bật khi cần soi kết quả: đây là bản ghi nguyên văn dòng theo yêu cầu rõ ràng,
không chứa pixel. Mặc định không tạo thư mục/file debug. Không áp dụng flag này
cho `--from-device` hoặc chế độ graph. Chạy lại cùng engine/ngày/set thay file debug.

Độ trễ PC chỉ tham khảo; trọng số VietOCR chỉ dùng đo vì điều khoản riêng chưa xác minh.
Xem [adapter](../../packages/reader-ocr/README.md) và
[pipeline chung](../../packages/reader-ocr-shared/README.md).

## Tính chỉ số từ file xuất của app

Lấy JSON qua đường dẫn app đã báo khi bấm Xuất kết quả (xem [README app](../../apps/mobile/README.md)). Engine D (`model: "d"`, `offline:figure-cv`) được nhập khi `mode: "graph"` và một lượt.
`--from-device` đọc định dạng version 1 do `exportReport()` tạo. Mặc định `both`: đánh giá các record graph và lines có trong file; không tự suy ra graph từ chữ hoặc ngược lại. Model, lượt đọc và cấu hình lấy từ file; không truyền `--engine`/`--passes` cùng `--from-device`. Hai lượt lines được báo riêng, không chọn lượt tốt hơn bằng truth.

Cấu hình `maxImageSide`, `readTimeout` (ms), `maxTokens` và bốn tham số `dry` được giữ trong JSON/Markdown, tách nhóm đo khi khác nhau.
`maxTokens` lấy từ config từng ảnh; file cũ chưa có thì lấy `runtime.maxTokens` đã ghi (ví dụ 4096),
không áp mặc định 1536 mới cho dữ liệu lịch sử. Giới hạn phải là số nguyên từ 1 đến 8192.
File xuất trộn nhiều giới hạn có `runtime.maxTokens:null`; từng báo cáo nhóm ghi đúng `runtime.maxTokens`
của nhóm. Mỗi row giữ `serverRestarted` nếu có: Android đã dừng server sau timeout/hủy khi slot không rảnh
trong 5 giây để lần đo sau khởi động lại. Không gộp các cấu hình token khác nhau vào cùng chỉ số.
Mỗi row giữ `usage.sentImages` (kích thước gốc/thực gửi/maxImageSide) và `usage.finish_reason` theo thứ tự request.
File version 1 cũ không có các trường này vẫn nhập được, không suy đoán cấu hình hay metadata còn thiếu.
`repetition_loop` và `logprob_alignment` giữ mã riêng và tính là lượt thất bại; không loại khỏi mẫu số.

Ghép theo id trên cả ba bộ; `--set` lọc theo bộ sau khi ghép. Id không có truth, id trùng trong cùng cấu hình, schema sai, lượt thiếu mà không có errorCode hoặc thiếu lines truth đều báo lỗi. Cùng id ở mode/cấu hình khác được chấp nhận và xuất báo cáo riêng. `--limit` giới hạn từng cấu hình theo thứ tự file. Lỗi đọc có errorCode vẫn được tính: graph sai có cờ lỗi xử lý, lượt chữ chưa có kết quả được so như mảng rỗng; không loại mẫu thất bại khỏi mẫu số. Nếu có `--set`, JSON ghi thêm `notExportedIds` để thấy các id chưa được app chạy/xuất.

Kết quả: `reports/read-device-<ngày UTC>-<hash>.md` và `.json`. Hash gồm nội dung file, bộ chọn, cấu hình, limit và ngưỡng nên các lần đo khác không ghi đè nhau. Chạy lại đúng cùng đầu vào thay đúng cặp báo cáo. Không chứa pixel/draft/khóa server; không đọc file ảnh khi nhập JSON. Ghi thiết bị, runtime/commit, backend, `cpuVariant` nếu app trả, cấu hình, độ trễ tổng/server p50/p90, thời gian nạp mới/dùng lại, RAM đỉnh và lỗi. Không gán thời gian tính chỉ số trên PC thành thời gian điện thoại. RAM < 6 GB có `targetEligible: false`: chỉ chứng minh chạy được hay không. Thiếu ảnh viết tay thật vẫn chưa đủ căn cứ cho kết luận nghiệm thu.

Markdown ghi riêng `cpuVariant` thực nạp (thiếu thì ghi chưa ghi nhận). JSON có
`summary.memoryPressureCount` và cùng bộ đếm theo từng nhóm ảnh; đây là số ảnh có
`errorCode: memory_pressure`, vẫn nằm trong `failedImages` và mẫu số đánh giá.
Mỗi row lỗi này giữ `memoryPressure: { callback, trimLevel }` từ `memory.memoryPressure`
của app, Markdown liệt kê tương ứng. `onTrimMemory` phải có mức trim nguyên không âm;
`onLowMemory` phải có `trimLevel: null`, không suy đoán một mức Android không gửi.

## Định nghĩa chỉ số chữ

`compareText` trong reader là hàm thuần, không dùng API Node và không dùng lời giải để chọn cách đọc. Chuẩn hóa NFC, trim và gom khoảng trắng trong mỗi dòng; giữ hoa/thường, dấu, dấu câu và thứ tự. Ghép dòng bằng một dấu cách để tính CER/WER. Bảng đọc trái sang phải từng hàng (mỗi hàng là một dòng), nhãn rời trong hình theo trên xuống dưới rồi trái sang phải. Dòng `struck: true` luôn bị loại khỏi reference các chỉ số chữ, dù còn đọc được hay `text: null`. Dự đoán được reader đánh dấu `struck: true` cũng không phải nội dung bài làm.

- CER = khoảng cách Levenshtein trên codepoint / số codepoint truth. WER dùng token tách bằng khoảng trắng (phù hợp cách viết tiếng Việt); dấu câu vẫn thuộc token. CER bỏ dấu loại Unicode combining marks và đổi `đ/Đ` thành `d/D`. Đây là chỉ số riêng, không thay CER có dấu.
- Đúng chữ số/trọng số = `max(0, 1 - editDistance / số token truth)`, token số `\d+(?:[.,]\d+)?` (giữ nguyên dấu thập phân và chữ số, không suy diễn giá trị). Mọi số nhìn thấy đều tham gia, kể cả số trong đề/bảng; chỉ số cạnh/trọng số theo cấu trúc vẫn do `compareRead` đo riêng.
- Đúng nhãn đỉnh dùng cùng công thức token; nhận diện nhãn nguyên vẹn từ từ vựng đỉnh truth và mẫu nhãn thông dụng `A…Z`, `A1`, `v1`, chỉ số dưới. Nhãn lạ kiểu `Z` vẫn được tính để không che cạnh/đỉnh thừa; phân biệt hoa/thường và dấu. Token ghép hoàn toàn từ nhãn đã biết (`AB`, `BD`, `v1v2`) được tách thành dãy nhãn, ưu tiên nhãn dài nhưng quay lui nếu phần còn lại không tách được; không tách một phần từ văn xuôi. Nhãn nhiều từ được khớp dài nhất, có biên từ Unicode.
- Recall dòng = số dòng khớp hoàn toàn theo LCS có thứ tự / số dòng truth. Đây là recall transcription nghiêm ngặt; không phải recall phát hiện theo IoU vì truth không bắt buộc box. Tách/gộp dòng có thể làm recall giảm dù CER nhỏ.
- Sai thầm lặng mức dòng = số dòng dự đoán chưa khớp trong LCS của các dòng có `conf >= threshold` / tổng dòng dự đoán. Ngưỡng mặc định 0.85, cấu hình bằng `--threshold`. Với dòng lặp, ưu tiên ghép bản có conf cao; một dòng truth chỉ ghép một lần. Không dùng `alternatives` làm đáp án thay thế. Thiếu dòng làm giảm recall/CER; không được bịa conf để tính sai thầm lặng.
- `struckReadAsContent`: số dòng gạch xóa bị chép như nội dung thường, mỗi dòng chỉ tính một lần. Đối chiếu box khi có cả hai box (giao ≥ 50% diện tích box nhỏ hơn); nếu thiếu box thì chỉ khớp nguyên văn dòng gạch còn đọc được, sau khi dành bản trùng cho dòng đang có hiệu lực. Bôi kín `text: null` không có chữ chuẩn để đoán: thiếu box cần thiết thì tăng `struckUnassessable`, không coi số 0 là đã đo được. `struckReferenceLines` giữ mẫu số gạch xóa. Chữ gạch bị chép thành nội dung vẫn là phần thêm trong CER/WER thông thường.

JSON có `byRegion` và Markdown có cột vùng `question` / `figure` / `table` / `solution`, cho từng lượt và từng nhóm nguồn ảnh. Để không làm mất lỗi khi reader không trả region, gán dự đoán vào vùng truth bằng căn chỉnh dòng theo thứ tự: thay dòng có chi phí CER chuẩn hóa, thêm/bớt dòng có chi phí 1, hòa ưu tiên thay dòng. Dòng chèn dùng region reader nếu có, nếu không dùng vùng truth lân cận; dòng chép từ vùng gạch xóa đã nhận diện dùng vùng của dòng gạch. Đây chỉ là chia nhóm để đo chữ, không sửa nội dung dự đoán và không phải điểm nhận dạng vùng. Mọi dự đoán đều vào một nhóm, kể cả dòng sai/thêm; reference thiếu ở mỗi vùng vẫn chịu CER/recall. Các phép đối chiếu này chỉ chạy **sau nhận dạng** trong bộ đánh giá, không dùng đáp án để chọn OCR.

Mẫu số rỗng cho rate/accuracy = `null` (N/A), vẫn giữ số lỗi thêm để kiểm toán. CER/WER có thể > 1 do chèn thêm chữ; độ đúng token chặn ở 0. Tổng hợp bằng tổng lỗi / tổng mẫu số, không trung bình phần trăm từng ảnh. JSON giữ từng tử/mẫu để kiểm tra. Báo cáo tách `printed`, `synthetic_handwriting`, `handwritten` thật và nhóm nét bút giả cũ; nghiêng/mờ là nhóm có thể chồng lấn.

Lô 2.11: đọc cấu trúc bằng D trên máy tính (không gọi adb):

```powershell
npm run eval:read -- --engine offline:figure-cv --glyph oracle --set synthetic-fig --split test
npm run eval:read -- --engine offline:figure-cv --glyph c --set synthetic-fig --split test
npm run eval:read -- --engine offline:figure-cv --glyph b --set synthetic-fig --split test --llama-server C:/path/llama-server.exe
```

Model phải có sẵn trong `.models/`; không tải thêm. B cần binary llama-server máy tính có sẵn. D dùng một lượt; `--passes 2` bị từ chối. Oracle chỉ giải mã crop chữ do CV tìm thấy, không đưa chú thích cấu trúc vào reader. Tên báo cáo chứa glyph/split để không ghi đè; `.json` giữ outcome/draft từng ảnh, topology và toàn bộ đồ thị được tách riêng. Thiếu câu hỏi không được coi là bằng chứng đã gắn cờ đủ lỗi đồ thị. Thời gian Node chỉ tham khảo. Chi tiết thuật toán và công thức confidence: `packages/reader-figure/README.md`.


### Chẩn đoán D sau review 2.11-r1 (chỉ dev)

```powershell
npm run eval:read -- --engine offline:figure-cv --glyph oracle --set synthetic-fig --split dev
npm run eval:read -- --engine offline:figure-cv --glyph oracle --geometry oracle --set synthetic-fig --split dev
```

D bắt buộc chọn split tường minh. CLI và API chỉ chấp nhận geometry oracle với glyph oracle và split dev. Subclass đo chỉ cấp tâm/bán kính đỉnh: bán kính từng trục lấy từ đường bao thật; chỉ nhãn dùng nửa kích thước labelBox. Mọi ellipse loại trừ dùng cùng kind ring, không cấp style truth cho reader. Không cấp vùng hình, nhãn cho khâu gán, polyline, cạnh hay trọng số; không sinh thêm đỉnh. Reader thật không có tùy chọn hình học oracle. Chế độ này cô lập lần cạnh với đỉnh thật, vẫn chịu ảnh hưởng của tìm vùng và tách chữ.

Báo cáo dev, checkpoint và quan sát từng ảnh nằm trong reports/.debug/, đã gitignore; không commit. Mẫu thất bại vẫn tính với quan sát rỗng. Có 196 ảnh đồ thị dev; 8 ảnh meta.hasFigure:false được đo riêng làm âm tính, không làm tăng tỉ lệ đồ thị đúng. Pack synthetic-fig cũng bỏ qua chúng.

- IoU: giao/hợp giữa box D và figure.json.box, trung bình theo ảnh. Không tìm thấy hình có IoU 0.
- Đỉnh: ghép một-một toàn cục theo khoảng cách tăng dần, tâm cách không quá bán kính truth + 10 pixel ảnh gốc, không dùng nhãn. Bán kính là khoảng cách lớn nhất từ tâm tới đường bao; chỉ nhãn dùng nửa cạnh dài labelBox. Giữ TP/predicted/truth để tính precision/recall/F1 micro. Strata open/double/dot/label-only lấy style truth của đỉnh đã ghép. Dự đoán thừa quy vào style của truth gần nhất cùng nhóm hình học (vòng/chấm/chỉ nhãn; không có nhóm tương ứng thì dùng open/dot/label-only). Đây là phân tầng lỗi phát hiện, không phải độ đúng phân loại style.
- Nhãn: số nhãn đúng sau normalizeLabel / số đỉnh ghép đúng; không lấy alternatives. Cổng này dùng glyph oracle với đỉnh D phát hiện, không dùng số của geometry oracle.
- Cạnh: đổi hai đầu qua phép ghép tâm, so multiset không hướng {u,v}. Đầu không ghép dùng id riêng nên luôn tính sai. Cạnh song song ghép một-một theo khoảng cách polyline tăng dần để đo thuộc tính, không chọn cặp theo trọng số đúng. Giữ TP/predicted/truth cho F1 micro; khuyên tính riêng. Đa cạnh: hợp các cặp không khuyên có bội số ít nhất 2 ở truth hoặc dự đoán; báo F1 và số nhóm đúng đủ bội số/tổng nhóm. Nhóm đa cạnh bịa vẫn tính sai.
- Giao cắt có/không chấm: F1 trên các ảnh có loại giao cắt tương ứng, gồm mọi cạnh của các ảnh đó; hai nhóm có thể chồng lấn.
- Trọng số/tên: số giá trị khớp / số cạnh ghép đúng hai đầu. null khớp null cũng đúng. Không dùng chú thích chữ để cấp vị trí/cạnh.

Oracle glyph chỉ khớp crop do CV đề xuất: IoU ít nhất 0,05 hoặc khoảng cách tâm không quá 0,75 chiều cao chữ truth; chiều cao crop không quá 2,5 lần và chiều rộng không quá 3 lần chữ truth. Chọn theo IoU + 0,3/(1 + khoảng cách/chiều cao truth); nếu ứng viên thứ hai đạt ít nhất 80% điểm cao nhất thì trả rỗng. Không khớp hộp nào cũng trả rỗng. Giới hạn kích thước ngăn nguyên một khuyên bị nhận là nhãn ở đầu khuyên; oracle không đề xuất crop hay hình học.

Chỉ khi F1 đỉnh đạt 95% (mỗi style 90%), gán nhãn 95%, F1 cạnh geometry oracle 95% (khuyên và đa cạnh 90%), toàn bộ đồ thị glyph oracle 80%, mới chạy test một lần cho oracle và C. Không đạt sau các thử nghiệm dev hợp lý thì báo khâu kẹt và dừng, không đánh giá lại test. JSON test trước review là dữ liệu lịch sử, không đại diện cho code sau sửa.

### Bài làm — parser văn xuôi Lô 3.2

```powershell
npm run eval:work -- --set work-text --lines truth --split dev --variant a --parser real
npm run eval:work -- --set work-text --lines truth --split dev --variant b --parser real
npm run eval:work -- --set work-text --lines truth --split test --variant a --parser real
npm run eval:work -- --set work-text --lines truth --split test --variant b --parser real
npm run eval:work -- --set synthetic-hw --lines truth --parser real
```

`--parser oracle|real` mặc định oracle để giữ phép kiểm bộ đo Lô 3.1. `--variant a|b|c|d` chỉ áp dụng work-text, không có thì đo mọi biến thể. Parser thật chỉ nhận chữ và vocabulary; truth chỉ dùng đối chiếu sau khi hiểu. `--lines device/engine` cấp chữ quan sát thật cho parser real, không thay bằng truth. Engine phải được đăng ký sẵn, không tải model.

Tên báo cáo real có hậu tố `-<variant>-real` (bỏ variant nếu không lọc), không đè báo cáo oracle. JSON giữ count/rate, nhóm cách viết, biến thể, unchecked/issues và dòng lỗi đầu; `proseOnly` đo riêng những bài truth không chứa năm loại claim thuật toán để dành cho Lô 3.3. Nhóm này vẫn có thể chứa cách viết chưa hiểu, không phải mẫu số đã lọc theo kết quả parser.

Từ Lô 3.4, parser real dùng `gradeWork`, nâng unchecked thành hỏi lại theo quy tắc 6 và giữ readingCheck cho mọi SAI. `summary/groups/variants` đo trước hỏi lại; `afterSummary/afterGroups/afterVariants` đo sau vòng trả lời bằng chữ truth của chính dòng được hỏi. Tính cả readingCheck vào số câu hỏi. Mỗi dòng được trả lời tối đa một lần; không dùng claim/expected để sửa bài, không tự bỏ qua khi truth vẫn chưa hiểu. CAN_XAC_NHAN còn lại được đếm riêng. `afterSummary.questionsMean/questionsMax` là tổng câu hỏi thực tế qua các vòng. Chỉ số tổng hợp không đủ để kết luận bật tự động trên ảnh thật.

Với work-text, các biến thể nhiễu dùng lines của biến thể a cùng coreFixture/family làm tham chiếu chữ khi phân loại (ii)/(iii); parser vẫn chỉ nhận lines của biến thể được chọn. JSON và danh sách sai thầm lặng giữ dòng lỗi dự đoán, dòng lỗi truth và unchecked (chỉ số 0-based), không ghi thêm chữ quan sát vào log.

Review 3.4-r1: mỗi vòng trả lời chạy lại parseWork toàn bài rồi gradeWork, lấy câu hỏi mới và readingCheck cho dòng chưa hỏi. Tổng câu hỏi và số dòng trả lời không vượt số dòng solution (không tính question/figure/gạch/skip); questionBoundViolations kiểm giới hạn này. contentAsProse tách lowConfidence/highConfidence theo conf dòng 0,85. silentWithHighConfidenceMisread/silentWithoutHighConfidenceMisread chia các bài sai thầm lặng còn lại theo có/không ít nhất một dòng solution đọc sai với conf dòng ≥ 0,85; dùng chữ còn lại sau sửa khi đo after, không tính dòng đã sửa đúng. Mục tiêu nhóm without = 0; nhóm with ghi số thực đo. Hai nhóm không thay đổi định nghĩa i/ii/iii.


Sửa review 3.2-r1: thêm 16 tổ hợp `dev-paraphrase*` (2 tiền tố × 2 từ đồng nghĩa × 2 từ nối × 2 thứ tự), mỗi tổ hợp có đủ nhiễu a–d; tổng work-text là 5.040 mẫu. Seed/noiseEngine của các họ cũ giữ nguyên, họ mới xếp sau test trong thứ tự cấp seed. Renderer dùng chung cho dev/test chỉ in nhãn đầu mút của walk, bỏ phần chữ edgeIds; `work.json` vẫn giữ các trường claim core. Vì bộ đo vẫn so claim đầy đủ, walk thiếu edgeIds trong phần chữ có thể làm precision/recall thấp dù dãy nhãn khớp; không đổi metric để bù việc này. Chỉ đo test sau khi chốt parser, không dùng các dòng test để sửa parser.

### Báo cáo đi/dừng Lô 3.6

`npm run eval:work -- --set synthetic-hw --lines engine offline:vietocr-onnx --parser real`
đăng ký adapter Node C, chỉ dùng model sẵn có `.models/c`, kiểm bytes/SHA-256,
đóng session sau đo; thiếu/sai model thì dừng, không tải. B dùng `--lines device
reports/.debug/device-vivo-app-b768-2026-11-17-40.json` (conf dòng khi thiếu charConf).

Sau khi đo work-text và work-text-tables với `--split test --lines truth --parser real`
(không lọc variant để đo đủ a–d), synthetic-hw truth/B/C, chạy
`node tools/eval/dist/work-report-cli.js YYYY-MM-DD`. Công cụ cần năm JSON nguồn cùng
ngày và `reports/.debug/work-gates-YYYY-MM-DD.json` ghi kết quả cổng kiểm tra; nó chỉ
đọc kết quả, không chạy lại OCR hay sinh corpus. Đầu ra gồm báo cáo tổng hợp
`reports/work-eval-YYYY-MM-DD.md` và `work-summary-3.6-YYYY-MM-DD.json` không chứa mẫu.
Phần sau marker `BEGIN AUTO-GENERATED PER-CASE DETAILS` dành cho reviewer; khi giữ
split test kín, chỉ đọc summary JSON, không mở phần từng bài.

JSON eval bổ sung `task`, `tasks/afterTasks`, `charConfidenceLines`, `audit/afterAudit`.
Audit chạy sau inference, so token số/nhãn và các dòng thiếu claim/unchecked; các cờ
chẩn đoán có thể chồng lấn, không được dùng để sửa chữ hoặc chọn claim. Eval chữ
không gọi detectStrikes. Review 3.6-r1: B/C dùng `work-alignment.ts` căn dòng đơn
điệu bằng DP edit distance (bỏ dấu/chữ thường/bỏ dấu câu), có gap hai phía,
1:N/N:1 tối đa 4 dòng và IoU box phụ khi cả hai có box. Không dùng claim/expected
hay conf để căn. Các fixture chữ vẫn giữ index nguồn đã biết.

Cùng ánh xạ dùng cho trả lời truth, nguồn claim/lỗi đầu, readingMismatch và audit.
readingMismatch phân biệt (ii)/(iii) theo chữ ở nhóm chứa dòng lỗi được báo,
đúng định nghĩa chỉ số; sai đọc ở dòng trước đó được giữ trong audit nguyên nhân.
OCR gộp nhận chữ truth nối; OCR thừa nhận skip; truth gạch nhận struck. OCR tách
nhận chữ truth một lần ở mảnh đầu, mảnh còn lại skip cùng lượt để không nhân claim.
Ánh xạ cố định trong vòng hỏi lại; dòng truth mất không được tự chèn vào inference.
Truth gạch rỗng có thể là gap nằm giữa một nhóm OCR gộp; không đưa dòng gap này
vào chữ trả lời hay nguồn claim. Điều này giữ phần claim khi OCR gộp văn xuôi với
nội dung ở hai phía của dòng gạch bị mất.
Audit giữ nhóm nguyên nhân a/b/c/d, dòng claim mất, sai conf cao và region; dòng
hình/đề lẫn được đếm riêng ở đầu vào và ở claim/unchecked. OCR chưa căn được
không mặc nhiên là chữ hình. Căn dòng vẫn là ước lượng cần kiểm trên ảnh thật.

## Lô 4.4: dựng B CPU Windows và đo layout, hoàn toàn cục bộ

Chỉ dùng nguồn b12388 sẵn có `.build-cache/llama.cpp` (commit
`1c2adc75f619d05efc5d49ce08eaaa96272ebfa2`), trọng số `.models/b`, MSVC và
CMake/Ninja đã cài. Thiếu thành phần thì dừng, không tải/cài. Máy đo ngày
2026-11-18 có MSVC 14.51 tại VS 18 Community và Android SDK CMake 4.0.2.
Lưu nội dung sau thành `.build-cache/build-llama-win.cmd` rồi chạy từ gốc repo:

```bat
@echo off
call "C:\Program Files\Microsoft Visual Studio\18\Community\VC\Auxiliary\Build\vcvars64.bat"
if errorlevel 1 exit /b %errorlevel%
set "PATH=%LOCALAPPDATA%\Android\Sdk\cmake\4.0.2\bin;%PATH%"
cmake -S .build-cache/llama.cpp -B .build-cache/llama-win -G Ninja -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DGGML_NATIVE=OFF -DGGML_OPENMP=OFF -DLLAMA_OPENSSL=OFF -DLLAMA_BUILD_TESTS=OFF -DLLAMA_BUILD_EXAMPLES=OFF -DLLAMA_BUILD_APP=OFF -DLLAMA_BUILD_UI=OFF -DLLAMA_USE_PREBUILT_UI=OFF -DLLAMA_CONNECT=OFF -DFETCHCONTENT_FULLY_DISCONNECTED=ON
if errorlevel 1 exit /b %errorlevel%
cmake --build .build-cache/llama-win --target llama-server --parallel 4
```

Trong PowerShell, các lệnh dài phải có timeout và log (đường dẫn batch dùng `\`):

```powershell
node tools/eval/run-bounded.mjs 900 reports/.debug/4.4-r1-llama-build.log cmd.exe /d /c .build-cache\build-llama-win.cmd
node tools/eval/run-bounded.mjs 180 reports/.debug/4.4-r1-build-ts.log cmd.exe /d /c npm run build
node tools/eval/run-bounded.mjs 3660 reports/.debug/4.4-r1-work-layout.log node tools/eval/dist/work-layout.js .build-cache/llama-win/bin/llama-server.exe
```

`run-bounded.mjs` ghi stdout/stderr, thời gian và exit code; timeout trên Windows
dừng cả cây tiến trình và trả mã 124. Binary đầu ra là
`.build-cache/llama-win/bin/llama-server.exe`. Không dùng binary Android.
Build này chỉ CPU, AVX2, không OpenMP, không UI tải sẵn hay HTTPS.

`work-layout` chạy tuần tự 40 trang synthetic-hw, B ở 768 px, 4 luồng,
1.536 token; mỗi request tối đa 180 s, mỗi lượt đọc tối đa 300 s, toàn bộ OCR
tối đa 60 phút. Một trang lỗi vẫn được ghi và tiếp tục trang sau. CLI lưu
`reports/.debug/mvp-batch-4.4-measurement.json` sau mỗi trang, kèm chữ/box quan sát,
phân bố region/regionConf, số trang cần khoanh, leakage trước/sau và ms từng trang.
Box dòng hợp lệ phải trong 0–1000, có chiều dương và diện tích dưới 80% trang;
box bị loại không tính vào tử số. Leakage dùng truth sau inference để căn dòng;
`before` đã loại dòng model gắn question/figure, `after` thêm lọc hình học.
Truth không điền tọa độ hay chữ vào OCR. `missing.misses` chứa 20 chẩn đoán
bỏ dòng oracle, gồm box dải, dòng đang che dải và nguyên nhân; không dùng để sửa parser.
Không chạy suy luận trong `npm test`, không dùng adb.

### Sửa review 4.4-r2: đo lại vùng và chạy lại riêng trang lỗi

Sau `npm run build`, chạy từ gốc repo (không tải/cài thêm):

```powershell
node tools/eval/run-bounded.mjs 120 reports/.debug/4.4-r2-region-review-verified.log node tools/eval/dist/work-layout.js --review-saved
node tools/eval/run-bounded.mjs 960 reports/.debug/4.4-r2-retries.log node tools/eval/retry-layout.mjs
```

`--review-saved` dùng lại đúng 37 trang thành công của phép đo r1, ghi
`reports/.debug/4.4-r2-region-review.json`. Khung gợi ý chỉ lấy bao các box hợp lệ
của dòng solution/table, cộng lề 24/1000 trang, chưa tự áp dụng khi chưa xác nhận.
Tách hai phép đo thành phần: xác nhận nguyên khung gợi ý từ OCR, và vùng người
dùng xác nhận mô phỏng bằng vùng lời giải tham chiếu synthetic-hw. Truth chỉ cấp
vùng cho nhánh mô phỏng này và căn dòng chấm số đo; không sửa chữ/box OCR, không
giả lập kết quả OCR crop. Đếm riêng 30 dòng cũ còn bị loại và tổng dòng bị loại
sau lọc; không coi các số này là kết quả chấm cuối của app. Trang thiếu box vẫn
phải đọc lại crop, rồi soát bắt buộc nếu crop còn thiếu box.

`retry-layout.mjs` chỉ chọn các trang có `error` trong phép đo r1; cùng model B,
768 px, 4 luồng, 1.536 token, request 180 s / lượt đọc 300 s. Ghi sau mỗi trang
vào `reports/.debug/4.4-r2-retries.json`, giữ `reason` và `finish_reason`; không
ghi đè phép đo 40 trang cũ và không tự retry thêm nếu lần chạy này vẫn lỗi.
