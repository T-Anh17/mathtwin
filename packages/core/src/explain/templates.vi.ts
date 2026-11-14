import { MAX_DEGREE_SEQUENCE_VALUE } from '../graph/degree-sequence.js';
import type { EulerFailureReason } from '../solvers/euler.js';
import type { HamiltonFailureReason } from '../solvers/hamilton.js';
import type { HamiltonAnalysis, HamiltonRuleStep } from '../graph/hamilton.js';
import type { DijkstraUpdate } from '../solvers/dijkstra.js';
import type { TourAnswer, TspComparison, TspFailureReason } from '../solvers/tsp.js';
import type { PostmanFailureReason, PostmanPair } from '../solvers/postman.js';
import type { Graph, StatementCheck } from '../types.js';

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
