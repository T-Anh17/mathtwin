import type { Graph, ProblemSpec, Task } from '@mathtwin/core';
import type { TruthLine } from '@mathtwin/reader';
import { checkedTruth } from './dataset.js';

export const syntheticFixtures = [
  '01-elements-multigraph', '18-short-answer-degree', '07-connectivity-components', '09-euler-loop-parallel',
  '10-hamilton-reverse-cycle', '12-dijkstra-tied-order', '13-tsp-tied-student-tour',
  '14-postman-alternative-matching', '19-four-true-false-items', '20-four-choice-question',
] as const;
export const variants = ['clean', 'tilted', 'blurred', 'low-resolution', 'handwritten'] as const;
export type SyntheticVariant = typeof variants[number];
const escape = (value: string): string => value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);

export function questionLines(task: Task, graph: Graph): string[] {
  const label = (id: string): string => graph.vertices.find((v) => v.id === id)!.label;
  switch (task.type) {
    case 'elements': return ['Liệt kê các đỉnh, các cạnh và nhận biết khuyên, cạnh song song.'];
    case 'degree': return [`Tính bậc của ${task.vertices ? task.vertices.map(label).join(', ') : 'mọi đỉnh'} trong đồ thị.`];
    case 'degree_sequence': return [`Dãy bậc ${task.sequence.join(', ')} có tồn tại đồ thị ${task.simple ? 'đơn' : 'đa'} không?`];
    case 'path': return [`Tìm đường đi từ ${label(task.from)} đến ${label(task.to)}.`];
    case 'connectivity': return ['Xét tính liên thông của đồ thị đã cho.'];
    case 'euler': return [`Tìm ${task.want === 'circuit' ? 'chu trình' : task.want === 'path' ? 'đường đi' : 'đường đi hoặc chu trình'} Euler${task.start ? ` xuất phát từ ${label(task.start)}` : ''}.`];
    case 'hamilton': return [`Tìm ${task.want === 'cycle' ? 'chu trình' : 'đường đi'} Hamilton${task.start ? ` từ ${label(task.start)}` : ''}${task.end ? ` đến ${label(task.end)}` : ''}.`];
    case 'shortest_path': return [`Dùng Dijkstra tìm đường đi ngắn nhất từ ${label(task.from)} đến ${label(task.to)}.`];
    case 'tsp': return [`Bài toán người du lịch: ${task.method === 'both' ? 'dùng láng giềng gần nhất và tìm chu trình tối ưu' : task.method === 'optimal' ? 'tìm chu trình tối ưu' : 'dùng láng giềng gần nhất'}${task.start ? ` từ ${label(task.start)}` : ' từ mọi đỉnh'}.`];
    case 'postman': return [`Tìm hành trình người đưa thư ngắn nhất xuất phát từ ${label(task.start)}, quay về điểm đầu.`];
    case 'statements': return ['Xét các phát biểu sau trên đồ thị:', ...task.items.map((item) => `${item.id}) ${item.text}`)];
  }
}
function wrap(text: string, length = 88): string[] {
  const lines: string[] = []; let line = '';
  for (const word of text.split(/\s+/)) {
    if (line.length + word.length > length) { lines.push(line); line = ''; }
    line += `${line ? ' ' : ''}${word}`;
  }
  if (line) lines.push(line);
  return lines;
}
export function buildSyntheticCase(input: ProblemSpec, variant: SyntheticVariant): { truth: ProblemSpec; svg: string; lines: TruthLine[] } {
  // One validated model supplies BOTH renderer and truth. No second graph/edge list is maintained.
  const truth = structuredClone(input); delete truth.uncertain;
  checkedTruth(truth, 'synthetic');
  const graph = truth.graph;
  const pen = variant === 'handwritten';
  const points = new Map(graph.vertices.map((vertex, i) => {
    const angle = -Math.PI / 2 + i * 2 * Math.PI / graph.vertices.length;
    return [vertex.id, { x: 500 + 220 * Math.cos(angle) + (pen ? Math.sin(i * 5) * 5 : 0),
      y: 560 + 220 * Math.sin(angle) + (pen ? Math.cos(i * 7) * 5 : 0) }];
  }));
  const paths: string[] = []; const labels: string[] = [];
  const figureLines: { text: string; x: number; y: number }[] = [];
  const annotation = (x: number, y: number, text: string): string => {
    figureLines.push({ text, x, y });
    const width = Math.max(28, text.length * 13 + 12);
    return `<rect x="${x - width / 2}" y="${y - 16}" width="${width}" height="28" rx="5" fill="white"/><text x="${x}" y="${y + 5}" text-anchor="middle" font-size="22">${escape(text)}</text>`;
  };
  graph.edges.forEach((edge, i) => {
    const a = points.get(edge.u)!; const b = points.get(edge.v)!;
    const siblings = graph.edges.filter((e) => [e.u, e.v].sort().join('\0') === [edge.u, edge.v].sort().join('\0'));
    const lane = siblings.indexOf(edge) - (siblings.length - 1) / 2;
    let path: string; let x: number; let y: number;
    if (edge.u === edge.v) {
      const angle = Math.atan2(a.y - 560, a.x - 500);
      const dx = Math.cos(angle); const dy = Math.sin(angle); const size = 78 + siblings.indexOf(edge) * 30;
      const c1 = { x: a.x + dx * size - dy * 55, y: a.y + dy * size + dx * 55 };
      const c2 = { x: a.x + dx * size + dy * 55, y: a.y + dy * size - dx * 55 };
      path = `M ${a.x} ${a.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${a.x} ${a.y}`;
      x = a.x + dx * size * 0.85; y = a.y + dy * size * 0.85;
    } else {
      const distance = Math.hypot(b.x - a.x, b.y - a.y);
      const direction = edge.u < edge.v ? 1 : -1;
      const offset = lane * 100 * direction + (pen ? Math.sin(i + 1) * 8 : 0);
      const cx = (a.x + b.x) / 2 - (b.y - a.y) / distance * offset;
      const cy = (a.y + b.y) / 2 + (b.x - a.x) / distance * offset;
      path = `M ${a.x} ${a.y} Q ${cx} ${cy}, ${b.x} ${b.y}`;
      // Keep annotations away from the centre where polygon diagonals often cross.
      // Moving along the edge preserves the association with that edge.
      const t = 0.42;
      x = (1 - t) ** 2 * a.x + 2 * (1 - t) * t * cx + t ** 2 * b.x;
      y = (1 - t) ** 2 * a.y + 2 * (1 - t) * t * cy + t ** 2 * b.y;
    }
    paths.push(`<path d="${path}" fill="none" stroke="#222" stroke-width="${pen ? 2.8 : 2}" stroke-linecap="round"/>`);
    const text = [edge.name, edge.w === undefined ? undefined : String(edge.w)].filter((v) => v !== undefined).join(' : ');
    if (text) labels.push(annotation(x, y, text));
  });
  const format = { tu_luan: 'Tự luận', trac_nghiem: 'Trắc nghiệm: chọn phát biểu đúng', dung_sai: 'Đúng / sai từng ý', tra_loi_ngan: 'Trả lời ngắn' }[truth.questionFormat];
  const text = [`Cho đồ thị vô hướng như hình. ${format}.`, ...questionLines(truth.task, graph)].flatMap((line) => wrap(line));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="900" viewBox="0 0 1000 900">
<metadata>${escape(JSON.stringify(truth))}</metadata>
<rect width="1000" height="900" fill="white"/>
<g font-family="${pen ? 'Comic Sans MS, Segoe Print, sans-serif' : 'Arial, sans-serif'}" fill="#111">
${text.map((line, i) => `<text x="38" y="${40 + i * 30}" font-size="21">${escape(line)}</text>`).join('\n')}
${paths.join('\n')}${labels.join('\n')}
${graph.vertices.map((v) => { const p = points.get(v.id)!; return `<circle cx="${p.x}" cy="${p.y}" r="20" fill="white" stroke="#111" stroke-width="${pen ? 2.8 : 2}"/><text x="${p.x}" y="${p.y + 7}" text-anchor="middle" font-size="22">${escape(v.label)}</text>`; }).join('\n')}
</g></svg>`;
  for (const vertex of graph.vertices) { const point = points.get(vertex.id)!; figureLines.push({ text: vertex.label, ...point }); }
  figureLines.sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: TruthLine[] = [...text.map((text) => ({ text: text.normalize('NFC'), region: 'question' as const })),
    ...figureLines.map(({ text }) => ({ text: text.normalize('NFC'), region: 'figure' as const }))];
  return { truth, svg, lines };
}
