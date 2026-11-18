import type { DijkstraAnswer, EulerAnswer, GraphWalk, HamiltonAnswer, PostmanAnswer, ProblemSpec, Solution, TourAnswer, TspAnswer } from '@mathtwin/core';
import { graphLabels } from './graph-labels.vi.js';

export const solutionVi = {
  title: 'Lời giải chuẩn', answer: 'Đáp án', steps: 'Các bước giải', notes: 'Ghi chú',
  graph: 'Đồ thị của lời giải', tap: 'Chạm một bước để xem phần đồ thị tương ứng.',
  grade: 'Chấm bài làm', photo: 'Chụp bài làm', manual: 'Gõ bài làm',
  choose: 'Chọn cách nhập bài làm', back: 'Quay lại lời giải',
  photoDestination: 'Chụp hoặc chọn ảnh bài làm', manualDestination: 'Nhập bài làm bằng bàn phím',
  step: (index: number) => `Bước ${index}`,
};
const reasons: Record<string, string> = {
  unreachable: 'không có đường đi đến đích', disconnected: 'đồ thị không liên thông',
  odd_degrees: 'không thỏa điều kiện bậc', invalid_start: 'đỉnh xuất phát không phù hợp',
  empty_graph: 'đồ thị rỗng', too_few_vertices: 'không đủ đỉnh', incompatible_endpoints: 'hai đầu mút không phù hợp',
  cycle_rules: 'không thỏa quy tắc chu trình Hamilton', exhausted: 'đã vét cạn các khả năng',
  no_neighbor: 'không còn đỉnh kề hợp lệ', no_return: 'không thể quay về đỉnh đầu', no_tour: 'không có chu trình',
};

/** Present solver-owned answers by task, without computing mathematical results. */
export function answerText(spec: ProblemSpec, solution: Solution): string {
  const { vertex, edge } = graphLabels(spec.graph);
  const list = (items: string[]) => items.length ? items.join(', ') : 'không có';
  const walk = (route: GraphWalk) => {
    const parallel = route.edgeIds.some((id) => {
      const e = spec.graph.edges.find((e) => e.id === id);
      return e && spec.graph.edges.some((other) => other.id !== id && ((other.u === e.u && other.v === e.v) || (other.u === e.v && other.v === e.u)));
    });
    return route.vertices.map(vertex).join(' → ') + (parallel ? ` (qua các cạnh: ${route.edgeIds.map(edge).join(' → ')})` : '');
  };
  const tour = (a: TourAnswer) => a.exists ? `${walk(a.walk)}, độ dài ${a.length}.`
    : `Không tìm được hành trình vì ${reasons[a.reason]}.${a.partialWalk ? ` Đã đi: ${walk(a.partialWalk)}, độ dài ${a.partialLength}.` : ''}`;
  switch (spec.task.type) {
    case 'elements': {
      const a = solution.answer as { vertices: string[]; edges: string[]; vertexCount: number; edgeCount: number; loops: string[]; isolatedVertices: string[]; simple: boolean; hasParallelEdges: boolean };
      return `Đồ thị có ${a.vertexCount} đỉnh: ${list(a.vertices.map(vertex))}; có ${a.edgeCount} cạnh: ${list(a.edges.map(edge))}.\n`
        + `Khuyên: ${list(a.loops.map(edge))}. Đỉnh cô lập: ${list(a.isolatedVertices.map(vertex))}.\n`
        + `${a.simple ? 'Đây là đơn đồ thị.' : 'Đây là đa đồ thị.'} ${a.hasParallelEdges ? 'Có cạnh song song.' : 'Không có cạnh song song.'}`;
    }
    case 'degree': {
      const a = solution.answer as { degrees: Record<string, number>; degreeSum: number; oddVertices: string[] };
      return `${Object.entries(a.degrees).map(([id, degree]) => `Bậc của ${vertex(id)} là ${degree}.`).join('\n')}\n`
        + `Tổng bậc là ${a.degreeSum}. Các đỉnh bậc lẻ: ${list(a.oddVertices.map(vertex))}.`;
    }
    case 'degree_sequence': return (solution.answer as { exists: boolean }).exists
      ? 'Tồn tại đồ thị có dãy bậc đã cho.' : 'Không tồn tại đồ thị có dãy bậc đã cho.';
    case 'connectivity': {
      const a = solution.answer as { connected: boolean; components: string[][] };
      return `Đồ thị ${a.connected ? 'liên thông' : 'không liên thông'}. Các thành phần liên thông: ${a.components.map((vs) => `{${vs.map(vertex).join(', ')}}`).join('; ') || 'không có'}.`;
    }
    case 'path': case 'shortest_path': {
      const a = solution.answer as DijkstraAnswer | { exists: true; walk: GraphWalk };
      const from = vertex(spec.task.from), to = vertex(spec.task.to);
      return a.exists ? `${spec.task.type === 'shortest_path' ? 'Đường đi ngắn nhất' : 'Một đường đi'} từ ${from} đến ${to}: ${walk(a.walk)}${'length' in a ? `, độ dài ${a.length}` : ''}.`
        : `Không có đường đi từ ${from} đến ${to}.`;
    }
    case 'euler': case 'hamilton': {
      const a = solution.answer as EulerAnswer | HamiltonAnswer;
      const family = spec.task.type === 'euler' ? 'Euler' : 'Hamilton';
      if (a.exists) return `${a.kind === 'path' ? 'Đường đi' : 'Chu trình'} ${family}: ${walk(a.walk)}.`;
      const want = spec.task.want === 'any' ? 'đường đi hoặc chu trình' : spec.task.want === 'path' ? 'đường đi' : 'chu trình';
      return `Không có ${want} ${family} thỏa yêu cầu vì ${reasons[a.reason]}.`;
    }
    case 'tsp': {
      const a = solution.answer as TspAnswer;
      return [
        ...(a.nearestNeighbor ?? []).map((entry) => `Láng giềng gần nhất từ ${vertex(entry.start)}: ${tour(entry.answer)}`),
        ...(a.optimal ? [`Hành trình tối ưu: ${tour(a.optimal)}`] : []),
        ...(a.comparison ?? []).map((c) => `Từ ${vertex(c.start)}: độ dài láng giềng gần nhất ${c.nearestLength ?? 'không có'}, độ dài tối ưu ${c.optimalLength ?? 'không có'}, chênh lệch ${c.gap ?? 'không xác định'}.`),
      ].join('\n');
    }
    case 'postman': {
      const a = solution.answer as PostmanAnswer;
      return a.exists ? `Hành trình người đưa thư: ${walk(a.walk)}, độ dài ${a.length}.\nTổng trọng số ban đầu ${a.baseLength}; độ dài đi lặp ${a.duplicateLength}.`
        + (a.duplicates.length ? ` Các cạnh đi lặp: ${a.duplicates.map((d) => edge(d.originalEdgeId)).join(', ')}.` : '')
        : `Không có hành trình người đưa thư thỏa yêu cầu vì ${reasons[a.reason]}.`;
    }
    case 'statements': {
      const a = solution.answer as Record<string, boolean | null>;
      return spec.task.items.map((item, i) => `Ý ${i + 1} (${item.text}): ${a[item.id] === null ? 'Chưa đủ căn cứ' : a[item.id] ? 'Đúng' : 'Sai'}.`).join('\n');
    }
  }
}

export function solutionDisplayText(spec: ProblemSpec, solution: Solution, text: string): string {
  const realization = spec.task.type === 'degree_sequence' ? solution.answer as { graph?: ProblemSpec['graph'] } : undefined;
  return graphLabels(realization?.graph ?? spec.graph).text(text).replace('Các khuyên (mã cạnh):', 'Các khuyên:');
}
