import type { WorkLine } from './types.js';

export type WorkBox = [number, number, number, number];
export const validWorkBox = (b: WorkBox): boolean => b.every((n) => Number.isFinite(n) && n >= 0 && n <= 1000) && b[2] > b[0] && b[3] > b[1];
export const validWorkLineBox = (b: WorkBox): boolean => validWorkBox(b) && (b[2] - b[0]) * (b[3] - b[1]) < 800_000;
const inside = (a: WorkBox, b: WorkBox): boolean => a[0] >= b[0] && a[1] >= b[1] && a[2] <= b[2] && a[3] <= b[3];
const overlaps = (a: WorkBox, b: WorkBox): boolean => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
const continuationHeading = /^\s*\(?\s*tiếp(?:\s+theo)?\s+bài\s+\d+\s*\)?\s*[:.]?\s*$/iu;
const hasContinuationQuestion = (lines: WorkLine[]): boolean => lines.some((line) =>
  line.page > 0 && line.region === 'question' && !continuationHeading.test(line.text.normalize('NFC')));

/** A proposal only: the caller must obtain user confirmation before applying it. */
export function suggestWorkRegion(lines: WorkLine[]): WorkBox | undefined {
  if (hasContinuationQuestion(lines)) return;
  // A tight envelope of the located rows can cut off later working when OCR
  // supplied boxes for only part of a continuation. Let the user draw it.
  if (lines.some((line) => line.page > 0 && (line.region === 'solution' || line.region === 'table')
    && (!line.box || !validWorkLineBox(line.box)))) return;
  const boxes = lines.filter((l) => (l.region === 'solution' || l.region === 'table') && l.box && validWorkLineBox(l.box)).map((l) => l.box!);
  if (!boxes.length) return;
  return [Math.max(0, Math.min(...boxes.map((b) => b[0])) - 24), Math.max(0, Math.min(...boxes.map((b) => b[1])) - 24),
    Math.min(1000, Math.max(...boxes.map((b) => b[2])) + 24), Math.min(1000, Math.max(...boxes.map((b) => b[3])) + 24)];
}

/** Geometry only; never interprets claims or manufactures solution text. Boxes are 0..1000. */
export function filterWorkRegions(lines: WorkLine[], options: { figures?: WorkBox[]; solution?: WorkBox; cropped?: boolean } = {}) {
  if (options.solution && !validWorkBox(options.solution)) throw new Error('Invalid solution region.');
  lines = lines.map(({ box, ...line }) => ({ ...line, ...(line.region ? { regionSource: line.regionSource ?? 'model' as const } : {}),
    ...(box && validWorkLineBox(box) ? { box } : {}) }));
  const annotations = lines.filter((l) => l.box && !(l.region === 'table' && (l.regionConf ?? 1) >= .85)
    && /^(?:[\p{L}]|v[_₀-₉\d]+|\d+(?:[.,]\d+)?)$/u.test(l.text.trim()));
  const clustered = new Set<number>();
  const visited = new Set<number>();
  for (const seed of annotations) {
    if (visited.has(seed.index)) continue;
    const group = [seed]; visited.add(seed.index);
    for (let i = 0; i < group.length; i++) for (const other of annotations) {
      if (visited.has(other.index) || other.page !== seed.page) continue;
      const a = group[i]!.box!, b = other.box!;
      const dx = Math.max(0, a[0] - b[2], b[0] - a[2]), dy = Math.max(0, a[1] - b[3], b[1] - a[3]);
      if (Math.hypot(dx, dy) <= 180) { group.push(other); visited.add(other.index); }
    }
    // A column of numbered steps is not evidence of a graph. Require lateral spread.
    if (group.length >= 3 && Math.max(...group.map((l) => l.box![0])) - Math.min(...group.map((l) => l.box![0])) >= 40)
      group.forEach((l) => clustered.add(l.index));
  }
  const figureLike = (line: WorkLine): boolean => line.box !== undefined
    && (options.figures?.some((b) => validWorkBox(b) && inside(line.box!, b)) === true || clustered.has(line.index));
  const filtered = lines.map((line): WorkLine => {
    if (options.solution) {
      // User-confirmed geometry wins over both model labels and figure heuristics.
      const region = (line.box ? inside(line.box, options.solution) : options.cropped) ? (line.region === 'table' ? 'table' : 'solution') : 'question';
      // Only a crop that moves a line out of B's working label, or cuts through the line's box, is a
      // user exclusion (phase 5 rule 5a); figure-label geometry outside the crop stays a figure exclusion.
      const agreed = region === 'question' && (line.region === 'question' || line.region === 'figure')
        && !(line.box && overlaps(line.box, options.solution));
      const regionSource = region !== 'question' ? 'user' : agreed ? line.regionSource ?? 'model' : figureLike(line) ? 'figure' : 'user';
      return { ...line, region, regionSource, regionConf: 1 };
    }
    if (figureLike(line))
      return { ...line, region: 'figure', regionSource: 'figure', regionConf: 1 };
    return { ...line };
  });
  // A continuation can contain either a new prompt or mislabelled working.
  // Ask for the solution region before discarding these lines.
  return { lines: filtered, needsRegion: filtered.some((l) => !l.region || (l.regionConf ?? 1) < .85 || !l.box && !options.cropped)
    || !options.solution && (hasContinuationQuestion(filtered) || !filtered.some((l) => l.region === 'solution' || l.region === 'table')) };
}
