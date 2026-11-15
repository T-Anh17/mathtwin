import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import type { OverlayOptions } from 'sharp';
import type { ProblemSpec } from '@mathtwin/core';
import type { TruthLine } from '@mathtwin/reader';
import { checkedTruth, readJson } from './dataset.js';
import { syntheticFixtures, questionLines } from './synthetic.js';
import { handwritingSolution } from './handwriting-solutions.js';

export const handwritingStyles = ['patrick-straight', 'patrick-perspective', 'dancing-straight', 'dancing-perspective'] as const;
export type HandwritingStyle = typeof handwritingStyles[number];
export const xml = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
interface Placement { text: string; x: number; y: number; size: number; region: TruthLine['region']; struck?: 'single' | 'opaque'; lineIndex?: number }
type Box = NonNullable<TruthLine['box']>;
export interface CancellationGeometry { kind: 'single' | 'opaque'; lineIndex: number; textBox: Box; strokeBox: Box; points: [number, number][]; imageBox: Box }
const W = 1000; const H = 1440;
function projectBox(box: NonNullable<TruthLine['box']>): NonNullable<TruthLine['box']> {
  const corners = [[box[0], box[1]], [box[0], box[3]], [box[2], box[1]], [box[2], box[3]]].map(([x, y]) => {
    const sy = y! / H; const denominator = 1 + 0.035 * sy;
    return [25 + (W - 50) * (x! / W + 0.018 * sy) / denominator, 16 + (H - 32) * sy / denominator];
  });
  return [Math.min(...corners.map((p) => p[0]!)), Math.min(...corners.map((p) => p[1]!)), Math.max(...corners.map((p) => p[0]!)), Math.max(...corners.map((p) => p[1]!))];
}
function wrap(s: string, length = 67): string[] {
  const lines: string[] = []; let line = '';
  for (const word of s.split(/\s+/u)) {
    if (line && (line + ' ' + word).length > length) { lines.push(line); line = ''; }
    line += (line ? ' ' : '') + word;
  }
  if (line) lines.push(line);
  return lines;
}
/** Rendering commands and labels are built from exactly the model saved as truth.json. */
export function buildHandwritingCase(input: ProblemSpec, style: HandwritingStyle) {
  const truth = structuredClone(input); delete truth.uncertain; checkedTruth(truth, 'handwriting');
  const placements: Placement[] = [];
  const lines: TruthLine[] = [];
  const add = (text: string, x: number, y: number, region: TruthLine['region'], size = 29, emitLine = true): void => {
    placements.push({ text: text.normalize('NFC'), x, y, region, size });
    if (emitLine) lines.push({ text: text.normalize('NFC'), region });
  };
  const formats = { tu_luan: 'Tự luận', trac_nghiem: 'Trắc nghiệm', dung_sai: 'Đúng / sai từng ý', tra_loi_ngan: 'Trả lời ngắn' };
  const question = [`Cho đồ thị vô hướng. ${formats[truth.questionFormat]}.`, ...questionLines(truth.task, truth.graph)].flatMap((s) => wrap(s));
  question.forEach((s, i) => add(s, 60, 28 + i * 39, 'question'));
  const vertices = truth.graph.vertices;
  const points = new Map(vertices.map((v, i) => {
    const angle = -Math.PI / 2 + i * Math.PI * 2 / vertices.length;
    return [v.id, { x: 500 + 225 * Math.cos(angle) + Math.sin(i * 7) * 6, y: 535 + 225 * Math.sin(angle) + Math.cos(i * 5) * 5 }];
  }));
  const paths: string[] = [];
  const figures: Placement[] = [];
  truth.graph.edges.forEach((edge, i) => {
    const a = points.get(edge.u)!; const b = points.get(edge.v)!;
    const siblings = truth.graph.edges.filter((e) => [e.u, e.v].sort().join('|') === [edge.u, edge.v].sort().join('|'));
    const lane = siblings.indexOf(edge) - (siblings.length - 1) / 2;
    let path: string; let x: number; let y: number;
    if (edge.u === edge.v) {
      const angle = Math.atan2(a.y - 535, a.x - 500); const dx = Math.cos(angle); const dy = Math.sin(angle);
      const r = 95 + siblings.indexOf(edge) * 30;
      path = `M ${a.x} ${a.y} C ${a.x + dx * r - dy * 65} ${a.y + dy * r + dx * 65}, ${a.x + dx * r + dy * 65} ${a.y + dy * r - dx * 65}, ${a.x} ${a.y}`;
      x = a.x + dx * r * 0.8; y = a.y + dy * r * 0.8;
    } else {
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      const offset = lane * 125 * (edge.u < edge.v ? 1 : -1) + Math.sin(i * 3 + 1) * 12;
      const cx = (a.x + b.x) / 2 - (b.y - a.y) / d * offset;
      const cy = (a.y + b.y) / 2 + (b.x - a.x) / d * offset;
      path = `M ${a.x} ${a.y}`;
      let previous = a;
      for (let segment = 1; segment <= 12; segment++) {
        const t = segment / 12;
        const end = segment === 12 ? b : { x: (1 - t) ** 2 * a.x + 2 * t * (1 - t) * cx + t ** 2 * b.x + Math.sin(segment * 4 + i) * 1.1,
          y: (1 - t) ** 2 * a.y + 2 * t * (1 - t) * cy + t ** 2 * b.y + Math.cos(segment * 3 + i) * 1.1 };
        path += ` Q ${(previous.x + end.x) / 2 + Math.sin(segment) * 0.9} ${(previous.y + end.y) / 2}, ${end.x} ${end.y}`;
        previous = end;
      }
      const t = 0.37;
      x = (1 - t) ** 2 * a.x + 2 * t * (1 - t) * cx + t ** 2 * b.x;
      y = (1 - t) ** 2 * a.y + 2 * t * (1 - t) * cy + t ** 2 * b.y;
    }
    paths.push(`<path data-edge="${xml(edge.id)}" d="${path}" fill="none" stroke="#253b72" stroke-width="2.6"/>`);
    const label = [edge.name, edge.w === undefined ? undefined : String(edge.w)].filter((v) => v !== undefined).join(': ');
    if (label) figures.push({ text: label, x: x + 4, y: y - 29, size: 28, region: 'figure' });
  });
  vertices.forEach((v, i) => {
    const p = points.get(v.id)!;
    paths.push(`<path data-vertex="${xml(v.id)}" d="M ${p.x + 18} ${p.y - 9} C ${p.x + 33} ${p.y + 22}, ${p.x - 25} ${p.y + 28}, ${p.x - 22} ${p.y} S ${p.x + 5} ${p.y - 31}, ${p.x + 14} ${p.y - 13}" fill="#fffdf3" stroke="#253b72" stroke-width="2.7"/>`);
    figures.push({ text: v.label, x: p.x - 9 + Math.sin(i) * 2, y: p.y - 17, size: 27, region: 'figure' });
  });
  figures.sort((a, b) => a.y - b.y || a.x - b.x); placements.push(...figures);
  lines.push(...figures.map(({ text, region }) => ({ text: text.normalize('NFC'), region })));
  // Every fixture has a student solution; each font has a correct and an incorrect case.
  const incorrect = style === 'patrick-perspective' || style === 'dancing-straight';
  const solution = handwritingSolution(truth, incorrect);
  if (solution.table) {
    const rows = solution.table;
    rows.forEach((row, i) => {
      row.forEach((s, j) => add(s, 80 + j * 140, 885 + i * 46, 'table', 27, false));
      lines.push({ text: row.join(' ').normalize('NFC'), region: 'table' });
      paths.push(`<path d="M 63 ${875 + i * 46} Q 390 ${873 + i * 46}, 785 ${877 + i * 46}" fill="none" stroke="#344e7b" stroke-width="1.5"/>`);
    });
    for (let j = 0; j <= vertices.length + 1; j++) paths.push(`<path d="M ${65 + j * 140} 874 Q ${60 + j * 140} 990, ${67 + j * 140} ${877 + rows.length * 46}" fill="none" stroke="#344e7b" stroke-width="1.5"/>`);
    paths.push(`<path d="M 63 ${875 + rows.length * 46} L 785 ${878 + rows.length * 46}" stroke="#344e7b"/>`);
  }
  let solutionY = solution.table ? 1130 : 840;
  solution.prose.forEach((text, i) => {
    if (i === solution.correction.before) {
      const struck = style.endsWith('perspective') ? 'opaque' : 'single';
      placements.push({ text: solution.correction.discarded, x: 75, y: solutionY, size: 28, region: 'solution', struck, lineIndex: lines.length });
      // Font-dependent image-coordinate boxes are populated by the renderer, never guessed here.
      lines.push({ text: struck === 'opaque' ? null : solution.correction.discarded, region: 'solution', struck: true });
      solutionY += 44;
    }
    for (const line of wrap(text, 63)) { add(line, 75, solutionY, 'solution', 28); solutionY += 44; }
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs>
<pattern id="grid" width="25" height="25" patternUnits="userSpaceOnUse"><path d="M 25 0 H 0 V 25" fill="none" stroke="#9db9d7" stroke-width="0.6"/></pattern>
<linearGradient id="shadow"><stop stop-color="#000" stop-opacity="0.23"/><stop offset="0.35" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.05"/></linearGradient></defs>
<rect width="100%" height="100%" fill="#fffdf3"/><rect width="100%" height="100%" fill="url(#grid)"/>
<path d="M 45 0 V ${H}" stroke="#d6a3a3" stroke-width="1"/>
${paths.join('\n')}</svg>`;
  return { truth, svg, placements, lines, style, hasSolution: true, studentErrors: solution.studentErrors };
}

/** Mild projective camera transform (inverse map, bilinear resampling); applied to the entire page. */
export async function perspective(png: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(data.length, 255); const w = info.width; const h = info.height;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const yy = (y - 16) / (h - 32); const xx = (x - 25) / (w - 50);
    const sy = yy / (1 - 0.035 * yy); const sx = xx * (1 + 0.035 * sy) - 0.018 * sy;
    const px = sx * w; const py = sy * h;
    if (px < 0 || py < 0 || px >= w - 1 || py >= h - 1) continue;
    const ix = Math.floor(px); const iy = Math.floor(py); const dx = px - ix; const dy = py - iy;
    for (let c = 0; c < 4; c++) out[(y * w + x) * 4 + c] = Math.round(
      data[(iy * w + ix) * 4 + c]! * (1 - dx) * (1 - dy) + data[(iy * w + ix + 1) * 4 + c]! * dx * (1 - dy)
      + data[((iy + 1) * w + ix) * 4 + c]! * (1 - dx) * dy + data[((iy + 1) * w + ix + 1) * 4 + c]! * dx * dy);
  }
  return sharp(out, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}
export async function renderHandwriting(layout: ReturnType<typeof buildHandwritingCase>, root: string): Promise<{ png: Buffer; lines: TruthLine[]; cancellations: CancellationGeometry[] }> {
  const dancing = layout.style.startsWith('dancing');
  const family = dancing ? 'Dancing Script' : 'Patrick Hand';
  const fontfile = join(root, 'tools/eval/fonts', dancing ? 'dancingscript/DancingScript[wght].ttf' : 'patrickhand/PatrickHand-Regular.ttf');
  const overlays: OverlayOptions[] = [];
  const cancellations: CancellationGeometry[] = [];
  const lines = structuredClone(layout.lines);
  for (const [i, p] of layout.placements.entries()) {
    if (p.struck) {
      // Rasterize a cancelled phrase as a single line to measure its real ink bounds.
      const { data, info } = await sharp({ text: { text: `<span foreground="#20386a">${xml(p.text)}</span>`, font: `${family} ${p.size}`, fontfile, dpi: 72, rgba: true } }).png().toBuffer({ resolveWithObject: true });
      const left = Math.round(p.x); const top = Math.round(p.y);
      const textBox: Box = [left, top, left + info.width, top + info.height];
      if (textBox[2] > W - 25 || textBox[3] > H - 25) throw new Error('Dòng gạch sửa tràn trang.');
      overlays.push({ input: data, left, top });
      const middle = top + info.height * 0.5;
      const points: [number, number][] = [[left - 3, middle + 1.5], [left + info.width / 3, middle - 1],
        [left + info.width * 2 / 3, middle + 0.5], [left + info.width + 3, middle - 1.5]];
      const strokeBox: Box = p.struck === 'opaque' ? [left - 3, top - 3, textBox[2] + 3, textBox[3] + 3]
        : [left - 4, middle - 2.5, textBox[2] + 4, middle + 2.5];
      const cancelledBox: Box = [Math.min(textBox[0], strokeBox[0]), Math.min(textBox[1], strokeBox[1]),
        Math.max(textBox[2], strokeBox[2]), Math.max(textBox[3], strokeBox[3])];
      const imageBox = layout.style.endsWith('perspective') ? projectBox(cancelledBox) : cancelledBox;
      const lineIndex = p.lineIndex!;
      lines[lineIndex] = { ...lines[lineIndex]!, box: imageBox };
      cancellations.push({ kind: p.struck, lineIndex, textBox, strokeBox, points, imageBox });
      continue;
    }
    let x = p.x;
    for (const [j, word] of p.text.split(' ').entries()) {
      const { data, info } = await sharp({ text: { text: `<span foreground="#20386a">${xml(word)}</span>`, font: `${family} ${p.size}`, fontfile, dpi: 72, rgba: true } }).png().toBuffer({ resolveWithObject: true });
      overlays.push({ input: data, left: Math.round(x), top: Math.round(p.y + Math.sin(j * 0.7 + i) * 3) });
      if (p.y + info.height + 3 > H - 20) throw new Error('Bài làm tràn cuối trang.');
      x += info.width + p.size * 0.23;
      if (x > W - 30) throw new Error('Dòng viết tay tràn trang.');
    }
  }
  // Cancellation ink must be painted OVER glyphs. An opaque cancellation has no readable truth text.
  const cancellation = cancellations.map((p) => p.kind === 'opaque'
    ? `<rect x="${p.strokeBox[0]}" y="${p.strokeBox[1]}" width="${p.strokeBox[2] - p.strokeBox[0]}" height="${p.strokeBox[3] - p.strokeBox[1]}" rx="3" fill="#20386a"/>`
    : `<path d="${p.points.map(([x, y], i) => `${i ? 'L' : 'M'} ${x} ${y}`).join(' ')}" fill="none" stroke="#20386a" stroke-width="1.8"/>`).join('');
  overlays.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${cancellation}</svg>`) });
  // The shadow is placed over ink as well as paper, as in a photographed notebook.
  overlays.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><linearGradient id="s"><stop stop-opacity=".19"/><stop offset=".4" stop-opacity="0"/><stop offset="1" stop-opacity=".04"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#s)"/></svg>`) });
  const png = await sharp(Buffer.from(layout.svg)).composite(overlays).png().toBuffer();
  return { png: layout.style.endsWith('perspective') ? await perspective(png) : png, lines, cancellations };
}
export async function generateHandwriting(root: string): Promise<number> {
  let count = 0;
  for (const fixture of syntheticFixtures) for (const style of handwritingStyles) {
    const input = checkedTruth(await readJson(join(root, 'testdata/core', fixture, 'spec.json')), fixture);
    const layout = buildHandwritingCase(input, style); const rendered = await renderHandwriting(layout, root);
    const directory = join(root, 'testdata/images-synthetic-hw', `${fixture}-${style}`);
    await mkdir(directory, { recursive: true });
    const text = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
    const artifacts = { 'truth.json': text(layout.truth), 'lines.json': text(rendered.lines), 'source.svg': layout.svg, 'layout.json': text(layout.placements),
      'cancellation.json': text(rendered.cancellations), '1.png': rendered.png };
    for (const [file, data] of Object.entries(artifacts)) await writeFile(join(directory, file), data);
    await writeFile(join(directory, 'meta.json'), text({ source: 'synthetic_handwriting', capture: style.endsWith('perspective') ? 'tilted' : 'straight',
      blurred: false, questionFormat: layout.truth.questionFormat, synthetic: true, variant: style, coreFixture: fixture,
      hasSolution: layout.hasSolution, studentErrors: layout.studentErrors,
      notes: 'Chữ kiểu viết tay tổng hợp, không phải bài học sinh thật. Bài làm đúng hoặc có lỗi cố ý, truth chép nguyên văn; dòng gạch xóa đánh dấu struck, bôi kín có text null.',
      handwritingHashes: Object.fromEntries(Object.entries(artifacts).map(([file, data]) => [file, createHash('sha256').update(data).digest('hex')])) }));
    count++;
  }
  return count;
}
