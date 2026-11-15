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

## Tính chỉ số từ file xuất của app

Lấy JSON qua đường dẫn app đã báo khi bấm Xuất kết quả (xem [README app](../../apps/mobile/README.md)). `--from-device` đọc định dạng version 1 do `exportReport()` tạo. Mặc định `both`: đánh giá các record graph và lines có trong file; không tự suy ra graph từ chữ hoặc ngược lại. Model, lượt đọc và cấu hình lấy từ file; không truyền `--engine`/`--passes` cùng `--from-device`. Hai lượt lines được báo riêng, không chọn lượt tốt hơn bằng truth.

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
