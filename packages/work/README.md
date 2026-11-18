# @mathtwin/work — Lô 3.5

TS thuần, ES2022, không dùng API Node. Xuất `vocabularyOf`, `parseWork`, `gradeWork`, `applyWorkAnswers`, `compareWork`, `claimKey`, `detectStrikes`, `readWork`, `STRIKE_NO`, `STRIKE_YES` và các kiểu. Không thêm dependency.

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

`WorkTruth.prose` là danh sách dòng mô tả, bắt buộc cho corpus sinh tự động, tùy chọn cho real. `TextLine.charConf` tùy chọn được kế thừa qua `WorkLine`. Trường tùy chọn `WorkTruth.lines` giúp phân biệt lỗi đọc và dòng gạch; thiếu thì `readingMismatch` có thể null.

`compareWork` bỏ metadata step/raw/conf/box, chuẩn hóa thứ tự khóa, danh sách đỉnh/đỉnh lẻ và multiset cặp đầu mút vô hướng; không khử trùng danh sách. Giữ thứ tự walk và thứ tự claim. Ghép bằng LCS; hòa thì bỏ claim dự đoán trước. Đúng dòng đòi đúng toàn bộ tập dòng nguồn của claim đã ghép. Không có claim hai phía thì precision/recall/đúng dòng = 1; chỉ một phía rỗng thì precision/recall = 0.

`CAN_XAC_NHAN` có verdictCorrect null, đếm riêng. Lỗi đầu đúng cần giao dòng nguồn và trùng mã lỗi. Ba loại sai thầm lặng là false correct (i), hiểu sai (ii), đọc sai (iii); thiếu bằng chứng chữ được xếp bảo thủ vào (ii). Prose unchecked khử trùng chỉ số; struckAsContent đếm bước. `questions` tính cả `readingCheck` vì đây cũng là một lần người dùng phải soát chữ.

Parser tách mệnh đề ngoài ngoặc theo `.`, `;` và liên từ `và`, `nên`, `vì`, `do đó`, `⇒`; giữ dấu thập phân và dấu phẩy trong danh sách. Liên từ chỉ tách sau nội dung có thể chấm, tránh gán chung một giá trị cho hai chủ đề chưa hoàn chỉnh.

`parse/slots.ts` dùng từ điển cụm danh từ và chọn cụm dài nhất khi chồng lấn; chỉ nhận một chủ đề độc lập. Khe số nhận đúng một số sau chủ đề hoặc sau dấu `=` cuối cùng, bỏ qua chữ nối; thứ tự đảo vẫn cần từ đệm ngữ pháp và không có hai giá trị cạnh tranh. Không tính lại biểu thức; vế trước dấu `=` cuối được phép chứa chữ (ví dụ “2 × số cạnh”). Giữ số sai của học sinh. Phủ định, nghi vấn và nhiều giá trị không được bỏ qua. Khe nhãn dùng từ vựng và ký hiệu tập hợp thông thường; các mô tả tìm đường không được biến thành dãy nhãn. Cấu trúc chia một tập thành các nhóm phân biệt đối tượng được chia với chủ đề số nhóm.

Gán trần “A = 0” không tự coi là bậc (cần “Bậc:” hoặc deg/d). Dãy dở chỉ nối vào dòng dãy nhãn tiếp theo, không nuốt claim độc lập. Guard phán đoán Đ/S giữ phân biệt từ “dùng”; guard thuật toán phân biệt “nhãn” với động từ “nhận thấy/nhận xét”. Không áp sửa lệch ký tự cho từ trong câu mô tả khi xác định dấu hiệu cần chấm.

## Bổ sung Lô 3.3

Đã hỗ trợ `dijkstra_init`, `dijkstra_select`, `dijkstra_label`, `nn_step`, `postman_duplicate` và bảng Dijkstra. Parser vẫn chỉ nhận `WorkVocabulary`, không import runtime solver/grade.

Bảng được nhận qua `region: table` hoặc cụm ít nhất ba dòng dạng bảng. Ghép các box chồng dọc thành hàng, sắp cột theo x tiêu đề; không có box thì theo token. Nhận tiêu đề Bước/Chọn/Đỉnh chọn hoặc chỉ nhãn; số thường, ∞, cặp số-predecessor, dạng slash/compact, dấu `*`/`✓`, dấu `-` và ô trống. Mỗi hàng phát chọn trước, rồi mọi nhãn hữu hạn chưa khoanh, kể cả nhãn cũ. Không phát nhãn cho ô vô cực. Dấu chọn hoặc cột đầu là bằng chứng trực tiếp; chỉ suy chọn khi đúng một cột chuyển thành `-`/trống ở hàng sau. Không chọn theo nhãn nhỏ nhất. Bước suy có `origin: inferred`, conf tối đa `confThreshold - 0.01` (mặc định 0.84). Không dựng chắc cả bảng thì toàn bảng vào unchecked và warning table_unrecognized.

Thứ tự xử lý là page rồi index. Nối dãy kết thúc mũi tên và phép tính kết thúc toán tử sang dòng kế tiếp, kể cả trang kế tiếp; không nối qua số trang bị thiếu hoặc nuốt claim độc lập. Một bước qua trang giữ mọi index nguồn, page đầu và box hợp chỉ trên page đầu. Trang trống, trang thiếu hoặc toàn đề phát warning page_order. Trang không có phần tử WorkLine chỉ phát hiện được khi có số trang tiếp sau.

Sửa review 3.3-r1: thao tác chọn dùng khe động từ + đỉnh/điểm tùy chọn + một nhãn; nhãn Dijkstra nhận chủ đề độc lập với tiền tố, số được viết và `via` qua/đi qua/từ (kể cả sau dấu phẩy). Không sửa phép tính. Độ dài lấy walk gần nhất; khi không có walk, chỉ dòng cần chấm cuối cùng của shortest_path/tsp/postman mới thành final_answer. Các trường hợp khác giữ unchecked.

## Bổ sung Lô 3.4

Parser thử `text` trước rồi alternatives theo thứ tự, chọn cách đầu hiểu được mà không còn phần cần chấm chưa hiểu trên dòng đó. Bảng chọn cách viết ô/hàng hợp cú pháp và nhãn đã biết trước khi dựng cả bảng. Không kiểm số theo trọng số hay đáp án. Giữ các cách hiểu khác nhau trong `candidates` (cách đang dùng đứng đầu), chữ tương ứng trong `candidateTexts`; không tìm tích Descartes của alternatives nhiều dòng. Dòng đã lọc là đề/hình/gạch không được khôi phục bằng alternatives.

`claim.conf` lấy min xác suất của số (cả dấu và thập phân), nhãn, phủ định, Đ/S, mã phương án và dấu chọn có trong mệnh đề nguồn. Tách bằng chứng theo mệnh đề, ý Đ/S, gán bậc dạng danh sách và ô bảng; nhãn cột bảng cũng góp độ tin cậy. Các số trong cùng một phép tính đều được giữ làm bằng chứng bảo thủ. `charConf` thiếu/sai độ dài/không hợp lệ thì dùng `conf` dòng. Chọn alternative hoặc inferred luôn bị chặn ở `confThreshold - 0.01`, mặc định 0.84.

`ParsedWork.sourceLines` giữ chữ đã chọn, để hỏi đúng dòng chưa có claim. `gradeWork` đổi label thành id ở biên gọi core, truyền confThreshold, ánh xạ needsConfirmation về câu hỏi đọc. DUNG còn unchecked, hoặc SAI có unchecked trước dòng lỗi đầu theo page/index, trở thành CAN_XAC_NHAN. Trường hợp chỉ có unchecked cũng hỏi lại; bài không có nội dung vẫn KHONG_DU_CAN_CU. SAI luôn giữ readingCheck và firstErrorLines. Không thay hành vi core.

Luồng thuần: `applyWorkAnswers(lines, answers) → parseWork → gradeWork`. Sửa text chuẩn hóa NFC, đặt conf=1 và bỏ charConf/alternatives OCR cũ; không tự thêm charConf=1. `skip` dùng `WorkLine.skipped`, không giả làm gạch xóa. Đánh dấu struck thay cờ và xóa strikeScore tự động để câu trả lời có hiệu lực. Mỗi lần gọi, câu trả lời cuối cho một index có hiệu lực. Không sửa đầu vào. Bên gọi theo dõi dòng đã trả lời để giới hạn vòng hỏi lại; eval chỉ trả lời mỗi dòng một lần, còn chưa hiểu truth thì để CAN_XAC_NHAN, không tự bỏ qua.

Sửa review 3.4-r1: chỉ xếp dòng chưa hiểu vào prose/empty khi mọi charConf hợp lệ ≥ ngưỡng (thiếu thì dùng conf dòng); dòng chưa chắc vào unchecked và hỏi kind reading, kể cả chữ hiện tại không còn dấu hiệu cần chấm. Giữ lọc đề/hình/gạch. Conf bước tính cả chủ đề, động từ, kết luận, dấu bằng và mũi tên; từ khớp xấp xỉ bị chặn dưới ngưỡng, conf dòng < 0,5 luôn là trần. Bậc danh sách giữ bằng chứng từ tiêu đề chung. gradeWork hỏi cả bước được core chấp nhận nhưng conf thấp trước hoặc tại lỗi đầu, để xác nhận trạng thái làm nền cho bước sau; DUNG phải xác nhận mọi bước còn nghi ngờ.

compareWork xét chữ của toàn bộ nguồn claim đến lỗi đầu, cùng dòng truth bị mất đứng trước (thứ tự page/index). Có bất kỳ khác chữ nào trong phần này thì readingMismatch=true; thiếu bằng chứng mà không phát hiện khác chữ thì null. contentAsProse đếm dòng thuộc lineOf bị bỏ thành prose, chia theo conf dòng < / ≥ ngưỡng (mặc định 0,85); đây là thống kê, không tham gia parser/grade.

## Bổ sung Lô 3.5: gạch xóa

`detectStrikes(image, lines)` trả một `{line, struck, score}` cho mỗi dòng, giữ thứ tự đầu vào. Một lần gọi chỉ nhận dòng của **một trang** tương ứng với image. Không đọc `text`, alternatives, cờ struck cũ, nhãn đỉnh, đáp án hay truth. Không sửa pixel hoặc dòng đầu vào. Ảnh RGBA sai kích thước bị từ chối; box thiếu/không hợp lệ cho score=0,5 (chưa chắc), không tự kết luận không gạch.

Công thức cố định, score là bằng chứng heuristic, không phải xác suất đã hiệu chuẩn:

1. Ghép alpha lên nền trắng, luminance `L = 255 + alpha × (0,2126R + 0,7152G + 0,0722B − 255)`. Mực tối khi `L < 160`, loại kẻ ô nhạt. Với kẻ đậm, lấy projection cả trang theo hàng/cột: nhóm liên tiếp phủ ≥60% chiều ngang/dọc; loại các nhóm thuộc cấp số cộng ít nhất 4 nhóm, khoảng ≥6 px, sai số tâm ≤2 px. Áp cùng nguyên tắc projection/lặp của reader-figure; không import preprocess vì phép nhị phân hóa Sauvola và pipeline hình không cần cho nét gạch, giữ package không thêm dependency. Kẻ đậm nghiêng nhiều chưa được bộ lọc projection này bảo đảm.
2. Đổi box 0–1000 sang pixel. Mở mỗi bên x `max(2 px, 0,06 × chiều cao box)`, mỗi bên y `max(2 px, 0,12 × chiều cao box)`, chặn vào trang. Lấy bbox mực tối còn lại `(w,h)` và mật độ `d`. Vùng rỗng cho score=0.
3. **Bôi kín:** nếu `h ≥ 8 px`, `h ≥ 0,55 × chiều cao box`, `0,5h ≤ w ≤ 30h`, điểm `O = clamp((d − 0,45) / 0,5, 0, 1)`; ngoài ra O=0. Guard chiều cao tránh nhận thanh trừ mảnh thành bôi kín; vẫn nhận vùng bôi ngắn.
4. **Gạch ngang:** chỉ khi `h ≥ 8 px, w ≥ 2h`. Quét đường có tâm ở 30–70% h (bước max(1 px, 5% h)), chênh cao hai đầu từ −25% h đến +25% h (bước max(1 px, 12,5% h)). Với mỗi x tìm mực trong bán kính `max(1 px, round(0,035h))` quanh đường; `c` là độ dài đoạn liên tục có mực lớn nhất chia w. Cần chữ hai phía đường: ít nhất 18% số cột có mực phía trên và 18% phía dưới, cách đường `max(3 px, ceil(0,14h))`; ít nhất 3/5 vùng ngang có cột mang mực cả hai phía. Điều này phân biệt mũi tên dài, dấu bằng/trừ với nét đi qua chữ. Không đủ bằng chứng chữ: `H = 0,1c`. Đủ bằng chứng và đoạn liên tục ≥25% w: nếu `c ≥ 0,7` thì `H = 0,5 + 0,5c`; nếu `0,45 ≤ c < 0,7` thì `H = 0,4 + 0,4c`; còn lại `H = 0,1c`. Chọn H lớn nhất. Gạch chân nằm ngoài dải giữa hoặc thiếu chữ phía dưới.
5. `score = max(O,H)` trong [0,1]. `score ≤ STRIKE_NO=0,3`: chắc không; `score ≥ STRIKE_YES=0,8`: chắc gạch và `struck=true`; khoảng giữa: chưa chắc. Ngưỡng cố định được kiểm bằng ảnh tổng hợp, chưa chứng minh cho ảnh học sinh thật. Box nên bao một dòng chữ sát vừa đủ; box lẫn dòng khác hoặc chữ dưới 8 px có thể làm hỏng bằng chứng.

`readWork` gọi reader từng trang (TextLine không có page), gán page/index liên tục, gọi detector trên trang đó **sau khi đọc**, đặt lại struck theo pixel và lưu `WorkLine.strikeScore?`, rồi parse cả bài. Engine struck cũ không quyết định đầu ra. `ReadUsage`: cộng passes/latencyMs và timing, nối mảng telemetry, lấy peak memory lớn nhất; latencyMs là tổng số đo reader, chưa gồm thời gian detector. Abort được chuyển tới reader và kiểm trước/sau từng lần đọc; lỗi đọc được truyền cho bên gọi. Không gọi model/mạng trực tiếp.

Dòng chắc gạch vẫn ignored=struck. Dòng chưa chắc chưa được parse, kể cả alternatives/bảng/nối trang: vào unchecked và issue `struck_uncertain`. `gradeWork` hỏi `kind: struck`, nâng thành CAN_XAC_NHAN kể cả khi dòng ở sau lỗi đầu. Dòng đề/hình hoặc đã skip vẫn được lọc trước. `{line,struck:true|false}` xóa score cũ; sửa chữ vẫn giữ câu hỏi gạch, skip bỏ dòng. Không tự gọi detector lại sau câu trả lời của người dùng.

Đo lại 40 trang: chạy `npm run build`, rồi `node tools/eval/dist/work-strikes-cli.js`. JSON chi tiết ghi ở `reports/.debug/work-strikes-40.json`. Không sinh ảnh/corpus mới. Phép đo dùng PNG hiện có; geometry hàng lấy từ layout cho **mọi** dòng, gộp ô bảng cùng y, biến đổi phối cảnh như renderer. Không dùng cờ gạch hoặc cancellation box để dựng geometry của phép đo. Chữ oracle từ lines.json chỉ cấp cho parser; loại struck/box truth trước inference. Sau inference mới so cancellation.json. Mẫu số gồm dòng solution/table, không gồm đề/hình mà parser bỏ qua. FN tính cả dòng gạch đang chưa chắc. `struckAsContent` đếm **bước** sinh từ dòng truth struck, đúng định nghĩa prompt; opaque có text null nên phải xem cùng recall, không chỉ số bước lọt. Đây là đo detector với box layout, chưa đo OCR phát hiện/bỏ sót dòng, chưa phải Lô 3.6.
