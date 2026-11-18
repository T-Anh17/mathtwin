import type { PreparedImage } from '@mathtwin/reader';
import type { WorkLine } from './types.js';

export const STRIKE_NO = 0.3;
export const STRIKE_YES = 0.8;
export const strikeUncertain = (line: WorkLine): boolean => !line.struck && line.strikeScore !== undefined
  && line.strikeScore > STRIKE_NO && line.strikeScore < STRIKE_YES;
const clamp = (n: number): number => Math.max(0, Math.min(1, n));

/** Pixel evidence only: neither transcription nor pre-existing struck flags are inspected. */
export function detectStrikes(image: PreparedImage, lines: WorkLine[]): { line: number; struck: boolean; score: number }[] {
  const { width, height, pixels } = image;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1
    || !(pixels instanceof Uint8ClampedArray) || pixels.length !== width * height * 4) throw new Error('Invalid RGBA image.');
  const ink = new Uint8Array(width * height);
  const rows = new Uint32Array(height), cols = new Uint32Array(width);
  for (let i = 0; i < ink.length; i++) {
    const p = i * 4, a = pixels[p + 3]! / 255;
    const gray = 255 + (pixels[p]! * .2126 + pixels[p + 1]! * .7152 + pixels[p + 2]! * .0722 - 255) * a;
    if (gray < 160) { ink[i] = 1; rows[Math.floor(i / width)]!++; cols[i % width]!++; }
  }
  // Same projection/repetition principle as reader-figure. Local crops cannot
  // establish repetition; find page-wide ruling before examining line crops.
  const ruling = (projection: Uint32Array, length: number): Uint8Array => {
    const groups: number[][] = [];
    for (let i = 0; i < projection.length; i++) if (projection[i]! >= length * .6) {
      if (!groups.length || i > groups.at(-1)!.at(-1)! + 1) groups.push([]);
      groups.at(-1)!.push(i);
    }
    const centers = groups.map((g) => (g[0]! + g.at(-1)!) / 2), out = new Uint8Array(projection.length);
    for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
      const c = centers[i]!, step = centers[j]! - c;
      if (step < 6) continue;
      const sequence = [0, 1, 2, 3].map((n) => centers.findIndex((r) => Math.abs(r - c - n * step) <= 2));
      if (sequence.every((index) => index >= 0)) for (const index of sequence) for (const p of groups[index]!) out[p] = 1;
    }
    return out;
  };
  const ruledRows = ruling(rows, width), ruledCols = ruling(cols, height);
  const at = (x: number, y: number): number => x < 0 || x >= width || y < 0 || y >= height
    || ruledRows[y] || ruledCols[x] ? 0 : ink[y * width + x]!;
  return lines.map((line) => {
    const result = (score: number) => ({ line: line.index, struck: score >= STRIKE_YES, score });
    const box = line.box;
    if (!box || !box.every(Number.isFinite) || box[0] < 0 || box[1] < 0 || box[2] > 1000 || box[3] > 1000
      || box[2] <= box[0] || box[3] <= box[1]) return result(.5);
    const x0 = box[0] * width / 1000, y0 = box[1] * height / 1000;
    const x1 = box[2] * width / 1000, y1 = box[3] * height / 1000, boxHeight = y1 - y0;
    const marginX = Math.max(2, boxHeight * .06), marginY = Math.max(2, boxHeight * .12);
    const left = Math.max(0, Math.floor(x0 - marginX)), right = Math.min(width, Math.ceil(x1 + marginX));
    const top = Math.max(0, Math.floor(y0 - marginY)), bottom = Math.min(height, Math.ceil(y1 + marginY));
    let l = right, r = left, t = bottom, b = top, count = 0;
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) if (at(x, y)) {
      l = Math.min(l, x); r = Math.max(r, x + 1); t = Math.min(t, y); b = Math.max(b, y + 1); count++;
    }
    if (!count) return result(0);
    const w = r - l, h = b - t;
    // A thin isolated minus/arrow/equals bar is not an opaque cancellation.
    const density = count / (w * h);
    const opaque = h >= 8 && h >= boxHeight * .55 && w >= h * .5 && w <= h * 30
      ? clamp((density - .45) / .5) : 0;
    let horizontal = 0;
    if (h >= 8 && w >= h * 2) {
      const radius = Math.max(1, Math.round(h * .035)), separation = Math.max(3, Math.ceil(h * .14));
      for (let cy = t + h * .3; cy <= t + h * .7; cy += Math.max(1, h * .05)) {
        for (let rise = -h * .25; rise <= h * .25; rise += Math.max(1, h * .125)) {
          let covered = 0, above = 0, below = 0, run = 0, longest = 0;
          const zones = new Uint8Array(5);
          for (let x = l; x < r; x++) {
            const y = Math.round(cy + rise * ((x - l) / w - .5));
            let hit = false, upper = false, lower = false;
            for (let d = -radius; d <= radius; d++) if (at(x, y + d)) hit = true;
            for (let yy = t; yy < y - separation; yy++) if (at(x, yy)) { upper = true; break; }
            for (let yy = y + separation + 1; yy < b; yy++) if (at(x, yy)) { lower = true; break; }
            if (hit) { covered++; run++; longest = Math.max(longest, run); } else run = 0;
            if (upper) above++; if (lower) below++;
            if (upper && lower) zones[Math.min(4, Math.floor((x - l) / w * 5))] = 1;
          }
          const coverage = Math.min(covered, longest) / w;
          // Require writing on both sides, spread across the line. Arrowheads
          // and a second equals bar alone do not provide this evidence.
          const text = above / w >= .18 && below / w >= .18 && zones.reduce((a, v) => a + v, 0) >= 3;
          const score = text && longest / w >= .25
            ? coverage >= .7 ? .5 + .5 * coverage : coverage >= .45 ? .4 + .4 * coverage : .1 * coverage
            : .1 * coverage;
          horizontal = Math.max(horizontal, score);
        }
      }
    }
    return result(clamp(Math.max(opaque, horizontal)));
  });
}
