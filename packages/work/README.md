# @mathtwin/work — Lô 3.2

TS thuần, ES2022, không dùng API Node. Xuất `vocabularyOf`, `parseWork`, `compareWork`, `claimKey` và các kiểu. Không thêm dependency.

`vocabularyOf` chỉ sao chép nhãn đỉnh, tên riêng cạnh (khử trùng, giữ thứ tự), loại bài, dạng câu hỏi, mã ý và chữ đề được truyền vào. Không trả id đỉnh, cạnh, trọng số hay đáp án. Parser chỉ nhận `WorkVocabulary`; toàn bộ `parse/**` và helper runtime không import runtime của core. Test kiểm cả import gián tiếp, re-export và cấm dynamic import.

`parseWork` hiểu các claim văn xuôi của Lô 3.2; chưa hỗ trợ Dijkstra, `nn_step`, `postman_duplicate`, bảng, nối qua trang, chọn alternatives, charConf, gradeWork hay phát hiện gạch từ ảnh. `candidates` chỉ chứa body đang dùng để giữ đúng kiểu API; không tạo lựa chọn khác. `conf` lấy min conf dòng nguồn; `opts.confThreshold` chưa tham gia xử lý ở lô này.

Chuẩn hóa NFC, chỉ số dưới, chữ hoa/thường của nhãn, mũi tên `→ -> - ⟶`, vô cực, dấu nhân `× *` và `x`/`.` giữa hai số có khoảng trắng; giữ nguyên dấu thập phân. Khi so từ khóa: bỏ dấu, hạ chữ thường; từ dài ít nhất 4 ký tự được sửa khoảng cách Levenshtein 1 nếu chỉ có một từ khóa phù hợp. Nhãn được bảo vệ trước bước này; không sửa số hay nhãn theo từ khóa. Nhãn đầu ra dùng đúng nhãn hiển thị trong vocabulary, không phải id nội bộ. Biên gọi core cần đổi label sang id; bộ eval làm việc đó bên ngoài parser, cả cho final_answer lồng nhau.

Tách chuỗi nhãn bằng từ vựng, không dựa vào cạnh tồn tại. Hai cách tách (kể cả `AB` và `A+B`) → không tạo claim ở dòng đó, `ambiguous_line` + `unparsed_line`, đưa vào unchecked. Phần chữ của corpus chỉ dùng nhãn đỉnh; không in hoặc dựng id cạnh nội bộ. Parser không ghép id cạnh từ cặp đầu mút.

Lọc dòng gạch, trống, vùng đề/hình trước khi hiểu câu. So đề gần đúng bằng khoảng cách Levenshtein ký tự sau bỏ dấu, chuẩn hóa khoảng trắng/dấu câu: độ tương đồng ≥ 92%, mỗi dòng dài ít nhất 20 ký tự; dòng ngắn chỉ bỏ nếu trùng hoàn toàn. Ý đúng/sai chép lại có tiền tố `a)`/`a.`/`a:` được bỏ; đáp án gọn Đ/S vẫn sinh statement. Vùng hình có chữ/số phát warning `figure_annotations`.

Chỉ nhãn trong câu mô tả không làm dòng thành unchecked. Dấu bằng, số ngoài chỉ số nhãn, dãy có mũi tên/gạch, từ kết luận, phán đoán Đ/S, chọn phương án là dấu hiệu cần chấm. Không hiểu thì unchecked + unparsed_line. Bảng được gắn vùng hoặc cụm ≥3 dòng chỉ có nhãn/số/∞/- bị đưa vào unchecked + table_unrecognized, không tạo claim.

Xử lý theo index; chỉ nối đường đi xuống dòng trong cùng trang khi dòng trước kết thúc mũi tên. Nhiều claim một dòng giữ thứ tự; một mệnh đề chưa hiểu vẫn đánh unchecked cho dòng dù có mệnh đề khác hiểu được. Khi tách nhãn mơ hồ/không biết thì không phát claim của cả nhóm dòng. `step` liên tục từ 1, `raw` giữ nguyên chữ, nối nguồn bằng newline; `lines` dùng index gốc, `page` từ dòng đầu, box là hợp các box nếu mọi dòng nguồn có box. Không bịa tọa độ khi thiếu box. Tiêu đề riêng quyết định kind và được đánh prose; dòng claim giữ nguồn chứa dãy. Không có tiêu đề: theo loại task; riêng Euler/Hamilton dùng đường khép kín ghi trực tiếp để phân biệt circuit/cycle với path. Vocabulary không có task.want. `length` chỉ dùng walk gần nhất đã đọc, không lấy đường đi từ spec hay truth.

`final_answer` chỉ từ tiền tố “Đáp số”, “KL”, “Vậy”, “Vậy kết quả là”, “Kết luận”. Không đọc JSON. Nhận số được viết cuối, boolean tiếng Việt và đường đi bằng nhãn/mũi tên, kể cả ngoặc tập hợp. Kết luận đếm/liệt kê đỉnh, bậc đỉnh, liên thông hoặc tồn tại được chuyển sang cấu trúc đáp án tương ứng, chỉ chứa trường đã viết:

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

`parse/slots.ts` dùng từ điển cụm danh từ và chọn cụm dài nhất khi chồng lấn; chỉ nhận một chủ đề độc lập. Khe số nhận số sau dấu `=` cuối cùng nếu vế phải chỉ là số, hoặc một số ở trước/sau chủ đề qua từ đệm ngữ pháp. Không tính lại biểu thức; vế trước dấu `=` cuối được phép chứa chữ (ví dụ “2 × số cạnh”). Giữ số sai của học sinh. Phủ định, nghi vấn và nhiều giá trị không được bỏ qua. Khe nhãn dùng từ vựng và ký hiệu tập hợp thông thường; các mô tả tìm đường không được biến thành dãy nhãn. Cấu trúc chia một tập thành các nhóm phân biệt đối tượng được chia với chủ đề số nhóm.

Gán trần “A = 0” không tự coi là bậc (cần “Bậc:” hoặc deg/d). Dãy dở chỉ nối vào dòng dãy nhãn tiếp theo, không nuốt claim độc lập. Guard phán đoán Đ/S giữ phân biệt từ “dùng”; guard thuật toán phân biệt “nhãn” với động từ “nhận thấy/nhận xét”. Không áp sửa lệch ký tự cho từ trong câu mô tả khi xác định dấu hiệu cần chấm.
