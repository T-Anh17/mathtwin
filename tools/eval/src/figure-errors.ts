import type { FigureObservation, Point, Box } from '@mathtwin/reader-figure';
import type { FigureAnnotation } from './figure-geometry.js';
import { distanceToPolyline } from './figure-geometry.js';
import { matchCenters } from './figure-diagnostics.js';

export const falseVertexSources = ['crossing', 'glyph', 'split-ring', 'endpoint', 'loop', 'other'] as const;
export type FalseVertexSource = typeof falseVertexSources[number];
const distance = (a: Point, b: Point): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
const boxDistance = (p: Point, b: Box): number => Math.hypot(Math.max(b[0] - p[0], 0, p[0] - b[2]), Math.max(b[1] - p[1], 0, p[1] - b[3]));
/** Post-read dev audit only. Mutually exclusive proximity attribution, not reader input. */
export function classifyFigureErrors(f: FigureAnnotation, observation: FigureObservation) {
  const matched = matchCenters(observation.vertices, f.vertices), truthMatched = new Set(matched.values());
  const glyphs = [...f.vertices.map(v => v.labelBox), ...f.edges.flatMap(e => [e.weightBox, e.nameBox].filter((b): b is Box => !!b))];
  const falseVertices = observation.vertices.flatMap((v, i) => {
    if (matched.has(i)) return [];
    const tolerance = Math.max(v.rx, v.ry) + 8;
    let source: FalseVertexSource = 'other';
    if (f.crossings.some(c => distance(c.point, v.center) <= tolerance)) source = 'crossing';
    else if (glyphs.some(b => boxDistance(v.center, b) <= 5)) source = 'glyph';
    else if (f.vertices.some(t => t.contours.some(c => distanceToPolyline(v.center, c) <= tolerance))) source = 'split-ring';
    else if (f.edges.some(e => [e.polyline[0]!, e.polyline.at(-1)!].some(p => distance(p, v.center) <= tolerance + 10))) source = 'endpoint';
    else if (f.edges.some(e => e.u === e.v && distanceToPolyline(v.center, e.polyline) <= tolerance)) source = 'loop';
    return [{ index: i, center: v.center, kind: v.kind, source }];
  });
  const missed = f.vertices.filter((_v, i) => !truthMatched.has(i)).map(v => ({ id: v.id, style: v.style }));
  const key = (u: string, v: string): string => JSON.stringify([u, v].sort());
  const keys = f.edges.map(e => key(e.u, e.v)), available = new Set(keys.map((_k, i) => i));
  const endpoint = (i: number): string => matched.has(i) ? f.vertices[matched.get(i)!]!.id : `?${i}`;
  const extras: { loop: boolean; parallel: boolean }[] = [];
  const predictedKeys = observation.paths.map(p => key(endpoint(p.u), endpoint(p.v)));
  observation.paths.forEach((p, i) => {
    const k = predictedKeys[i]!, truth = [...available].find(j => keys[j] === k);
    if (truth !== undefined) available.delete(truth);
    else extras.push({ loop: p.u === p.v, parallel: p.u !== p.v && predictedKeys.filter(q => q === k).length > 1 });
  });
  const missingEdges = [...available].map(i => f.edges[i]!);
  return { falseVertices, missed,
    sources: Object.fromEntries(falseVertexSources.map(s => [s, falseVertices.filter(v => v.source === s).length])) as Record<FalseVertexSource, number>,
    missedByStyle: Object.fromEntries(['open', 'double', 'dot', 'label-only'].map(s => [s, missed.filter(v => v.style === s).length])),
    edges: { missing: missingEdges.length, extra: extras.length,
      missingLoops: missingEdges.filter(e => e.u === e.v).length, extraLoops: extras.filter(e => e.loop).length,
      missingParallel: missingEdges.filter(e => e.u !== e.v && keys.filter(k => k === key(e.u,e.v)).length > 1).length,
      extraParallel: extras.filter(e => e.parallel).length } };
}
export function summarizeFigureErrors(rows: ReturnType<typeof classifyFigureErrors>[]) {
  const sum = (get: (row: typeof rows[number]) => Record<string, number>) => {
    const result: Record<string, number> = {};
    for (const row of rows) for (const [k, v] of Object.entries(get(row))) result[k] = (result[k] ?? 0) + v;
    return result;
  };
  return { sources: sum(r => r.sources), missedByStyle: sum(r => r.missedByStyle), edges: sum(r => r.edges) };
}
