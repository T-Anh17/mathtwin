import { stripDiacritics } from '@mathtwin/reader';
import { compareWork } from '@mathtwin/work';
import type { WorkComparison, WorkGrade, WorkLine, WorkTruth, ParsedWork } from '@mathtwin/work';

export interface LineMatch { observed: number[]; truth: number[] }
export interface WorkAlignment { groups: LineMatch[] }
export const readingText = (text: string): string => text.normalize('NFC').trim().replace(/\s+/gu, ' ');
const folded = (text: string): string => stripDiacritics(text.normalize('NFC')).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const blankStrike = (line: WorkLine): boolean => Boolean(line.struck) && !folded(line.text);
export const joinedText = (lines: WorkLine[], indices: number[]): string => indices.map((i) => lines.find((l) => l.index === i)?.text ?? '').join('\n');

function editDistance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1]! + 1, row[j]! + 1, row[j - 1]! + Number(a[i - 1] !== b[j - 1]));
    row = next;
  }
  return row[b.length]!;
}
function overlap(a: WorkLine[], b: WorkLine[]): number {
  const union = (lines: WorkLine[]) => lines.length && lines.every((l) => l.box) ? [Math.min(...lines.map((l) => l.box![0])), Math.min(...lines.map((l) => l.box![1])), Math.max(...lines.map((l) => l.box![2])), Math.max(...lines.map((l) => l.box![3]))] : undefined;
  const x = union(a), y = union(b);
  if (!x || !y) return 0;
  const intersection = Math.max(0, Math.min(x[2]!, y[2]!) - Math.max(x[0]!, y[0]!)) * Math.max(0, Math.min(x[3]!, y[3]!) - Math.max(x[1]!, y[1]!));
  return intersection / Math.max(1, (x[2]! - x[0]!) * (x[3]! - x[1]!) + (y[2]! - y[0]!) * (y[3]! - y[1]!) - intersection);
}
/** Evaluation only: monotone text DP, gaps on either side, 1:1 / 1:N / N:1.
 * At most four adjacent lines per group; text distance <= .6, gap .7,
 * extra-line cost .7 (same as a gap, so a group must improve text distance).
 * Box IoU contributes at most .04 as a secondary cue.
 * No claims, grades, confidence or answers participate in alignment.
 */
export function alignWorkLines(observed: WorkLine[], truth: WorkLine[]): WorkAlignment {
  const n = observed.length, m = truth.length;
  const costs = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(Infinity));
  const back = new Map<string, [number, number]>();
  costs[0]![0] = 0;
  const offer = (i: number, j: number, a: number, b: number, cost: number) => {
    const value = costs[i]![j]! + cost;
    if (value < costs[i + a]![j + b]! - 1e-9) { costs[i + a]![j + b] = value; back.set(`${i + a},${j + b}`, [a, b]); }
  };
  const cache = new Map<string, string>();
  const text = (lines: WorkLine[], start: number, size: number, side: string) => {
    const key = `${side}:${start}:${size}`;
    if (!cache.has(key)) cache.set(key, folded(lines.slice(start, start + size).map((l) => l.text).join(' ')));
    return cache.get(key)!;
  };
  for (let i = 0; i <= n; i++) for (let j = 0; j <= m; j++) {
    for (let a = 1; a <= Math.min(4, n - i); a++) for (let b = 1; b <= Math.min(4, m - j); b++) {
      if (a > 1 && b > 1) continue;
      const left = observed.slice(i, i + a), right = truth.slice(j, j + b);
      if (new Set([...left, ...right].map((l) => l.page)).size > 1) continue;
      // An unreadable cancelled line can be absent inside an OCR merge. Treat
      // it as a truth-side gap, not text to restore or a source of the claim.
      const meaningful = right.filter((l) => !blankStrike(l));
      if (a > 1 && left.some((l) => !folded(l.text)) || b > 1 && (!meaningful.length || meaningful.some((l) => !folded(l.text))
        || new Set(meaningful.map((l) => Boolean(l.struck))).size > 1 || new Set(meaningful.map((l) => l.region)).size > 1)) continue;
      const x = text(observed, i, a, 'o'), y = text(truth, j, b, 't');
      const edits = editDistance(x, y);
      const distance = Math.max(x.length, y.length) ? edits / Math.max(x.length, y.length) : 0;
      if (distance > .6) continue;
      // Every fragment must preserve or improve the match. Otherwise an exact line would
      // absorb an adjacent diagram label merely because grouping costs less.
      if (a > 1 && left.some((_, k) => editDistance(folded(left.filter((_, q) => q !== k).map((l) => l.text).join(' ')), y) < edits)) continue;
      if (b > 1 && meaningful.some((_, k) => editDistance(x, folded(meaningful.filter((_, q) => q !== k).map((l) => l.text).join(' '))) < edits)) continue;
      offer(i, j, a, b, distance + .7 * (a + Math.max(1, meaningful.length) - 2) - .04 * overlap(left, meaningful));
    }
    if (i < n) offer(i, j, 1, 0, .7);
    if (j < m) offer(i, j, 0, 1, .7);
  }
  const groups: LineMatch[] = [];
  for (let i = n, j = m; i || j;) {
    const [a, b] = back.get(`${i},${j}`)!;
    const right = truth.slice(j - b, j);
    const gaps = a && b > 1 ? right.filter(blankStrike) : [];
    groups.push({ observed: observed.slice(i - a, i).map((l) => l.index), truth: right.filter((l) => !gaps.includes(l)).map((l) => l.index) });
    for (const line of [...gaps].reverse()) groups.push({ observed: [], truth: [line.index] });
    i -= a; j -= b;
  }
  return { groups: groups.reverse() };
}
/** Text fixtures have authoritative source indices, even under severe noise. */
export function indexedWorkLines(observed: WorkLine[], truth: WorkLine[]): WorkAlignment {
  return { groups: [...observed.map((l) => ({ observed: [l.index], truth: truth.some((t) => t.index === l.index) ? [l.index] : [] })),
    ...truth.filter((l) => !observed.some((o) => o.index === l.index)).map((l) => ({ observed: [], truth: [l.index] }))] };
}
export function truthIndices(alignment: WorkAlignment, indices: number[]): number[] {
  return [...new Set(indices.flatMap((i) => alignment.groups.find((g) => g.observed.includes(i))?.truth ?? []))].sort((a, b) => a - b);
}
/** Remap sources for measurement only; parser/grade and their inputs stay untouched. */
export function compareAlignedWork(prediction: { parsed: ParsedWork; grade: WorkGrade }, truth: WorkTruth, reference: WorkLine[], observed: WorkLine[], alignment: WorkAlignment): WorkComparison {
  const remap = (indices: number[]) => [...new Set(indices.flatMap((i) => {
    const mapped = truthIndices(alignment, [i]); return mapped.length ? mapped : [-i - 1];
  }))];
  const selected = prediction.parsed.sourceLines ?? observed;
  const sourceLines = alignment.groups.flatMap((g) => {
    const source = selected.filter((l) => g.observed.includes(l.index) && !l.skipped);
    if (!source.length) return [];
    const indices = g.truth.length ? g.truth : g.observed.map((i) => -i - 1);
    return indices.map((index) => ({ ...source[0]!, index, text: joinedText(source, g.observed), conf: Math.min(...source.map((l) => l.conf)) }));
  });
  const parsed = { ...prediction.parsed, steps: prediction.parsed.steps.map((s) => ({ ...s, lines: remap(s.lines) })),
    sourceLines, unchecked: remap(prediction.parsed.unchecked), ignored: prediction.parsed.ignored.flatMap((l) => remap([l.line]).map((line) => ({ ...l, line }))) };
  const grade = { ...prediction.grade, ...(prediction.grade.firstErrorLines ? { firstErrorLines: remap(prediction.grade.firstErrorLines) } : {}) };
  const comparison = compareWork({ parsed, grade }, { ...truth, lines: reference });
  if (prediction.grade.result.verdict === 'SAI') {
    // Definition (ii)/(iii) concerns the text at the reported error, which is
    // exactly what readingCheck shows. Earlier OCR errors belong in the cause
    // audit; they must not hide a pipeline error on an exactly read line.
    const errorLines = prediction.grade.firstErrorLines ?? [];
    const relevant = alignment.groups.filter((g) => g.observed.some((i) => errorLines.includes(i)));
    const mismatch = relevant.some((g) => !g.truth.length || readingText(joinedText(selected.filter((l) => !l.skipped), g.observed)) !== readingText(joinedText(reference, g.truth)));
    comparison.readingMismatch = mismatch;
    const falseWrong = comparison.silentFalseWrongParse || comparison.silentFalseWrongReading;
    comparison.silentFalseWrongParse = falseWrong && !mismatch;
    comparison.silentFalseWrongReading = falseWrong && mismatch;
  }
  return comparison;
}
