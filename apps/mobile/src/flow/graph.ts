import type { Graph, ProblemSpec, Solution } from '@mathtwin/core';
import type { ReadDraft } from '@mathtwin/reader';
import { edgeShapes, editorFromGraph } from '../graph-editor.js';
import type { GraphLayout, Session } from './types.js';

export function draftLayout(graph: Graph, draft: ReadDraft, aspect = 1): GraphLayout {
  return { aspect, vertices: graph.vertices.flatMap((v) => {
    const box = draft.vertices.find((p) => p.label === v.label || p.label === v.id)?.box;
    return box ? [{ id: v.id, x: (box[0] + box[2]) / 2000, y: (box[1] + box[3]) / 2000 }] : [];
  }) };
}

/** Prefer confirmed editor positions, then the first matching D page (one coordinate frame). */
export function sessionGraphLayout(s: Session): GraphLayout | undefined {
  if (s.graphLayout) return s.graphLayout;
  if (!s.spec) return undefined;
  for (const page of s.problemPages ?? []) {
    if (!page.figure) continue;
    const photo = s.problemPhotos[page.page];
    const layout = draftLayout(s.spec.graph, page.figure, photo ? photo.height / photo.width : 1);
    if (layout.vertices.length) return layout;
  }
  return undefined;
}

/** Degree-sequence realizations are solver output, not the (usually empty) input graph. */
export function solutionGraph(spec: ProblemSpec, solution: Solution): Graph {
  if (spec.task.type === 'degree_sequence') {
    const answer = solution.answer as { exists: boolean; graph?: Graph };
    if (answer.exists && answer.graph) return answer.graph;
  }
  return spec.graph;
}

export function graphDrawing(graph: Graph, layout?: GraphLayout) {
  const aspect = layout && Number.isFinite(layout.aspect) && layout.aspect > 0 ? layout.aspect : 1;
  const valid = layout?.vertices.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1);
  const editor = editorFromGraph(graph, { aspect, vertices: valid ?? [] });
  const width = 400, height = 400 * aspect;
  const vertices = graph.vertices.map((v, i) => ({ ...v, x: editor.vertices[i]!.x * width, y: editor.vertices[i]!.y * height }));
  const shapes = new Map(edgeShapes(editor, width, height).map((shape) => [shape.key, shape]));
  const edges = graph.edges.map((e, i) => ({ ...e, ...shapes.get(editor.edges[i]!.key)! }));
  // Include curve control points, loops and label margins, even for boundary coordinates.
  const points = [...vertices.map((v) => [v.x, v.y]), ...edges.flatMap((e) => {
    const numbers = e.path.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)?.map(Number) ?? [];
    return [[e.labelX, e.labelY], ...numbers.flatMap((n, i) => i % 2 === 0 ? [[n, numbers[i + 1]!]] : [])];
  })];
  const xs = points.length ? points.map((p) => p[0]!) : [0, width];
  const ys = points.length ? points.map((p) => p[1]!) : [0, height];
  const x = Math.min(...xs) - 48, y = Math.min(...ys) - 48;
  const viewWidth = Math.max(...xs) - x + 48, viewHeight = Math.max(...ys) - y + 48;
  // At 360px the content/card paddings leave 294px: labels must remain >=14px.
  const fontSize = Math.max(18, viewWidth * 16 / 294);
  return { vertices, edges, fontSize, vertexRadius: Math.max(17, fontSize * 0.9),
    viewBox: `${x} ${y} ${viewWidth} ${viewHeight}` };
}
