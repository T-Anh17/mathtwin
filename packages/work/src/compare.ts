import type { ClaimBody } from '@mathtwin/core';
import type { ParsedWork, WorkComparison, WorkGrade, WorkTruth } from './types.js';

function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') return '{' + Object.entries(value)
    .filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v)).join(',') + '}';
  return JSON.stringify(value);
}
/** Sets and undirected edge multisets are unordered; all walks remain ordered. */
export function claimKey(claim: ClaimBody): string {
  const { step: _step, raw: _raw, conf: _conf, box: _box, ...body } = claim as ClaimBody & {
    step?: number; raw?: string; conf?: number; box?: number[];
  };
  if (body.type === 'vertex_list' || body.type === 'odd_vertices') return canonical({ ...body, vertices: [...body.vertices].sort() });
  if (body.type === 'edge_list') return canonical({ type: body.type,
    edges: body.edges.map(({ u, v }) => [u, v].sort()).sort((a, b) => canonical(a).localeCompare(canonical(b), 'en')) });
  return canonical(body);
}
const sameLines = (a: number[], b: number[]): boolean => canonical([...new Set(a)].sort((x, y) => x - y)) === canonical([...new Set(b)].sort((x, y) => x - y));
export function compareWork(predicted: { parsed: ParsedWork; grade: WorkGrade }, truth: WorkTruth, opts?: { confThreshold?: number }): WorkComparison {
  const steps = predicted.parsed.steps;
  const p = steps.map((s) => claimKey(s.claim)); const t = truth.claims.map(claimKey);
  const lcs = Array.from({ length: p.length + 1 }, () => new Array<number>(t.length + 1).fill(0));
  for (let i = p.length - 1; i >= 0; i--) for (let j = t.length - 1; j >= 0; j--)
    lcs[i]![j] = p[i] === t[j] ? 1 + lcs[i + 1]![j + 1]! : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
  const matches: [number, number][] = [];
  let i = 0; let j = 0;
  while (i < p.length && j < t.length) {
    if (p[i] === t[j]) { matches.push([i++, j++]); }
    else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) i++; else j++;
  }
  const sourceCorrect = matches.filter(([pi, ti]) => sameLines(steps[pi]!.lines, truth.lineOf[String(truth.claims[ti]!.step)] ?? [])).length;
  const result = predicted.grade.result;
  const expectedLines = truth.lineOf[String(truth.expected.firstErrorStep)] ?? [];
  const errorLines = predicted.grade.firstErrorLines ?? [];
  const overlap = errorLines.some((line) => expectedLines.includes(line));
  const confirmation = result.verdict === 'CAN_XAC_NHAN';
  let readingMismatch: boolean | null = null;
  if (result.verdict === 'SAI') {
    const failing = steps.find((s) => s.claim.step === result.firstErrorStep);
    if (failing && errorLines.length) {
      const prefix = steps.slice(0, steps.indexOf(failing) + 1);
      const checks: (boolean | null)[] = prefix.map((step) => {
        const source = step.lines.map((index) => truth.lines?.find((l) => l.index === index)?.text);
        if (source.length && source.every((s) => s !== undefined)) return step.claim.raw.normalize('NFC').trim() !== source.join('\n').normalize('NFC').trim();
        const sameSource = truth.claims.filter((c) => sameLines(truth.lineOf[String(c.step)] ?? [], step.lines));
        return sameSource.length ? !sameSource.some((c) => c.raw === step.claim.raw) : null;
      });
      const source = predicted.parsed.sourceLines ?? [];
      const position = (index: number): [number, number] => [source.find((l) => l.index === index)?.page ?? truth.lines?.find((l) => l.index === index)?.page ?? 0, index];
      const throughError = (index: number): boolean => errorLines.some((last) => {
        const a = position(index), b = position(last); return a[0] < b[0] || a[0] === b[0] && a[1] <= b[1];
      });
      // Include truth content lost to prose/ignored before the predicted error.
      const missing = new Set(Object.values(truth.lineOf).flat().filter((index) => throughError(index) && !prefix.some((s) => s.lines.includes(index))));
      for (const index of missing) {
        const actual = source.find((l) => l.index === index), expected = truth.lines?.find((l) => l.index === index);
        checks.push(actual && expected ? actual.text.normalize('NFC').trim() !== expected.text.normalize('NFC').trim() : null);
      }
      readingMismatch = checks.includes(true) ? true : checks.includes(null) ? null : false;
    }
  }
  const threshold = opts?.confThreshold ?? 0.85;
  const content = new Set(Object.values(truth.lineOf).flat());
  const contentAsProse = { lowConfidence: 0, highConfidence: 0 };
  for (const index of new Set(predicted.parsed.ignored.filter((item) => item.reason === 'prose' && content.has(item.line)).map((item) => item.line))) {
    const line = predicted.parsed.sourceLines?.find((l) => l.index === index) ?? truth.lines?.find((l) => l.index === index);
    if (line && line.conf < threshold) contentAsProse.lowConfidence++; else contentAsProse.highConfidence++;
  }
  const falseWrong = result.verdict === 'SAI' && (truth.expected.verdict === 'DUNG' || truth.expected.verdict === 'SAI' && !overlap);
  return {
    completeCorrect: p.length === t.length && p.every((key, index) => key === t[index]),
    claims: { matched: matches.length, predicted: p.length, reference: t.length,
      precision: p.length ? matches.length / p.length : t.length ? 0 : 1,
      recall: t.length ? matches.length / t.length : p.length ? 0 : 1 },
    sourceLines: { correct: sourceCorrect, matched: matches.length, accuracy: matches.length ? sourceCorrect / matches.length : p.length || t.length ? 0 : 1 },
    verdictCorrect: confirmation ? null : result.verdict === truth.expected.verdict, confirmation,
    firstErrorCorrect: truth.expected.verdict === 'SAI' ? result.verdict === 'SAI' && overlap && result.errorCode === truth.expected.errorCode : null,
    silentFalseCorrect: result.verdict === 'DUNG' && truth.expected.verdict === 'SAI',
    // Missing reading evidence is conservatively counted as a parse error (ii).
    silentFalseWrongParse: falseWrong && readingMismatch !== true,
    silentFalseWrongReading: falseWrong && readingMismatch === true,
    readingMismatch,
    proseAsUnchecked: new Set(predicted.parsed.unchecked.filter((line) => truth.prose?.includes(line))).size,
    contentAsProse,
    struckAsContent: steps.filter((s) => s.lines.some((index) => truth.lines?.some((l) => l.index === index && l.struck))).length,
    insufficient: result.verdict === 'KHONG_DU_CAN_CU',
    insufficientReasons: result.verdict === 'KHONG_DU_CAN_CU' ? predicted.parsed.issues.map((issue) => issue.code) : [],
    questions: predicted.grade.questions.length + Number(predicted.grade.readingCheck !== undefined),
  };
}
