# @mathtwin/core — Lô 1.1 và 1.2

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
  để dùng cho điều kiện Euler. Tập đỉnh đang xét rỗng được quy ước
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

## Euler, Hamilton và kiểm tra walk (Lô 1.2)

```ts
import { solveEuler, solveHamilton, checkWalk } from '@mathtwin/core';

const euler = solveEuler(graph, { want: 'any', start: 'A' });
const hamilton = solveHamilton(graph, { want: 'cycle', start: 'A' });
const checked = checkWalk(graph, {
  kind: 'euler_path', vertices: ['A', 'B', 'A'], edgeIds: ['e1', 'e2'],
}, { start: 'A' });
```

- `analyzeEuler(graph)` trả bậc từng đỉnh, đỉnh bậc lẻ, thành phần liên thông
  trên các đỉnh có bậc dương và các cờ `hasPath`, `hasCircuit`. Các cờ này xét
  tồn tại nói chung, chưa áp dụng ràng buộc `start`.
- `solveEuler(graph, options?)`: mặc định `{ want: 'any' }`. Trả
  `EulerSolution` mở rộng `Solution` với `analysis` và `trace` có kiểu cụ thể.
  `answer` là `{ exists: true, kind, walk: { vertices, edgeIds } }` hoặc
  `{ exists: false, reason }`. Dùng Hierholzer, bắt đầu tại `start` nếu được
  chỉ định; nếu không thì đỉnh bậc lẻ đầu tiên, hoặc đỉnh đầu tiên có cạnh.
  Chọn cạnh chưa dùng theo thứ tự cạnh đầu vào. Mỗi khuyên và mỗi cạnh song
  song có mã riêng, được dùng đúng một lần. Nếu có hai đỉnh bậc lẻ, đỉnh
  xuất phát phải là một trong hai đỉnh đó; không thể xuất phát ở đỉnh cô lập
  khi đồ thị còn cạnh.
- Trace Euler gồm `start`, `traverse { from, to, edgeId }` và
  `backtrack { vertex, via? }`. Phát lại bằng một stack; danh sách đỉnh và
  cạnh thu được khi backtrack phải đảo ngược để thành walk kết quả. Chuỗi
  các sự kiện `traverse` là thứ tự khám phá, có thể khác walk kết quả khi
  thuật toán phải ghép các chu trình. Lời giải nêu bậc từng đỉnh, điều kiện
  tồn tại, thao tác thuật toán và walk cuối cùng.
- `analyzeHamilton(graph)` trả liên thông trên toàn bộ đỉnh, tính đơn,
  số láng giềng phân biệt `neighborCounts` (bỏ khuyên) và
  `dirac`, `ore`, mỗi trường gồm `{ applicable, holds }`. Hai định lý chỉ
  áp dụng trực tiếp cho đơn đồ thị có ít nhất 3 đỉnh. Không thỏa điều kiện
  đủ không được suy ra là không có chu trình.
- `hamiltonCycleRules(graph)` suy luận cho chu trình trên đơn đồ thị:
  ép chọn hai cạnh khi chỉ còn hai cạnh khả dụng; loại cạnh thừa khi đã
  đủ hai cạnh bắt buộc; phát hiện bậc không đủ, quá nhiều cạnh bắt buộc,
  hoặc chu trình bắt buộc khép kín trước khi qua mọi đỉnh. Trả
  `{ status, forcedEdgeIds, excludedEdgeIds, trace }`, với `status` là
  `cycle`, `impossible` hoặc `inconclusive`. Không áp dụng các quy tắc
  dành cho chu trình này để loại đường đi Hamilton.
- `solveHamilton(graph, options?)`: mặc định `{ want: 'cycle' }`. Trả
  `HamiltonSolution` mở rộng `Solution` với `analysis`, `method` và `trace`.
  `answer` có cùng cấu trúc phân nhánh như Euler. Dùng quy tắc SGK nếu đủ
  quyết định chu trình; nếu chưa đủ thì tìm kiếm chính xác có ghi nhớ trạng
  thái bitmask (tối đa 20 đỉnh). `method` là `conditions`, `rules` hoặc
  `search`. Chọn đỉnh theo thứ tự đỉnh đầu vào và cạnh song song đầu tiên
  theo thứ tự cạnh đầu vào; khuyên không giúp đi tới một đỉnh mới.
- Trace Hamilton ghi các suy luận ép/loại cạnh, mâu thuẫn, thống kê tìm kiếm
  `{ statesVisited, memoHits }` nếu có, rồi `start`, các bước `advance`,
  bước `close` cho chu trình và `verify`. Không lưu mọi nhánh thử của tìm
  kiếm. Lời giải trình bày quy tắc SGK, hoặc đường tìm được kèm kiểm tra.
  Các bước `SolutionStep` của hai solver có `data` và `highlight` để phát
  lại và tô màu; mọi câu hiển thị lấy từ `src/explain/templates.vi.ts`.
- `checkWalk(graph, input, constraints?)` kiểm tra walk bất kỳ, độc lập với
  đáp án mẫu. `kind` hỗ trợ `path`, `euler_path`, `euler_circuit`,
  `hamilton_path`, `hamilton_cycle`; `constraints` có `start?`, `end?`.
  `path` ở API walk này chỉ kiểm tra đỉnh/cạnh và ràng buộc đầu/cuối, cho
  phép lặp. Euler yêu cầu đủ mọi cạnh đúng một lần; Hamilton yêu cầu đủ
  mọi đỉnh đúng một lần (ngoại trừ lần quay về đỉnh đầu của chu trình).
  Có thể bỏ `edgeIds`; với Euler, mỗi lần đi dùng cạnh song song chưa dùng
  đầu tiên. Khi truyền `edgeIds`, hàm kiểm tra đúng từng mã cạnh được chọn.
  Kết quả là `{ ok: true, walk }` với mã cạnh đã xác định, hoặc
  `{ ok: false, errorCode, reason, facts, index? }`. `index` bắt đầu từ 0
  trong danh sách đỉnh, chỉ vị trí lỗi cục bộ đầu tiên; lỗi thiếu cạnh/đỉnh
  được kiểm tra sau toàn bộ walk. `facts` chứa dữ liệu, không chứa lời giải
  thích. Đây là bộ kiểm tra walk, chưa phải `grade()`.

Các quy ước ca biên của Lô 1.2:

- Đường đi Euler (`want: 'path'`, `hasPath`, `euler_path`) chấp nhận cả
  walk khép kín. Nếu khép kín thì solver trả `kind: 'circuit'`.
- Đồ thị không cạnh có Euler walk dài 0: một đỉnh theo `start` hoặc đỉnh
  đầu tiên; nếu không có đỉnh thì walk rỗng. Không cần đi qua các đỉnh cô lập.
- Hamilton không tồn tại trên đồ thị không đỉnh; một đỉnh có đường đi
  Hamilton dài 0. Chu trình Hamilton cần ít nhất 3 đỉnh phân biệt, kể cả
  khi đồ thị có khuyên hoặc hai cạnh song song nối hai đỉnh.
- `end` của đường đi Hamilton là đỉnh cuối. Với chu trình, `end` là điểm
  quay về, nên phải trùng `start` nếu cả hai được chỉ định; nếu chỉ có
  `end` thì solver xuất phát và kết thúc ở đó.
- Các solver nhận đồ thị đã hợp lệ như các hàm Lô 1.1; đỉnh đầu/cuối
  không có trong đồ thị ném `RangeError`. Hamilton còn chặn trực tiếp
  đầu vào quá 20 đỉnh để tránh vượt giới hạn bitmask. Không thay đổi đầu vào.

Kiểm thử Lô 1.2 gồm các ca Königsberg, khuyên/đa cạnh, A–B–C, không thỏa
Dirac vẫn có chu trình, ràng buộc đầu/cuối, suy luận SGK và trace. Các test
fast-check dùng seed cố định: 1.000 đa đồ thị ngẫu nhiên cho Euler, 500 đồ
thị sinh từ walk (bảo đảm có Euler walk), 200 đa đồ thị nhỏ đối chiếu vét
cạn cạnh, và 1.000 đồ thị đơn/đa đối chiếu Hamilton với vét cạn hoán vị,
có và không có ràng buộc đầu/cuối. Dữ liệu sinh có tối đa 8 đỉnh.
Vitest dùng worker threads để chạy được trong môi trường chặn tạo tiến trình con.

## Dijkstra, TSP và người đưa thư (Lô 1.3)

```ts
import { solveDijkstra, solveTsp, solvePostman } from '@mathtwin/core';

const shortest = solveDijkstra(graph, { from: 'A', to: 'D' });
const tsp = solveTsp(graph, { method: 'both', start: 'A' });
const postman = solvePostman(graph, { start: 'B' });
```

Các solver nhận đồ thị đã được kiểm tra cấu trúc bằng `validateSpec`, không
thay đổi đầu vào. Chúng kiểm tra thêm giới hạn 20 đỉnh, trọng số hữu hạn
lớn hơn 0 trên mọi cạnh và các đỉnh đầu/cuối được truyền vào; vi phạm ném
`RangeError`. Không mặc định trọng số bị thiếu thành 1. Khuyên không giúp
đi tới đỉnh khác. Khi tính đường ngắn nhất hoặc TSP, dùng cạnh song song
nhẹ nhất; nếu bằng nhau, dùng cạnh đầu tiên trong dữ liệu.

- `solveDijkstra(graph, { from, to })` trả `DijkstraSolution`, mở rộng
  `Solution` với `state` cuối và `trace`. `answer` là
  `{ exists: true, length, walk }` hoặc `{ exists: false, reason: 'unreachable' }`.
  Mỗi trace ghi `selected`, tập đồng hạng nhỏ nhất `tied`, `updates`, cùng
  snapshot `labels` và `settled` sau bước đó. Mỗi cập nhật ghi
  `{ v, old, candidate, new, via, edgeId, viaDistance, weight }`, kể cả khi
  nhãn không giảm. `null` biểu diễn ∞; không đưa `Infinity` vào JSON kết quả.
  Dừng ngay khi khoanh đích, không cập nhật các láng giềng của đích.
  Các nhãn còn lại lúc này có thể chưa được cố định.
- `createDijkstraState(graph, source, target?)`,
  `dijkstraCandidates(graph, state)` và
  `advanceDijkstra(graph, state, selected)` cho phép mô phỏng theo mọi
  lựa chọn đồng hạng hợp lệ. Hàm chuyển trả `{ state, trace }` mới, không
  sửa trạng thái cũ; chọn đỉnh ngoài tập đồng hạng ném `RangeError`.
  Dùng trạng thái do các hàm này tạo ra trên cùng một đồ thị. Bỏ `target`
  để tiếp tục đến khi không còn nhãn hữu hạn chưa khoanh. Solver mẫu luôn
  chọn đỉnh đồng hạng đầu tiên theo thứ tự đỉnh đầu vào; nhãn bằng nhau
  không thay đỉnh trước đã chọn. Đây chưa phải API chấm bài.
- `solveTsp(graph, options?)` mặc định `{ method: 'both' }`. Trả
  `TspSolution` với `answer.nearestNeighbor?`, `answer.optimal?`,
  `answer.comparison?` và `trace`. `nearestNeighbor` là danh sách
  `{ start, answer }`; bỏ `start` chạy từ **mọi đỉnh** theo thứ tự đầu vào.
  `optimal` dùng Held–Karp; bỏ `start` chọn đỉnh đầu tiên vì xoay hành trình
  không đổi độ dài. Chỉ tính phương pháp được yêu cầu.
- Mỗi đáp án hành trình là `{ exists: true, length, walk }` hoặc
  `{ exists: false, reason, partialWalk?, partialLength? }`. Gần nhất chọn
  đỉnh chưa thăm có cạnh nhẹ nhất và ghi trace
  `{ type: 'nearest_neighbor', start, from, to, tied, edgeId, weight, length, closing }`.
  Ưu tiên đỉnh theo thứ tự đầu vào khi đồng hạng. Bước quay về được ghi
  riêng với `closing: true`. Có thể thất bại vì `no_neighbor` hoặc
  `no_return` ngay cả khi vẫn tồn tại hành trình khác. Không tự thêm cạnh
  theo khoảng cách đường ngắn nhất vào đồ thị thiếu cạnh.
- Held–Karp dùng trạng thái tập đỉnh chưa thăm và đỉnh hiện tại, ghi trace
  `{ type: 'held_karp', start, statesVisited }`, không lưu toàn bộ bảng DP.
  Các hành trình tối ưu bằng nhau được chọn theo thứ tự đỉnh đầu vào.
  `both` so sánh từng kết quả gần nhất với tối ưu qua
  `{ start, nearestLength, optimalLength, gap }`; giá trị không tồn tại là
  `null`, đồng thời nêu rõ gần nhất không bảo đảm tối ưu.
- `solvePostman(graph, { start })` tìm **hành trình khép kín** đi qua mọi
  cạnh ít nhất một lần và quay về đúng `start`, kể cả khi `start` bậc chẵn.
  Trả `PostmanSolution` với `matching`, `trace` và đáp án
  `{ exists: true, walk, length, baseLength, duplicateLength, duplicates }`
  hoặc `{ exists: false, reason }`. Chỉ xét liên thông trên phần có cạnh;
  từ chối `start` cô lập khi vẫn còn cạnh và từ chối nhiều thành phần có cạnh.
- Người đưa thư dùng Floyd–Warshall, DP bitmask ghép cặp đỉnh bậc lẻ,
  nhân đôi đường ngắn nhất được ghép, rồi gọi Hierholzer. Khi ghép cặp
  đồng hạng, xét các đỉnh bậc lẻ theo thứ tự đầu vào. Floyd–Warshall giữ
  đường đã có nếu bằng độ dài, xét đỉnh trung gian theo thứ tự đầu vào.
  Mọi cạnh gốc, kể cả cạnh song song nặng hơn và khuyên, đều được tính
  vào `baseLength` và đi qua trong kết quả.
- `walk.edgeIds` của người đưa thư là **mã cạnh gốc**, có thể lặp lại.
  `duplicates` ghi `{ id, originalEdgeId }` cho từng bản sao với mã riêng
  không trùng mã cạnh đầu vào. Trace gồm bậc/đỉnh lẻ, ma trận khoảng cách
  giữa các đỉnh lẻ, ghép cặp kèm đường đi và chi phí, các bản sao, trace
  Euler trên đồ thị tăng cường, và phép cộng tổng chi phí. Trong trace
  Euler, `edgeId`/`via` là mã cạnh tăng cường; dùng `duplicates` để quy về
  cạnh gốc. Highlights và walk cuối đã quy về cạnh gốc để tô màu.

Quy ước ca biên: Dijkstra từ một đỉnh tới chính nó có độ dài 0; không tới
được đích trả `exists: false`. TSP không đỉnh không có hành trình (danh
sách gần nhất rỗng); một đỉnh có hành trình dài 0, không cần đi khuyên;
hai đỉnh đi và quay lại cùng cạnh nhẹ nhất. Đây là quy ước hành trình TSP,
khác quy ước chu trình Hamilton tối thiểu 3 đỉnh của Lô 1.2. Người đưa thư
không cạnh trả walk `[start]` với chi phí 0; nếu có khuyên thì vẫn phải đi
qua mọi khuyên. Các trường thêm cho kết quả/trace được xuất thành kiểu
cụ thể, không thay đổi `Task`, `Solution`, `Claim` hay `GradeResult`.

Kiểm thử Lô 1.3 dùng seed cố định: 1.000 đồ thị có tối đa 8 đỉnh so
Dijkstra với vét cạn đường đi (thêm mô phỏng chọn đồng hạng theo thứ tự
ngược), 1.000 đồ thị tối đa 8 đỉnh so Held–Karp với vét cạn hoán vị, và
300 đa đồ thị nhỏ so người đưa thư với vét cạn trạng thái
`(đỉnh hiện tại, tập cạnh đã đi)`. Test còn kiểm tra trace, hoàn nguyên
Euler trên đồ thị tăng cường, ca 20 đỉnh cho Held–Karp/ghép cặp, ví dụ
gần nhất không tối ưu, 2/4 đỉnh lẻ với điểm đầu bậc chẵn, khuyên/đa cạnh,
đồ thị thiếu cạnh, dữ liệu bất biến, tên tiếng Việt và JSON kết quả.
