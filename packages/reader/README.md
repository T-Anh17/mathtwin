# @mathtwin/reader — Lô 2.1–2.2

Nền chung đọc đề, TypeScript thuần chạy trên trình duyệt và Node. Chỉ phụ thuộc
`@mathtwin/core` và `zod`; không đọc file, gọi mạng, tải model hay lưu ảnh.

API xuất từ `src/index.ts`: `ReadDraftSchema`, `TaskDraftSchema`,
`StatementCheckDraftSchema`, `normalizeDraft`, `reconcile`, `readProblem`,
`applyConfirmation`, `completeWithQuestion`, `QuestionDraftSchema`/`QuestionDraft`
và các interface. `compareRead` được bổ sung ở Lô 2.2.
`test/fixtures.ts` cung cấp `FakeVisionReader`, ảnh RGBA một pixel và draft mẫu.

Chạy từ gốc repo:

```sh
npm install
npm test
npm run typecheck --workspace @mathtwin/reader
npm run build
```

Build gốc dựng core trước reader. Kiểm tra kiểu của reader đặt `types: []`, chỉ
dùng ES2022/DOM; test kiểm tra import/globals của cả reader và nguồn core.
Vitest dùng nguồn core qua alias, nên `npm test` không cần build trước.

## Quyết định & giả định

- Theo quyết định đã chốt trong prompt 02, đọc ảnh chạy offline dù đặc tả 7/10
  còn ghi cloud. Lô này chưa cài engine thực, không có phép đo chất lượng ảnh thật.
- Khóa so khớp nội bộ (`normalizeLabel`) dùng Unicode NFC, bỏ khoảng trắng,
  đổi chỉ số dưới 0–9 thành số thường và chuyển chữ thường; giữ dấu tiếng Việt.
  `Vertex.id`/`Vertex.label` giữ hoa/thường, chỉ bỏ khoảng trắng thừa và đổi chỉ
  số dưới. Khi cùng khóa, giữ cách viết đầu tiên trong danh sách đỉnh của lượt
  `edges`; mọi tham chiếu ánh xạ về id đó, kể cả tham chiếu ở lượt `neighbors`.
  Hai nhãn chỉ khác hoa/thường cùng xuất hiện trong một lượt vẫn gộp theo khóa
  nhưng có cờ `graph` và `count_mismatch` warning để người dùng xác nhận.
  Tên cạnh/văn bản đề giữ nguyên. Id cạnh `e1…en` theo thứ tự lượt `edges`.
- Task/statement dùng cấu trúc core, với tham chiếu đỉnh theo label. Task ngoài
  phạm vi có dạng `{ type: string, rawText?: string }`, bị chặn bằng
  `unsupported_task`. Các trường thừa (đặc biệt đáp án tự tính) bị schema từ chối.
- Thêm trường tùy chọn `question.needsPostprocessing?: boolean` để engine chép
  việc đề yêu cầu đổi đơn vị/tính thêm. Pipeline phát `needs_postprocessing`,
  không phân tích văn bản để đoán phép toán và không đổi số liệu.
- Trắc nghiệm/đúng-sai lấy đúng 4 `question.options` dựng task `statements`;
  không dùng đáp án tính sẵn. Check không ánh xạ được phải là `null`, có issue
  riêng `task.items.<id>`. `dijkstra_label` bắt buộc `source`, `nn_step` bắt buộc
  `start` ngay tại schema. Các mệnh đề chỉ được kiểm tra hình dạng/tham chiếu.
- Mất trọng số: không thay bằng 1. Các task trọng số (kể cả statement liên quan)
  bị chặn; khi chưa có câu hỏi hoặc task cấu trúc thì có warning. Cờ `<id>.w`
  giữ `null` để hiện phần cần nhập lại. Đồ thị trộn cạnh có/không có trọng số vẫn
  phải qua quy tắc nhất quán của `validateSpec`; không thêm lỗi `invalid_spec`
  trùng với một issue blocking đã xác định.
- Ngưỡng confidence là `CONFIDENCE_THRESHOLD = 0.85`, dùng so sánh `<`.
  Confidence của fixture là dữ liệu giả 0.96; engine thật phải tự đo và ghi rõ
  cách tính ở báo cáo giai đoạn sau. Confidence đỉnh thấp gắn cờ đỉnh; cạnh thấp
  gắn cờ tồn tại; câu hỏi thấp gắn cờ các trường task và dạng câu hỏi; option thấp
  gắn cờ `task.items`. Vùng không đọc được/số liệu đếm không khớp gắn cờ `graph`.
  Khi không có cách đọc khác, candidates chỉ gồm giá trị hiện dùng, không bịa thêm.
- Đối chiếu multiset ghép lần lượt: cạnh trùng toàn bộ (không phân biệt hướng
  đầu mút), cùng đầu mút/tên, tên riêng khớp duy nhất, cặp đầu mút khớp duy nhất,
  cuối cùng là trọng số/tên và một đầu mút khớp duy nhất. Cạnh không ghép chắc
  được giữ riêng, gắn cờ tồn tại; không làm mất khuyên hay đa cạnh. Cạnh chỉ có ở
  lượt hai được nối cuối và cấp id tiếp theo. Edge id trong statement `walk`
  của lượt hai được ánh xạ sang id kết quả.
- Với cạnh ghép được, lấy dữ liệu lượt có confidence cạnh cao hơn, hòa lấy
  `edges`. Riêng trọng số null ở một lượt nhưng đọc được ở lượt kia: lấy số đã
  đọc, kể cả khi lượt thiếu có confidence cao hơn, và gắn `<id>.w` với candidates
  `[số, null]`. Chỉ phát `missing_weight` trên cạnh gộp vẫn thiếu trọng số.
  Định hướng đầu mút lượt hai được căn theo lượt một để tránh cờ giả.
  Task/format dùng confidence câu hỏi cùng quy tắc. Tên cạnh lệch gắn cờ `graph`
  vì quy ước không cho `<id>.name`. Mọi candidate đầu tiên là giá trị đang dùng.
  Giá trị `null` trong candidate cho trường task tùy chọn/trọng số biểu thị thiếu
  giá trị. Nếu nhãn đỉnh trùng mã dành riêng hoặc mã cạnh/trường cạnh, cờ đỉnh
  dùng `graph` để tránh nhập nhằng.
- `reconcile` gộp đồ thị trước, kể cả khi từng lượt thiếu trọng số hay cả hai
  lượt không có câu hỏi; không cộng dồn các issue đã được lượt kia giải quyết.
  Sau khi hợp nhất mới kiểm tra giới hạn đỉnh, trọng số, số liệu đếm, phần không
  đọc được và `validateSpec` của spec gộp. Dấu mũi tên, nhãn nhập nhằng và vùng
  không đọc được ở một lượt vẫn là bằng chứng cần báo. Nếu chỉ một lượt đọc
  được câu hỏi thì dùng lượt đó; nếu cả hai có câu hỏi thì dùng confidence.
- `NormalizedRead`/`ReadOutcome` thêm `graph: Graph | null`, `graphUncertain`.
  Đồ thị và cờ đồ thị vẫn hiện diện khi `spec: null` do thiếu câu hỏi hoặc còn
  issue blocking. `graph` phục vụ xác nhận, có thể chưa thỏa các ràng buộc core;
  riêng mũi tên giữ trong draft/issue vì kiểu `Graph` của core là vô hướng.
  `graphUncertain` không chứa cờ task hay dạng câu hỏi.
- `completeWithQuestion(outcome, question)` giữ đồ thị/cờ, drafts và usage, dựng
  lại task/statement từ câu hỏi do người dùng cung cấp và chạy cùng kiểm tra như
  khi đọc ảnh. Hàm không gọi reader, không sửa đầu vào, bỏ `missing_question`
  khi đã có câu hỏi và chỉ trả spec khi hợp lệ. Nếu chưa có đồ thị thì giữ kết
  quả bị chặn; lỗi đọc chưa hoàn tất vẫn được giữ.
- `readProblem` mặc định gọi tuần tự `edges`, `neighbors`, truyền mọi ảnh và
  AbortSignal; cộng latency engine báo, lấy max peak memory, đếm lượt hoàn tất.
  Lỗi engine được chuyển thành `read_failed`, không ghi log/nội dung lỗi gốc.
  Draft sai schema thành `invalid_spec`. Usage giữ số liệu các lượt đã hoàn tất.
  Hủy tác vụ reject bằng `signal.reason` (mặc định AbortError), kể cả adapter
  không phản hồi signal; không bắt đầu lượt tiếp theo. Dừng tính toán bên trong
  adapter vẫn là trách nhiệm của adapter.
- `applyConfirmation` áp dụng nguyên tử trên bản sao; giá trị không hợp lệ hoặc
  mục không hỗ trợ gây lỗi tiếng Việt, đầu vào không đổi. Hỗ trợ trọng số/đầu
  mút, tồn tại cạnh (`false` xóa, không đánh lại id), đổi/xóa đỉnh, `task.<field>`,
  `questionFormat`, thay toàn bộ `graph`. Đổi nhãn giữ cách viết hiển thị mới,
  cập nhật cạnh/task và từ chối nhãn trùng khóa một đỉnh khác. Xóa đỉnh
  xóa cạnh kề nhưng task còn tham chiếu đỉnh đó sẽ bị chặn. Xác nhận null cho
  trường task xóa trường; thay loại task có thể cần xác nhận nhiều trường cùng
  lúc. Xóa cờ đã xác nhận và cờ cạnh/đỉnh đã xóa; cập nhật candidate đầu tiên
  của các cờ còn lại; luôn kiểm `validateSpec` trước khi trả ra.
## Đánh giá bản đọc (Lô 2.2)

`compareRead(outcome, truth)` trả `ReadComparison`: `completeCorrect`, `graphCorrect`,
`fullyFlagged`, `silentError`, `graphSilentError`, `coverage`, `extraFlags`, `differences`, `errorCounts`.
Đồ thị được so theo nhãn đỉnh và multiset cạnh vô hướng, bỏ qua id/thứ tự.
Khi `spec` bị chặn vì thiếu câu hỏi, `graphCorrect` vẫn dùng `outcome.graph`;
`completeCorrect` luôn yêu cầu `spec !== null`. Theo review vòng 1, mỗi sai lệch được
xếp đúng một mức `precise` (cờ đúng phần tử với candidate đúng), `coarse` (cờ/issue
yêu cầu xem lại phần liên quan), hoặc `none`. Blocking câu hỏi không phủ lỗi đồ thị.
`silentError` xét mọi sai lệch `none`; `graphSilentError` chỉ xét phần đồ thị.
`fullyFlagged` là không có `none`; báo cáo chỉ đếm bài sai trong tỉ lệ gắn cờ đủ.
Xem [CLI đánh giá](../../tools/eval/README.md).
