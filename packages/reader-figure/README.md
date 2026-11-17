# Ứng viên D — reader-figure (Lô 2.11)

Engine `offline:figure-cv`, TypeScript thuần, không dependency mới hay API Node. CV dùng cùng mã trên Node/WebView; host cung cấp `GlyphReader`. Không tích hợp app hoặc lượt kiểm chéo D/B trong lô này.

```ts
const reader = new FigureReader({ glyphReader: new VietOcrGlyphReader(ocr) });
const result = await reader.read([rgbaImage], 'edges', signal);
```

`rgbaImage` là `PreparedImage`. `figureBox` tùy chọn dùng pixel ảnh gốc, cạnh phải/dưới exclusive. Không có box thì tự tìm vùng: lấy thành phần có nét dài, mở rộng tới các thành phần lân cận, bỏ vùng chữ rời bên ngoài. `question` tùy chọn do người dùng/reader khác cung cấp; mặc định `null`, không lấy câu hỏi từ truth. Lượt `neighbors` chạy lại cùng CV xác định; không coi đó là kiểm chéo độc lập, CLI luôn dùng một lượt.

Pipeline:

1. Co cạnh dài tối đa 1000 px; alpha ghép trên nền trắng. Luminance Rec.709; chia nền trung bình cửa sổ 91 px, rồi Sauvola cửa sổ 31 px, k=0,22, R=128.
2. Lọc đường kẻ: projection ở góc −8..8°, bước 2°; cần ít nhất bốn đường dài ≥48% chiều ảnh, có khoảng cách lặp lại. Chỉ xóa phần nhạt hơn mức mực phân vị 15% ít nhất 35 mức xám, giữ mực đậm ở giao điểm.
3. Zhang–Suen skeleton. Đỉnh vòng: Hough bán kính 8..25 px, lưới tâm 3 px; fit ellipse tỉ số trục 0,8/1/1,2 và tâm lân cận. Cần ≥60% mẫu góc có nét tiếp tuyến phù hợp; chuỗi góc liên tục ≥55%, cho phép khuyết một mẫu. Chấm nối nét cần ít nhất 27/29 pixel của đĩa bán kính 3 có mực; ưu tiên tâm có độ đặc cao. Sau ghép nhãn toàn cục, chấm không có nhãn phải có nhánh kết thúc cả trước và sau tách chữ. Ghép cặp nhánh quanh chấm bằng tối đa số cặp rồi tối thiểu lỗi góc, lệch đường thẳng ≤30°. Điểm chỉ có nhánh đi xuyên không thành đỉnh. Vòng nhỏ ≤1,3 chiều cao chữ trung vị, không glyph trong và không nhánh dài, được trả về nhận chữ.
4. Thành phần nhỏ/đặc là ứng viên chữ. Directional opening lấy 17 mẫu trên nét dài ở 12 hướng, cho sai lệch ngang một pixel, cần 15 mẫu có mực. Giữ cả ứng viên tách nét và thành phần gốc, ghép các ký tự cạnh nhau (`v1`, số hai chữ số). Chỉ glyph nhận đủ chắc mới được xóa khỏi skeleton; đầu nét không tính từ mask xóa tất cả ứng viên. Crop nội tiếp marker và crop ở đầu mút mực thật phục hồi nhãn dính nét. Nhãn chỉ nhãn cần đầu nét trong 2 lần chiều cao chữ, kiểm cặp nhánh đi ngang qua và đầu mút trước tách; trường hợp cô lập, không có nét dài gần đó vẫn được giữ để hỗ trợ đỉnh cô lập.
5. Xóa ellipse đỉnh với margin 3, co skeleton thành các đoạn độc lập. Điểm chạm biên (margin đến 5) cũng là nút, kể cả bậc 2, tránh biến hai cạnh song song thành khuyên. Junction nhiều pixel được co cục bộ; ghép toàn cục tối đa số cặp nhánh, rồi tối thiểu lỗi góc, dùng tiếp tuyến tám pixel (cho lệch tối đa 60° ở junction cong). Đoạn ngắn ≤20 bước sát đỉnh có thể nhập biên để giữ mọi nhánh ra. Nối khe ≤5 px theo tiếp tuyến; khe lớn hơn chỉ qua crop chữ đã nhận, tối đa 24 px. Đầu hở cách biên ellipse ≤20 px được nối và giảm confidence. Mỗi tập id đoạn skeleton là một đường; chỉ bỏ đường đảo chiều đi qua đúng các đoạn đó, không hợp nhất theo cặp đầu mút hoặc tỉ lệ pixel chồng lấn. Khuyên có hai đầu cùng đỉnh được giữ cả khi tiếp điểm sát nhau; bỏ mảnh vòng nếu độ dài <max(24,1,2πr) hoặc không vươn khỏi r+12 px.
6. Ghép nhãn–đỉnh một-một toàn cục theo khoảng cách tăng dần, tìm trong max(0,d−radius)/height ≤2,5. Chi phí chấm có nhánh chỉ đi xuyên cộng 0,75 để tránh chiếm nhãn của đỉnh khác; vẫn xét cạnh tranh toàn cục và giữ nhãn duy nhất sau chuẩn hóa. Crop nội tiếp dùng 0,65 bán kính vòng, 1 với chấm có đầu nét. Vòng không có nhãn trong nhưng chứa số/tên đủ chắc chỉ được loại làm annotation khi nằm gần nét dài và không có nét kết thúc ở vòng. Gán trọng số/tên theo khoảng cách polyline. Hai khoảng cách gần bằng nhau (`d1/d2 ≥0,8; 0/0 :=1`) giữ cả hai gán, giảm confidence để sinh cờ cạnh/đầu mút.

Confidence (không phải xác suất đã hiệu chuẩn):

- Vòng: `coverage × (0,75 + 0,25 × fit)`, `fit = 1 − mean_radial_residual/3`, mỗi đại lượng trong [0,1]. Chấm: 0,9 khi qua kiểm độ đặc. Nhãn đứng riêng: 0,8 khi gần đầu mút, 0,65 khi cô lập.
- Đỉnh: điểm hình học × xác suất glyph × điểm gán `1/(1+cost)/số_đỉnh_ứng_viên`, cost là khoảng cách chuẩn hóa bằng chiều cao chữ, cộng 0,75 với chấm chỉ có nhánh đi xuyên.
- Lần nét: `max(0,1 − tổng_chiều_dài_khe/số_điểm_đường)`; gán đầu `1/(1+gap/20)` theo khoảng cách tới ellipse. Cạnh là tích ba điểm.
- Trọng số: xác suất glyph × `1/(1+d/45)` / số ứng viên cạnh. Nhiều trọng số trên cùng cạnh giữ `wAlternatives`; nhiều cạnh ứng viên cùng giữ đọc này và cờ cạnh.
- Glyph dưới 0,85 hoặc ngoài từ vựng: trọng số `null`, nhãn `unreadableN`, không đoán. `normalizeDraft` tạo `missing_weight` blocking khi question cần trọng số. Không có ứng viên tên cạnh thì để `name: null`.

Các glyph adapter cài sẵn:

- `OracleGlyphReader`: chỉ đo, nhận danh sách `{box,text,role}` từ `figure.json`. Chỉ trả glyph khi crop CV đề xuất khớp đúng một chú thích; không tạo crop, không cung cấp tâm/vòng/cạnh/truth cho CV. Xác suất 1 là oracle chữ, không phải confidence hình học.
- `VietOcrGlyphReader`: host `VietOcrReader.readCrop` (ORT Node hoặc WebView) chạy encoder/decoder trên một dòng, bỏ detector. Top-k gồm greedy và thay một ký tự từ phân phối thật, confidence min xác suất ký tự; chuỗi bị cắt có điểm 0.
- `LlamaGlyphReader`: host `LlamaCppReader.readCrop`, prompt theo vai trò, schema **một JSON string**. Top-k và confidence dùng logprobs trước sampling/grammar; thiếu logprobs báo lỗi. Server do adapter Node quản lý, bind loopback, offline. CLI `--llama-server` phải trỏ binary máy tính có sẵn; không tải gì.

Từ vựng được lọc trước khi chấp nhận: nhãn một chữ cái hoặc `v`+số (kể cả chỉ số dưới); trọng số nguyên dương; tên `a/b/m`. Các phân phối gốc của C không bị đổi thành confidence 1 khi lọc theo vai trò.

Đo:

```powershell
npm run eval:read -- --engine offline:figure-cv --glyph oracle --set synthetic-fig --split dev
npm run eval:read -- --engine offline:figure-cv --glyph oracle --geometry oracle --set synthetic-fig --split dev
# Chỉ chạy test khi đạt toàn bộ mốc dev trong review 2.11-r1.
npm run eval:read -- --engine offline:figure-cv --glyph oracle --set synthetic-fig --split test
npm run eval:read -- --engine offline:figure-cv --glyph c --set synthetic-fig --split test
npm run eval:read -- --engine offline:figure-cv --glyph b --set synthetic-fig --split test --llama-server C:/path/llama-server.exe
```

C chỉ được dùng để đo theo tình trạng giấy phép trọng số trong manifest. Test không model, không mạng. Tập `dev`/ảnh unit test dùng phát triển; `test` chỉ báo cáo, không chỉnh ngưỡng theo kết quả. Báo cáo có topology (nhãn + multiset đầu mút, bỏ w/name), toàn bộ đồ thị, nhóm biến thể, toàn bộ draft/outcome để kiểm lại; checkpoint giữ từng ảnh cho đến khi ghi xong báo cáo. Độ trễ máy tính chỉ tham khảo; không gọi adb/đo điện thoại.

Giới hạn: các ngưỡng hình học cố định theo kích thước ảnh chuẩn; ellipse là fit lưới cục bộ, chưa xử lý biến dạng tùy ý. Nét chữ chồng hoàn toàn lên cạnh, khuyên nhỏ giống chữ O, chấm giao cắt giống đỉnh và vùng trang quá dày chữ có thể nhầm. Số đo tổng hợp không chứng minh chất lượng ảnh thật; xem báo cáo Lô 2.11 trước khi quyết định bước tiếp.

Chẩn đoán hình học oracle nằm riêng trong tools/eval/src/figure-diagnostics.ts: chỉ subclass dùng bởi bộ đo dev cấp tâm/bán kính từ chú thích thật; mọi ellipse dùng cùng kind ring, không cấp style truth cho reader, không cấp cạnh/polyline hay vùng hình. FigureOptions không có tùy chọn geometry oracle. CLI và API từ chối chế độ này trên test hoặc khi glyph khác oracle. Quan sát các khâu dùng tọa độ pixel ảnh gốc; quy tắc/mẫu số và quy tắc khớp oracle glyph xem tools/eval/README.md. Mọi file dev/checkpoint nằm trong reports/.debug/ (gitignore).
