import { solve, validateSpec } from '@mathtwin/core';
import { applyWorkAnswers, gradeWork, parseWork, vocabularyOf } from '@mathtwin/work';
import type { Session, SessionEvent } from './types.js';
import { sessionVi } from './messages.vi.js';
import { combinedWorkLines } from './work-reading.js';
import { taskSuggestion, initialProblem } from './confirmation.js';

/** Identity and clock belong to the caller, keeping all transitions deterministic. */
export function createSession(id: string, createdAt: string): Session {
  return { id, createdAt, stage: 'problem_capture', problemPhotos: [], specConfirmed: false, specSource: 'photo',
    workPhotos: [], workLines: [], workAnswers: [], reviewAcknowledged: false, timings: {} };
}

function clearWork(s: Session): Session {
  const { workGrade: _grade, workSource: _source, workPages: _pages, ...rest } = s;
  const { workRead: _read, grade: _ms, ...timings } = s.timings;
  return { ...rest, workPhotos: [], workLines: [], workAnswers: [], reviewAcknowledged: false, timings };
}

export interface SessionOperations { solve: typeof solve; gradeWork: typeof gradeWork }
const operations: SessionOperations = { solve, gradeWork };

function regrade(s: Session, ops: SessionOperations): Session {
  if (!s.specConfirmed || !s.spec || !s.solution || !s.workSource || s.stage === 'work_reading' || s.workPages?.some((p) => p.needsRegion)) return s;
  let workGrade = ops.gradeWork(s.spec, parseWork(s.workLines, vocabularyOf(s.spec)));
  const needsReview = s.workSource === 'photo' && !s.reviewAcknowledged && (workGrade.result.verdict === 'DUNG'
    || workGrade.result.verdict === 'SAI' && !!s.workPages?.some((p) => p.missingLineCheckUnavailable));
  if (workGrade.questions.length || needsReview) {
    // Never expose a definitive verdict while questions or the photo review remain.
    workGrade = { ...workGrade, result: { verdict: 'CAN_XAC_NHAN', message: needsReview ? sessionVi.review : workGrade.result.message, notes: [] } };
  }
  const { grade: _ms, ...timings } = s.timings;
  return { ...s, timings, workGrade, stage: workGrade.result.verdict === 'CAN_XAC_NHAN' ? 'work_review' : 'result' };
}

export function sessionReducer(s: Session, e: SessionEvent, ops: SessionOperations = operations): Session {
  switch (e.type) {
    case 'work_restore': {
      if (!['work_review', 'result'].includes(s.stage) || !s.workLines.some((l) => l.index === e.line && (l.region === 'question' || l.region === 'figure'))) return s;
      const workLines = s.workLines.map((l) => l.index === e.line ? { ...l, region: 'solution' as const, regionConf: 1 } : l);
      const workPages = s.workPages?.map((p) => ({ ...p, lines: workLines.filter((l) => l.page === p.page).map((l, index) => ({ ...l, index })) }));
      return regrade({ ...s, workLines, ...(workPages ? { workPages } : {}), reviewAcknowledged: false }, ops);
    }
    case 'work_manual_page': {
      if (s.stage !== 'work_reading' || !s.workPages?.some((p) => p.page === e.page && p.failed) || !e.lines.some((l) => l.trim())) return s;
      const lines = e.lines.filter((l) => l.trim()).map((text, index) => ({ text, index, page: e.page, conf: 1, alternatives: [], region: 'solution' as const, struck: false, textConfirmed: true }));
      const workPages = s.workPages.map((p) => p.page !== e.page ? p : { page: p.page, raw: lines, lines, ms: p.ms,
        needsRegion: false, inspected: true, missingLineCheckUnavailable: true, region: [0, 0, 1000, 1000] as [number, number, number, number] });
      const next = { ...s, workPages, workLines: combinedWorkLines(workPages), reviewAcknowledged: false };
      return workPages.length === s.workPhotos.length && workPages.every((p) => p.inspected && !p.needsRegion)
        ? regrade({ ...next, stage: 'work_review' }, ops) : next;
    }
    case 'work_capture_photos': {
      if (!s.specConfirmed || !s.solution) return s;
      const pages = (s.workPages ?? []).flatMap((p) => {
        const page = e.photos.findIndex((photo) => photo.id === s.workPhotos[p.page]?.id);
        return page < 0 ? [] : [{ ...p, page }];
      });
      return { ...clearWork(s), stage: 'work_capture', workSource: 'photo', workPhotos: structuredClone(e.photos.map((p, page) => ({ ...p, page }))),
        workPages: structuredClone(pages), workLines: combinedWorkLines(pages) };
    }
    case 'work_page': {
      if (s.stage !== 'work_reading' || !Number.isInteger(e.reading.page) || e.reading.page < 0 || e.reading.page >= s.workPhotos.length) return s;
      const pages = [...(s.workPages ?? []).filter((p) => p.page !== e.reading.page), structuredClone(e.reading)].sort((a, b) => a.page - b.page);
      return { ...s, workPages: pages, workLines: combinedWorkLines(pages), timings: { ...s.timings, workRead: pages.reduce((n, p) => n + p.ms, 0) } };
    }
    case 'problem_capture':
      return { ...createSession(s.id, s.createdAt), problemPhotos: structuredClone(e.photos) };
    case 'problem_page': {
      if (s.stage !== 'problem_reading' || !Number.isInteger(e.reading.page) || e.reading.page < 0 || e.reading.page >= s.problemPhotos.length) return s;
      const reading = structuredClone(e.reading);
      const pages = [...(s.problemPages ?? []).filter((p) => p.page !== reading.page), reading].sort((a, b) => a.page - b.page);
      return { ...s, problemPages: pages, timings: { ...s.timings,
        problemRead: pages.reduce((n, p) => n + p.ms, 0), figureDraft: pages.reduce((n, p) => n + p.figureMs, 0) } };
    }
    case 'reset': return createSession(s.id, s.createdAt);
    case 'retake': {
      if (e.target === 'problem') return createSession(s.id, s.createdAt);
      return { ...clearWork(s), stage: s.specConfirmed ? 'work_capture' : s.stage };
    }
    case 'problem_photos': {
      if (!e.photos.length) return s;
      return { ...createSession(s.id, s.createdAt), problemPhotos: structuredClone(e.photos), stage: 'problem_confirm' };
    }
    case 'problem_read_request':
      return s.stage === 'problem_confirm' && !s.specConfirmed && s.problemPhotos.length
        ? { ...s, stage: 'problem_reading' } : s;
    case 'problem_read_cancel': {
      if (s.stage !== 'problem_reading') return s;
      const { problemRead: _read, spec: _spec, solution: _solution, graphLayout: _layout, readerId: _reader, ...rest } = s;
      return { ...rest, stage: 'problem_confirm', specConfirmed: false, specSource: 'photo' };
    }
    case 'problem_read': {
      if (s.stage !== 'problem_reading') return s;
      const outcome = structuredClone(e.outcome);
      const suggested = taskSuggestion(outcome);
      return { ...s, stage: 'problem_confirm', problemRead: outcome, ...(outcome.spec || suggested?.task ? { spec: initialProblem(outcome) } : {}),
        timings: { ...s.timings, problemRead: s.problemPages?.reduce((n, p) => n + p.ms, 0) ?? e.ms }, readerId: outcome.usage.engine };
    }
    case 'manual_spec': case 'spec_confirmed': {
      if (e.type === 'spec_confirmed' && s.stage !== 'problem_confirm' && !s.specConfirmed) return s;
      if (!validateSpec(e.spec).ok || e.spec.uncertain?.length) return s;
      const spec = structuredClone(e.spec);
      const changed = JSON.stringify(s.spec) !== JSON.stringify(spec);
      const { workGrade: _grade, graphLayout: oldLayout, ...rest } = s;
      const graphLayout = e.graphLayout ?? (JSON.stringify(s.spec?.graph) === JSON.stringify(spec.graph) ? oldLayout : undefined);
      const { solve: _solveMs, grade: _gradeMs, ...timings } = s.timings;
      return regrade({ ...rest, spec, ...(graphLayout ? { graphLayout: structuredClone(graphLayout) } : {}), specConfirmed: true, specSource: e.type === 'manual_spec' ? 'manual' : s.specSource,
        solution: ops.solve(spec), stage: s.stage === 'work_reading' || s.stage === 'work_capture' ? s.stage : 'solution',
        timings, reviewAcknowledged: changed ? false : s.reviewAcknowledged }, ops);
    }
    case 'work_capture':
      return s.stage === 'solution' && s.specConfirmed && s.solution
        ? { ...s, stage: 'work_capture', workSource: e.source } : s;
    case 'work_photos': {
      if (!s.specConfirmed || !s.solution || !e.photos.length) return s;
      const same = s.stage === 'work_capture' && JSON.stringify(s.workPhotos) === JSON.stringify(e.photos);
      return { ...(same ? s : clearWork(s)), workPhotos: structuredClone(e.photos), workSource: 'photo', stage: 'work_reading' };
    }
    case 'work_read': {
      if (!s.specConfirmed || !s.solution || s.workSource !== 'photo' || !['work_reading', 'work_review', 'result'].includes(s.stage)) return s;
      if (e.complete !== false && s.workPages && (s.workPages.length !== s.workPhotos.length || s.workPages.some((p) => p.needsRegion))) return s;
      // Each event can checkpoint one page; globally unique line indices replace earlier readings.
      const lines = new Map(s.workLines.map((line) => [line.index, line]));
      for (const line of structuredClone(e.lines)) lines.set(line.index, line);
      const { workGrade: _grade, ...rest } = s;
      return regrade({ ...rest, stage: e.complete === false ? 'work_reading' : 'work_review',
        workLines: [...lines.values()].sort((a, b) => a.page - b.page || a.index - b.index),
        reviewAcknowledged: false, timings: { ...s.timings, workRead: (s.timings.workRead ?? 0) + e.ms } }, ops);
    }
    case 'manual_work': {
      if (!s.specConfirmed || !s.solution) return s;
      return regrade({ ...clearWork(s), stage: 'work_review', workSource: 'manual', workLines: e.lines.map((text, index) => ({
        text, index, page: 0, conf: 1, alternatives: [], region: 'solution', textConfirmed: true,
      })) }, ops);
    }
    case 'work_answer': {
      if (!s.workSource || !['work_review', 'result'].includes(s.stage) || !s.workLines.some((line) => line.index === e.answer.line)) return s;
      const workLines = applyWorkAnswers(s.workLines, [e.answer]);
      const workPages = s.workPages?.map((p) => ({ ...p, lines: workLines.filter((l) => l.page === p.page).map((l, index) => ({ ...l, index })) }));
      return regrade({ ...s, workLines, ...(workPages ? { workPages } : {}),
        workAnswers: [...s.workAnswers, structuredClone(e.answer)], reviewAcknowledged: false }, ops);
    }
    case 'review_ack': {
      if (s.stage !== 'work_review' || s.workSource !== 'photo' || !s.workGrade || s.workGrade.questions.length) return s;
      return regrade({ ...s, reviewAcknowledged: true }, ops);
    }
  }
}
