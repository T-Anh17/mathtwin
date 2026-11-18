/** Preserve alignment through NFC composition, conservatively taking each cluster's minimum. */
export function normalizeCharConfidence(text: string, scores: number[]): number[] | undefined {
  if ([...text].length !== scores.length || scores.some((p) => !Number.isFinite(p) || p < 0 || p > 1)) return;
  const result: number[] = [];
  let offset = 0;
  for (const { segment } of new Intl.Segmenter('vi', { granularity: 'grapheme' }).segment(text)) {
    const length = [...segment].length;
    const probability = Math.min(...scores.slice(offset, offset + length));
    result.push(...[...segment.normalize('NFC')].map(() => probability));
    offset += length;
  }
  return result;
}
