# Bộ ảnh đề thật

Giáo viên/người dùng cung cấp ảnh thật; repo chưa có ảnh thật. Không dùng ảnh tổng hợp để thay cho mẫu thật.

Mỗi đề là một thư mục có mã không chứa tên học sinh, ví dụ:

```text
testdata/images/de-001/
  1.jpg
  2.jpg           # nếu đề nhiều trang; đánh số liên tiếp từ 1
  truth.json
  lines.json      # bắt buộc khi đo đọc chữ, gồm đề và/hoặc bài làm
  meta.json
```

Nhận JPG/JPEG/PNG; có thể trộn định dạng giữa các trang. Ảnh được đọc theo số trang (1, 2, …, 10), xoay EXIF và giải mã RGBA tại máy. Có thể chứa đề, bài làm hoặc cả hai để đo chữ; `truth.json` vẫn là đề gốc gắn với bài làm đó. Chỉ đưa ảnh đã cho phép sử dụng vào repo; bỏ thông tin cá nhân. Mặc định giữ ảnh bài làm học sinh ngoài repo; không đưa ảnh thật vào commit khi chưa được cho phép rõ ràng.

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

## Gán nhãn chữ viết tay `lines.json`

Giáo viên chép lại **đúng chữ nhìn thấy**, không sửa số hay lập luận sai của học sinh theo lời giải. `lines.json` là mảng `{text, region, struck?, box?}` chuẩn NFC theo thứ tự trang và thứ tự đọc trên xuống dưới, trái sang phải:

```json
[
  {"text":"Tìm đường đi ngắn nhất từ A đến C.","region":"question"},
  {"text":"A","region":"figure"},
  {"text":"Chọn A B C","region":"table"},
  {"text":"A 0 7 ∞","region":"table"},
  {"text":"A → B → C","region":"solution"},
  {"text":"Đường đi có độ dài 9.","region":"solution"},
  {"text":"Nháp: 7","region":"solution","struck":true,"box":[70,315,270,360]},
  {"text":null,"region":"solution","struck":true,"box":[70,375,270,420]}
]
```

`region` chỉ nhận `question`, `figure`, `solution`, `table`. Mỗi hàng bảng là một dòng, ô trong hàng cách nhau bằng dấu cách; không ghi từng ô thành một dòng. Nhãn/trọng số rời trong hình ghi riêng, theo trên xuống dưới rồi trái sang phải.

Chữ đã gạch không còn là bài làm: tách thành **dòng riêng** với `struck: true`, không ghép vào dòng đang có hiệu lực. Gạch một nét còn đọc rõ thì chép nguyên văn chữ dưới nét gạch; bôi kín không đọc được thì dùng `text: null`, tuyệt đối không đoán chữ cũ. Null chỉ hợp lệ khi `struck: true`. Thêm `box: [x1,y1,x2,y2]` bao vùng gạch, theo pixel ảnh gốc đã xoay EXIF (trái < phải, trên < dưới). Với chữ xen giữa một dòng, tách phần đang có hiệu lực và phần gạch thành các mục riêng theo thứ tự đọc, rồi giữ cùng quy ước cho kết quả dự đoán khi đo.

`compareText` mặc định bỏ mọi reference `struck` khỏi CER/WER, số/nhãn và recall. `struckReadAsContent` đếm vùng gạch được chép như chữ bình thường; bôi kín cần box truth và box dự đoán để đo chỉ số này. Khi thiếu box thì ghi `struckUnassessable`, không gán chữ hoặc conf giả. Ngoài vùng gạch, chữ không thể gán nhãn chắc chắn thì chưa dùng trang đó để tính chỉ số. Có thể dùng `[]` cho trang thực sự không có chữ; không dùng để thay cho nhãn chưa làm.

Lưu UTF-8 NFC, không nhập dòng trống; `eval:validate` kiểm các điều kiện này nếu có `lines.json`. Khi chạy `--mode lines|both`, thiếu file này sẽ báo lỗi. Nhờ giáo viên thứ hai kiểm tra dấu tiếng Việt, chữ số, nhãn đỉnh, thứ tự và các chữ gạch xóa. Không lấy bản đọc tự động làm truth trước khi đối chiếu độc lập.

App v1 đo một ảnh mỗi id. Khi đóng gói bộ nhiều trang, tách từng trang ra id riêng và lặp truth đề; mỗi id có lines của đúng trang đó. Đo graph chỉ chọn ảnh chứa đủ thông tin đề và hình, không lấy riêng trang lời giải để kết luận chất lượng đọc đồ thị. Xem [đóng gói và nhập kết quả thiết bị](../../tools/eval/README.md).

Đánh giá thử pipeline: `npm run eval:read -- --engine fake --set real`. Reader `fake` dùng trực tiếp nhãn chuẩn, không đọc pixel; kết quả của nó không phải số đo OCR. Xem [hướng dẫn CLI](../../tools/eval/README.md).

## Gán nhãn bài làm `work.json` (Lô 3.1)

Mỗi thư mục bài làm có thêm `work.json`, giữ `truth.json` là đề đã xác nhận. Giáo viên chép **đúng điều học sinh viết**, gồm cả số và kết luận sai; không chép lời giải chuẩn thay thế. Mỗi claim có step liên tục từ 1, raw nối nguyên văn các dòng nguồn bằng `\n`. `lineOf` ánh xạ step (khóa chuỗi) sang chỉ số 0-based trong `lines.json`. Không ánh xạ dòng đề, hình, văn xuôi không có claim, hay dòng đã gạch. Một dòng có nhiều claim thì lặp chỉ số dòng trong các bước tương ứng.

Ví dụ với đề A—B trọng số 7 ở trên:

```json
[
  {"text":"Tìm đường ngắn nhất A đến B.","region":"question"},
  {"text":"A → B","region":"solution"},
  {"text":"Độ dài = 9.","region":"solution"},
  {"text":"Độ dài = 8.","region":"solution","struck":true},
  {"text":"Em đi qua cạnh AB.","region":"solution"}
]
```

`work.json` tương ứng:

```json
{
  "claims": [
    {"step":1,"raw":"A → B","type":"walk","kind":"path","vertices":["A","B"]},
    {"step":2,"raw":"Độ dài = 9.","type":"length","vertices":["A","B"],"value":9}
  ],
  "lineOf": {"1":[1],"2":[2]},
  "prose": [4],
  "expected": {"verdict":"SAI","firstErrorStep":2,"errorCode":"SAI_PHEP_TINH"}
}
```

`prose` ghi chỉ số các dòng `region: solution` đang có hiệu lực, không nằm trong `lineOf`, chỉ mô tả và không có nội dung cần chấm. Bắt buộc trong `synthetic-hw` và `work-text`; tùy chọn với ảnh `real`, khuyến khích giáo viên ghi đủ. Không ghi dòng gạch, đề, hình hoặc hàng bảng vào đây. Khi có trường này, validator kiểm đủ các dòng văn xuôi và dùng hàm kiểm dữ liệu trong tools/eval (không phải parser).

Nội dung cần chấm gồm: chữ số (trừ chỉ số trong nhãn như v1), `=`, từ hai nhãn nối bằng mũi tên/gạch, từ kết luận “vậy”, “KL”, “đáp số”, “đáp án”, phán đoán Đ/S hoặc “chọn” + mã phương án. Dòng đó chưa có claim thì cần gán nhãn tiếp, không đưa vào prose để bỏ qua. Ví dụ “Cập nhật nhãn D qua cạnh BD.”, “Em đi lần lượt qua cạnh AA rồi AB.”, “Ghép cặp: (A, B); (C, D).” là mô tả. Không sửa chữ học sinh để né điều kiện; bộ sinh tổng hợp có thể sửa câu mô tả và phải sinh lại ảnh/nhãn/hash đồng bộ.

Đỉnh trong claim tham chiếu **id**, không phải nhãn hiển thị. Khuyên có cùng hai đầu mút; `edge_list` giữ đủ số lần của cạnh song song, không cần thứ tự/chiều. Không suy thêm kết luận: viết “2 thành phần” chỉ tạo `component_count`, không tự tạo `connected`. Phép tính “1 + 3 = 2” giữ value 2. Hàng bảng Dijkstra gắn cả bước chọn và các nhãn có số vào cùng dòng; không tạo claim từ header, ô vô cực hay đỉnh đã khoanh. Tổng riêng người đưa thư có thể dùng `final_answer` theo core.

Khi nhiều trang, bổ sung `page` (0-based) và `index` (duy nhất, liên tục trên toàn bài) cho từng dòng. Có thể thêm conf 1 và alternatives rỗng khi lưu bản chuẩn dưới dạng `WorkLine[]`; đây là độ chắc của nhãn chuẩn, không phải confidence của OCR. WorkLine dùng box hệ 0–1000 của từng trang. Định dạng chữ cũ không có index/page vẫn được hỗ trợ cho một trang: CLI gắn page 0 và index theo mảng, chuyển box pixel sang 0–1000 dựa trên kích thước ảnh (mặc định bộ synthetic-hw 1000×1440). Với bôi kín vẫn dùng text null và struck true ở file nhãn; bộ chuyển đổi dùng chuỗi rỗng khi đưa vào API work. Không đặt bất kỳ claim nào trên dòng này.

Giáo viên thứ hai kiểm lại claim, thứ tự, dòng nguồn và nhãn chấm. Kiểm bằng:

```sh
npm run eval:validate -- real
npm run eval:validate -- synthetic-hw
```

Khi có `work.json`, validator kiểm dòng tham chiếu, không lấy dòng gạch/đề/hình, raw trùng nguyên văn, step liên tục và verdict/bước/mã lỗi trùng `grade(truth, claims)`. Nếu không có work.json thì dữ liệu đề cũ vẫn hợp lệ; synthetic-hw bắt buộc có nhãn bài làm. Khi cần đánh giá bài làm thật, mọi bài được chọn phải có work.json. Validator không thay thế việc giáo viên đối chiếu ảnh.
