import type { TextLine } from './types.js';

export type TextRegion = NonNullable<TextLine['region']>;
export type TruthLine = { region: TextRegion; box?: [number, number, number, number] } &
  ({ text: string; struck?: boolean } | { text: null; struck: true });
export interface EditScore { errors: number; reference: number; rate: number | null }
export interface TokenScore extends EditScore { accuracy: number | null }
export interface TextMetrics {
  cer: EditScore; wer: EditScore; cerWithoutDiacritics: EditScore;
  digits: TokenScore; vertexLabels: TokenScore;
  referenceLines: number; predictedLines: number; correctLines: number;
  lineRecall: number | null; wrongLines: number; silentLines: number;
  silentLineRate: number | null; confidenceThreshold: number;
  struckReferenceLines: number; struckReadAsContent: number; struckUnassessable: number;
}
export interface TextComparison extends TextMetrics { byRegion: Record<TextRegion, TextMetrics> }
const clean = (text: string): string => text.normalize('NFC').trim().replace(/\s+/gu, ' ');
export const stripDiacritics = (text: string): string => text.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');

/** Unit-cost Levenshtein, linear memory, deterministic and Unicode-code-point aware at call sites. */
export function editDistance(reference: readonly string[], predicted: readonly string[]): number {
  let previous = Array.from({ length: predicted.length + 1 }, (_, i) => i);
  for (let i = 0; i < reference.length; i++) {
    const row = [i + 1];
    for (let j = 0; j < predicted.length; j++) row.push(Math.min(previous[j + 1]! + 1, row[j]! + 1,
      previous[j]! + (reference[i] === predicted[j] ? 0 : 1)));
    previous = row;
  }
  return previous[predicted.length]!;
}
function score(reference: string[], predicted: string[]): EditScore {
  const errors = editDistance(reference, predicted);
  return { errors, reference: reference.length, rate: reference.length ? errors / reference.length : null };
}
function tokens(reference: string[], predicted: string[]): TokenScore {
  const result = score(reference, predicted);
  return { ...result, accuracy: result.rate === null ? null : Math.max(0, 1 - result.rate) };
}
function exactLineMatches(reference: string[], predicted: string[]): number {
  // LCS counts only complete, ordered lines; a duplicated prediction cannot recover two truth lines.
  let previous = new Array<number>(predicted.length + 1).fill(0);
  for (const line of reference) {
    const row = [0];
    for (let j = 0; j < predicted.length; j++) row.push(line === predicted[j] ? previous[j]! + 1 : Math.max(previous[j + 1]!, row[j]!));
    previous = row;
  }
  return previous[predicted.length]!;
}
function vertexTokens(s: string, labels: readonly string[]): string[] {
  const vocabulary = [...new Set(labels.map(clean).filter(Boolean))].sort((a, b) => b.length - a.length);
  const escaped = vocabulary.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const labelPattern = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${[...escaped, '[A-Z](?:[0-9₀-₉]+)?', '[vV][0-9₀-₉]+'].join('|')})(?![\\p{L}\\p{N}_])`, 'gu');
  const compact = (word: string): string[] | null => {
    // Full-token segmentation, longest label first with backtracking. Never split prose partially.
    const suffixes = new Map<number, string[] | null>([[word.length, []]]);
    const split = (offset: number): string[] | null => {
      if (suffixes.has(offset)) return suffixes.get(offset)!;
      for (const label of vocabulary) if (!label.includes(' ') && word.startsWith(label, offset)) {
        const tail = split(offset + label.length);
        if (tail !== null) { const result = [label, ...tail]; suffixes.set(offset, result); return result; }
      }
      suffixes.set(offset, null); return null;
    };
    return split(0);
  };
  const tokens: string[] = []; let start = 0;
  for (const match of s.matchAll(/[\p{L}\p{N}_₀-₉]+/gu)) {
    const parts = compact(match[0]);
    if (parts === null || parts.length < 2) continue;
    tokens.push(...(s.slice(start, match.index).match(labelPattern) ?? []), ...parts);
    start = match.index + match[0].length;
  }
  tokens.push(...(s.slice(start).match(labelPattern) ?? []));
  return tokens;
}
function metrics(predicted: readonly TextLine[], truth: readonly TruthLine[], labels: readonly string[], threshold: number,
  struckReadAsContent: number, struckUnassessable: number): TextMetrics {
  const reference = truth.filter((line) => !line.struck).map((line) => clean(line.text!));
  const hypothesis = predicted.map((line) => clean(line.text));
  const text = reference.join(' '); const read = hypothesis.join(' ');
  const words = (s: string): string[] => s ? s.split(' ') : [];
  const numbers = (s: string): string[] => s.match(/\d+(?:[.,]\d+)?/gu) ?? [];
  const correctLines = exactLineMatches(reference, hypothesis);
  // Choose high-confidence matches first among repeated identical lines, without using alternatives.
  const highConfidence = hypothesis.filter((_, i) => predicted[i]!.conf >= threshold);
  const silentLines = highConfidence.length - exactLineMatches(reference, highConfidence);
  return { cer: score([...text], [...read]), wer: score(words(text), words(read)),
    cerWithoutDiacritics: score([...stripDiacritics(text)], [...stripDiacritics(read)]),
    digits: tokens(numbers(text), numbers(read)), vertexLabels: tokens(vertexTokens(text, labels), vertexTokens(read, labels)),
    referenceLines: reference.length, predictedLines: predicted.length, correctLines,
    lineRecall: reference.length ? correctLines / reference.length : null,
    wrongLines: predicted.length - correctLines, silentLines,
    silentLineRate: predicted.length ? silentLines / predicted.length : null, confidenceThreshold: threshold,
    struckReferenceLines: truth.filter((line) => line.struck).length, struckReadAsContent, struckUnassessable };
}

/** Ordered text alignment assigns each prediction to a truth region, including wrong/extra lines.
 * It changes only reporting buckets, never recognition text, confidence or alternatives. */
function alignedRegions(predicted: readonly TextLine[], truth: readonly TruthLine[]): TextRegion[] {
  const reference = truth.filter((line) => !line.struck);
  const n = reference.length; const m = predicted.length;
  const cost = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  const action = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 1; i <= n; i++) { cost[i]![0] = i; action[i]![0] = 1; }
  for (let j = 1; j <= m; j++) { cost[0]![j] = j; action[0]![j] = 2; }
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
    const a = [...clean(reference[i - 1]!.text!)]; const b = [...clean(predicted[j - 1]!.text)];
    const candidates = [cost[i - 1]![j - 1]! + editDistance(a, b) / Math.max(1, a.length, b.length), cost[i - 1]![j]! + 1, cost[i]![j - 1]! + 1];
    const best = Math.min(...candidates); cost[i]![j] = best; action[i]![j] = candidates.indexOf(best);
  }
  const regions: TextRegion[] = new Array<TextRegion>(m);
  let i = n; let j = m;
  while (i > 0 || j > 0) {
    const step = action[i]![j];
    if (step === 0) { regions[j - 1] = reference[i - 1]!.region; i--; j--; }
    else if (step === 1) i--;
    else { regions[j - 1] = predicted[j - 1]!.region ?? reference[Math.min(i, n - 1)]?.region ?? truth[0]?.region ?? 'solution'; j--; }
  }
  return regions;
}
function overlaps(a: NonNullable<TruthLine['box']>, b: NonNullable<TruthLine['box']>): boolean {
  const intersection = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const area = Math.min((a[2] - a[0]) * (a[3] - a[1]), (b[2] - b[0]) * (b[3] - b[1]));
  return area > 0 && intersection / area >= 0.5;
}
export function compareText(predicted: readonly TextLine[], truth: readonly TruthLine[], labels: readonly string[] = [], threshold = 0.85): TextComparison {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1
    || predicted.some((line) => !Number.isFinite(line.conf) || line.conf < 0 || line.conf > 1)) throw new Error('Invalid confidence');
  const content = predicted.filter((line) => !line.struck);
  const regions = alignedRegions(content, truth);
  const readStruck: TruthLine[] = []; const unassessable: TruthLine[] = []; const used = new Set<number>();
  const activeTexts = truth.filter((line) => !line.struck).map((line) => clean(line.text!));
  // Reserve exact active text occurrences first so a repeated legitimate line is not a false strike hit.
  const remaining = new Map<string, number>();
  for (const text of activeTexts) remaining.set(text, (remaining.get(text) ?? 0) + 1);
  const reserved = new Set<number>();
  content.forEach((line, i) => { const text = clean(line.text); const count = remaining.get(text) ?? 0;
    if (count > 0) { reserved.add(i); remaining.set(text, count - 1); } });
  for (const line of truth.filter((line) => line.struck)) {
    const index = content.findIndex((p, i) => !used.has(i) && (line.box && p.box ? overlaps(line.box, p.box)
      : line.text !== null && !reserved.has(i) && clean(p.text) === clean(line.text)));
    if (index >= 0) { readStruck.push(line); used.add(index); regions[index] = line.region; }
    else if (line.text === null && content.some((p) => !line.box || !p.box)) unassessable.push(line);
  }
  const byRegion = Object.fromEntries((['question', 'figure', 'table', 'solution'] as const).map((region) => [region,
    metrics(content.filter((_, i) => regions[i] === region), truth.filter((line) => line.region === region), labels, threshold,
      readStruck.filter((line) => line.region === region).length, unassessable.filter((line) => line.region === region).length)])) as Record<TextRegion, TextMetrics>;
  return { ...metrics(content, truth, labels, threshold, readStruck.length, unassessable.length), byRegion };
}
