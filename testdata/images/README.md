# Bộ ảnh đề thật

Giáo viên/người dùng cung cấp ảnh thật; repo chưa có ảnh thật. Không dùng ảnh tổng hợp để thay cho mẫu thật.

Mỗi đề là một thư mục có mã không chứa tên học sinh, ví dụ:

```text
testdata/images/de-001/
  1.jpg
  2.jpg           # nếu đề nhiều trang; đánh số liên tiếp từ 1
  truth.json
  meta.json
```

Nhận JPG/JPEG/PNG; có thể trộn định dạng giữa các trang. Ảnh được đọc theo số trang (1, 2, …, 10), xoay EXIF và giải mã RGBA tại máy. Không đặt ảnh bài làm vào bộ này. Chỉ đưa ảnh đã cho phép sử dụng vào repo; bỏ thông tin cá nhân.

## Gán nhãn chuẩn

1. Đọc toàn bộ đề và hình, tự nhập `truth.json` dưới dạng `ProblemSpec` của `packages/core` (xem `testdata/core/*/spec.json`). Không lấy kết quả reader làm nhãn chuẩn mà chưa kiểm tra.
2. Ghi đủ `vertices: [{id,label}]`; mỗi nét cạnh là một phần tử có `id` riêng. Khuyên có `u === v`; cạnh song song vẫn phải ghi từng cạnh. Đầu mút tham chiếu `id` của đỉnh.
3. Chép đúng trọng số vào `w`, tên cạnh vào `name`; cạnh không có trọng số thì bỏ trường `w`, không tự đặt 1. Không nhập đáp án/bậc đã tính vào đồ thị.
4. Chép đúng yêu cầu vào `task` và `questionFormat`. Với trắc nghiệm/đúng-sai, giữ đủ bốn ý trong `task.items`, mỗi ý có `id`, `text`, `check`. Giá trị trong `check` là phát biểu của đề, có thể đúng hoặc sai; không sửa thành đáp án đúng.
5. `truth.json` không có trường `uncertain` (kể cả mảng rỗng). Ảnh không thể gán nhãn chắc chắn thì chưa đưa vào tập đánh giá; ghi lại để xin đề gốc rõ hơn.
6. Giáo viên thứ hai đối chiếu hình và nhãn: đếm cạnh kể cả khuyên/cạnh lặp, kiểm tên cạnh/trọng số và từng ý hỏi. Kiểm tra schema chỉ phát hiện dữ liệu không hợp lệ, không chứng minh nhãn đúng với ảnh.

Ví dụ `truth.json`:

```json
{
  "graph": {
    "directed": false,
    "vertices": [{"id":"A","label":"A"},{"id":"B","label":"B"}],
    "edges": [{"id":"e1","u":"A","v":"B","w":7,"name":"a"}]
  },
  "task": {"type":"shortest_path","from":"A","to":"B"},
  "questionFormat": "tu_luan"
}
```

`meta.json` bắt buộc:

```json
{
  "source": "printed",
  "capture": "straight",
  "blurred": false,
  "questionFormat": "tu_luan",
  "synthetic": false,
  "notes": "Đề in, chụp đủ trang; nhãn đã được đối chiếu độc lập."
}
```

`source`: `printed` (in) / `handwritten` (vẽ tay); `capture`: `straight` / `tilted`; `blurred`: có mờ hay không. Nếu nhiều trang, ghi điều kiện khó nhất của đề trong metadata và mô tả chi tiết ở `notes`. `questionFormat` phải khớp `truth.json`: `tu_luan`, `trac_nghiem`, `dung_sai`, `tra_loi_ngan`. Nhóm in/vẽ tay có thể chồng với nghiêng/mờ.

## Kiểm nhãn

```sh
npm install
npm run eval:validate -- real
npm run eval:validate -- synthetic
```

Lệnh gọi `validateSpec(truth).ok` của core cho từng nhãn, kiểm không có `uncertain`, metadata và thứ tự trang. Trả mã lỗi nếu bất kỳ nhãn nào không hợp lệ. Bộ thật rỗng được báo `0 đề`; chạy đánh giá bộ rỗng sẽ thất bại, không tạo kết quả độ chính xác giả.

Đánh giá thử pipeline: `npm run eval:read -- --engine fake --set real`. Reader `fake` dùng trực tiếp nhãn chuẩn, không đọc pixel; kết quả của nó không phải số đo OCR. Xem [hướng dẫn CLI](../../tools/eval/README.md).
