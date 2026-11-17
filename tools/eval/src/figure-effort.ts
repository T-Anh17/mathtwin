import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { FigureReader, NoGlyphReader } from '@mathtwin/reader-figure';
import type { ReadDraft } from '@mathtwin/reader';
import { loadCases, prepareImages } from './dataset.js';
import type { FigureAnnotation } from './figure-geometry.js';

/**
 * Editing effort in the graph review screen (Lô 2.12). One operation = one tap or one typed field:
 * add/delete a vertex, type a label, add/delete an edge, type a weight or a name.
 * Draft vertices are matched to annotated vertices by position (no labels: the app runs D without a glyph model).
 */
export interface Effort {
  draftOps: number; manualOps: number;
  matchedVertices: number; extraVertices: number; missingVertices: number;
  matchedEdges: number; extraEdges: number; missingEdges: number;
}
const center = (box: [number, number, number, number]): [number, number] => [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2];

export function figureEffort(draft: Pick<ReadDraft, 'vertices' | 'edges'>, figure: FigureAnnotation): Effort {
  const truth = figure.vertices.map((v) => ({ id: v.id, label: v.label, at: v.center,
    // Generous radius: label beside a dot, or a ring drawn larger than its label.
    radius: Math.max(40, 1.5 * (v.labelBox[3] - v.labelBox[1])) }));
  // ReadDraft boxes are normalized 0–1000; the annotation is in image pixels.
  const predicted = draft.vertices.map((v, i) => ({ i, label: v.label,
    at: v.box ? [center(v.box)[0] * figure.width / 1000, center(v.box)[1] * figure.height / 1000] as [number, number] : null }));
  // Greedy one-to-one matching by increasing distance.
  const pairs = predicted.flatMap((p) => p.at ? truth.map((t) => ({ p: p.i, t: t.id, d: Math.hypot(p.at![0] - t.at[0], p.at![1] - t.at[1]), r: t.radius })) : [])
    .filter((x) => x.d <= x.r).sort((a, b) => a.d - b.d);
  const toTruth = new Map<number, string>(), used = new Set<string>();
  for (const pair of pairs) if (!toTruth.has(pair.p) && !used.has(pair.t)) { toTruth.set(pair.p, pair.t); used.add(pair.t); }
  const byLabel = new Map(draft.vertices.map((v, i) => [v.label, i]));
  const key = (u: string, v: string) => [u, v].sort().join('|');
  const count = (keys: string[]) => keys.reduce((m, k) => m.set(k, (m.get(k) ?? 0) + 1), new Map<string, number>());
  // Edges touching a deleted (unmatched) vertex disappear with it at no extra cost.
  const draftKeys = draft.edges.flatMap((e) => {
    const u = toTruth.get(byLabel.get(e.u) ?? -1), v = toTruth.get(byLabel.get(e.v) ?? -1);
    return u && v ? [key(u, v)] : [];
  });
  const truthKeys = figure.edges.map((e) => key(e.u, e.v));
  const have = count(draftKeys), need = count(truthKeys);
  let matchedEdges = 0;
  for (const [k, n] of need) matchedEdges += Math.min(n, have.get(k) ?? 0);
  const extraEdges = draftKeys.length - matchedEdges, missingEdges = truthKeys.length - matchedEdges;
  const matchedVertices = toTruth.size, extraVertices = draft.vertices.length - matchedVertices, missingVertices = truth.length - matchedVertices;
  const valueOps = figure.edges.reduce((n, e) => n + (e.w !== null ? 1 : 0) + (e.name !== null ? 1 : 0), 0);
  // Labels: every matched draft vertex needs typing unless already correct; a missing vertex needs a tap and a label.
  const labelOps = [...toTruth].filter(([p, t]) => draft.vertices[p]!.label !== truth.find((x) => x.id === t)!.label).length;
  const draftOps = extraVertices + labelOps + missingVertices * 2 + extraEdges + missingEdges + valueOps;
  // Manual entry: the editor auto-names vertices A, B, C… in placement order, so such labels cost nothing.
  const sorted = [...figure.vertices].map((v) => v.label).sort();
  const autoNamed = sorted.every((label, i) => label === String.fromCharCode(65 + i));
  const manualOps = figure.vertices.length * (autoNamed ? 1 : 2) + figure.edges.length + valueOps;
  return { draftOps, manualOps, matchedVertices, extraVertices, missingVertices, matchedEdges, extraEdges, missingEdges };
}

export async function evaluateFigureEffort(root: string, date: string, split: 'dev' | 'test', limit?: number): Promise<string> {
  const cases = (await loadCases(join(root, 'testdata/images-synthetic-fig')))
    .filter((c) => c.meta.split === split && c.meta.hasFigure !== false && c.figure).slice(0, limit);
  const rows: (Effort & { id: string; form: string; vertices: number; ms: number })[] = [];
  for (const sample of cases) {
    const reader = new FigureReader({ glyphReader: new NoGlyphReader() });
    const images = await prepareImages(sample);
    const start = performance.now();
    const { draft } = await reader.read(images, 'edges');
    rows.push({ id: sample.id, form: String(sample.meta.parameters?.form ?? ''), vertices: sample.figure!.vertices.length,
      ms: performance.now() - start, ...figureEffort(draft, sample.figure!) });
    process.stdout.write(`${rows.length}/${cases.length} ${sample.id}: D ${rows.at(-1)!.draftOps} / tay ${rows.at(-1)!.manualOps}\n`);
  }
  const mean = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
  const group = (name: string, list: typeof rows) => {
    const d = mean(list.map((r) => r.draftOps)), m = mean(list.map((r) => r.manualOps));
    return `| ${name} | ${list.length} | ${d.toFixed(1)} | ${m.toFixed(1)} | ${(d / m).toFixed(2)} | ${list.filter((r) => r.draftOps < r.manualOps).length} |`;
  };
  const sum = (k: keyof Effort) => rows.reduce((n, r) => n + r[k], 0);
  const sorted = rows.map((r) => r.ms).sort((a, b) => a - b);
  const md = [`# Công sửa bản nháp D — synthetic-fig ${split} — ${date}`, '',
    'D chạy **không có glyph model** như trong app (nhãn, trọng số để trống). Một thao tác = một lần chạm hoặc một ô gõ.',
    'Đỉnh nháp ghép với đỉnh chú thích theo vị trí (≤ max(40 px, 1,5 × cao nhãn)). Tự nhập: app tự đặt nhãn A, B, C… nên đồ thị có nhãn liền A… chỉ tốn 1 thao tác/đỉnh.',
    'Ảnh tổng hợp, không phải ảnh thật. Thời gian là máy tính, chỉ tham khảo.', '',
    '| Nhóm | Ảnh | TB thao tác từ nháp D | TB thao tác tự nhập | Tỉ lệ | Ảnh nháp D ít thao tác hơn |', '| --- | ---: | ---: | ---: | ---: | ---: |',
    group('all', rows), group('crop', rows.filter((r) => r.form === 'crop')), group('page', rows.filter((r) => r.form === 'page')),
    group('1–4 đỉnh', rows.filter((r) => r.vertices <= 4)), group('5–8 đỉnh', rows.filter((r) => r.vertices > 4 && r.vertices <= 8)), group('9+ đỉnh', rows.filter((r) => r.vertices > 8)), '',
    `Đỉnh: ghép ${sum('matchedVertices')}, thừa ${sum('extraVertices')}, thiếu ${sum('missingVertices')}. Cạnh: đúng ${sum('matchedEdges')}, thừa ${sum('extraEdges')}, thiếu ${sum('missingEdges')}.`,
    `Thời gian D (Node, máy tính): p50 ${Math.round(sorted[Math.floor(sorted.length / 2)] ?? 0)} ms, p90 ${Math.round(sorted[Math.floor(sorted.length * 0.9)] ?? 0)} ms.`, ''].join('\n');
  await mkdir(join(root, 'reports'), { recursive: true });
  const base = join(root, 'reports', `figure-effort-${date}-${split}`);
  await writeFile(`${base}.md`, md); await writeFile(`${base}.json`, `${JSON.stringify({ split, date, rows }, null, 2)}\n`);
  return `${base}.md`;
}
