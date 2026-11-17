import { grade } from '@mathtwin/core';
import type { ProblemSpec } from '@mathtwin/core';
import { stripDiacritics } from '@mathtwin/reader';
import type { TruthLine } from '@mathtwin/reader';
import type { WorkLine, WorkTruth } from '@mathtwin/work';
export function workLines(input: (TruthLine | WorkLine)[], width = 1000, height = 1440): WorkLine[] {
  return input.map((line, index) => {
    if ('index' in line) return { ...structuredClone(line), text: line.text ?? '', conf: line.conf ?? 1, alternatives: line.alternatives ?? [] };
    return { text: line.text ?? '', conf: 1, alternatives: [], page: 0, index, region: line.region,
      ...(line.struck === undefined ? {} : { struck: line.struck }),
      ...(line.box === undefined ? {} : { box: [line.box[0] / width * 1000, line.box[1] / height * 1000, line.box[2] / width * 1000, line.box[3] / height * 1000] as [number, number, number, number] }) };
  });
}
/** Fixture-label guard for rule 3, not a claim parser. */
export function hasGradingContent(text: string, spec: ProblemSpec): boolean {
  const escape = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const labels = spec.graph.vertices.map((v) => v.label.normalize('NFC')).sort((a, b) => b.length - a.length).map(escape);
  const label = '(?:' + labels.join('|') + ')';
  const normalized = text.normalize('NFC');
  const withoutLabels = labels.length ? normalized.replace(new RegExp('(?<![\\p{L}\\p{N}_])' + label + '(?![\\p{L}\\p{N}_])', 'gu'), '') : normalized;
  const folded = stripDiacritics(normalized).toLowerCase();
  return /\p{N}/u.test(withoutLabels) || normalized.includes('=')
    || labels.length > 0 && new RegExp(label + '\\s*(?:→|->|–|—|-)\\s*' + label, 'u').test(normalized)
    || /\b(?:vay|kl|dap so|dap an)\b/u.test(folded)
    || /(?:^|[^\p{L}])(?:đúng|sai)(?=$|[^\p{L}])/iu.test(normalized)
    || /(?:^|[\s;])[a-zA-Z][).:]\s*[ĐS](?=$|[\s.;,])|^\s*[ĐS]\s*[.;]?\s*$/u.test(normalized)
    || /\bchon\s+(?:phuong an\s+)?[a-d](?=$|[\s.;,)])/u.test(folded);
}
export function validateWork(spec: ProblemSpec, work: WorkTruth, lines: WorkLine[], requireProse = false): void {
  const invalid = (): never => { throw new Error('work.json không hợp lệ: kiểm tra claim, dòng nguồn, raw và nhãn chấm.'); };
  if (!work || !Array.isArray(work.claims) || !work.lineOf || typeof work.lineOf !== 'object' || !work.expected || !Array.isArray(lines)) invalid();
  const indices = new Set<number>();
  for (const line of lines) {
    if (!Number.isInteger(line.index) || line.index < 0 || indices.has(line.index) || !Number.isInteger(line.page) || line.page < 0
      || typeof line.text !== 'string' || line.text !== line.text.normalize('NFC') || !Number.isFinite(line.conf) || line.conf < 0 || line.conf > 1
      || !Array.isArray(line.alternatives) || line.alternatives.some((t) => typeof t !== 'string')
      || line.box && (line.box.length !== 4 || line.box.some((n) => !Number.isFinite(n) || n < 0 || n > 1000) || line.box[0] >= line.box[2] || line.box[1] >= line.box[3])) invalid();
    indices.add(line.index);
  }
  if (Object.keys(work.lineOf).length !== work.claims.length) invalid();
  for (const [index, claim] of work.claims.entries()) {
    if (!claim || claim.step !== index + 1 || typeof claim.raw !== 'string' || !claim.raw.trim()) invalid();
    const source = work.lineOf[String(claim.step)];
    if (!Array.isArray(source) || !source.length || new Set(source).size !== source.length) invalid();
    const selected = source!.map((i) => lines.find((l) => l.index === i));
    if (selected.some((l) => !l || l.struck || l.region === 'question' || l.region === 'figure') || selected.map((l) => l!.text).join('\n') !== claim.raw) invalid();
  }
  if (requireProse && !Array.isArray(work.prose)) invalid();
  if (work.prose !== undefined) {
    const used = new Set(Object.values(work.lineOf).flat());
    const prose = lines.filter((l) => l.region === 'solution' && !l.struck && !used.has(l.index));
    if (!Array.isArray(work.prose) || new Set(work.prose).size !== work.prose.length
      || work.prose.length !== prose.length || prose.some((l) => !work.prose!.includes(l.index) || hasGradingContent(l.text, spec))) invalid();
  }
  const result = grade(spec, work.claims);
  if (result.verdict !== work.expected.verdict || (result.firstErrorStep ?? null) !== (work.expected.firstErrorStep ?? null)
    || (result.errorCode ?? null) !== (work.expected.errorCode ?? null)) invalid();
}
