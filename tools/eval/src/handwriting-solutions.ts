import { connectedComponents, degrees, oddVertices, solve, solveDijkstra, solveEuler, solveHamilton, solvePostman, solveStatements, solveTsp } from '@mathtwin/core';
import type { ProblemSpec } from '@mathtwin/core';
import type { ImageMeta } from './dataset.js';

/** Core provides the correct baseline only for fixture creation. Deliberate student mistakes
 * are written into BOTH the rendered page and transcription; the reader never sees this baseline. */
export function handwritingSolution(spec: ProblemSpec, incorrect: boolean) {
  const { graph, task } = spec;
  const label = (id: string): string => graph.vertices.find((v) => v.id === id)!.label;
  const walk = (ids: string[]): string => ids.map(label).join(' → ');
  const prose: string[] = [];
  const studentErrors: NonNullable<ImageMeta['studentErrors']> = [];
  let table: string[][] | undefined;
  let correction: { before: number; discarded: string; replacement: string } | undefined;
  const write = (expected: string, wrong: string, kind: NonNullable<ImageMeta['studentErrors']>[number]['kind'], description: string, discarded: string): void => {
    const written = incorrect ? wrong : expected;
    correction = { before: prose.length, discarded, replacement: written };
    prose.push(written);
    if (incorrect) studentErrors.push({ kind, written, expected, description });
  };
  const sum = Object.values(degrees(graph)).reduce((a, b) => a + b, 0);
  switch (task.type) {
    case 'elements':
      prose.push(`${incorrect ? 'Em liệt kê tập đỉnh' : 'Các đỉnh là'} ${graph.vertices.map((v) => v.label).join(', ')}.`);
      write(`Đồ thị có ${graph.edges.length} cạnh.`, `Đồ thị có ${graph.edges.length + 1} cạnh.`, 'conclusion', 'Đếm thừa một cạnh của đồ thị.', `Số cạnh = ${graph.edges.length + 2}.`);
      prose.push(`Số khuyên là ${graph.edges.filter((e) => e.u === e.v).length}.`);
      break;
    case 'degree':
      prose.push(...(task.vertices ?? graph.vertices.map((v) => v.id)).map((id) => incorrect
        ? `Đếm các đầu cạnh tại ${label(id)}, em được bậc ${degrees(graph)[id]}.` : `Bậc của ${label(id)} bằng ${degrees(graph)[id]}.`));
      write(`Tổng bậc = 2 × số cạnh = 2 × ${graph.edges.length} = ${sum}.`,
        `Tổng bậc = 2 × số cạnh = 2 × ${graph.edges.length} = ${sum + 1}.`, 'arithmetic', 'Tính sai tổng bậc ở kết quả cuối.', `Tổng bậc = ${sum + 2}.`);
      break;
    case 'connectivity': {
      const components = connectedComponents(graph);
      prose.push(incorrect ? `Em chia các đỉnh thành ${components.length} nhóm liên thông.` : `Có ${components.length} thành phần liên thông.`);
      const connected = components.length <= 1;
      write(`Đồ thị ${connected ? '' : 'không '}liên thông.`, `Đồ thị ${connected ? 'không ' : ''}liên thông.`, 'conclusion', 'Kết luận liên thông trái với các thành phần đã tìm.', 'Đồ thị không có thành phần liên thông.');
      break;
    }
    case 'euler': {
      const answer = solveEuler(graph, task).answer;
      if (!answer.exists) throw new Error('Fixture Euler cần có đường đi để tạo bài làm mẫu.');
      const vertices = answer.walk.vertices;
      prose.push(incorrect ? `Em đếm được ${oddVertices(graph).length} đỉnh có bậc lẻ.` : `Có ${oddVertices(graph).length} đỉnh bậc lẻ.`);
      write(walk(vertices), walk([...vertices, vertices.at(-1)!]), 'vertex', 'Viết thêm một đỉnh cuối, làm đường Euler thừa một bước.', walk(vertices.slice(0, -1)));
      const firstEdges = answer.walk.edgeIds.slice(0, 2).map((id) => {
        const edge = graph.edges.find((e) => e.id === id)!;
        return `${label(edge.u)}${label(edge.v)}${edge.name ? ` (${edge.name})` : ''}`;
      });
      prose.push(incorrect ? `Em đi lần lượt qua cạnh ${firstEdges.join(' rồi ')}.` : `Đường Euler bắt đầu qua cạnh ${firstEdges.join(' rồi ')}.`);
      break;
    }
    case 'hamilton': {
      const answer = solveHamilton(graph, task).answer;
      if (!answer.exists) throw new Error('Fixture Hamilton cần có đường đi để tạo bài làm mẫu.');
      const wrong = [...answer.walk.vertices]; wrong[1] = wrong[0]!;
      prose.push(incorrect ? 'Em thử khép một vòng Hamilton qua tất cả đỉnh.' : 'Em tìm chu trình đi qua mọi đỉnh.');
      write(walk(answer.walk.vertices), walk(wrong), 'vertex', 'Lặp đỉnh đầu ở giữa chu trình Hamilton và bỏ một đỉnh.', walk(answer.walk.vertices.slice(0, -2)));
      prose.push('Quay về đỉnh xuất phát sau khi đi qua các đỉnh.');
      break;
    }
    case 'shortest_path': {
      const solution = solveDijkstra(graph, task); const answer = solution.answer;
      if (!answer.exists) throw new Error('Fixture Dijkstra cần có đường đi.');
      table = [['Chọn', ...graph.vertices.map((v) => v.label)], ...solution.trace.map((step) => [label(step.selected),
        ...graph.vertices.map((v) => step.labels[v.id] === null ? '∞' : String(step.labels[v.id]))])];
      prose.push(walk(answer.walk.vertices));
      write(`Đường đi có độ dài ${answer.length}.`, `Đường đi có độ dài ${answer.length + 1}.`, 'arithmetic', 'Cộng sai độ dài dù bảng nhãn cho kết quả khác.', `Độ dài đường đi = ${answer.length + 2}.`);
      const update = solution.trace.flatMap((step) => step.updates).find((item) => item.v === task.to)!;
      prose.push(incorrect ? `Qua cạnh ${label(update.via)}${label(update.v)}, em đổi nhãn ${label(update.v)}.`
        : `Cập nhật nhãn ${label(update.v)} qua cạnh ${label(update.via)}${label(update.v)}.`);
      break;
    }
    case 'tsp': {
      const solved = solveTsp(graph, task);
      const answer = solved.answer.nearestNeighbor?.[0]?.answer ?? solved.answer.optimal;
      if (!answer?.exists) throw new Error('Fixture TSP cần có tour.');
      prose.push(incorrect ? 'Mỗi bước em chọn đỉnh chưa thăm ở gần nhất.' : 'Dùng thuật toán láng giềng gần nhất.', walk(answer.walk.vertices));
      const terms = answer.walk.edgeIds.map((id) => graph.edges.find((e) => e.id === id)!.w!).join(' + ');
      write(`Độ dài = ${terms} = ${answer.length}.`, `Độ dài = ${terms} = ${answer.length + 1}.`, 'arithmetic', 'Cộng sai tổng trọng số của tour.', `Độ dài = ${answer.length + 2}.`);
      break;
    }
    case 'postman': {
      const solution = solvePostman(graph, task); const answer = solution.answer;
      if (!answer.exists) throw new Error('Fixture người đưa thư cần có hành trình.');
      prose.push(`${incorrect ? 'Em liệt kê các đỉnh có bậc lẻ' : 'Các đỉnh bậc lẻ'}: ${oddVertices(graph).map(label).join(', ')}.`,
        `Ghép cặp: ${solution.matching.map((p) => `(${label(p.from)}, ${label(p.to)})`).join('; ')}.`,
        `Lặp lại cạnh ${answer.duplicates.map((copy) => { const edge = graph.edges.find((e) => e.id === copy.originalEdgeId)!; return `(${label(edge.u)}, ${label(edge.v)})`; }).join(', ')} để ghép các đỉnh lẻ.`);
      write(`Tổng = ${answer.baseLength} + ${answer.duplicateLength} = ${answer.length}.`,
        `Tổng = ${answer.baseLength} + ${answer.duplicateLength} = ${answer.length + 1}.`, 'arithmetic', 'Cộng sai tổng độ dài ban đầu và các cạnh lặp.', `Tổng quãng đường = ${answer.length + 2}.`);
      break;
    }
    case 'statements': {
      const answer = solveStatements(graph, task).answer;
      if (spec.questionFormat === 'trac_nghiem') {
        const correct = task.items.find((item) => answer[item.id] === true)!;
        const wrong = task.items.find((item) => item.id === 'C' && answer[item.id] === false) ?? task.items.find((item) => answer[item.id] === false)!;
        const discarded = task.items.find((item) => item.id !== correct.id && item.id !== wrong.id)!;
        write(`Chọn ${correct.id}.`, `Chọn ${wrong.id}.`, 'conclusion', 'Chọn phương án sai thay vì phát biểu đúng.', `Chọn ${discarded.id}.`);
        prose.push(incorrect ? 'Em chọn đáp án sau khi đếm các cạnh tại B.' : 'Hai cạnh AB và BC cùng nhận B làm đầu mút.');
      } else {
        const judgments = task.items.map((item) => `${item.id}) ${answer[item.id] ? 'Đ' : 'S'}`);
        const wrong = [...judgments]; const first = task.items[0]!; wrong[0] = `${first.id}) ${answer[first.id] ? 'S' : 'Đ'}`;
        write(judgments.join(' '), wrong.join(' '), 'conclusion', 'Đánh dấu sai ý đầu của câu đúng/sai.', `${task.items[1]!.id}) Đ`);
        prose.push(incorrect ? 'Em xét lần lượt số đỉnh, số cạnh rồi các ý còn lại.' : 'Em kiểm tra từng ý đúng hoặc sai một cách độc lập.');
      }
      break;
    }
    case 'degree_sequence': case 'path':
      prose.push(...solve(spec).steps.slice(0, 3).map((step) => step.text));
      write(`Đồ thị có ${graph.vertices.length} đỉnh.`, `Đồ thị có ${graph.vertices.length + 1} đỉnh.`, 'conclusion', 'Ghi sai số đỉnh ở phần kết luận.', `Số đỉnh = ${graph.vertices.length + 2}.`);
      break;
  }
  if (!correction) throw new Error('Bài làm mẫu phải có một chỗ gạch sửa trong mạch giải.');
  return { prose, correction, ...(table ? { table } : {}), studentErrors };
}
