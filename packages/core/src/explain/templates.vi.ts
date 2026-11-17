import { MAX_DEGREE_SEQUENCE_VALUE } from '../graph/degree-sequence.js';
import type { EulerFailureReason } from '../solvers/euler.js';
import type { HamiltonFailureReason } from '../solvers/hamilton.js';
import type { HamiltonAnalysis, HamiltonRuleStep } from '../graph/hamilton.js';
import type { DijkstraUpdate } from '../solvers/dijkstra.js';
import type { TourAnswer, TspComparison, TspFailureReason } from '../solvers/tsp.js';
import type { PostmanFailureReason, PostmanPair } from '../solvers/postman.js';
import type { ErrorCode, Graph, StatementCheck } from '../types.js';

function gradeValue(value: unknown): string {
  if (value === null) return '∞';
  if (value === true) return 'đúng';
  if (value === false) return 'sai';
  if (Array.isArray(value)) return value.map(gradeValue).join(', ');
  if (typeof value === 'object' && value !== null) return Object.entries(value).map(([k, v]) => `${k}: ${gradeValue(v)}`).join('; ');
  return value === undefined ? '' : String(value);
}
function gradeRows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null) : [];
}
function gradeSubject(f: Record<string, unknown>): string {
  switch (f.claimType) {
    case 'vertex_list': return 'danh sách đỉnh';
    case 'edge_list': return 'danh sách cạnh';
    case 'loop_count': return 'số khuyên';
    case 'odd_count': return 'số đỉnh bậc lẻ';
    case 'component_count': return 'số thành phần liên thông';
    case 'vertex_count': return 'số đỉnh';
    case 'edge_count': return 'số cạnh';
    case 'degree': return `bậc của đỉnh ${f.vertexLabel}`;
    case 'degree_sum': return 'tổng bậc';
    case 'dijkstra_label': return `nhãn tại ${f.vertexLabel}`;
    case 'dijkstra_select': return 'đỉnh được khoanh';
    case 'nn_step': return `đỉnh tiếp theo từ ${f.fromLabel}`;
    case 'odd_vertices': return 'tập đỉnh bậc lẻ';
    case 'walk': return 'dãy đi';
    case 'theorem': return 'kết luận áp dụng định lý';
    case 'length': case 'shortest_length': return 'độ dài đường đi';
    case 'statement': case 'choice': return `kết quả của ý ${f.option}`;
    case 'connected': return 'kết luận liên thông';
    default: return 'đáp số';
  }
}
function gradeSelection(f: Record<string, unknown>): string {
  const candidates = gradeRows(f.candidates);
  if (candidates.length === 0) return 'không còn đỉnh chưa khoanh có nhãn hữu hạn được phép chọn. Hãy dừng thuật toán.';
  const tied = candidates.map((v) => `${v.vertex} (nhãn ${gradeValue(v.label)})`).join(', ');
  return `bài khoanh ${gradeValue(f.displayGot)} có nhãn ${gradeValue(f.chosenLabel)}, trong khi ${tied} có nhãn nhỏ nhất chưa khoanh. `
    + `Phải khoanh ${candidates.length === 1 ? candidates[0]!.vertex : `một trong các đỉnh đồng hạng ${candidates.map((v) => v.vertex).join(', ')}`}.`;
}
function gradeHamilton(f: Record<string, unknown>): string {
  const witness = Array.isArray(f.hamiltonWitness) ? f.hamiltonWitness.join('–') : '';
  const conclusion = witness ? ` Đồ thị vẫn có ${f.kind === 'path' ? 'đường đi' : 'chu trình'} Hamilton ${witness}; hãy kiểm tra từng cạnh của đường này.`
    : ` Hãy kiểm tra lại kết luận tồn tại trên đủ ${f.vertexCount} đỉnh, không suy ngược từ điều kiện đủ.`;
  if (Number(f.vertexCount) < Number(f.minimumOrder)) return `Dirac và Ore yêu cầu ít nhất ${f.minimumOrder} đỉnh, nhưng đồ thị chỉ có ${f.vertexCount} đỉnh. Không được áp dụng định lý khi thiếu giả thiết này.` + conclusion;
  if (f.theorem === 'dirac') {
    const violations = gradeRows(f.diracViolations);
    return `Dirac cần mọi bậc trên đồ thị đơn nền ≥ n/${f.divisor}, với n = ${f.vertexCount} nên ngưỡng là ${f.threshold}. `
      + (violations.length > 0 ? `${violations.map((v) => `${v.vertex} có bậc ${v.degree}`).join(', ')} không đạt ngưỡng.` : 'Mọi bậc đều đạt ngưỡng nên đồ thị thỏa điều kiện Dirac.')
      + ' Dirac chỉ là điều kiện đủ; không thỏa không suy ra không có chu trình Hamilton.' + conclusion;
  }
  if (f.theorem === 'ore') {
    const pair = typeof f.oreViolation === 'object' && f.oreViolation !== null ? f.oreViolation as Record<string, unknown> : undefined;
    return `Ore cần tổng bậc của mọi cặp đỉnh không kề ≥ n = ${f.vertexCount}. `
      + (pair === undefined ? 'Các cặp đỉnh không kề đều thỏa điều kiện này.' : `${pair.u} và ${pair.v} không kề, có tổng bậc ${pair.sum}, nhỏ hơn ${f.vertexCount}.`)
      + ' Ore chỉ là điều kiện đủ; không được suy ngược để phủ định chu trình Hamilton.' + conclusion;
  }
  return `Lý do đã nêu chưa chứng minh được kết luận Hamilton trên ${f.vertexCount} đỉnh. `
    + `Bậc trên đồ thị đơn nền: ${gradeRows(f.neighborDegrees).map((v) => `${v.vertex}: ${v.degree}`).join(', ')}.` + conclusion;
}

export const gradeTemplates = {
  invalidThreshold: 'Ngưỡng tin cậy phải là số hữu hạn trong khoảng từ 0 đến 1.',
  correct: 'Các mệnh đề kiểm tra được đều đúng và các bước đã nêu đều hợp lệ.',
  insufficient: 'Chưa có mệnh đề đủ dữ kiện để kiểm tra. Cần bổ sung bài làm hoặc nhập lại dữ liệu còn thiếu.',
  answerOnly: 'Không có bước giải để kiểm tra; chỉ chấm đáp số.',
  skipped: (step: number, reason: unknown): string => `Bỏ qua bước ${step}: ` + (reason === 'null_statement'
    ? 'ý này chưa đủ dữ kiện để kết luận đúng hay sai.'
    : reason === 'ambiguous_nearest_answer' ? 'láng giềng gần nhất có đồng hạng; cần bổ sung đường đi hoặc các bước chọn để kiểm tra độ dài khác lượt giải mẫu.'
    : reason === 'missing_weights' ? 'chưa có đủ trọng số cạnh để kiểm tra.'
      : reason === 'missing_source' ? 'chưa xác định đỉnh nguồn Dijkstra; cần bổ sung bước khởi tạo.'
        : reason === 'missing_options' ? 'đề chưa có các phương án có cấu trúc để kiểm tra lựa chọn.'
          : reason === 'unknown_statement' ? 'mã ý không có trong đề đã đọc; cần xác nhận lại mã ý.'
            : reason === 'answer_shape' ? 'dạng đáp số chưa xác định được nội dung cần kiểm tra.'
              : 'chưa đủ dữ kiện để kiểm tra mệnh đề.'),
  confirm: (facts: Record<string, unknown>): string => `Cần xác nhận ở bước ${facts.step}: `
    + gradeRows(facts.confirmationDetails).map((detail) => {
      if (detail.kind === 'w') return `trọng số cạnh ${detail.edge} đọc được là ${Array.isArray(detail.candidates) ? detail.candidates.map(gradeValue).join(' hoặc ') : ''}`;
      if (detail.kind === 'u' || detail.kind === 'v') return `đầu mút cạnh ${detail.edge} đọc được là ${Array.isArray(detail.candidates) ? detail.candidates.map(gradeValue).join(' hoặc ') : ''}`;
      if (detail.kind === 'name') return `tên cạnh ${detail.edge} đọc được là ${gradeValue(detail.candidates)}`;
      if (detail.kind === 'edge_count_mismatch') return `dãy có ${facts.walkVertexCount} đỉnh, cần ${facts.expectedEdges} cạnh nhưng đã đọc ${facts.readEdgeCount} cạnh`;
      if (detail.kind === 'claim') return `${gradeSubject(facts)} đọc được là ${gradeValue(facts.displayGot)} chưa chắc chắn`;
      return 'phần đồ thị hoặc yêu cầu đề đã đọc còn chưa chắc chắn';
    }).join('; ') + '. Hãy đối chiếu ảnh hoặc nhập lại dữ kiện này trước khi kết luận.',
  later: (step: number, uncertain: boolean): string => `Bước ${step} cũng ${uncertain ? 'cần xác nhận dữ liệu' : 'chưa hợp lệ khi kiểm tra bằng trạng thái toán đúng'}; kết luận chính vẫn giữ bước đầu tiên.`,
  error: (code: ErrorCode, facts: Record<string, unknown>): string => {
    const prefix = `Bước ${facts.step}: `;
    const position = facts.position === undefined ? '' : ` tại vị trí ${facts.position} trong dãy đỉnh`;
    const pair = facts.edgeLabel || `${facts.fromLabel ?? facts.viaLabel ?? ''}–${facts.toLabel ?? facts.vertexLabel ?? ''}`;
    const comparison = `${gradeSubject(facts)} đúng là ${gradeValue(facts.displayExpected)}, bài ghi ${gradeValue(facts.displayGot)}`;
    switch (code) {
      case 'SAI_PHEP_TINH':
        if (facts.claimType === 'vertex_list') return prefix + comparison + '. Hãy đối chiếu tập đỉnh, liệt kê mỗi đỉnh đúng một lần.';
        if (facts.claimType === 'dijkstra_label' && facts.candidate !== undefined) {
          const sum = `tại ${facts.vertexLabel}, n(${facts.viaLabel}) + w(${pair}) = ${facts.nVia ?? facts.viaDistance} + ${facts.w ?? facts.weight} = ${facts.candidate}`;
          return prefix + sum + (facts.reason === 'minimum_not_taken'
            ? `; ${facts.candidate} > ${facts.old} nên giữ nhãn ${facts.old} của ${facts.vertexLabel}, bài ghi ${gradeValue(facts.got)}. Hãy lấy nhãn nhỏ hơn giữa nhãn cũ và giá trị qua ${facts.viaLabel}.`
            : `, nhưng bài ghi ${gradeValue(facts.got)}. Hãy tính lại tổng rồi so với nhãn cũ ${gradeValue(facts.old)} để lấy nhãn nhỏ hơn.`);
        }
        return prefix + comparison + '. Hãy tính lại từ các cạnh và trọng số đã cho.';
      case 'SAI_DIEU_KIEN':
        if (facts.claimType === 'hamilton_exists' || facts.claimType === 'theorem') return prefix + gradeHamilton(facts);
        if (facts.claimType === 'euler_exists') return prefix + `phần có cạnh có ${facts.componentCount} thành phần liên thông và ${facts.oddCount} đỉnh bậc lẻ (${gradeValue(facts.oddVertexLabels)}). `
          + 'Chu trình Euler cần phần có cạnh liên thông và mọi bậc chẵn; đường đi Euler cho phép đúng hai đỉnh bậc lẻ. Hãy xét lại điều kiện của loại đường đề yêu cầu.';
        if (facts.claimType === 'postman_duplicate') return prefix + `đường lặp ${gradeValue(facts.walkVertices)} chưa nối hợp lệ một cặp đỉnh bậc lẻ bằng đường ngắn nhất. Hãy chọn cặp lẻ và đường ngắn nhất thuộc một ghép cặp tối ưu.`;
        if (facts.claimType === 'dijkstra_init') return prefix + 'đã khoanh các đỉnh nên không được khởi tạo lại giữa lượt chạy. Hãy tiếp tục từ các nhãn đã cố định.';
        return prefix + `dãy đi có ${gradeValue(facts.got)} đỉnh phân biệt, cần ít nhất ${gradeValue(facts.minimum)} để tạo chu trình. Hãy kiểm tra lại điều kiện của loại đường.`;
      case 'BO_SOT': {
        if (facts.claimType === 'vertex_list') return prefix + comparison + '. Hãy bổ sung các đỉnh còn thiếu.';
        if (facts.claimType === 'edge_list') return prefix + comparison + '. Hãy bổ sung các cạnh còn thiếu, kể cả cạnh song song và khuyên.';
        if (facts.claimType === 'odd_vertices') {
          const missing = gradeRows(facts.missingOdd).map((v) => `${v.vertex} (bậc ${v.degree})`).join(', ');
          const extra = gradeRows(facts.extraOdd).map((v) => `${v.vertex} (bậc ${gradeValue(v.degree)})`).join(', ');
          return prefix + (missing ? `còn thiếu đỉnh bậc lẻ ${missing}. ` : '') + (extra ? `Đã liệt kê thừa ${extra}. ` : '')
            + `Tập đỉnh bậc lẻ đúng là ${gradeValue(facts.displayExpected)}. Hãy liệt kê mỗi đỉnh bậc lẻ đúng một lần.`;
        }
        if (facts.claimType === 'dijkstra_select') return prefix + `chưa ghi các nhãn cần cập nhật tại ${gradeValue(facts.missingVertices)} trước khi khoanh tiếp. Hãy bổ sung các nhãn này từ đỉnh vừa khoanh.`;
        return prefix + (gradeValue(facts.missingEdges) ? `đường còn thiếu cạnh ${gradeValue(facts.missingEdges)}` : `đường còn thiếu đỉnh ${gradeValue(facts.missingVertices)}`)
          + (facts.position === undefined ? '' : ` khi kết thúc dãy ở vị trí ${facts.position}`)
          + '. Hãy bổ sung các phần tử này rồi kiểm tra lại toàn bộ dãy đi.';
      }
      case 'CANH_KHONG_TON_TAI':
        if (facts.claimType === 'edge_list') return prefix + comparison + '. Danh sách có cạnh không tồn tại hoặc liệt kê thừa số lần; hãy kiểm tra từng cặp đầu mút.';
        return prefix + (facts.reason === 'unknown_vertex' || (!facts.fromLabel && !facts.viaLabel)
        ? `đỉnh ${facts.vertexLabel} không có trong đồ thị${position}` : `không có cạnh ${pair} nối các đỉnh được nêu${position}`)
        + '. Hãy sửa đoạn đi này theo các cạnh có trong hình.';
      case 'LAP': return prefix + (facts.reason === 'repeated_vertex' ? `đỉnh ${facts.vertexLabel} đã xuất hiện trước đó${position}`
        : facts.claimType === 'postman_duplicate' ? `cặp ${facts.fromLabel}–${facts.toLabel} dùng lại đỉnh lẻ đã ghép`
          : `cạnh ${pair} đã được đi qua trước đó${position}`)
        + '. Hãy chọn lại đường để không lặp phần tử mà loại đường này chỉ cho đi qua một lần.';
      case 'NHAM_THUAT_TOAN': return prefix + `chuỗi khoanh khớp ${Array.isArray(facts.matchedAlgorithms) ? facts.matchedAlgorithms.map((m) => m === 'prim' ? 'Prim' : 'láng giềng gần nhất').join(' và ') : ''} (chọn cạnh nhỏ nhất), thay vì nhãn nhỏ nhất của Dijkstra; ` + gradeSelection(facts);
      case 'SAI_LUA_CHON':
        if (facts.claimType === 'dijkstra_select') return prefix + gradeSelection(facts);
        if (facts.claimType === 'nn_step') return prefix + (facts.gotFromLabel !== facts.fromLabel
          ? `đang ở ${facts.fromLabel} nhưng bài đi từ ${facts.gotFromLabel}. Hãy tiếp tục từ ${facts.fromLabel}.`
          : `từ ${facts.fromLabel}, bài chọn ${gradeValue(facts.displayGot)} với trọng số ${gradeValue(facts.chosenWeight)}; phải chọn ${gradeValue(facts.displayExpected)} với trọng số nhỏ nhất ${gradeValue(facts.minimumWeight)} trong các đỉnh chưa thăm. Hãy chọn lại láng giềng gần nhất.`);
        return prefix + comparison + '. Hãy chọn lại cặp lẻ hoặc cạnh có chi phí nhỏ nhất hợp lệ.';
      case 'KET_LUAN_KHONG_SUY_RA':
        if (facts.claimType === 'dijkstra_label') return prefix + `nhãn đúng tại ${facts.vertexLabel} là ${gradeValue(facts.displayExpected)}, nhưng ${facts.viaLabel} không phải đỉnh liền trước cho nhãn đó. Hãy truy vết qua một đỉnh cho đúng nhãn này.`;
        if (facts.claimType === 'walk') return prefix + `đường đã nêu có độ dài ${gradeValue(facts.displayGot)}, trong khi độ dài ngắn nhất là ${gradeValue(facts.displayExpected)}. Hãy truy vết lại theo các nhãn ngắn nhất.`;
        return prefix + comparison + '. Hãy sửa kết luận theo kết quả đã kiểm tra.';
      case 'HIEU_SAI_DE':
        if (facts.reason === 'not_closed') return prefix + `dãy kết thúc tại ${facts.endLabel}${position}, chưa quay về ${facts.startLabel} như yêu cầu chu trình. Hãy khép kín về đỉnh xuất phát.`;
        if (facts.reason === 'wrong_end') return prefix + `đề yêu cầu kết thúc tại ${gradeValue(facts.displayExpected)}, bài kết thúc tại ${gradeValue(facts.displayGot)}${position}. Hãy sửa đỉnh cuối.`;
        if (facts.reason === 'wrong_start' || facts.claimType === 'dijkstra_init') return prefix + `đề yêu cầu xuất phát từ ${gradeValue(facts.displayExpected)}, bài xuất phát từ ${gradeValue(facts.displayGot)}${position}. Hãy bắt đầu lại ở ${gradeValue(facts.displayExpected)}.`;
        return prefix + 'bài đưa ra đường đi trong khi đề yêu cầu chu trình. Hãy đi đủ các phần tử bắt buộc rồi quay về đỉnh đầu.';
    }
  },
};

export const validationMessages = {
  object: 'Phải là một đối tượng.',
  array: 'Phải là một danh sách.',
  string: 'Phải là một chuỗi.',
  id: 'Mã định danh phải là chuỗi không rỗng.',
  duplicate: 'Mã định danh bị trùng.',
  vertex: 'Đỉnh không có trong đồ thị.',
  edge: 'Cạnh không có trong đồ thị.',
  directed: 'Phiên bản này chỉ hỗ trợ đồ thị vô hướng (directed = false).',
  vertexLimit: 'Phiên bản này hỗ trợ tối đa 20 đỉnh.',
  weight: 'Trọng số phải là số hữu hạn lớn hơn 0; Dijkstra không áp dụng với trọng số không dương.',
  missingWeight: 'Thiếu trọng số.',
  degreeSequence: `Dãy bậc phải gồm tối đa 20 số nguyên từ 0 đến ${MAX_DEGREE_SEQUENCE_VALUE}.`,
  boolean: 'Phải là giá trị đúng hoặc sai.',
  option: 'Giá trị không thuộc các lựa chọn được hỗ trợ.',
  number: 'Phải là một số hữu hạn.',
  statementSource: 'Mệnh đề nhãn cuối Dijkstra phải chỉ rõ đỉnh nguồn (source).',
  statementStart: 'Mệnh đề bước láng giềng gần nhất phải chỉ rõ đỉnh xuất phát (start).',
  standaloneDijkstra: 'Khởi tạo hoặc khoanh đỉnh Dijkstra không có nghĩa khi đứng riêng trong các ý độc lập; hãy dùng mệnh đề nhãn cuối có đỉnh nguồn.',
} as const;

export function validationMessage(path: string, message: string): string {
  return `${path}: ${message}`;
}

export function unknownVertexMessage(vertex: string): string {
  return `Đỉnh ${vertex} không có trong đồ thị.`;
}

const routeText = (vertices: string[]): string => vertices.length === 0 ? 'dãy rỗng' : vertices.join(' → ');
const listText = (items: string[]): string => items.length === 0 ? '∅' : items.join(', ');
const eulerName = (kind: 'path' | 'circuit' | 'any'): string =>
  kind === 'circuit' ? 'chu trình Euler' : kind === 'path' ? 'đường đi Euler' : 'đường đi hoặc chu trình Euler';
const hamiltonName = (kind: 'path' | 'cycle'): string => kind === 'cycle' ? 'chu trình Hamilton' : 'đường đi Hamilton';

export const basicTemplates = {
  invalidSpec: (errors: string[]): string => `Đề bài không hợp lệ:\n${errors.join('\n')}`,
  vertices: (vertices: string[]): string => `Các đỉnh: ${listText(vertices)}. Có ${vertices.length} đỉnh.`,
  edges: (edges: { name: string; u: string; v: string }[]): string =>
    `Các cạnh: ${listText(edges.map((e) => `${e.name} (${e.u}–${e.v})`))}. Có ${edges.length} cạnh.`,
  elements: (loops: string[], isolated: string[], simple: boolean, parallel: boolean): string =>
    `Các khuyên (mã cạnh): ${listText(loops)}. Đỉnh cô lập: ${listText(isolated)}. `
    + `Đồ thị ${parallel ? 'có' : 'không có'} cạnh song song; đây là ${simple ? 'đơn đồ thị' : 'đa đồ thị (kể cả đồ thị có khuyên)'}.`,
  degree: (vertex: string, value: number): string => `Bậc của đỉnh ${vertex} là ${value}.`,
  degreeSum: (sum: number, edgeCount: number, odd: string[]): string =>
    `Trên toàn đồ thị, tổng bậc = ${sum} = 2 × ${edgeCount}. Các đỉnh bậc lẻ: ${listText(odd)}; số đỉnh bậc lẻ là ${odd.length}.`,
  sequence: (sequence: number[], simple: boolean): string =>
    `Xét dãy bậc (${sequence.join(', ')}), tổng ${sequence.reduce((sum, d) => sum + d, 0)}. `
    + (simple ? 'Với đơn đồ thị, mỗi bậc không vượt số đỉnh trừ 1; dùng Havel–Hakimi: bỏ bậc lớn nhất, giảm các bậc lớn tiếp theo rồi lặp lại.'
      : 'Với đa đồ thị cho phép khuyên, dãy số nguyên không âm tồn tại khi và chỉ khi tổng bậc chẵn; ghép các đầu cạnh để dựng ví dụ.'),
  realization: (graph: Graph): string => `Dựng được đồ thị ví dụ có ${graph.vertices.length} đỉnh, các cạnh: ${listText(graph.edges.map((e) => `${e.id}: ${e.u}–${e.v}`))}. Kiểm tra bậc theo đúng thứ tự dãy đã cho:`,
  noSequence: (simple: boolean): string => simple
    ? 'Dãy không thỏa giới hạn bậc, tổng chẵn hoặc phép giảm Havel–Hakimi; không tồn tại đơn đồ thị có dãy bậc này.'
    : 'Tổng bậc lẻ nên không tồn tại đa đồ thị có dãy bậc này.',
  path: (from: string, to: string, vertices: string[] | null): string => vertices === null
    ? `Duyệt hết các đỉnh có thể đến từ ${from} nhưng không gặp ${to}; không có đường đi giữa hai đỉnh.`
    : `Duyệt theo chiều rộng từ ${from} đến ${to}, được đường đi: ${routeText(vertices)}. Mỗi bước đi theo một cạnh của đồ thị.`,
  component: (vertices: string[]): string => `Một thành phần liên thông gồm các đỉnh: ${listText(vertices)}.`,
  connectivity: (count: number, connected: boolean): string =>
    `Có ${count} thành phần liên thông khi xét toàn bộ đỉnh; đồ thị ${connected ? 'liên thông' : 'không liên thông'}${count === 0 ? ' theo quy ước với đồ thị rỗng' : ''}.`,
  notes: {
    elements: 'Cạnh song song vẫn được đếm riêng; khuyên là một cạnh. Đỉnh cô lập không có cạnh nào kề.',
    degree: 'Mỗi khuyên đóng góp 2 vào bậc. Tổng bậc trên toàn đồ thị bằng hai lần số cạnh; số đỉnh bậc lẻ luôn chẵn.',
    degree_sequence: 'Phải phân biệt đơn đồ thị và đa đồ thị cho phép khuyên: tổng chẵn chưa đủ cho đơn đồ thị. Bậc đỉnh trong đơn đồ thị không vượt số đỉnh trừ 1.',
    path: 'Một đường đi không cần qua mọi đỉnh hay mọi cạnh. Đường từ một đỉnh đến chính nó có thể có độ dài 0.',
    connectivity: 'Liên thông nói chung xét cả đỉnh cô lập. Quy ước đồ thị rỗng là liên thông; quy tắc bỏ đỉnh cô lập chỉ dùng khi xét phần có cạnh của Euler.',
  },
};

export const statementTemplates = {
  result: (id: string, text: string, value: boolean | null): string => `Ý ${id}: “${text}” — ${value === null ? 'Chưa đủ dữ kiện' : value ? 'Đúng' : 'Sai'}.`,
  evidence: (check: StatementCheck, value: boolean | null, facts: Record<string, unknown>): string => {
    switch (check.type) {
      case 'vertex_count': return `Số đỉnh thực tế là ${facts.expected}.`;
      case 'edge_count': return `Số cạnh thực tế là ${facts.expected}; khuyên và cạnh song song đều được đếm riêng.`;
      case 'degree': return `Bậc thực tế là ${facts.expected}; mỗi khuyên đóng góp hai vào bậc.`;
      case 'degree_sum': return `Tổng bậc thực tế trên toàn bộ đồ thị là ${facts.expected}.`;
      case 'odd_vertices': return `Tập đỉnh bậc lẻ (mã đỉnh) là ${listText(facts.expected as string[])}; thứ tự liệt kê không làm thay đổi tập.`;
      case 'connected': return `Khi xét mọi đỉnh, đồ thị ${facts.expected ? 'liên thông' : 'không liên thông'}.`;
      case 'euler_exists': return 'Kiểm tra phần có cạnh liên thông và số đỉnh bậc lẻ: chu trình yêu cầu mọi bậc chẵn; đường đi cho phép không có hoặc có hai đỉnh bậc lẻ.';
      case 'hamilton_exists': return `Kiểm tra chính xác cho thấy ${facts.expected ? 'có' : 'không có'} ${hamiltonName(check.kind)}. `
        + 'Dirac/Ore và quy tắc SGK xét trên đồ thị đơn nền: bỏ khuyên, gộp cạnh song song. '
        + (facts.reasonValid === false ? 'Lý do được nêu không suy ra kết luận: Dirac/Ore chỉ là điều kiện đủ, còn quy tắc bậc và cạnh bắt buộc dành cho chu trình.' : 'Kết luận đã được kiểm tra bằng quy tắc SGK hoặc tìm kiếm đầy đủ.');
      case 'theorem': return `${check.name === 'dirac' ? 'Dirac' : 'Ore'}: ${facts.expected ? 'thỏa' : 'không thỏa'} trên đồ thị đơn nền (bỏ khuyên, gộp cạnh song song). `
        + (facts.applicable ? 'Đây chỉ là điều kiện đủ cho chu trình Hamilton.' : 'Không đủ số đỉnh để áp dụng định lý.');
      case 'walk': return value ? 'Dãy đi đã cho thỏa các yêu cầu về cạnh, đỉnh và việc khép kín của loại đường được nêu.'
        : 'Dãy đi đã cho không thỏa yêu cầu. Cần kiểm tra từng cạnh, số lần đi qua đỉnh/cạnh, việc đi đủ và việc quay về điểm đầu theo loại đường được nêu.';
      case 'shortest_length': return facts.expected === null ? 'Không có đường đi giữa hai đỉnh nên độ dài được nêu không đúng.' : `Độ dài đường đi ngắn nhất thực tế là ${facts.expected}.`;
      case 'length': return value === null
        ? 'Dãy đỉnh đi qua các cạnh song song khác trọng số; cần chỉ rõ cạnh đã đi để xác định độ dài.'
        : facts.validWalk === false ? 'Dãy đỉnh không tạo thành đường đi hợp lệ; có cặp đỉnh không kề hoặc dãy không có đỉnh.'
          : `Độ dài đường đã cho là ${facts.expected}.`;
      case 'dijkstra_label': return (facts.expected === null ? 'Không tới được đỉnh này từ nguồn; nhãn cuối là ∞.' : `Nhãn cuối (khoảng cách ngắn nhất) từ nguồn tới đỉnh này là ${facts.expected}.`)
        + (check.via === undefined ? '' : facts.viaValid ? ' Đỉnh liền trước được nêu thuộc một đường ngắn nhất hợp lệ.' : ' Không có đường ngắn nhất với đỉnh liền trước được nêu.');
      case 'nn_step': return value
        ? 'Có một cách chọn đồng hạng hợp lệ từ đỉnh xuất phát đã cho chứa bước này; mỗi bước chọn đỉnh chưa thăm có cạnh nhẹ nhất, rồi quay về điểm đầu sau khi thăm đủ.'
        : 'Đã xét mọi lựa chọn đồng hạng từ đỉnh xuất phát đã cho; không có cách chạy láng giềng gần nhất hợp lệ chứa bước này.';
      case 'postman_duplicate': return (value ? 'Đường lặp này hợp lệ. ' : 'Đường lặp này không hợp lệ. ')
        + 'Đường phải nối một cặp đỉnh bậc lẻ bằng đường ngắn nhất và thuộc một cách ghép cặp có tổng nhỏ nhất.';
    }
  },
  note: 'Mỗi ý được kiểm tra độc lập theo mệnh đề có cấu trúc; kết quả và thứ tự các ý không ảnh hưởng ý khác. Câu chữ gốc dùng để hiển thị. Một đường đi khác đáp án mẫu vẫn có thể đúng.',
  lengthNote: 'Chỉ biết dãy đỉnh chưa xác định được độ dài nếu có cạnh song song khác trọng số; cần chỉ rõ cạnh đã đi. Đi qua cặp đỉnh không kề thì mệnh đề sai.',
  dijkstraLabelNote: 'Trong một ý độc lập, nhãn Dijkstra là khoảng cách ngắn nhất cuối cùng từ nguồn đã cho. Không tới được có nhãn ∞; có thể có nhiều đỉnh liền trước hợp lệ khi các đường ngắn nhất đồng hạng.',
  nnStepNote: 'Mỗi ý về láng giềng gần nhất dùng riêng đỉnh xuất phát đã cho và xét mọi cách chọn đồng hạng. Một bước hợp lệ vẫn có thể dẫn tới cách chạy bị kẹt trên đồ thị thiếu cạnh.',
};

export const eulerTemplates = {
  degree: (vertex: string, value: number): string => `Bậc của đỉnh ${vertex} là ${value}.`,
  conditions: (connected: boolean, odd: string[]): string =>
    `Các đỉnh có bậc dương ${connected ? 'liên thông' : 'không liên thông'}. `
    + `Có ${odd.length} đỉnh bậc lẻ: ${listText(odd)}. `
    + 'Euler yêu cầu phần có cạnh liên thông; chu trình cần mọi bậc chẵn, đường đi cần 0 hoặc 2 đỉnh bậc lẻ.',
  failure: (reason: EulerFailureReason, want: 'path' | 'circuit' | 'any', start: string | undefined): string => {
    if (reason === 'disconnected') return `Không có ${eulerName(want)} vì các đỉnh có bậc dương không liên thông.`;
    if (reason === 'odd_degrees') return `Không có ${eulerName(want)} vì số đỉnh bậc lẻ không thỏa điều kiện.`;
    return `Không có ${eulerName(want)} xuất phát từ ${start}. Khi còn cạnh, đỉnh đầu phải có bậc dương và phải là một đỉnh bậc lẻ nếu đồ thị có đúng hai đỉnh bậc lẻ.`;
  },
  walk: (kind: 'path' | 'circuit', vertices: string[], edges: string[]): string =>
    `Một ${eulerName(kind)} là: ${routeText(vertices)}. `
    + (edges.length === 0 ? 'Không cần đi qua cạnh nào.' : `Các cạnh theo thứ tự: ${edges.join(' → ')}.`),
  success: (kind: 'path' | 'circuit', edgeCount: number): string =>
    edgeCount === 0
      ? `Đồ thị không có cạnh. Theo quy ước, tồn tại ${eulerName(kind)} có độ dài 0.`
      : `Đường này đi qua đủ ${edgeCount} cạnh, mỗi cạnh đúng một lần${kind === 'circuit' ? ', và quay về đỉnh đầu' : ''}; vậy tồn tại ${eulerName(kind)}.`,
  note: 'Khuyên đóng góp 2 vào bậc. Các cạnh song song là các cạnh riêng biệt. Khi xét Euler, chỉ xét liên thông trên các đỉnh có bậc dương; đường đi Euler có thể khép kín.',
};

export const hamiltonTemplates = {
  underlying: 'Xét đồ thị đơn nền: bỏ các khuyên và gộp các cạnh song song, giữ cạnh xuất hiện đầu tiên làm đại diện. Hamilton chỉ phụ thuộc quan hệ kề giữa các đỉnh phân biệt; Dirac, Ore và các quy tắc SGK dưới đây dùng bậc trên đồ thị đơn nền.',
  conditions: (count: number, connected: boolean): string =>
    `Đồ thị có ${count} đỉnh và ${connected ? 'liên thông' : 'không liên thông'}. Hamilton phải đi qua mọi đỉnh, kể cả đỉnh cô lập.`,
  theorems: (analysis: HamiltonAnalysis, count: number): string => {
    if (!analysis.dirac.applicable) {
      return 'Dirac và Ore yêu cầu đồ thị đơn nền có ít nhất 3 đỉnh; đồ thị này không thỏa giả thiết áp dụng.';
    }
    return `Điều kiện Dirac (mọi bậc ít nhất ${count}/2): ${analysis.dirac.holds ? 'thỏa' : 'không thỏa'}. `
      + `Điều kiện Ore (tổng bậc của mọi cặp đỉnh không kề ít nhất ${count}): ${analysis.ore.holds ? 'thỏa' : 'không thỏa'}. `
      + 'Đây chỉ là các điều kiện đủ; không thỏa không có nghĩa là không có chu trình Hamilton.';
  },
  rule: (event: HamiltonRuleStep, vertexLabel: (id: string) => string, edgeName: (id: string) => string): string => {
    if (event.type === 'insufficient_degree') {
      return `Đỉnh ${vertexLabel(event.vertex)} có bậc ${event.degree}, nhỏ hơn 2, nên không có chu trình Hamilton.`;
    }
    if (event.type === 'force_edges') {
      return `Tại ${vertexLabel(event.vertex)} chỉ còn hai cạnh có thể chọn (${listText(event.availableEdgeIds.map(edgeName))}); chu trình Hamilton buộc phải đi qua cả hai.`;
    }
    if (event.type === 'exclude_edges') {
      return `Đỉnh ${vertexLabel(event.vertex)} đã có hai cạnh bắt buộc (${listText(event.forcedEdgeIds.map(edgeName))}); loại các cạnh ${listText(event.edgeIds.map(edgeName))} khỏi chu trình đang xét.`;
    }
    if (event.reason === 'premature_cycle') {
      return `Các cạnh bắt buộc đã tạo chu trình qua ${listText(event.vertices.map(vertexLabel))}, nhưng chưa qua mọi đỉnh. Mỗi đỉnh trên chu trình đã đủ hai cạnh nên không thể nối thêm; không có chu trình Hamilton.`;
    }
    return event.reason === 'too_few_edges'
      ? `Sau khi loại cạnh, đỉnh ${listText(event.vertices.map(vertexLabel))} chỉ còn ${event.edgeIds.length} cạnh có thể chọn, không đủ hai cạnh của chu trình Hamilton.`
      : `Đỉnh ${listText(event.vertices.map(vertexLabel))} bị buộc chọn ${event.edgeIds.length} cạnh, vượt quá hai cạnh của một chu trình; không có chu trình Hamilton.`;
  },
  search: (kind: 'path' | 'cycle'): string => `Xét các cách đi qua mỗi đỉnh đúng một lần để tìm ${hamiltonName(kind)} thỏa các đỉnh đầu/cuối được yêu cầu.`,
  start: (vertex: string): string => `Bắt đầu tại đỉnh ${vertex}.`,
  advance: (from: string, to: string, edge: string, closing: boolean): string =>
    `Đi từ ${from} đến ${to} qua cạnh ${edge}${closing ? ', khép kín chu trình' : ''}.`,
  verify: (count: number, closed: boolean): string =>
    `Kiểm tra: đi qua đủ ${count} đỉnh, mỗi đỉnh đúng một lần${closed ? ' trước khi quay về đỉnh đầu' : ''}; mọi bước đi đều theo cạnh có trong đồ thị.`,
  success: (kind: 'path' | 'cycle', vertices: string[]): string => `Một ${hamiltonName(kind)} là: ${routeText(vertices)}.`,
  failure: (reason: HamiltonFailureReason, kind: 'path' | 'cycle'): string => {
    switch (reason) {
      case 'empty_graph': return `Đồ thị không có đỉnh nên không có ${hamiltonName(kind)}.`;
      case 'too_few_vertices': return 'Theo quy ước, chu trình Hamilton cần ít nhất 3 đỉnh phân biệt.';
      case 'disconnected': return `Đồ thị không liên thông nên không có ${hamiltonName(kind)} qua mọi đỉnh.`;
      case 'incompatible_endpoints': return `Các đỉnh đầu/cuối được yêu cầu không phù hợp với ${hamiltonName(kind)}: đường đi qua nhiều đỉnh có hai đầu khác nhau, còn chu trình kết thúc tại đỉnh xuất phát.`;
      case 'cycle_rules': return 'Các quy tắc về cạnh bắt buộc đã dẫn tới mâu thuẫn, nên không có chu trình Hamilton.';
      case 'exhausted': return `Đã xét hết các khả năng thỏa quy tắc đi qua mỗi đỉnh đúng một lần và yêu cầu đầu/cuối; không có ${hamiltonName(kind)} thỏa đề bài.`;
    }
  },
  note: 'Hamilton đi qua mỗi đỉnh đúng một lần; chu trình quay lại đỉnh đầu và có ít nhất 3 đỉnh phân biệt. Dirac, Ore và quy tắc SGK xét trên đồ thị đơn nền: bỏ khuyên, gộp cạnh song song. Dirac và Ore chỉ là điều kiện đủ cho chu trình, không phải điều kiện cần. Quy tắc ép hai cạnh áp dụng cho chu trình, không áp dụng cho đường đi Hamilton.',
};

const distanceText = (value: number | null): string => value === null ? '∞' : String(value);

export const dijkstraTemplates = {
  invalidSelection: 'Phải khoanh một đỉnh chưa khoanh có nhãn hữu hạn nhỏ nhất.',
  init: (source: string): string => `Gán nhãn ${source} bằng 0, các đỉnh còn lại bằng ∞.`,
  select: (vertex: string, value: number, tied: string[]): string =>
    `Các đỉnh chưa khoanh có nhãn nhỏ nhất ${value}: ${listText(tied)}. Khoanh ${vertex}; nhãn này được cố định.`,
  update: (vertex: string, update: DijkstraUpdate, via: string): string =>
    `Tại ${vertex}, nhãn qua ${via} là ${update.viaDistance} + ${update.weight} = ${update.candidate}. `
    + `Lấy min(${distanceText(update.old)}, ${update.candidate}) = ${update.new}${update.old === update.new ? '; giữ nguyên nhãn' : '; cập nhật nhãn và đỉnh trước'}.`,
  unreachable: (from: string, to: string): string => `Không còn đỉnh chưa khoanh có nhãn hữu hạn; không có đường đi từ ${from} đến ${to}.`,
  success: (vertices: string[], length: number): string =>
    `Đã khoanh đỉnh đích nên dừng. Truy vết các đỉnh trước, được đường đi ngắn nhất: ${routeText(vertices)}, độ dài ${length}.`,
  note: 'Dijkstra chỉ áp dụng với trọng số dương. Khi nhiều đỉnh cùng nhãn nhỏ nhất, có thể khoanh bất kỳ đỉnh nào trong số đó. Dừng khi khoanh đích, không dừng khi vừa gán nhãn cho đích.',
};

export const tspTemplates = {
  start: (start: string): string => `Áp dụng láng giềng gần nhất từ ${start}: mỗi bước chọn đỉnh chưa thăm gần nhất.`,
  advance: (from: string, to: string, weight: number, tied: string[], closing: boolean): string => closing
    ? `Đã thăm mọi đỉnh, đi từ ${from} về ${to} với trọng số ${weight} để khép kín hành trình.`
    : `Từ ${from}, các đỉnh chưa thăm gần nhất là ${listText(tied)} với trọng số ${weight}; chọn ${to}.`,
  optimal: (start: string): string =>
    `Tìm hành trình tối ưu từ ${start} bằng quy hoạch động Held–Karp: với mỗi tập đỉnh chưa thăm và đỉnh hiện tại, lấy nhỏ nhất của trọng số cạnh tiếp theo cộng chi phí đi hết phần còn lại rồi về điểm đầu.`,
  failure: (reason: TspFailureReason): string => {
    switch (reason) {
      case 'empty_graph': return 'Đồ thị không có đỉnh nên không có hành trình người du lịch.';
      case 'no_neighbor': return 'Không còn cạnh tới đỉnh chưa thăm; cách chọn láng giềng gần nhất này không hoàn thành hành trình.';
      case 'no_return': return 'Đã thăm mọi đỉnh nhưng không có cạnh quay về điểm đầu; cách chọn này không tạo hành trình khép kín.';
      case 'no_tour': return 'Đã xét mọi hành trình đi qua các đỉnh rồi quay về điểm đầu; không có hành trình thỏa yêu cầu.';
    }
  },
  result: (answer: TourAnswer, label: (id: string) => string): string => answer.exists
    ? `Hành trình: ${routeText(answer.walk.vertices.map(label))}. Tổng trọng số là ${answer.length}.`
    : tspTemplates.failure(answer.reason),
  comparison: (start: string, comparison: TspComparison): string => {
    const warning = 'Láng giềng gần nhất không bảo đảm tối ưu.';
    if (comparison.optimalLength === null) return `${warning} Không có hành trình khép kín qua mọi đỉnh.`;
    if (comparison.nearestLength === null) return `${warning} Từ ${start}, cách chọn này không hoàn thành hành trình, trong khi hành trình tối ưu có độ dài ${comparison.optimalLength}.`;
    return `${warning} Từ ${start}: độ dài gần nhất ${comparison.nearestLength}, tối ưu ${comparison.optimalLength}, chênh lệch ${comparison.gap}.`;
  },
  note: 'Láng giềng gần nhất không bảo đảm tối ưu; đồng hạng cho phép nhiều lựa chọn. Hành trình phải quay về điểm đầu. Trên đồ thị thiếu cạnh, cách chọn gần nhất có thể bị kẹt dù vẫn tồn tại hành trình khác.',
};

export const postmanTemplates = {
  constructionFailure: 'Không dựng được chu trình Euler sau khi nhân đôi các đường ghép cặp.',
  degrees: (entries: [string, number][]): string =>
    `Bậc các đỉnh: ${entries.map(([label, value]) => `${label}: ${value}`).join(', ')}. Ghép từng cặp đỉnh bậc lẻ và lặp đường nối để mọi bậc trở thành chẵn.`,
  distances: (odd: string[]): string => odd.length === 0
    ? 'Mọi đỉnh đều có bậc chẵn, không cần lặp thêm cạnh.'
    : `Các đỉnh bậc lẻ: ${listText(odd)}. Dùng Floyd–Warshall tìm độ dài đường đi ngắn nhất giữa từng cặp.`,
  matching: (pairs: PostmanPair[], label: (id: string) => string, length: number): string =>
    `Ghép cặp hoàn hảo có tổng độ dài nhỏ nhất: ${listText(pairs.map((pair) => `${label(pair.from)}–${label(pair.to)} (${pair.length})`))}. Tổng đường lặp là ${length}.`,
  duplicate: (vertices: string[], edges: string[], length: number): string =>
    `Lặp đường ${routeText(vertices)}, gồm các cạnh ${listText(edges)}, độ dài ${length}.`,
  augmented: (entries: [string, number][]): string =>
    'Sau khi đi lặp các đường trên, mọi đỉnh có bậc chẵn. '
    + `Bậc trong đồ thị có thêm các cạnh lặp: ${entries.map(([label, value]) => `${label}: ${value}`).join(', ')}.`,
  eulerCircuit: (start: string, vertices: string[]): string =>
    `Một chu trình Euler xuất phát từ ${start} trên đồ thị có thêm các cạnh lặp là: ${routeText(vertices)}. Chu trình này đi qua mọi cạnh gốc ít nhất một lần và quay về ${start}.`,
  failure: (reason: PostmanFailureReason, start: string): string => reason === 'disconnected'
    ? 'Các đỉnh có bậc dương không liên thông; không thể đi một hành trình qua mọi cạnh.'
    : `Đỉnh xuất phát ${start} cô lập trong khi đồ thị còn cạnh; không thể đi qua mọi cạnh từ đỉnh này.`,
  success: (baseLength: number, duplicateLength: number, length: number): string =>
    `Tổng độ dài nhỏ nhất của hành trình người đưa thư = tổng trọng số các cạnh + tổng đường lặp = ${baseLength} + ${duplicateLength} = ${length}.`,
  note: 'Người đưa thư đi qua mọi cạnh ít nhất một lần và quay về đúng đỉnh xuất phát được yêu cầu. Đỉnh xuất phát có thể có bậc chẵn; ghép cặp các đỉnh bậc lẻ bằng đường ngắn nhất, không nhất thiết bằng một cạnh trực tiếp.',
};
