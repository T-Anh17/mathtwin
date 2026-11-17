import type { ProblemSpec } from '@mathtwin/core';

export type Point = [number, number];
export type Box = [number, number, number, number];
export interface FigureAnnotation {
  version: 1; width: number; height: number; box: Box;
  vertices: { id: string; label: string; center: Point; contours: Point[][]; labelBox: Box; style: string; gap: number }[];
  edges: { id: string; u: string; v: string; polyline: Point[]; w: number | null; name: string | null; weightBox?: Box; nameBox?: Box }[];
  crossings: { point: Point; edges: [string, string]; notVertex: true; dot: boolean }[];
}
export function bounds(points: Point[], margin = 0): Box {
  return [Math.min(...points.map((p) => p[0])) - margin, Math.min(...points.map((p) => p[1])) - margin,
    Math.max(...points.map((p) => p[0])) + margin, Math.max(...points.map((p) => p[1])) + margin];
}
export function boxCorners(b: Box): Point[] { return [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]]; }
export function distanceToPolyline(point: Point, line: Point[]): number {
  return Math.min(...line.slice(1).map((b, i) => {
    const a = line[i]!; const dx = b[0] - a[0]; const dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(point[0] - a[0] - dx * t, point[1] - a[1] - dy * t);
  }));
}
function intersect(a: Point, b: Point, c: Point, d: Point): Point | null {
  const dx = b[0] - a[0]; const dy = b[1] - a[1]; const ex = d[0] - c[0]; const ey = d[1] - c[1];
  const cross = dx * ey - dy * ex;
  if (Math.abs(cross) < 1e-8) return null;
  const t = ((c[0] - a[0]) * ey - (c[1] - a[1]) * ex) / cross;
  const s = ((c[0] - a[0]) * dy - (c[1] - a[1]) * dx) / cross;
  return t >= 0 && t <= 1 && s >= 0 && s <= 1 ? [a[0] + dx * t, a[1] + dy * t] : null;
}
export function findCrossings(figure: Pick<FigureAnnotation, 'edges' | 'vertices'>, dot: boolean): FigureAnnotation['crossings'] {
  const result: FigureAnnotation['crossings'] = [];
  figure.edges.forEach((a, i) => figure.edges.slice(i + 1).forEach((b) => {
    for (let j = 1; j < a.polyline.length; j++) for (let k = 1; k < b.polyline.length; k++) {
      const point = intersect(a.polyline[j - 1]!, a.polyline[j]!, b.polyline[k - 1]!, b.polyline[k]!);
      if (point && !figure.vertices.some((v) => Math.hypot(v.center[0] - point[0], v.center[1] - point[1]) < 36)
        && !result.some((r) => r.edges[0] === a.id && r.edges[1] === b.id && Math.hypot(r.point[0] - point[0], r.point[1] - point[1]) < 3)) {
        result.push({ point, edges: [a.id, b.id], notVertex: true, dot });
      }
    }
  }));
  return result;
}
/** Validate annotations independently against graph truth, including multiplicity, loops and all image coordinates. */
export function validateFigure(figure: FigureAnnotation, truth: ProblemSpec): void {
  const fail = (): never => { throw new Error('figure.json không khớp truth hoặc tọa độ ảnh.'); };
  const point = (p: Point): boolean => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)
    && p[0] >= 0 && p[0] <= figure.width && p[1] >= 0 && p[1] <= figure.height;
  const box = (b: Box): boolean => Array.isArray(b) && b.length === 4 && b[2] > b[0] && b[3] > b[1] && boxCorners(b).every(point);
  if (figure.version !== 1 || !Number.isSafeInteger(figure.width) || !Number.isSafeInteger(figure.height) || !box(figure.box)
    || figure.vertices.length !== truth.graph.vertices.length || figure.edges.length !== truth.graph.edges.length) fail();
  for (const v of truth.graph.vertices) {
    const matches = figure.vertices.filter((a) => a.id === v.id);
    if (matches.length !== 1) fail();
    const a = matches[0]!;
    if (a.label !== v.label || !point(a.center) || !box(a.labelBox) || !a.contours.every((c) => c.length >= 2 && c.every(point))) fail();
  }
  for (const e of truth.graph.edges) {
    const matches = figure.edges.filter((a) => a.id === e.id);
    if (matches.length !== 1) fail();
    const a = matches[0]!;
    if (a.u !== e.u || a.v !== e.v || a.w !== (e.w ?? null) || a.name !== (e.name ?? null)
      || a.polyline.length < 2 || !a.polyline.every(point)) fail();
    for (const [value, b] of [[a.w, a.weightBox], [a.name, a.nameBox]] as const) {
      if ((value === null) !== (b === undefined)) fail();
      if (b && (!box(b) || distanceToPolyline([(b[0] + b[2]) / 2, (b[1] + b[3]) / 2], a.polyline) > 100)) fail();
    }
  }
  const expected = findCrossings(figure, false);
  if (expected.length !== figure.crossings.length) fail();
  figure.crossings.forEach((c, i) => {
    if (c.notVertex !== true || typeof c.dot !== 'boolean' || !point(c.point) || JSON.stringify(c.edges) !== JSON.stringify(expected[i]!.edges)
      || Math.hypot(c.point[0] - expected[i]!.point[0], c.point[1] - expected[i]!.point[1]) > 0.01) fail();
  });
  const inside = (p: Point): boolean => p[0] >= figure.box[0] && p[0] <= figure.box[2] && p[1] >= figure.box[1] && p[1] <= figure.box[3];
  if (!figure.edges.every((e) => e.polyline.every(inside) && (!e.weightBox || boxCorners(e.weightBox).every(inside)) && (!e.nameBox || boxCorners(e.nameBox).every(inside)))
    || !figure.vertices.every((v) => inside(v.center) && v.contours.every((c) => c.every(inside)) && boxCorners(v.labelBox).every(inside))) fail();
}
