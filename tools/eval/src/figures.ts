import { createHash } from 'node:crypto';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import type { Graph, ProblemSpec } from '@mathtwin/core';
import { normalizeLabel } from '@mathtwin/reader';
import { checkedTruth, readJson } from './dataset.js';
import { buildHandwritingCase, xml } from './handwriting.js';
import { bounds, boxCorners, distanceToPolyline, findCrossings, validateFigure } from './figure-geometry.js';
import type { Box, Point, FigureAnnotation } from './figure-geometry.js';

export const figureSeed = 210202611;
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}
export function graphKey(graph: Graph): string {
  const label = (id: string): string => normalizeLabel(graph.vertices.find((v) => v.id === id)!.label);
  return createHash('sha256').update(JSON.stringify({ vertices: graph.vertices.map((v) => normalizeLabel(v.label)).sort(),
    edges: graph.edges.map((e) => JSON.stringify([[label(e.u), label(e.v)].sort(), e.w ?? null, e.name ?? null])).sort() })).digest('hex');
}
export function graphSplit(graph: Graph): 'dev' | 'test' {
  return ((parseInt(graphKey(graph).slice(0, 8), 16) ^ figureSeed) >>> 0) % 4 === 0 ? 'test' : 'dev';
}
export function graphOnly(graph: Graph): ProblemSpec {
  return checkedTruth({ graph: structuredClone(graph), task: { type: 'elements' }, questionFormat: 'tu_luan' }, 'figure');
}
export function randomFigureGraph(index: number): Graph {
  const random = seeded(figureSeed + index * 109);
  const n = index % 9 === 0 ? 20 : 3 + Math.floor(random() * 10);
  const vertices = Array.from({ length: n }, (_, i) => ({ id: `v${i + 1}`, label: i === 0 ? (index % 2 ? 'v1' : 'v₁') : i === 1 ? 'Đ' : String.fromCharCode(65 + i) }));
  const edges: Graph['edges'] = [];
  const add = (u: number, v: number, name?: string): void => { edges.push({ id: `e${edges.length + 1}`, u: vertices[u]!.id, v: vertices[v]!.id,
    ...(index % 3 === 0 ? {} : { w: 1 + Math.floor(random() * 99) }), ...(name ? { name } : {}) }); };
  for (let i = 1; i < n; i++) add(i - 1, i);
  add(0, 0, 'm'); add(0, 1, 'a'); if (index % 2 === 0) add(0, 1, 'b');
  // Two diagonals deliberately cross away from any vertex in the circular layout.
  if (n >= 4) { add(0, Math.floor(n / 2)); add(1, Math.floor(n / 2) + 1); }
  return { directed: false, vertices, edges };
}
export interface FigureParameters {
  seed: number; form: 'crop' | 'page'; paper: 'white' | 'ruled' | 'grid-light' | 'grid-dark';
  pen: string; strokeWidth: number; rotation: number; perspective: number; blur: number; jpegQuality: number;
  font: 'patrick' | 'dancing'; curved: boolean; crossingDots: boolean; endpoint: 'touch' | 'gap' | 'overshoot';
}
export function figureParameters(seed: number, form: 'crop' | 'page', variant: number): FigureParameters {
  const random = seeded(seed);
  return { seed, form, paper: (['white', 'ruled', 'grid-light', 'grid-dark'] as const)[variant % 4]!,
    pen: ['#183f8b', '#272327', '#653884'][variant % 3]!, strokeWidth: 1.5 + random() * 2.5,
    rotation: (random() * 16 - 8), perspective: (random() * 2 - 1) * 0.08,
    blur: variant % 3 === 0 ? 0 : 0.35 + random() * 0.5, jpegQuality: 60 + Math.floor(random() * 31),
    font: variant % 2 ? 'dancing' : 'patrick', curved: variant % 2 === 0, crossingDots: variant % 2 === 1,
    endpoint: (['touch', 'gap', 'overshoot'] as const)[variant % 3]! };
}
export function cameraTransform(p: FigureParameters, width: number, height: number): (point: Point) => Point {
  const theta = p.rotation * Math.PI / 180;
  return ([x, y]) => {
    const denominator = 1 + p.perspective * (y / height - 0.5);
    const dx = (x - width / 2) / denominator; const dy = (y - height / 2) / denominator;
    return [width / 2 + 0.78 * (dx * Math.cos(theta) - dy * Math.sin(theta)),
      height / 2 + 0.78 * (dx * Math.sin(theta) + dy * Math.cos(theta))];
  };
}
interface Glyph { text: string; center: Point; size: number; target?: { kind: 'vertex' | 'weight' | 'name'; index: number }; region: 'question' | 'figure' | 'solution' | 'table' }
const path = (points: Point[]): string => points.map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).join(' ');

/** One scene model supplies BOTH the rendered strokes and figure.json; no inferred annotations. */
export function buildFigureScene(truth: ProblemSpec, parameters: FigureParameters) {
  const p = parameters; const random = seeded(p.seed); const width = p.form === 'page' ? 1000 : 1200; const height = p.form === 'page' ? 1440 : 1000;
  const cx = width / 2; const cy = p.form === 'page' ? 535 : height / 2;
  const rx = p.form === 'page' ? 300 : 375; const ry = p.form === 'page' ? 170 : 285;
  const transform = cameraTransform(p, width, height);
  const centers: Point[] = truth.graph.vertices.map((_, i, all) => {
    const angle = -Math.PI / 2 + i * Math.PI * 2 / all.length;
    return [cx + rx * Math.cos(angle) + (random() - 0.5) * 12, cy + ry * Math.sin(angle) + (random() - 0.5) * 12];
  });
  const glyphs: Glyph[] = []; const localVertices: FigureAnnotation['vertices'] = []; const localEdges: FigureAnnotation['edges'] = [];
  truth.graph.vertices.forEach((v, i) => {
    const center = centers[i]!; const styleIndex = (i + Math.floor(p.seed % 4)) % 4;
    const style = ['open', 'double', 'dot', 'label-only'][styleIndex]!;
    const gap = style === 'open' ? 0.1 + random() * 0.3 : 0;
    const contours: Point[][] = [];
    if (styleIndex < 2) for (let ring = 0; ring < (styleIndex === 1 ? 2 : 1); ring++) {
      const start = random() * Math.PI * 2;
      contours.push(Array.from({ length: 65 }, (_, j): Point => {
        const angle = start + j / 64 * Math.PI * 2 * (1 - gap);
        return [center[0] + ring * 3 + (22 + Math.sin(angle * 3) * 2) * Math.cos(angle), center[1] - ring * 2 + 19 * Math.sin(angle)];
      }));
    }
    if (style === 'dot') contours.push(Array.from({ length: 33 }, (_, j): Point => [center[0] + 5 * Math.cos(j / 32 * Math.PI * 2), center[1] + 5 * Math.sin(j / 32 * Math.PI * 2)]));
    const inside = styleIndex < 2 && i % 2 === 0;
    glyphs.push({ text: v.label, center: inside || style === 'label-only' ? [...center] : [center[0] + 30, center[1] - 28],
      size: inside ? 22 : 28, target: { kind: 'vertex', index: i }, region: 'figure' });
    localVertices.push({ id: v.id, label: v.label, center, contours, labelBox: [0, 0, 1, 1], style, gap });
  });
  truth.graph.edges.forEach((edge, i) => {
    const a = centers[truth.graph.vertices.findIndex((v) => v.id === edge.u)]!;
    const b = centers[truth.graph.vertices.findIndex((v) => v.id === edge.v)]!;
    const siblings = truth.graph.edges.filter((e) => [e.u, e.v].sort().join('|') === [edge.u, edge.v].sort().join('|'));
    const lane = siblings.indexOf(edge) - (siblings.length - 1) / 2;
    let polyline: Point[];
    if (edge.u === edge.v) {
      const angle = Math.atan2(a[1] - cy, a[0] - cx) + (i % 3 - 1) * 0.5;
      const radius = 80 + siblings.indexOf(edge) * 35; const dx = Math.cos(angle); const dy = Math.sin(angle);
      polyline = Array.from({ length: 65 }, (_, j): Point => {
        const t = j / 64; const length = radius * Math.sin(Math.PI * t); const side = radius * 0.65 * Math.sin(Math.PI * 2 * t) * Math.sin(Math.PI * t);
        return [a[0] + dx * length - dy * side, a[1] + dy * length + dx * side];
      });
    } else {
      const distance = Math.hypot(b[0] - a[0], b[1] - a[1]); const dx = (b[0] - a[0]) / distance; const dy = (b[1] - a[1]) / distance;
      const offset = lane * 100 * (edge.u < edge.v ? 1 : -1) + (p.curved ? (random() - 0.5) * 110 : 0);
      const radius = (id: string): number => { const style = localVertices.find((v) => v.id === id)!.style; return style === 'dot' ? 5 : style === 'label-only' ? 12 : 22; };
      const stop = (id: string): number => Math.max(0, radius(id) + (p.endpoint === 'gap' ? 10 : p.endpoint === 'overshoot' ? -14 : 0));
      const startStop = stop(edge.u); const endStop = stop(edge.v);
      polyline = Array.from({ length: 65 }, (_, j): Point => {
        const t = j / 64; const along = startStop + (distance - startStop - endStop) * t;
        const bend = 4 * t * (1 - t) * offset + Math.sin(t * 35 + i) * Math.sin(Math.PI * t) * 1.3;
        return [a[0] + dx * along - dy * bend, a[1] + dy * along + dx * bend];
      });
    }
    if (i === 0 && edge.u !== edge.v && p.seed % 3 === 0 && truth.graph.vertices.length >= 4) {
      const other = truth.graph.vertices.findIndex((v, j) => v.id !== edge.u && v.id !== edge.v && localVertices[j]!.style === 'dot');
      if (other >= 0) {
        const target: Point = [centers[other]![0] + 34, centers[other]![1] - 24];
        const start = polyline[0]!; const end = polyline.at(-1)!;
        const control: Point = [2 * target[0] - (start[0] + end[0]) / 2, 2 * target[1] - (start[1] + end[1]) / 2];
        polyline = Array.from({ length: 65 }, (_, j): Point => {
          const t = j / 64;
          return [(1 - t) ** 2 * start[0] + 2 * (1 - t) * t * control[0] + t ** 2 * end[0],
            (1 - t) ** 2 * start[1] + 2 * (1 - t) * t * control[1] + t ** 2 * end[1]];
        });
      }
    }
    localEdges.push({ id: edge.id, u: edge.u, v: edge.v, polyline, w: edge.w ?? null, name: edge.name ?? null });
    const fraction = [0.3, 0.5, 0.7][i % 3]!; const position = polyline[Math.floor(fraction * 64)]!;
    const before = polyline[Math.max(0, Math.floor(fraction * 64) - 1)]!; const after = polyline[Math.min(64, Math.floor(fraction * 64) + 1)]!;
    const norm = Math.hypot(after[0] - before[0], after[1] - before[1]) || 1;
    const normal: Point = [-(after[1] - before[1]) / norm, (after[0] - before[0]) / norm];
    const side = i % 2 ? 1 : -1;
    if (edge.w !== undefined) glyphs.push({ text: String(edge.w), center: [position[0] + normal[0] * 21 * side, position[1] + normal[1] * 21 * side], size: 27, region: 'figure', target: { kind: 'weight', index: i } });
    if (edge.name !== undefined) glyphs.push({ text: edge.name, center: [position[0] - normal[0] * 24 * side, position[1] - normal[1] * 24 * side], size: 23, region: 'figure', target: { kind: 'name', index: i } });
  });
  if (p.form === 'page') {
    // Reuse the synthetic-hw page layout, contextual Vietnamese prose and line wrapping.
    const page = buildHandwritingCase(truth, p.font === 'patrick' ? 'patrick-straight' : 'dancing-straight');
    glyphs.push(...page.placements.filter((g) => g.region !== 'figure' && !g.struck).map((g): Glyph => ({ text: g.text, center: [g.x, g.y], size: g.size, region: g.region })));
  }
  const figure: FigureAnnotation = { version: 1, width, height, box: [0, 0, 1, 1],
    vertices: localVertices.map((v) => ({ ...v, center: transform(v.center), contours: v.contours.map((c) => c.map(transform)) })),
    edges: localEdges.map((e) => ({ ...e, polyline: e.polyline.map(transform) })), crossings: [] };
  figure.crossings = findCrossings(figure, p.crossingDots);
  return { figure, glyphs, transform, parameters, localEdges };
}

export async function renderFigure(truth: ProblemSpec, parameters: FigureParameters, root: string) {
  const scene = buildFigureScene(truth, parameters); const { figure, transform } = scene; const p = parameters;
  const strokes: string[] = []; const textImages: string[] = [];
  const poly = (points: Point[], width = p.strokeWidth, color = p.pen, fill = 'none'): void => {
    strokes.push(`<polyline points="${path(points)}" fill="${fill}" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`);
  };
  if (p.paper !== 'white') {
    const grid = p.paper.startsWith('grid'); const color = p.paper === 'grid-dark' ? '#a3b3c9' : '#d3dce7';
    for (let y = 0; y < figure.height; y += grid ? 25 : 39) poly([transform([0, y]), transform([figure.width, y])], grid ? 0.65 : 0.85, color);
    if (grid) for (let x = 0; x < figure.width; x += 25) poly([transform([x, 0]), transform([x, figure.height])], 0.65, color);
  }
  for (const e of figure.edges) poly(e.polyline);
  for (const v of figure.vertices) for (const contour of v.contours) poly(contour, p.strokeWidth, p.pen, v.style === 'dot' ? p.pen : 'none');
  for (const c of figure.crossings) if (c.dot) strokes.push(`<circle cx="${c.point[0]}" cy="${c.point[1]}" r="3.1" fill="${p.pen}"/>`);
  const fontfile = join(root, 'tools/eval/fonts', p.font === 'patrick' ? 'patrickhand/PatrickHand-Regular.ttf' : 'dancingscript/DancingScript[wght].ttf');
  const family = p.font === 'patrick' ? 'Patrick Hand' : 'Dancing Script';
  const lines: { text: string; region: Glyph['region']; box: Box; struck?: boolean }[] = [];
  for (const glyph of scene.glyphs) {
    const { data, info } = await sharp({ text: { text: `<span foreground="${p.pen}">${xml(glyph.text)}</span>`, font: `${family} ${glyph.size}`, fontfile, dpi: 72, rgba: true } }).png().toBuffer({ resolveWithObject: true });
    const local: Box = glyph.target ? [glyph.center[0] - info.width / 2, glyph.center[1] - info.height / 2, glyph.center[0] + info.width / 2, glyph.center[1] + info.height / 2]
      : [glyph.center[0], glyph.center[1], glyph.center[0] + info.width, glyph.center[1] + info.height];
    const origin = transform([local[0], local[1]]); const right = transform([local[2], local[1]]); const bottom = transform([local[0], local[3]]);
    // A glyph is a tiny affine patch of the projective page. Boxes enclose the actual patch, including Vietnamese diacritics.
    const fourth: Point = [right[0] + bottom[0] - origin[0], right[1] + bottom[1] - origin[1]];
    const box = bounds([origin, right, bottom, fourth], 1);
    const matrix = [(right[0] - origin[0]) / info.width, (right[1] - origin[1]) / info.width,
      (bottom[0] - origin[0]) / info.height, (bottom[1] - origin[1]) / info.height, ...origin];
    textImages.push(`<image width="${info.width}" height="${info.height}" transform="matrix(${matrix.join(' ')})" href="data:image/png;base64,${data.toString('base64')}"/>`);
    if (glyph.target?.kind === 'vertex') figure.vertices[glyph.target.index]!.labelBox = box;
    else if (glyph.target) {
      const edge = figure.edges[glyph.target.index]!;
      edge[glyph.target.kind === 'weight' ? 'weightBox' : 'nameBox'] = box;
      const anchor = transform(glyph.center);
      if (glyph.target.index % 4 === 0) {
        const radius = Math.max(box[2] - box[0], box[3] - box[1]) * 0.65;
        strokes.push(`<ellipse cx="${anchor[0]}" cy="${anchor[1]}" rx="${radius}" ry="${(box[3] - box[1]) * 0.75}" fill="none" stroke="${p.pen}" stroke-width="1.3"/>`);
      } else if (glyph.target.index % 4 === 1) {
        const line = edge.polyline[Math.floor([0.3, 0.5, 0.7][glyph.target.index % 3]! * 64)]!;
        poly([anchor, line], 1.2);
      }
    }
    lines.push({ text: glyph.text.normalize('NFC'), region: glyph.region, box });
  }
  const allPoints = [...figure.vertices.flatMap((v) => [v.center, ...v.contours.flat(), ...boxCorners(v.labelBox)]),
    ...figure.edges.flatMap((e) => [...e.polyline, ...(e.weightBox ? boxCorners(e.weightBox) : []), ...(e.nameBox ? boxCorners(e.nameBox) : [])])];
  // An empty source graph is a valid core fixture; its figure is an explicitly empty region.
  figure.box = allPoints.length ? bounds(allPoints, 12) : bounds([[figure.width * 0.3, figure.height * 0.3], [figure.width * 0.7, figure.height * 0.55]]);
  validateFigure(figure, truth);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${figure.width}" height="${figure.height}"><defs><linearGradient id="shadow"><stop stop-color="#000" stop-opacity=".24"/><stop offset=".45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".06"/></linearGradient></defs><rect width="100%" height="100%" fill="#fffdf5"/>${strokes.join('')}${textImages.join('')}<rect width="100%" height="100%" fill="url(#shadow)"/></svg>`;
  let image = sharp(Buffer.from(svg)); if (p.blur) image = image.blur(p.blur);
  const jpeg = await image.jpeg({ quality: p.jpegQuality, chromaSubsampling: '4:4:4' }).toBuffer();
  const styles = new Set(figure.vertices.map((v) => v.style));
  const variants = [p.paper, p.endpoint, ...(p.curved ? ['curved'] : []), ...styles,
    ...(figure.edges.some((e) => figure.vertices.some((v) => v.id !== e.u && v.id !== e.v && distanceToPolyline([(v.labelBox[0] + v.labelBox[2]) / 2, (v.labelBox[1] + v.labelBox[3]) / 2], e.polyline) < 18)) ? ['near-other-label'] : []),
    ...(figure.crossings.length ? ['crossing', p.crossingDots ? 'crossing-dot' : 'crossing-no-dot'] : []),
    ...(truth.graph.edges.some((e) => e.u === e.v) ? ['loop'] : []), p.form];
  return { figure, svg, jpeg, lines, variants };
}

export async function generateFigures(root: string): Promise<number> {
  const fixtures = (await readdir(join(root, 'testdata/core'), { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  const sources = await Promise.all(fixtures.map(async (id) => ({ id, truth: graphOnly((checkedTruthInput(await readJson(join(root, 'testdata/core', id, 'spec.json')))).graph) })));
  for (let i = 0; i < 20; i++) sources.push({ id: `random-${String(i + 1).padStart(2, '0')}`, truth: graphOnly(randomFigureGraph(i)) });
  let count = 0;
  const text = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
  for (const [sourceIndex, source] of sources.entries()) for (let variant = 0; variant < 4; variant++) {
    const form = variant === 3 ? 'page' : 'crop'; const seed = figureSeed + sourceIndex * 997 + variant;
    const parameters = figureParameters(seed, form, sourceIndex + variant);
    const rendered = await renderFigure(source.truth, parameters, root);
    const id = `fig-${source.id}-${form}-${variant}`; const directory = join(root, 'testdata/images-synthetic-fig', id);
    await mkdir(directory, { recursive: true });
    const artifacts = { '1.jpg': rendered.jpeg, 'truth.json': text(source.truth), 'figure.json': text(rendered.figure), 'lines.json': text(rendered.lines), 'source.svg': rendered.svg };
    for (const [file, content] of Object.entries(artifacts)) await writeFile(join(directory, file), content);
    await writeFile(join(directory, 'meta.json'), text({ source: 'synthetic_handwriting', capture: 'tilted', blurred: parameters.blur > 0,
      questionFormat: source.truth.questionFormat, notes: 'Hình vẽ tay tổng hợp bằng code và font OFL, không phải ảnh thật.', synthetic: true,
      coreFixture: source.id, originalGraph: graphKey(source.truth.graph), split: graphSplit(source.truth.graph),
      form, parameters, variants: rendered.variants, hasSolution: form === 'page',
      figureHashes: Object.fromEntries(Object.entries(artifacts).map(([file, data]) => [file, createHash('sha256').update(data).digest('hex')])) }));
    count++;
  }
  return count;
}
function checkedTruthInput(value: unknown): ProblemSpec {
  // Core confirmation fixtures intentionally carry uncertain. It is not part of image truth.
  const spec = structuredClone(value) as ProblemSpec; delete spec.uncertain;
  return checkedTruth(spec, 'core');
}
