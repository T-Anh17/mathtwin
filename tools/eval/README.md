# Đánh giá đọc ảnh — Lô 2.2

Yêu cầu Node ≥ 22.12; cài bằng `npm install` ở repo gốc. `sharp` chỉ nằm trong workspace công cụ Node; `@types/node` chỉ phục vụ kiểm tra kiểu. Không thêm runtime OCR/model, không gọi dịch vụ mạng khi chạy.

```sh
npm run eval:generate
npm run eval:read -- --engine fake [--passes 1|2] [--set synthetic|real] [--limit n]
npm run eval:validate -- synthetic
```

Mặc định hai lượt, bộ tổng hợp và toàn bộ mẫu. Lô này chỉ có engine `fake`: chuyển nhãn chuẩn thành hai draft độc lập về object nhưng nội dung giống nhau. Không phân tích pixel; `conf = 1` là giá trị cố định của fixture, không phải độ tin cậy OCR đo được. Hai lượt không phải hai phương pháp nhận dạng. Chỉ dùng để kiểm tra chuẩn bị ảnh → `readProblem` → `compareRead` → báo cáo. Không dùng kết quả để quyết định bật đọc ảnh.

Engine khác bị từ chối trước khi đọc dữ liệu, kể cả có `--confirm`. Không có model hay lệnh tải ở lô này. CLI luôn thông báo dung lượng tải model là 0 byte; không cần `--confirm` cho reader giả. Các adapter thật và luồng tải model chỉ được bổ sung sau duyệt Lô 2.3/2.4.

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

Chưa có ảnh thật trong repo; xem [quy trình giáo viên gán nhãn](../../testdata/images/README.md). Lô này chưa có báo cáo so sánh engine hoặc đề xuất bật đọc ảnh (thuộc Lô 2.5).
