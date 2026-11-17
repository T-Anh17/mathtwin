import { labelKey } from './text.js';
export class LabelError extends Error {
  constructor(readonly code: 'ambiguous_line' | 'unknown_label') { super(code); }
}
/** At most two segmentations are needed to reject ambiguity, including AB vs A+B. */
export function splitLabels(text: string, labels: string[]): string[] {
  const token = labelKey(text); const cache = new Map<number, string[][]>();
  const visit = (offset: number): string[][] => {
    if (offset === token.length) return [[]];
    const cached = cache.get(offset); if (cached) return cached;
    const results: string[][] = [];
    for (const label of labels) {
      const key = labelKey(label);
      if (!key || !token.startsWith(key, offset)) continue;
      for (const tail of visit(offset + key.length)) {
        results.push([label, ...tail]);
        if (results.length === 2) { cache.set(offset, results); return results; }
      }
    }
    cache.set(offset, results); return results;
  };
  const results = visit(0);
  if (results.length > 1) throw new LabelError('ambiguous_line');
  if (!results.length) throw new LabelError('unknown_label');
  return results[0]!;
}
export function oneLabel(text: string, labels: string[]): string {
  const matches = labels.filter((v) => labelKey(v) === labelKey(text.trim()));
  if (matches.length > 1) throw new LabelError('ambiguous_line');
  if (matches.length !== 1) throw new LabelError('unknown_label');
  return matches[0]!;
}
export function labelList(text: string, labels: string[]): string[] {
  const clean = text.replace(/[{}().]/gu, '').trim();
  if (!clean || /^(?:khong co|tap rong)$/u.test(clean)) return [];
  return clean.split(/\s*(?:,|;|→|-)\s*|\s+/u).filter(Boolean).flatMap((s) => splitLabels(s, labels));
}
