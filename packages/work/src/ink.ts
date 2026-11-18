import type { PreparedImage } from '@mathtwin/reader';

/** Page-wide ink with repeated notebook ruling removed (batch 3.5). */
export function pageInk(image: PreparedImage) {
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
  return { width, height, at };
}
