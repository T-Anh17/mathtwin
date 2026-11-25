import { grade } from '@mathtwin/core';
import type { Claim, ProblemSpec } from '@mathtwin/core';
import type { ParsedStep, ParsedWork, WorkGrade, WorkLine, WorkQuestion, WorkVocabulary } from './types.js';
import { workMessages } from './messages.vi.js';
import { readingConfidence } from './parse/confidence.js';
import { parseWork } from './parse/index.js';
import { vocabularyOf } from './vocabulary.js';

/** Display labels become core ids only at this grading boundary. */
function coreClaim(spec: ProblemSpec, claim: Claim): Claim {
  const ids = new Map(spec.graph.vertices.map((v) => [v.label, v.id]));
  const id = (value: string): string => ids.get(value) ?? value;
  const answer = (value: unknown, key = ''): unknown => {
    if (Array.isArray(value)) return value.map((v) => answer(v, key));
    if (typeof value === 'string' && ['vertices', 'oddVertices', 'isolatedVertices', 'components'].includes(key)) return id(value);
    if (typeof value === 'object' && value !== null) return Object.fromEntries(Object.entries(value).map(([k, v]) => [key === 'degrees' ? id(k) : k, answer(v, k)]));
    return value;
  };
  switch (claim.type) {
    case 'dijkstra_init': return { ...claim, source: id(claim.source) };
    case 'dijkstra_select': case 'degree': return { ...claim, v: id(claim.v) };
    case 'dijkstra_label': return { ...claim, v: id(claim.v), ...(claim.via ? { via: id(claim.via) } : {}) };
    case 'nn_step': case 'shortest_length': return { ...claim, from: id(claim.from), to: id(claim.to) };
    case 'postman_duplicate': case 'vertex_list': case 'odd_vertices': case 'walk': case 'length': return { ...claim, vertices: claim.vertices.map(id) };
    case 'edge_list': return { ...claim, edges: claim.edges.map((e) => ({ u: id(e.u), v: id(e.v) })) };
    case 'final_answer': return { ...claim, value: answer(claim.value) };
    default: return claim;
  }
}

/** Vocabulary-only: does this line yield a claim when read as working, in its page context?
 * With `unchecked`, working-like content the parser cannot interpret (e.g. "Chọn A:") also counts. */
export function lineCarriesClaim(lines: WorkLine[], index: number, vocab: WorkVocabulary, opts: { unchecked?: boolean } = {}): boolean {
  const trial = lines.map((line): WorkLine => {
    if (line.index !== index) return line;
    const { strikeScore: _score, strokeBand: _band, strikeQuestion: _question, skipped: _skipped, ...plain } = line;
    return { ...plain, region: line.region === 'table' ? 'table' : 'solution', struck: false };
  });
  const parsed = parseWork(trial, vocab);
  return parsed.steps.some((step) => step.lines.includes(index)) || opts.unchecked === true && parsed.unchecked.includes(index);
}

/** Rule 5 of phase 5: lines excluded from the working that would carry a claim must be asked about. */
export function regionQuestionLines(spec: ProblemSpec, source: WorkLine[]): WorkLine[] {
  const order = (a: WorkLine, b: WorkLine): number => a.page - b.page || a.index - b.index;
  const firstSolution = [...source].sort(order).find((line) => line.region === 'solution' || line.region === 'table');
  const candidates = source.filter((line) => !line.regionConfirmed && !line.skipped && !line.missing && !line.struck
    && (line.region === 'question' || line.region === 'figure') && (
      // (a) moved out of B's working label by the user's crop;
      line.regionSource === 'user'
      // (b) B labelled it question although it follows the first working line.
      || (line.regionSource ?? 'model') === 'model' && line.region === 'question' && firstSolution !== undefined && order(firstSolution, line) < 0));
  if (!candidates.length) return [];
  const vocab = vocabularyOf(spec);
  return candidates.filter((line) => lineCarriesClaim(source, line.index, vocab, { unchecked: true }));
}

export function gradeWork(spec: ProblemSpec, parsed: ParsedWork, opts?: { confThreshold?: number }): WorkGrade {
  const result = grade(spec, parsed.steps.map((s) => coreClaim(spec, s.claim)), opts);
  const first = parsed.steps.find((s) => s.claim.step === result.firstErrorStep);
  const source = parsed.sourceLines ?? [];
  const question = (kind: WorkQuestion['kind'], indices: number[], step?: ParsedStep): WorkQuestion => {
    // Table confidence also includes column labels. Confirm that header together with
    // the row, otherwise correcting only the row leaves the same OCR uncertainty alive.
    const labelKey = (text: string): string => text.normalize('NFC').replace(/[₀-₉]/gu, (s) => String(s.charCodeAt(0) - 0x2080)).toLowerCase();
    const labels = spec.graph.vertices.map((v) => labelKey(v.label));
    const firstSource = source.find((line) => line.index === indices[0]);
    const header = step && step.origin !== 'text' ? source.filter((line) => {
      if (!firstSource || line.page > firstSource.page || line.page === firstSource.page && line.index >= firstSource.index) return false;
      const words = (line.text.match(/[\p{L}\p{N}_]+/gu) ?? []).map(labelKey);
      return labels.length > 1 && labels.every((label) => words.includes(label))
        && words.filter((word) => !labels.includes(word)).every((word) => !/\d/u.test(word)) && !/[∞*=]/u.test(line.text);
    }).at(-1) : undefined;
    const questionLines = [...new Set([...(header ? [header.index] : []), ...indices])];
    const lines = questionLines.map((index) => source.find((l) => l.index === index)).filter((l) => l !== undefined);
    const page = step?.page ?? lines[0]?.page ?? 0;
    const boxes = lines.filter((l) => l.page === page).flatMap((l) => l.box ? [l.box] : []);
    const box = (!header ? step?.box : undefined) ?? (boxes.length ? [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])),
      Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))] as [number, number, number, number] : undefined);
    return { kind, lines: questionLines, page, ...(box ? { box } : {}),
      shownText: header ? lines.map((l) => l.text).join('\n') : step?.claim.raw ?? lines.map((l) => l.text).join('\n'),
      options: kind === 'unparsed' ? [workMessages.skip_line] : [...new Set((step?.candidateTexts ?? step?.candidates.map((body) => JSON.stringify(body)) ?? [])
        .map((text) => header ? header.text + '\n' + text : text))] };
  };
  const output: WorkGrade = { result, questions: [], ...(first ? { firstErrorLines: [...first.lines] } : {}) };
  if (result.verdict === 'CAN_XAC_NHAN') {
    output.questions = (result.needsConfirmation ?? []).flatMap((item) => {
      const step = parsed.steps.find((s) => s.claim.step === item.step);
      return step ? [question('reading', step.lines, step)] : [];
    });
    output.questions = output.questions.filter((q, i, all) => all.findIndex((other) => other.lines.join(',') === q.lines.join(',')) === i);
  }
  const position = (index: number): [number, number] => {
    const line = source.find((l) => l.index === index);
    return [line?.page ?? parsed.steps.find((s) => s.lines.includes(index))?.page ?? 0, index];
  };
  const before = (a: number, b: number): boolean => {
    const x = position(a), y = position(b); return x[0] < y[0] || x[0] === y[0] && x[1] < y[1];
  };
  const threshold = opts?.confThreshold ?? 0.85;
  const relevant = (indices: number[]): boolean => !first || indices.some((line) => first.lines.some((index) => line === index || before(line, index)));
  const regionLines = regionQuestionLines(spec, source).filter((line) => relevant([line.index]));
  // A doubtful earlier action may change all subsequent state, even if core accepts it.
  const uncertain = parsed.steps.filter((step) => (step.claim.conf ?? 1) < threshold && relevant(step.lines));
  const struck = new Set(parsed.issues.filter((issue) => issue.code === 'struck_uncertain').flatMap((issue) => issue.lines ?? []));
  const unchecked = [...new Set(parsed.unchecked)].filter((line) => struck.has(line) || relevant([line]));
  if (unchecked.length || uncertain.length) {
    const { errorCode: _errorCode, ...rest } = result;
    output.result = { ...rest, verdict: 'CAN_XAC_NHAN', message: workMessages.confirm_unparsed };
    output.questions.push(...uncertain.map((step) => question('reading', step.lines, step)));
    output.questions.push(...unchecked.map((index) => {
      const line = source.find((item) => item.index === index);
      if (struck.has(index)) return { ...question('struck', [index]), options: [workMessages.struck_yes, workMessages.struck_no] };
      return question(line && readingConfidence(line) < threshold ? 'reading' : 'unparsed', [index]);
    }));
  }
  if (regionLines.length) {
    // Rule 5: an excluded proposition is never dropped silently, and KHONG_DU_CAN_CU waits for these answers.
    output.questions.push(...regionLines.map((line): WorkQuestion => ({ kind: 'region', lines: [line.index], page: line.page,
      ...(line.box ? { box: line.box } : {}), shownText: line.text, options: [workMessages.region_solution, workMessages.region_question] })));
    const { errorCode: _errorCode, ...rest } = output.result;
    output.result = { ...rest, verdict: 'CAN_XAC_NHAN', message: workMessages.region };
  }
  output.questions = output.questions.filter((q, i, all) => all.findIndex((other) => other.lines.join(',') === q.lines.join(',')) === i);
  const missing = source.filter((l) => l.missing && !l.skipped);
  if (missing.length) {
    output.questions = output.questions.filter((q) => !q.lines.some((index) => missing.some((l) => l.index === index)));
    output.questions.push(...missing.map((l): WorkQuestion => ({ kind: 'reading', reason: 'missing', lines: [l.index], page: l.page,
      ...(l.box ? { box: l.box } : {}), shownText: workMessages.missing_line, options: [] })));
    output.result = { verdict: 'CAN_XAC_NHAN', message: workMessages.missing_line, notes: [] };
  }
  output.questions.sort((a, b) => a.page - b.page || Math.min(...a.lines) - Math.min(...b.lines));
  if (output.result.verdict === 'SAI' && first) output.readingCheck = question('reading', first.lines, first);
  return output;
}
