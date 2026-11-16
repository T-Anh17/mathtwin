import type { Box, LineMergeOptions, OrtTensor } from './types.js';
import { OcrError } from './errors.js';

/** Axis-aligned DB approximation: component foreground score, rectangular unclip. */
export function detectBoxes(tensor: OrtTensor, imageWidth: number, imageHeight: number, options: LineMergeOptions = {}): Box[] {
  const [batch, channel, height, width] = tensor.dims;
  if (tensor.type !== 'float32' || !(tensor.data instanceof Float32Array) || tensor.dims.length !== 4 || batch !== 1 || channel !== 1
    || !width || !height || tensor.data.length !== width * height) throw new OcrError('invalid_output');
  const probabilities = tensor.data;
  const mask = new Uint8Array(width * height);
  // RapidOCR's optional 2x2 dilation, default enabled in 3.9.2.
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const score = probabilities[y * width + x]!;
    if (!Number.isFinite(score) || score < 0 || score > 1) throw new OcrError('invalid_output');
    if (score > 0.3) for (let dy = 0; dy < 2 && y + dy < height; dy++) for (let dx = 0; dx < 2 && x + dx < width; dx++) mask[(y + dy) * width + x + dx] = 1;
  }
  const queue = new Int32Array(width * height);
  const boxes: Box[] = [];
  const referenceBoxes: Box[] = [];
  let candidates = 0;
  for (let index = 0; index < mask.length; index++) {
    if (!mask[index]) continue;
    let head = 0, tail = 1, left = width, right = 0, top = height, bottom = 0, score = 0, foregroundCount = 0;
    queue[0] = index; mask[index] = 0;
    while (head < tail) {
      const current = queue[head++]!, x = current % width, y = Math.floor(current / width);
      // Dilation connects fragments, but its added background must not lower the text score.
      if (probabilities[current]! > 0.3) { score += probabilities[current]!; foregroundCount++; }
      left = Math.min(left, x); right = Math.max(right, x + 1); top = Math.min(top, y); bottom = Math.max(bottom, y + 1);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, next = ny * width + nx;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height && mask[next]) { mask[next] = 0; queue[tail++] = next; }
      }
    }
    if (++candidates > 1000) throw new OcrError('invalid_output'); // Never silently omit a dense page.
    const w = right - left, h = bottom - top;
    if (Math.min(w, h) < 3) continue;
    if (!foregroundCount || score / foregroundCount < 0.5) continue;
    const distance = w * h * 2 / (2 * (w + h)); // area * unclip(2.0) / perimeter
    const box: Box = [Math.max(0, (left - distance) / width * imageWidth), Math.max(0, (top - distance) / height * imageHeight),
      Math.min(imageWidth, (right + distance) / width * imageWidth), Math.min(imageHeight, (bottom + distance) / height * imageHeight)];
    if (Math.min(box[2] - box[0], box[3] - box[1]) >= 5) {
      boxes.push(box);
      referenceBoxes.push([left / width * imageWidth, top / height * imageHeight, right / width * imageWidth, bottom / height * imageHeight]);
    }
  }
  return mergeReadingLines(boxes, { ...options, referenceBoxes });
}

/** Compare original components, never an expanded/merged union, when deciding row membership. */
export function mergeReadingLines(boxes: readonly Box[], options: LineMergeOptions & { referenceBoxes?: readonly Box[] } = {}): Box[] {
  const references = options.referenceBoxes ?? boxes;
  const maxGap = options.maxHorizontalGapRatio ?? 2.5;
  if (references.length !== boxes.length || !Number.isFinite(maxGap) || maxGap < 0) throw new OcrError('invalid_output');
  const sorted = boxes.map((box, i) => ({ box, core: references[i]! })).sort((a, b) => a.core[1] - b.core[1] || a.core[0] - b.core[0]);
  const sameRow = (a: Box, b: Box): boolean => Math.min(a[3], b[3]) - Math.max(a[1], b[1]) >= 0.5 * Math.min(a[3] - a[1], b[3] - b[1]);
  const rows: (typeof sorted)[] = [];
  for (const entry of sorted) {
    // Pairwise agreement prevents a tall/shifted component from bridging two text rows.
    const row = rows.find((members) => members.every((member) => sameRow(member.core, entry.core)));
    if (row) row.push(entry); else rows.push([entry]);
  }
  const merged: Box[] = [];
  for (const row of rows) {
    row.sort((a, b) => a.core[0] - b.core[0] || a.core[1] - b.core[1]);
    let current: Box | undefined;
    let previous: Box | undefined;
    for (const { box, core } of row) {
      const gap = previous ? Math.max(0, core[0] - previous[2]) : Infinity;
      const lineHeight = previous ? Math.min(core[3] - core[1], previous[3] - previous[1]) : 0;
      if (current && gap <= maxGap * lineHeight) {
        current[0] = Math.min(current[0], box[0]); current[1] = Math.min(current[1], box[1]);
        current[2] = Math.max(current[2], box[2]); current[3] = Math.max(current[3], box[3]);
      } else { current = [...box]; merged.push(current); }
      previous = core;
    }
  }
  return merged;
}
