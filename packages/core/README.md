# @mathtwin/core — Lô 1.1

Lõi TypeScript thuần, ES2022/ESM, không có dependency runtime, UI hay AI.
Chạy `npm install`, `npm test` và `npm run build` từ thư mục gốc.
Sau khi build, package xuất JavaScript và khai báo kiểu từ `dist/index`.

## API hiện có

- Các kiểu `Graph`, `Task`, `ProblemSpec`, `Claim`, `StatementCheck`, `Solution`,
  `GradeResult` và các kiểu thành phần theo prompt 01.
- `validateSpec(spec)` trả `{ ok, errors }`. Kiểm tra cấu trúc JSON, mã trùng,
  tham chiếu đỉnh/cạnh, tối đa 20 đỉnh, trọng số hữu hạn dương, dạng task và
  metadata. Nội dung mệnh đề chỉ được kiểm tra cấu trúc, chưa xét đúng/sai.
  `StatementCheck` loại trừ `statement`, `choice` và `final_answer` để tránh
  tự tham chiếu hoặc nội dung không kiểm chứng độc lập được.
  Dãy bậc không tồn tại đồ thị vẫn là đề hợp lệ.
- `degree(graph, vertex)`, `degrees(graph)`, `oddVertices(graph)`,
  `isolatedVertices(graph)`: khuyên cộng hai vào bậc. Truy vấn bậc của đỉnh
  không tồn tại ném `RangeError`.
- `connectedComponents(graph, options?)`, `isConnected(graph, options?)`:
  mặc định xét mọi đỉnh. `{ ignoreIsolated: true }` chỉ xét đỉnh có bậc dương
  để dùng cho điều kiện Euler ở lô sau. Tập đỉnh đang xét rỗng được quy ước
  liên thông, có danh sách thành phần rỗng.
- `hasLoops`, `hasParallelEdges`, `isSimpleGraph`, `isMultigraph`: trong API
  này `isMultigraph` chỉ đồ thị không đơn (có khuyên hoặc đa cạnh).
  Đa cạnh nhận biết theo cặp đầu mút vô hướng, không phụ thuộc tên/trọng số.
- `isValidDegreeSequence(sequence)`: tối đa 20 số nguyên từ 0 đến 100.
  `MAX_DEGREE_SEQUENCE_VALUE = 100` giới hạn công việc dựng đồ thị ở tối đa
  1.000 cạnh, chặn dữ liệu bậc quá lớn từ lỗi đọc ảnh.
- `realizeDegreeSequence(sequence, simple)` trả `{ exists: false }` hoặc
  `{ exists: true, graph }`. Đơn đồ thị dùng Havel–Hakimi; đa đồ thị cho phép
  khuyên dùng điều kiện tổng chẵn trong giới hạn dãy bậc hợp lệ ở trên.
  Mỗi lần nối hai đỉnh còn bậc lớn nhất (đồng hạng theo chỉ số gốc).
  Không tạo khuyên khi bậc lớn nhất không vượt tổng các bậc còn lại; nếu vượt,
  chỉ phần bậc dư bắt buộc ở đỉnh đó được chuyển thành khuyên.
  Đỉnh thứ i có mã/nhãn `String(i + 1)` và bậc đúng bằng phần tử thứ i của
  dãy đầu vào; cạnh có mã `e1`, `e2`, … Không thay đổi dãy đầu vào.

Các hàm đồ thị nhận dữ liệu đã hợp lệ; gọi `validateSpec` tại biên nhận JSON.
Thứ tự trả đỉnh/thành phần và cách phá đồng hạng theo thứ tự đầu vào.
Đồ thị có bất kỳ cạnh nào khai báo trọng số thì mọi cạnh phải có trọng số.
Các task `shortest_path`, `tsp`, `postman` luôn yêu cầu trọng số cho mọi cạnh;
những task khác có thể dùng đồ thị hoàn toàn không trọng số. Thiếu trọng số
được báo tại từng `graph.edges[i].w`, không tự gán giá trị mặc định.
Chuỗi thông báo tiếng Việt nằm trong `src/explain/templates.vi.ts`.

`solve()` và `grade()` sẽ được triển khai trong các lô được giao sau.
