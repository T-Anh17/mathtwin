import { solve, validateSpec } from '@mathtwin/core';
import type { ProblemSpec } from '@mathtwin/core';
import { compareRead, normalizeDraft } from '@mathtwin/reader';
import type { PreparedImage, ReadOutcome } from '@mathtwin/reader';
import { gradeWork, parseWork, vocabularyOf } from '@mathtwin/work';
import type { WorkAnswer, WorkLine, WorkQuestion, WorkTruth, WorkBox } from '@mathtwin/work';
import { createSession, sessionReducer } from '../../../apps/mobile/src/flow/sessionReducer.js';
import type { Session, SessionEvent } from '../../../apps/mobile/src/flow/types.js';
import { readProblemPages } from '../../../apps/mobile/src/flow/reading.js';
import type { Readers } from '../../../apps/mobile/src/flow/reading.js';
import { confirmationQuestions, initialProblem, replaceGraph, confirmProblem, replaceSuggestedFields, taskSuggestion } from '../../../apps/mobile/src/flow/confirmation.js';
import { readWorkPages, readWorkRegion, combinedWorkLines, processWorkPage } from '../../../apps/mobile/src/flow/work-reading.js';
import type { WorkPageRead } from '../../../apps/mobile/src/flow/work-reading.js';
import { resultView, solutionView } from '../../../apps/mobile/src/flow/view.js';
import { alignWorkLines, compareAlignedWork, joinedText, readingText } from './work-alignment.js';
import type { WorkAlignment } from './work-alignment.js';
import { auditWork } from './work-audit.js';
import { figureEffort } from './figure-effort.js';
import type { FigureAnnotation } from './figure-geometry.js';
import { checkMvpSolution } from './mvp-oracle.js';

/** Truth is consulted only when explicitly simulating a user action or scoring. */
export function simulateProblemConfirmation(outcome: ReadOutcome, truth: ProblemSpec) {
  const questions = confirmationQuestions(outcome);
  let spec = replaceGraph(initialProblem(outcome), structuredClone(truth.graph));
  const taskFields = truth.task as unknown as Record<string, unknown>;
  const answers: Record<string, unknown> = {};
  const suggestion = taskSuggestion(outcome);
  const fullFormEdits = formEditCount(truth);
  let formEdits = 0;
  // A missing task needs the same explicit form entry as in ProblemConfirmScreen.
  if (!outcome.spec || spec.uncertain?.some((u) => u.item === 'task.type')) {
    spec = { ...spec, task: structuredClone(truth.task) };
    if (!outcome.spec) formEdits = suggestion?.task?.type === truth.task.type ? changedSuggestionFields(suggestion.task, truth) : fullFormEdits;
  }
  if (!outcome.spec) {
    spec.questionFormat = truth.questionFormat;
    if (suggestion?.questionFormat !== truth.questionFormat) formEdits++;
    spec = replaceSuggestedFields(spec);
  }
  for (const flag of spec.uncertain ?? []) {
    if (flag.item === 'questionFormat') answers[flag.item] = truth.questionFormat;
    else if (flag.item.startsWith('task.')) answers[flag.item] = taskFields[flag.item.slice(5)] ?? null;
  }
  // Never repair a confident, incorrect task merely because truth is available.
  const suggestionTaskCorrect = suggestion?.task?.type === truth.task.type;
  const suggestionParametersCorrect = suggestionTaskCorrect && JSON.stringify(suggestion?.task) === JSON.stringify(truth.task);
  return { spec: confirmProblem(spec, answers), questions: questions.length, formEdits, suggestion: {
    available: Boolean(suggestion?.task), typeCorrect: suggestionTaskCorrect, parametersCorrect: suggestionParametersCorrect,
    formEditsBefore: !outcome.spec ? fullFormEdits + 1 : 0, formEditsAfter: formEdits,
  } };
}

function formEditCount(spec: ProblemSpec): number {
  const task = spec.task as unknown as Record<string, unknown>;
  return 1 + Object.entries(task).reduce((count, [key, value]) => key === 'type' ? count
    : key === 'items' && Array.isArray(value) ? count + value.length * 2 : count + 1, 0);
}
function changedSuggestionFields(suggested: ProblemSpec['task'], truth: ProblemSpec): number {
  const candidate = suggested as unknown as Record<string, unknown>;
  const expected = truth.task as unknown as Record<string, unknown>;
  let edits = 0;
  for (const [key, value] of Object.entries(expected)) {
    if (key === 'type' || JSON.stringify(candidate[key]) === JSON.stringify(value)) continue;
    edits += key === 'items' && Array.isArray(value) ? value.length * 2 : 1;
  }
  return edits;
}

/** Preserve the Lô 3.6 text DP. Only an actual missing-ink question can use crop geometry. */
export function alignMvpWork(observed: WorkLine[], truth: WorkLine[]): WorkAlignment {
  // First reserve truth for rows actually shown in the main list.  Rows labelled
  // question/figure (or skipped) live behind the review affordance and must not
  // consume text that a visible missing-ink placeholder needs to ask about.
  const main = observed.filter((l) => l.missing || (!l.skipped && (l.region === 'solution' || l.region === 'table')));
  const alignment = alignWorkLines(main, truth);
  const mainTruth = new Set(alignment.groups.filter((g) => g.observed.length).flatMap((g) => g.truth));
  const remaining = truth.filter((line) => !mainTruth.has(line.index));
  const hidden = observed.filter((l) => !main.includes(l));
  if (hidden.length && remaining.length) alignment.groups.push(...alignWorkLines(hidden, remaining).groups);
  for (const line of main.filter((l) => l.missing)) {
    const matches = truth.filter((t) => (t.region === 'solution' || t.region === 'table') && t.box && line.box
      && t.box[1] < line.box[3] && t.box[3] > line.box[1]
      // A main-list text row wins, but an ignored question/figure row does not.
      && !mainTruth.has(t.index));
    const indices = matches.map((l) => l.index);
    alignment.groups = alignment.groups.map((g) => main.includes(observed.find((l) => l.index === g.observed[0])!) ? g
      : { ...g, truth: g.truth.filter((i) => !indices.includes(i)) });
    alignment.groups = alignment.groups.filter((g) => g.observed.length || g.truth.length);
    alignment.groups = alignment.groups.filter((g) => !g.observed.includes(line.index));
    alignment.groups.push({ observed: [line.index], truth: indices });
  }
  return alignment;
}

const solutionRow = (l: WorkLine) => l.region === 'solution' || l.region === 'table';

/** Simulate an accurate hand crop without another B read.  Alignment may only
 * change the displayed region of matched OCR rows; raw B output stays intact. */
export function simulateManualWorkRegion(image: PreparedImage, reading: WorkPageRead, reference: WorkLine[]): WorkPageRead {
  const truth = reference.filter((line) => line.page === reading.page);
  const matchesByObserved = new Map<number, WorkLine[]>();
  for (const group of alignWorkLines(reading.raw, truth).groups) {
    const matches = truth.filter((line) => group.truth.includes(line.index));
    for (const index of group.observed) matchesByObserved.set(index, matches);
  }
  const relabelled = reading.raw.map((line) => {
    const matches = matchesByObserved.get(line.index) ?? [];
    if (!matches.length) return line;
    const regions = matches.map((match) => match.region);
    if (regions.every((region) => region === 'solution' || region === 'table'))
      return { ...line, region: regions.every((region) => region === 'table') ? 'table' as const : 'solution' as const, regionConf: 1 };
    if (regions.every((region) => region === 'question' || region === 'figure'))
      return { ...line, region: regions.every((region) => region === 'figure') ? 'figure' as const : 'question' as const, regionConf: 1 };
    // One OCR group spanning distinct truth regions is ambiguous: retain B's label.
    return line;
  });
  const processed = processWorkPage(image, { ...reading, raw: relabelled, lines: relabelled });
  // An unmatched row retains B's region and cannot cause another crop inference.
  return { ...processed, raw: reading.raw, needsRegion: false, inspected: true, missingLineCheckUnavailable: true };
}

/** Evaluator-only: an automatic strike counts as "on a mark" when the vertical centre of a
 * truth-struck row lies inside the observed row and the two overlap horizontally. */
export function strikeAudit(observed: WorkLine[], truth: WorkLine[]) {
  const marks = truth.filter((t) => t.struck && t.box).map((t) => t.box!);
  const struck = observed.filter((l) => l.struck && solutionRow(l));
  const onMark = struck.filter((l) => l.box && marks.some((m) => {
    const middle = (m[1] + m[3]) / 2;
    return middle >= l.box![1] && middle <= l.box![3] && m[0] < l.box![2] && m[2] > l.box![0];
  })).map((l) => l.index);
  return { onMark, offMark: struck.map((l) => l.index).filter((i) => !onMark.includes(i)) };
}

export type DeviationCause = 'pending_questions' | 'strike_off_mark' | 'strike_merged' | 'region_excluded' | 'claim_line_missing' | 'unclassified';
/** Evaluator-only explanation of a verdict that differs from truth, derived from the final
 * session and the Lô 3.6 alignment (never from sample ids). */
export function deviationCause(session: Session, truth: WorkLine[], workTruth: WorkTruth): { cause: DeviationCause; lines: number[] } {
  const pending = [...(session.workGrade?.questions ?? []), ...(session.workGrade?.readingCheck ? [session.workGrade.readingCheck] : [])];
  if (pending.length) return { cause: 'pending_questions', lines: [...new Set(pending.flatMap((q) => q.lines))] };
  const alignment = alignMvpWork(session.workLines, truth);
  const strikes = strikeAudit(session.workLines, truth);
  const found: { cause: DeviationCause; line: number }[] = [];
  for (const claimLine of new Set(Object.values(workTruth.lineOf).flat())) {
    const observed = alignment.groups.filter((g) => g.truth.includes(claimLine)).flatMap((g) => g.observed)
      .map((i) => session.workLines.find((l) => l.index === i)).filter((l): l is WorkLine => Boolean(l));
    if (!observed.length) { found.push({ cause: 'claim_line_missing', line: claimLine }); continue; }
    for (const line of observed) {
      if (line.struck && strikes.offMark.includes(line.index)) found.push({ cause: 'strike_off_mark', line: line.index });
      else if (line.struck) found.push({ cause: 'strike_merged', line: line.index });
      else if (line.skipped || line.region === 'question' || line.region === 'figure') found.push({ cause: 'region_excluded', line: line.index });
    }
  }
  const order: DeviationCause[] = ['strike_off_mark', 'strike_merged', 'region_excluded', 'claim_line_missing'];
  const cause = order.find((c) => found.some((f) => f.cause === c)) ?? 'unclassified';
  return { cause, lines: found.filter((f) => f.cause === cause).map((f) => f.line) };
}

/** Only answer shown lines. A completely absent line is never injected from truth. */
export function truthWorkAnswers(indices: number[], lines: WorkLine[], truth: WorkLine[], alignment: WorkAlignment): WorkAnswer[] {
  const groups = alignment.groups.filter((g) => g.observed.some((i) => indices.includes(i)));
  return groups.flatMap((g): WorkAnswer[] => {
    const primary = g.observed.find((i) => indices.includes(i) && !['question', 'figure'].includes(lines.find((l) => l.index === i)?.region ?? ''))
      ?? g.observed.find((i) => indices.includes(i)) ?? g.observed[0]!;
    const refs = truth.filter((l) => g.truth.includes(l.index));
    if (!refs.length) return g.observed.map((line) => ({ line, skip: true }));
    if (refs.every((l) => l.struck)) return g.observed.map((line) => lines.find((l) => l.index === line)?.missing
      ? { line, skip: true } : { line, struck: true });
    // Question/figure intrusions are explicitly skipped by the simulated user.
    if (refs.every((l) => l.region === 'question' || l.region === 'figure')) return g.observed.map((line) => ({ line, skip: true }));
    const active = refs.filter((l) => !l.struck);
    const answers: WorkAnswer[] = [{ line: primary, text: active.map((l) => l.text).join('\n') }];
    const source = lines.find((l) => l.index === primary);
    if (source?.struck || source?.strikeScore !== undefined) answers.unshift({ line: primary, struck: false });
    const grouped = new Set(alignment.groups.flatMap((other) => other.observed));
    const splitFragments = [
      ...alignment.groups.filter((other) => !other.truth.length && other.observed.length
      && other.observed.every((line) => !indices.includes(line))
      && other.observed.every((line) => ['question', 'figure'].includes(lines.find((row) => row.index === line)?.region ?? ''))),
      // Hidden rows with no truth remaining are not represented by the second
      // DP pass at all. They can still be the other half of a split.
      ...lines.filter((line) => !grouped.has(line.index) && !indices.includes(line.index)
        && (line.region === 'question' || line.region === 'figure')).map((line) => ({ observed: [line.index], truth: [] })),
    ].filter((other) => readingText(joinedText(lines, [...g.observed, ...other.observed].sort((a, b) => a - b)))
      === readingText(active.map((line) => line.text).join('\n'))).flatMap((other) => other.observed);
    // A split OCR fragment that the main list intentionally hid must be
    // answered exactly once with its visible counterpart.  Otherwise it is
    // surfaced later as an unrelated, truth-less review row.
    answers.push(...[...g.observed.filter((i) => i !== primary), ...splitFragments].map((line): WorkAnswer => ({ line, skip: true })));
    return answers;
  });
}

export function replayMvpWork(start: Session, truth: WorkLine[], ops?: Parameters<typeof sessionReducer>[2]) {
  let session = start;
  const alignment = alignMvpWork(start.workLines, truth);
  const answered = new Set<number>();
  let questions = 0, reviews = 0, reviewEdits = 0;
  const send = (event: SessionEvent) => { session = sessionReducer(session, event, ops); };
  const respond = (indices: number[]) => {
    const answers = truthWorkAnswers(indices, session.workLines, truth, alignment);
    for (const answer of answers) { send({ type: 'work_answer', answer }); answered.add(answer.line); }
    return answers.length > 0;
  };
  for (let round = 0; round <= start.workLines.length * 3 + 1; round++) {
    const pending: WorkQuestion[] = [...(session.workGrade?.questions ?? []),
      ...(session.workGrade?.readingCheck ? [session.workGrade.readingCheck] : [])];
    const next = pending.find((q) => q.lines.some((i) => !answered.has(i)));
    if (next) { questions++; if (respond(next.lines)) continue; }
    if (session.stage !== 'work_review' || session.workGrade?.questions.length) break;
    // This is the actual review gate, not an unconditional oracle repair pass.
    reviews = 1;
    // WorkScreen renders every source row: either in the main list or in the
    // expandable ignored list. Opening that list is part of the optimistic review.
    const visible = new Set(session.workLines.map((l) => l.index));
    const group = alignment.groups.find((g) => g.observed.some((i) => visible.has(i) && !answered.has(i)) && g.truth.length
      && (readingText(joinedText(session.workLines.filter((l) => !l.skipped), g.observed)) !== readingText(joinedText(truth, g.truth))
        || g.observed.some((i) => Boolean(session.workLines.find((l) => l.index === i)?.struck) !== truth.filter((l) => g.truth.includes(l.index)).every((l) => l.struck))
        || g.observed.some((i) => ['question', 'figure'].includes(session.workLines.find((l) => l.index === i)?.region ?? '')))
      && g.truth.some((i) => truth.some((l) => l.index === i && (l.region === 'solution' || l.region === 'table'))));
    if (group) {
      for (const i of group.observed) if (['question', 'figure'].includes(session.workLines.find((l) => l.index === i)?.region ?? '')) send({ type: 'work_restore', line: i });
      reviewEdits++; respond(group.observed); continue;
    }
    send({ type: 'review_ack' }); break;
  }
  return { session, alignment, questions, reviews, reviewEdits };
}

export interface MvpInput {
  id: string; date: string; image: PreparedImage; truth: ProblemSpec; workTruth: WorkTruth; reference: WorkLine[];
  region: WorkBox; figure: FigureAnnotation; readers: Readers; signal: AbortSignal;
  /** Pair datasets may contain distinct, multi-page problem and work photos.  The
   * legacy synthetic evaluator continues to supply the single `image` field. */
  problemImages?: PreparedImage[];
  workImages?: PreparedImage[];
  /** A label-derived solution area.  `undefined` means a person would have to
   * draw the crop; the evaluator records that work but does not reread B. */
  regionByPage?: (page: number) => WorkBox | undefined;
  saved?: Session; checkpoint: (session: Session) => Promise<void>;
  /** Explicit evaluator-only replay: raw OCR is retained, no corrected text is recycled. */
  prior?: { session: Session; regionQuestions: number; manualRegionPages: number[]; timings: { workRead: number; decode: number; region: number } };
}
/** Also usable for a page whose work OCR failed after the problem/solve stages. */
export function mvpReadComparisons(session: Session, truth: ProblemSpec) {
  const outcome = session.problemRead;
  if (!outcome) throw new Error('Checkpoint thiếu kết quả đọc đề.');
  const draft = session.problemPages?.[0]?.figure;
  const d = draft ? normalizeDraft(draft) : null;
  const effective: ReadOutcome = { ...outcome, graph: d?.graph ?? null, graphUncertain: d?.graphUncertain ?? [{ item: 'graph', candidates: [] }],
    spec: outcome.spec && d?.graph ? { ...outcome.spec, graph: d.graph, uncertain: [...(outcome.spec.uncertain ?? []).filter((u) => u.item.startsWith('task.') || u.item === 'questionFormat'),
      ...d.graphUncertain] } : null };
  return { draft, readComparison: compareRead(effective, truth), bComparison: compareRead(outcome, truth) };
}
export async function runMvpSample(input: MvpInput) {
  const { image, truth, reference, readers, signal } = input;
  const problemImages = input.problemImages ?? [image];
  const workImages = input.workImages ?? [image];
  let session = input.prior ? { ...createSession(input.id, input.date), stage: 'problem_reading' as const,
    problemPhotos: structuredClone(input.prior.session.problemPhotos), problemPages: structuredClone(input.prior.session.problemPages ?? []),
    timings: { ...input.prior.session.timings, figureDraft: (input.prior.session.problemPages ?? []).reduce((n, p) => n + p.figureMs, 0) } }
    : input.saved ?? createSession(input.id, input.date);
  const timings = { decode: 0, problemRead: 0, figureDraft: 0, confirm: 0, solve: 0, workRead: 0, region: input.prior?.timings.region ?? 0, inspection: 0, grade: 0, replay: 0, view: 0 };
  const ops = { solve: ((...args: Parameters<typeof solve>) => { const t = performance.now(); const result = solve(...args); timings.solve += performance.now() - t; return result; }),
    gradeWork: ((...args: Parameters<typeof gradeWork>) => { const t = performance.now(); const result = gradeWork(...args); timings.grade += performance.now() - t; return result; }) };
  const send = (event: SessionEvent) => { session = sessionReducer(session, event, ops); };
  const problemPhotos = problemImages.map((page, index) => ({ id: `${input.id}-de-${index + 1}`, width: page.width, height: page.height, page: index }));
  const workPhotos = workImages.map((page, index) => ({ id: `${input.id}-bai-${index + 1}`, width: page.width, height: page.height, page: index }));
  if (session.stage === 'problem_capture') send({ type: 'problem_photos', photos: problemPhotos });
  if (session.stage === 'problem_reading') {
    const outcome = await readProblemPages({ count: problemImages.length, readers, signal, load: async (page) => problemImages[page]!, saved: session.problemPages ?? [], progress: () => {},
      timeoutMs: 420_000, checkpoint: async (reading) => { send({ type: 'problem_page', reading }); await input.checkpoint(session); } });
    send({ type: 'problem_read', outcome, ms: outcome.usage.latencyMs }); await input.checkpoint(session);
  }
  const outcome = session.problemRead;
  if (!outcome) throw new Error('Checkpoint thiếu kết quả đọc đề.');
  const { draft, readComparison, bComparison } = mvpReadComparisons(session, truth);
  const effort = figureEffort(draft ?? { vertices: [], edges: [] }, input.figure);
  const t = performance.now();
  const confirmation = simulateProblemConfirmation(outcome, truth);
  timings.confirm = performance.now() - t;
  if (session.stage === 'problem_confirm') { send({ type: 'spec_confirmed', spec: confirmation.spec }); await input.checkpoint(session); }
  if (!session.spec || !session.solution || !validateSpec(session.spec).ok) throw new Error('Đề xác nhận chưa hợp lệ.');
  const confirmedCorrect = compareRead({ ...outcome, spec: session.spec }, truth).completeCorrect;
  const solutionCheck = confirmedCorrect ? checkMvpSolution(truth, session.solution) : { correct: false, reason: 'Đề xác nhận khác truth' };
  if (session.stage === 'solution') { send({ type: 'work_capture', source: 'photo' }); send({ type: 'work_photos', photos: workPhotos }); }
  if (input.prior) {
    const started = performance.now();
    const pages = input.prior.session.workPages;
    if (!pages?.length || pages.some((p) => p.failed || !p.inspected)) throw new Error('Không có đủ OCR gốc để chấm lại.');
    for (const page of pages) {
      const labelledRegion = input.regionByPage?.(page.page);
      const reread = { ...structuredClone(page), lines: structuredClone(page.raw) };
      send({ type: 'work_page', reading: input.regionByPage && !labelledRegion
        ? simulateManualWorkRegion(workImages[page.page]!, reread, reference)
        : processWorkPage(workImages[page.page]!, reread, input.prior.regionQuestions ? page.region : undefined) });
    }
    timings.inspection = performance.now() - started;
    await input.checkpoint(session);
  }
  if (session.stage === 'work_reading') {
    await readWorkPages({ count: workImages.length, reader: readers.text, vocab: vocabularyOf(session.spec), signal, load: async (page) => workImages[page]!,
      saved: session.workPages ?? [], timeoutMs: 420_000, progress: () => {},
      checkpoint: async (reading) => { send({ type: 'work_page', reading }); await input.checkpoint(session); } });
  }
  let regionQuestions = input.prior?.regionQuestions ?? 0;
  const manualRegionPages = [...(input.prior?.manualRegionPages ?? [])];
  for (const reading of session.workPages ?? []) if (reading.needsRegion) {
    regionQuestions++;
    const labelledRegion = input.regionByPage?.(reading.page);
    if (input.regionByPage) {
      // Pair labels may not include geometry.  Model B has already completed its
      // one permitted read of this page, so record a hand crop instead of doing a
      // second OCR call merely to manufacture boxes.
      if (!labelledRegion) manualRegionPages.push(reading.page);
      const completed = labelledRegion
        ? processWorkPage(workImages[reading.page]!, reading, labelledRegion)
        : simulateManualWorkRegion(workImages[reading.page]!, reading, reference);
      send({ type: 'work_page', reading: completed });
      await input.checkpoint(session);
      continue;
    }
    const began = performance.now();
    const result = await readWorkRegion(workImages[reading.page]!, reading, input.region, readers.text, vocabularyOf(session.spec), signal);
    timings.region += performance.now() - began;
    send({ type: 'work_page', reading: result }); await input.checkpoint(session);
  }
  if (session.stage === 'work_reading') send({ type: 'work_read', lines: combinedWorkLines(session.workPages ?? []), ms: 0 });
  if (!session.workGrade) throw new Error('Chưa đủ dòng hoặc vùng bài làm để chấm; cần đọc lại hoặc nhập tay.');
  const observed = structuredClone(session.workLines);
  const before = session.workGrade!;
  const initialGradeMs = timings.grade;
  const began = performance.now();
  const replay = replayMvpWork(session, reference, ops); session = replay.session;
  timings.replay = performance.now() - began;
  await input.checkpoint(session);
  const prediction = { parsed: parseWork(session.workLines, vocabularyOf(session.spec!)), grade: session.workGrade! };
  const comparison = compareAlignedWork(prediction, input.workTruth, reference, session.workLines, replay.alignment);
  const audit = auditWork(truth, session.workLines, input.workTruth, reference, prediction, replay.alignment, comparison);
  const rawComparison = compareAlignedWork({ parsed: parseWork(observed, vocabularyOf(session.spec!)), grade: before }, input.workTruth, reference, observed, replay.alignment);
  const beforeAudit = auditWork(truth, observed, input.workTruth, reference, { parsed: parseWork(observed, vocabularyOf(session.spec!)), grade: before }, replay.alignment, rawComparison);
  const viewed = performance.now(); const result = resultView(session); const solution = solutionView(session.spec!, session.solution!);
  timings.view = performance.now() - viewed;
  timings.problemRead = session.timings.problemRead ?? 0; timings.figureDraft = session.timings.figureDraft ?? 0;
  timings.workRead = session.timings.workRead ?? 0;
  return { id: input.id, task: truth.task.type, source: 'synthetic-hw' as const, expected: input.workTruth.expected,
    readComparison, bComparison, confirmedCorrect, solutionCheck, effort, problemQuestions: confirmation.questions,
    problemFormEdits: confirmation.formEdits, problemSuggestion: confirmation.suggestion, workQuestions: replay.questions, regionQuestions,
    reviews: replay.reviews, reviewEdits: replay.reviewEdits, comparison, rawComparison, audit, beforeAudit, manualRegionPages,
    finalVerdict: session.workGrade!.result.verdict, result, solution, timings,
    strikes: strikeAudit(session.workLines, reference),
    deviation: session.workGrade!.result.verdict === input.workTruth.expected.verdict ? null : deviationCause(session, reference, input.workTruth),
    // grade is a subset of replay; region may include crop OCR already included in workRead.
    machineMs: timings.problemRead + timings.figureDraft + timings.confirm + timings.solve + timings.workRead + timings.inspection + initialGradeMs + timings.replay + timings.view,
    session };
}
