# @mathtwin/work — Lô 3.3

TS thuần, ES2022, không dùng API Node. Xuất `vocabularyOf`, `parseWork`, `compareWork`, `claimKey` và các kiểu. Không thêm dependency.

`vocabularyOf` chỉ sao chép nhãn đỉnh, tên riêng cạnh (khử trùng, giữ thứ tự), loại bài, dạng câu hỏi, mã ý và chữ đề được truyền vào. Không trả id đỉnh, cạnh, trọng số hay đáp án. Parser chỉ nhận `WorkVocabulary`; toàn bộ `parse/**` và helper runtime không import runtime của core. Test kiểm cả import gián tiếp, re-export và cấm dynamic import.

Chuẩn hóa NFC, chỉ số dưới, chữ hoa/thường của nhãn, mũi tên `→ -> - ⟶`, vô cực, dấu nhân `× *` và `x`/`.` giữa hai số có khoảng trắng; giữ nguyên dấu thập phân. Khi so từ khóa: bỏ dấu, hạ chữ thường; từ dài ít nhất 4 ký tự được sửa khoảng cách Levenshtein 1 nếu chỉ có một từ khóa phù hợp. Nhãn được bảo vệ trước bước này; không sửa số hay nhãn theo từ khóa. Nhãn đầu ra dùng đúng nhãn hiển thị trong vocabulary, không phải id nội bộ. Biên gọi core cần đổi label sang id; bộ eval làm việc đó bên ngoài parser, cả cho final_answer lồng nhau.

Tách chuỗi nhãn bằng từ vựng, không dựa vào cạnh tồn tại. Hai cách tách (kể cả `AB` và `A+B`) → không tạo claim ở dòng đó, `ambiguous_line` + `unparsed_line`, đưa vào unchecked. Phần chữ của corpus chỉ dùng nhãn đỉnh; không in hoặc dựng id cạnh nội bộ. Parser không ghép id cạnh từ cặp đầu mút.

Lọc dòng gạch, trống, vùng đề/hình trước khi hiểu câu. So đề gần đúng bằng khoảng cách Levenshtein ký tự sau bỏ dấu, chuẩn hóa khoảng trắng/dấu câu: độ tương đồng ≥ 92%, mỗi dòng dài ít nhất 20 ký tự; dòng ngắn chỉ bỏ nếu trùng hoàn toàn. Ý đúng/sai chép lại có tiền tố `a)`/`a.`/`a:` được bỏ; đáp án gọn Đ/S vẫn sinh statement. Vùng hình có chữ/số phát warning `figure_annotations`.

Chỉ nhãn trong câu mô tả không làm dòng thành unchecked. Dấu bằng, số ngoài chỉ số nhãn, dãy có mũi tên/gạch, từ kết luận, phán đoán Đ/S, chọn phương án và động từ thao tác thuật toán có nhãn theo sau là dấu hiệu cần chấm. Không hiểu thì unchecked + unparsed_line.

`final_answer` chỉ từ tiền tố “Đáp số”, “KL”, “Vậy”, “Vậy kết quả là”, “Kết luận”, “Kết quả”, “Kết quả cuối cùng”. Không đọc JSON. Nhận số được viết cuối, boolean tiếng Việt và đường đi bằng nhãn/mũi tên, kể cả ngoặc tập hợp. Kết luận đếm/liệt kê đỉnh, bậc đỉnh, liên thông hoặc tồn tại được chuyển sang cấu trúc đáp án tương ứng, chỉ chứa trường đã viết:

| Task | Giá trị final_answer |
| --- | --- |
| elements | `{vertexCount}`, `{edgeCount}`, `{vertices}` từ câu đếm/liệt kê |
| degree | Số hoặc `{degrees}` từ câu bậc đỉnh |
| degree_sequence, connectivity | Boolean |
| path, euler, hamilton | Boolean hoặc `{walk: {vertices}}` |
| shortest_path, tsp, postman | Số hoặc `{walk: {vertices}}` |
| statements | Dùng claim statement/choice |

Không điền độ dài, đường đi hay đáp số từ lời giải chuẩn. Dạng chưa hiểu vào unchecked khi có dấu hiệu cần chấm.

`WorkTruth.prose` là danh sách dòng mô tả, bắt buộc cho corpus sinh tự động, tùy chọn cho real. `WorkLine.charConf` là kiểu tùy chọn sẵn từ Lô 3.1; parser lô này không dùng. Trường tùy chọn `WorkTruth.lines` giúp phân biệt lỗi đọc và dòng gạch; thiếu thì `readingMismatch` có thể null.

`compareWork` bỏ metadata step/raw/conf/box, chuẩn hóa thứ tự khóa, danh sách đỉnh/đỉnh lẻ và multiset cặp đầu mút vô hướng; không khử trùng danh sách. Giữ thứ tự walk và thứ tự claim. Ghép bằng LCS; hòa thì bỏ claim dự đoán trước. Đúng dòng đòi đúng toàn bộ tập dòng nguồn của claim đã ghép. Không có claim hai phía thì precision/recall/đúng dòng = 1; chỉ một phía rỗng thì precision/recall = 0.

`CAN_XAC_NHAN` có verdictCorrect null, đếm riêng. Lỗi đầu đúng cần giao dòng nguồn và trùng mã lỗi. Ba loại sai thầm lặng là false correct (i), hiểu sai (ii), đọc sai (iii); thiếu bằng chứng chữ được xếp bảo thủ vào (ii). Prose unchecked khử trùng chỉ số; struckAsContent đếm bước. Chưa mô phỏng hỏi lại (Lô 3.4).

Parser tách mệnh đề ngoài ngoặc theo `.`, `;` và liên từ `và`, `nên`, `vì`, `do đó`, `⇒`; giữ dấu thập phân và dấu phẩy trong danh sách. Liên từ chỉ tách sau nội dung có thể chấm, tránh gán chung một giá trị cho hai chủ đề chưa hoàn chỉnh.

`parse/slots.ts` dùng từ điển cụm danh từ và chọn cụm dài nhất khi chồng lấn; chỉ nhận một chủ đề độc lập. Khe số nhận đúng một số sau chủ đề hoặc sau dấu `=` cuối cùng, bỏ qua chữ nối; thứ tự đảo vẫn cần từ đệm ngữ pháp và không có hai giá trị cạnh tranh. Không tính lại biểu thức; vế trước dấu `=` cuối được phép chứa chữ (ví dụ “2 × số cạnh”). Giữ số sai của học sinh. Phủ định, nghi vấn và nhiều giá trị không được bỏ qua. Khe nhãn dùng từ vựng và ký hiệu tập hợp thông thường; các mô tả tìm đường không được biến thành dãy nhãn. Cấu trúc chia một tập thành các nhóm phân biệt đối tượng được chia với chủ đề số nhóm.

Gán trần “A = 0” không tự coi là bậc (cần “Bậc:” hoặc deg/d). Dãy dở chỉ nối vào dòng dãy nhãn tiếp theo, không nuốt claim độc lập. Guard phán đoán Đ/S giữ phân biệt từ “dùng”; guard thuật toán phân biệt “nhãn” với động từ “nhận thấy/nhận xét”. Không áp sửa lệch ký tự cho từ trong câu mô tả khi xác định dấu hiệu cần chấm.

## Bổ sung Lô 3.3

Đã hỗ trợ `dijkstra_init`, `dijkstra_select`, `dijkstra_label`, `nn_step`, `postman_duplicate` và bảng Dijkstra. Parser vẫn chỉ nhận `WorkVocabulary`, không import runtime solver/grade. Không chọn alternatives, tính charConf hay triển khai gradeWork ở lô này.

Bảng được nhận qua `region: table` hoặc cụm ít nhất ba dòng dạng bảng. Ghép các box chồng dọc thành hàng, sắp cột theo x tiêu đề; không có box thì theo token. Nhận tiêu đề Bước/Chọn/Đỉnh chọn hoặc chỉ nhãn; số thường, ∞, cặp số-predecessor, dạng slash/compact, dấu `*`/`✓`, dấu `-` và ô trống. Mỗi hàng phát chọn trước, rồi mọi nhãn hữu hạn chưa khoanh, kể cả nhãn cũ. Không phát nhãn cho ô vô cực. Dấu chọn hoặc cột đầu là bằng chứng trực tiếp; chỉ suy chọn khi đúng một cột chuyển thành `-`/trống ở hàng sau. Không chọn theo nhãn nhỏ nhất. Bước suy có `origin: inferred`, conf tối đa `confThreshold - 0.01` (mặc định 0.84). Không dựng chắc cả bảng thì toàn bảng vào unchecked và warning table_unrecognized.

Thứ tự xử lý là page rồi index. Nối dãy kết thúc mũi tên và phép tính kết thúc toán tử sang dòng kế tiếp, kể cả trang kế tiếp; không nối qua số trang bị thiếu hoặc nuốt claim độc lập. Một bước qua trang giữ mọi index nguồn, page đầu và box hợp chỉ trên page đầu. Trang trống, trang thiếu hoặc toàn đề phát warning page_order. Trang không có phần tử WorkLine chỉ phát hiện được khi có số trang tiếp sau.

Sửa review 3.3-r1: thao tác chọn dùng khe động từ + đỉnh/điểm tùy chọn + một nhãn; nhãn Dijkstra nhận chủ đề độc lập với tiền tố, số được viết và `via` qua/đi qua/từ (kể cả sau dấu phẩy). Không sửa phép tính. Độ dài lấy walk gần nhất; khi không có walk, chỉ dòng cần chấm cuối cùng của shortest_path/tsp/postman mới thành final_answer. Các trường hợp khác giữ unchecked.
