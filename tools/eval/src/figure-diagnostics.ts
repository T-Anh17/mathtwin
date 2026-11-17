import { normalizeLabel } from '@mathtwin/reader';
import { FigureReader } from '@mathtwin/reader-figure';
import type { BinaryImage, FigureObservation, FigureVertex, Box } from '@mathtwin/reader-figure';
import type { FigureAnnotation } from './figure-geometry.js';
import { distanceToPolyline } from './figure-geometry.js';

export class DevFigureReader extends FigureReader {
  observation?: FigureObservation;
  annotation?: FigureAnnotation;
  protected override detectVertices(binary: BinaryImage, skeleton: Uint8Array): FigureVertex[] {
    if (!this.annotation) return super.detectVertices(binary, skeleton);
    const f = this.annotation, sx = binary.width / f.width, sy = binary.height / f.height;
    return f.vertices.map(v => {
      const points = v.contours.flat();
      const rx = points.length ? Math.max(...points.map(p => Math.abs(p[0] - v.center[0]))) : (v.labelBox[2] - v.labelBox[0]) / 2;
      const ry = points.length ? Math.max(...points.map(p => Math.abs(p[1] - v.center[1]))) : (v.labelBox[3] - v.labelBox[1]) / 2;
      // The oracle supplies only centers/radii, never the truth marker style.
      // Treat all exclusion ellipses uniformly; style is used only by the scorer.
      return { center: [v.center[0] * sx, v.center[1] * sy], rx: rx * sx, ry: ry * sy, score: 1, kind: 'ring' };
    });
  }
  protected override get allowLabelVertices(): boolean { return !this.annotation; }
  protected override get refineVertices(): boolean { return !this.annotation; }
  protected override observe(observation: FigureObservation): void { this.observation = observation; }
}
export interface Counts { correct: number; predicted: number; truth: number }
export const counts = (): Counts => ({ correct: 0, predicted: 0, truth: 0 });
export const rates = (c: Counts) => ({ ...c, precision: c.predicted ? c.correct / c.predicted : null,
  recall: c.truth ? c.correct / c.truth : null, f1: c.predicted + c.truth ? 2 * c.correct / (c.predicted + c.truth) : null });
export function iou(a: Box, b: Box): number {
  const overlap = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  return overlap / ((a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - overlap || 1);
}
/** Global distance-ordered one-to-one pairing, fixed tolerance in ORIGINAL image pixels. */
export function matchCenters(predicted: FigureVertex[], truth: FigureAnnotation['vertices']): Map<number, number> {
  const candidates = predicted.flatMap((v, p) => truth.map((t, q) => {
    const radius = t.contours.length ? Math.max(...t.contours.flat().map(c => Math.hypot(c[0] - t.center[0], c[1] - t.center[1]))) : Math.max(t.labelBox[2] - t.labelBox[0], t.labelBox[3] - t.labelBox[1]) / 2;
    const distance = Math.hypot(v.center[0] - t.center[0], v.center[1] - t.center[1]);
    return { p, q, distance, valid: distance <= radius + 10 };
  })).filter(c => c.valid).sort((a, b) => a.distance - b.distance || a.p - b.p || a.q - b.q);
  const result = new Map<number, number>(), used = new Set<number>();
  for (const c of candidates) if (!result.has(c.p) && !used.has(c.q)) { result.set(c.p, c.q); used.add(c.q); }
  return result;
}
export function measureStages(f: FigureAnnotation, observation: FigureObservation) {
  const matched = matchCenters(observation.vertices, f.vertices);
  const vertices = { correct: matched.size, predicted: observation.vertices.length, truth: f.vertices.length };
  const styles: Record<string, Counts> = Object.fromEntries(['open', 'double', 'dot', 'label-only'].map(s => [s, counts()]));
  for (const v of f.vertices) styles[v.style]!.truth++;
  // Style strata: assign a prediction to its closest truth of the same physical kind;
  // unmatched predictions remain false positives in that stratum. This is NOT style-classification accuracy.
  observation.vertices.forEach((v, p) => {
    const pool = f.vertices.map((t, q) => ({ t, q, d: Math.hypot(t.center[0] - v.center[0], t.center[1] - v.center[1]) }))
      .filter(({ t }) => v.kind === 'ring' ? ['open', 'double'].includes(t.style) : t.style === (v.kind === 'dot' ? 'dot' : 'label-only')).sort((a, b) => a.d - b.d);
    const style = matched.has(p) ? f.vertices[matched.get(p)!]!.style : pool[0]?.t.style ?? (v.kind === 'label' ? 'label-only' : v.kind === 'dot' ? 'dot' : 'open');
    styles[style]!.predicted++; if (matched.has(p)) styles[style]!.correct++;
  });
  const labelCorrect = [...matched].filter(([p, q]) => normalizeLabel(observation.labels[p]!) === normalizeLabel(f.vertices[q]!.label)).length;
  const key = (u: string, v: string): string => JSON.stringify([u, v].sort());
  const endpoint = (p: number): string => matched.has(p) ? f.vertices[matched.get(p)!]!.id : `?${p}`;
  const predicted = observation.paths.map((p, i) => ({ key: key(endpoint(p.u), endpoint(p.v)), path: p, edge: observation.edges[i]!, i }));
  const available = new Set(f.edges.map((_, i) => i)), pairings: { p: number; t: number }[] = [];
  const choices = predicted.flatMap((p, pi) => f.edges.flatMap((t, ti) => p.key !== key(t.u, t.v) ? [] : [{ pi, ti,
    distance: p.path.points.filter((_, i) => i % 12 === 0).reduce((sum, point) => sum + distanceToPolyline(point, t.polyline), 0) / Math.ceil(p.path.points.length / 12) }]))
    .sort((a, b) => a.distance - b.distance || a.pi - b.pi || a.ti - b.ti);
  const used = new Set<number>();
  for (const c of choices) if (!used.has(c.pi) && available.has(c.ti)) { used.add(c.pi); available.delete(c.ti); pairings.push({ p: c.pi, t: c.ti }); }
  const edges = { correct: pairings.length, predicted: predicted.length, truth: f.edges.length };
  const loops = { correct: pairings.filter(c => f.edges[c.t]!.u === f.edges[c.t]!.v).length,
    predicted: predicted.filter(p => p.path.u === p.path.v).length, truth: f.edges.filter(e => e.u === e.v).length };
  const truthCounts = new Map<string, number>(), predCounts = new Map<string, number>();
  f.edges.forEach(e => { const k = key(e.u, e.v); truthCounts.set(k, (truthCounts.get(k) ?? 0) + 1); });
  predicted.forEach(p => predCounts.set(p.key, (predCounts.get(p.key) ?? 0) + 1));
  const parallelKeys = new Set([...truthCounts, ...predCounts].filter(([k, n]) => n > 1 && JSON.parse(k)[0] !== JSON.parse(k)[1]).map(([k]) => k));
  const parallel = counts(); let parallelExact = 0;
  for (const k of parallelKeys) { const t = truthCounts.get(k) ?? 0, p = predCounts.get(k) ?? 0;
    parallel.truth += t; parallel.predicted += p; parallel.correct += Math.min(t, p); if (t === p) parallelExact++; }
  const attributes = { weights: { correct: 0, total: pairings.length }, names: { correct: 0, total: pairings.length } };
  for (const c of pairings) { const p = predicted[c.p]!.edge, t = f.edges[c.t]!;
    if (p.w === t.w) attributes.weights.correct++; if (p.name === t.name) attributes.names.correct++; }
  return { iou: iou(observation.box, f.box), vertices, styles, labels: { correct: labelCorrect, total: matched.size }, edges, loops, parallel,
    parallelGroups: { correct: parallelExact, total: parallelKeys.size }, attributes,
    crossingDot: f.crossings.some(c => c.dot) ? edges : counts(), crossingNoDot: f.crossings.some(c => !c.dot) ? edges : counts(),
    detail: { matched: [...matched], missedVertices: f.vertices.filter((_, q) => ![...matched.values()].includes(q)).map(v => ({ label: v.label, style: v.style })), observation } };
}
export function summarizeStages(rows: ReturnType<typeof measureStages>[]) {
  const sum = (get: (row: typeof rows[number]) => Counts) => rates(rows.reduce((s, row) => {
    const c = get(row); return { correct: s.correct + c.correct, predicted: s.predicted + c.predicted, truth: s.truth + c.truth };
  }, counts()));
  const ratio = (get: (row: typeof rows[number]) => { correct: number; total: number }) => {
    const c = rows.reduce((s, row) => { const n = get(row); return { correct: s.correct + n.correct, total: s.total + n.total }; }, { correct: 0, total: 0 });
    return { ...c, accuracy: c.total ? c.correct / c.total : null };
  };
  return { images: rows.length, meanFigureIoU: rows.reduce((s, r) => s + r.iou, 0) / (rows.length || 1), vertices: sum(r => r.vertices),
    styles: Object.fromEntries(['open', 'double', 'dot', 'label-only'].map(s => [s, sum(r => r.styles[s]!)])), labels: ratio(r => r.labels), edges: sum(r => r.edges),
    loops: sum(r => r.loops), parallel: sum(r => r.parallel), parallelGroups: ratio(r => r.parallelGroups),
    crossingDot: sum(r => r.crossingDot), crossingNoDot: sum(r => r.crossingNoDot), weights: ratio(r => r.attributes.weights), names: ratio(r => r.attributes.names) };
}
