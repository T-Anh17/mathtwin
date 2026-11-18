import type { ProblemSpec } from '@mathtwin/core';
import { graphLabels } from './graph-labels.vi.js';
import { sessionVi } from './flow/messages.vi.js';

export const problemVi = {
  capture: 'Ảnh đề bài', confirm: 'Chờ xác nhận đề', manual: 'Nhập tay đề', add: 'Chụp thêm ảnh', choose: 'Chọn ảnh',
  read: 'Đọc đề', cancel: 'Hủy đọc', resume: 'Tiếp tục đọc', retry: 'Thử lại', remove: 'Xóa ảnh',
  missing: 'Bộ đọc B chưa tải. Tải trong Cài đặt hoặc nhập tay đề.', settings: 'Mở Cài đặt',
  preview: 'Bản xem thử dùng bộ đọc giả lập. Kết quả dưới đây là dữ liệu mô phỏng, không phải nội dung ảnh.',
  speed: 'Bộ đọc B khoảng 2 GB; số đo cũ khoảng 49 giây/trang trên điện thoại mạnh, vượt mục tiêu 15 giây.',
  edit: 'Sửa đồ thị', draft: 'Dùng nháp hình D để sửa', draftNote: 'Nháp D chỉ là gợi ý; cần soát mọi đỉnh, cạnh và trọng số.',
  done: 'Xác nhận đề', other: 'Nhập giá trị khác', answer: 'Áp dụng', unresolved: 'Trả lời hết các chỗ chưa chắc trước khi xác nhận.',
  keepGraph: 'Giữ đồ thị này',
  invalid: 'Đề chưa hợp lệ. Kiểm tra đồ thị, dạng bài và các tham số.', failed: 'Không đọc được đề. Có thể thử lại hoặc nhập tay; phần đã đọc đã được giữ.',
  noSpec: 'Chưa hiểu đủ đề. Sửa đồ thị và yêu cầu theo ảnh gốc trước khi xác nhận.', noBox: 'Chưa xác định vùng cắt; hãy xem ảnh gốc.',
  noGraph: 'Vẽ hoặc sửa đồ thị trước khi xác nhận.', source: 'Ảnh đề gốc', graph: 'Đồ thị máy đọc',
  task: 'Dạng bài', format: 'Dạng câu hỏi', from: 'Đỉnh nguồn', to: 'Đỉnh đích', start: 'Đỉnh xuất phát', end: 'Đỉnh kết thúc (tùy chọn)',
  vertices: 'Các đỉnh cần tính bậc (cách nhau bằng dấu phẩy; để trống là tất cả)', sequence: 'Dãy bậc (cách nhau bằng dấu phẩy)',
  simple: 'Đơn đồ thị', want: 'Yêu cầu', method: 'Cách giải', statements: 'Các ý của đề',
  addStatement: 'Thêm ý', removeStatement: 'Xóa ý', statementId: 'Ký hiệu ý / lựa chọn', statementText: 'Nội dung ý', checkType: 'Mệnh đề cần kiểm tra',
  checks: { vertex_count: 'Số đỉnh', edge_count: 'Số cạnh', degree_sum: 'Tổng bậc', degree: 'Bậc một đỉnh', odd_vertices: 'Các đỉnh bậc lẻ',
    connected: 'Liên thông', euler_exists: 'Tồn tại Euler', hamilton_exists: 'Tồn tại Hamilton', theorem: 'Điều kiện định lý',
    walk: 'Đường đi cho trước', length: 'Độ dài đường đi', dijkstra_label: 'Nhãn Dijkstra', nn_step: 'Bước láng giềng gần nhất',
    postman_duplicate: 'Đường cần lặp', shortest_length: 'Độ dài đường ngắn nhất' },
  checkFields: { value: 'Giá trị nêu trong đề', v: 'Đỉnh', vertices: 'Dãy đỉnh (cách nhau bằng dấu phẩy)', edgeIds: 'Dãy mã cạnh (cách nhau bằng dấu phẩy)',
    kind: 'Loại đường / chu trình', name: 'Định lý', holds: 'Thỏa điều kiện', source: 'Đỉnh nguồn', via: 'Qua đỉnh (tùy chọn)',
    from: 'Từ đỉnh', to: 'Đến đỉnh', start: 'Đỉnh xuất phát', reason: 'Lý do' },
  checkOptions: { path: 'Đường đi', circuit: 'Chu trình', cycle: 'Chu trình', euler_path: 'Đường đi Euler', euler_circuit: 'Chu trình Euler',
    hamilton_path: 'Đường đi Hamilton', hamilton_cycle: 'Chu trình Hamilton', tsp_tour: 'Hành trình người du lịch', postman_tour: 'Hành trình người đưa thư',
    dirac: 'Dirac', ore: 'Ore', degree1: 'Đỉnh bậc một', forced_edges: 'Cạnh bắt buộc', found: 'Tìm được đường' },
  path: 'Đường đi', circuit: 'Chu trình', any: 'Bất kỳ', nearest_neighbor: 'Láng giềng gần nhất', optimal: 'Tối ưu', both: 'Cả hai',
  true: 'Có', false: 'Không', null: 'Không có',
  page: (page: number) => `Trang ${page + 1}`,
  progress: (page: number, total: number, figure: boolean) => `${figure ? 'Đang nháp hình' : 'Đang đọc đề'} · trang ${page + 1}/${total}`,
  formats: { tu_luan: 'Tự luận', trac_nghiem: 'Trắc nghiệm', dung_sai: 'Đúng / sai', tra_loi_ngan: 'Trả lời ngắn' },
};

function confirmationTarget(spec: ProblemSpec, item: string) {
  const indexedEdge = /^(?:graph\.)?edges\[(\d+)\](?:\.(w|u|v|name))?$/.exec(item);
  const edge = indexedEdge ? spec.graph.edges[Number(indexedEdge[1])]
    : spec.graph.edges.find((e) => item === e.id || ['w', 'u', 'v', 'name'].some((f) => item === `${e.id}.${f}`));
  const field = indexedEdge?.[2] ?? (edge && item !== edge.id ? item.slice(edge.id.length + 1) : undefined);
  const indexedVertex = /^(?:graph\.)?vertices\[(\d+)\](?:\.(?:label|id))?$/.exec(item);
  const vertex = indexedVertex ? spec.graph.vertices[Number(indexedVertex[1])]
    : spec.graph.vertices.find((v) => item === v.id || item === `${v.id}.label` || item === `${v.id}.id`);
  return { edge, field, vertex };
}

export function confirmationQuestionText(spec: ProblemSpec, item: string): string {
  const labels = graphLabels(spec.graph), target = confirmationTarget(spec, item);
  if (target.edge) {
    const name = labels.edge(target.edge.id);
    switch (target.field) {
      case 'w': return `Trọng số cạnh ${name} là bao nhiêu?`;
      case 'u': case 'v': return `Đầu mút ${target.field === 'u' ? 'thứ nhất' : 'thứ hai'} của cạnh ${name} là đỉnh nào?`;
      case 'name': return `Tên cạnh ${name} là gì?`;
      default: return `Có cạnh ${name} không?`;
    }
  }
  if (target.vertex) return `Đỉnh này là ${target.vertex.label}?`;
  const questions: Record<string, string> = {
    graph: 'Đồ thị đã đọc đúng chưa?', vertices: 'Các đỉnh của đồ thị là gì?', edges: 'Các cạnh của đồ thị là gì?',
    questionFormat: 'Dạng câu hỏi của đề là gì?', 'task.type': 'Đề yêu cầu dạng bài nào?',
    'task.from': 'Đỉnh nguồn là?', 'task.to': 'Đỉnh đích là?', 'task.start': 'Đỉnh xuất phát là?',
    'task.end': 'Đỉnh kết thúc là?', 'task.vertices': 'Cần tính bậc những đỉnh nào?',
    'task.sequence': 'Dãy bậc đã cho là gì?', 'task.simple': 'Đề yêu cầu đơn đồ thị phải không?',
    'task.want': 'Cần tìm đường đi hay chu trình?', 'task.method': 'Đề yêu cầu cách giải nào?',
    'task.items': 'Các ý cần kiểm tra của đề là gì?',
  };
  return questions[item] ?? 'Hãy xác nhận phần đề được đánh dấu.';
}

export function confirmationCandidateText(spec: ProblemSpec, item: string, value: unknown): string {
  if (value === true) return problemVi.true;
  if (value === false) return problemVi.false;
  if (value === null || value === undefined) return problemVi.null;
  if (Array.isArray(value)) return value.map((v) => confirmationCandidateText(spec, item, v)).join(', ');
  if (typeof value === 'object') return item === 'graph' ? problemVi.keepGraph : problemVi.statements;
  if (typeof value === 'number') return String(value);
  const text = String(value), { edge, field, vertex } = confirmationTarget(spec, item);
  if (item === 'task.type' && Object.hasOwn(sessionVi.tasks, text)) return sessionVi.tasks[text as keyof typeof sessionVi.tasks];
  if (item === 'questionFormat' && Object.hasOwn(problemVi.formats, text)) return problemVi.formats[text as keyof typeof problemVi.formats];
  if (item === 'task.want' && Object.hasOwn(problemVi.checkOptions, text)) return problemVi.checkOptions[text as keyof typeof problemVi.checkOptions];
  if (['task.want', 'task.method'].includes(item) && Object.hasOwn(problemVi, text)) return String(problemVi[text as keyof typeof problemVi]);
  const labels = graphLabels(spec.graph);
  if ((vertex || field === 'u' || field === 'v' || ['task.from', 'task.to', 'task.start', 'task.end', 'task.vertices', 'vertices'].includes(item))
    && spec.graph.vertices.some((v) => v.id === text)) return labels.vertex(text);
  if ((edge && !field || item === 'edges') && spec.graph.edges.some((e) => e.id === text)) return labels.edge(text);
  return labels.text(text);
}
