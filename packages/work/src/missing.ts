import type { PreparedImage } from '@mathtwin/reader';
import type { WorkLine } from './types.js';
import { pageInk } from './ink.js';
import { validWorkBox } from './regions.js';
import type { WorkBox } from './regions.js';

export interface MissingBand {
  box: WorkBox; score: number; coveringLines: number[];
  rejectedBy?: 'height' | 'width' | 'ink' | 'covered';
}
/** Diagnostics share the exact detector thresholds; truth is never used here. */
export function inspectMissingLines(image: PreparedImage, lines: WorkLine[], region: WorkBox = [0, 0, 1000, 1000]): MissingBand[] {
  if (!validWorkBox(region)) throw new Error('Invalid solution region.');
  const { width, height, at } = pageInk(image);
  const left = Math.floor(region[0] * width / 1000), right = Math.ceil(region[2] * width / 1000);
  const top = Math.floor(region[1] * height / 1000), bottom = Math.ceil(region[3] * height / 1000);
  const rows: { y: number; left: number; right: number; count: number }[] = [];
  const excluded = lines.filter((l) => l.box && (l.region === 'figure' || l.region === 'question')).map((l) => l.box!);
  for (let y = top; y < bottom; y++) {
    let count = 0, l = right, r = left;
    for (let x = left; x < right; x++) {
      if (excluded.some((b) => x * 1000 / width >= b[0] && x * 1000 / width <= b[2] && y * 1000 / height >= b[1] && y * 1000 / height <= b[3])) continue;
      if (at(x, y)) { count++; l = Math.min(l, x); r = Math.max(r, x + 1); }
    }
    if (count >= Math.max(3, (right - left) * .006)) rows.push({ y, left: l, right: r, count });
  }
  const bands: typeof rows[] = [];
  const gap = Math.max(2, Math.round(height / 500));
  for (const row of rows) {
    if (!bands.length || row.y - bands.at(-1)!.at(-1)!.y > gap) bands.push([]);
    bands.at(-1)!.push(row);
  }
  return bands.map((band): MissingBand => {
    const y0 = band[0]!.y, y1 = band.at(-1)!.y + 1;
    const x0 = Math.min(...band.map((r) => r.left)), x1 = Math.max(...band.map((r) => r.right));
    const count = band.reduce((n, r) => n + r.count, 0);
    const box: WorkBox = [x0 / width * 1000, y0 / height * 1000, x1 / width * 1000, y1 / height * 1000];
    // Any corresponding reading covers the band; no automatic textual reconstruction.
    const coveringLines = lines.filter((l) => !l.missing && l.box && l.box[0] < box[2] && l.box[2] > box[0] && l.box[1] < box[3] + 2 && l.box[3] > box[1] - 2).map((l) => l.index);
    const rejectedBy = y1 - y0 < Math.max(3, height * .002) ? 'height' : x1 - x0 < width * .015 ? 'width'
      : count < Math.max(12, width * .02) ? 'ink' : coveringLines.length ? 'covered' : undefined;
    return { box, score: Math.min(1, count / ((x1 - x0) * (y1 - y0)) * 3), coveringLines, ...(rejectedBy ? { rejectedBy } : {}) };
  });
}

/** Row projection of ink, sharing the cancellation detector's notebook-ruling filter. */
export function detectMissingLines(image: PreparedImage, lines: WorkLine[], region: WorkBox = [0, 0, 1000, 1000]): { box: WorkBox; score: number }[] {
  return inspectMissingLines(image, lines, region).filter((b) => !b.rejectedBy).map(({ box, score }) => ({ box, score }));
}
