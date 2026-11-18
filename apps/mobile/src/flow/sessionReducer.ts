import { solve, validateSpec } from '@mathtwin/core';
import { applyWorkAnswers, gradeWork, parseWork, vocabularyOf } from '@mathtwin/work';
import type { Session, SessionEvent } from './types.js';
import { sessionVi } from './messages.vi.js';

/** Identity and clock belong to the caller, keeping all transitions deterministic. */
export function createSession(id: string, createdAt: string): Session {
  return { id, createdAt, stage: 'problem_capture', problemPhotos: [], specConfirmed: false, specSource: 'photo',
    workPhotos: [], workLines: [], workAnswers: [], reviewAcknowledged: false, timings: {} };
}

function clearWork(s: Session): Session {
  const { workGrade: _grade, workSource: _source, ...rest } = s;
  const { workRead: _read, grade: _ms, ...timings } = s.timings;
  return { ...rest, workPhotos: [], workLines: [], workAnswers: [], reviewAcknowledged: false, timings };
}

function regrade(s: Session): Session {
  if (!s.specConfirmed || !s.spec || !s.solution || !s.workSource || s.stage === 'work_reading') return s;
  let workGrade = gradeWork(s.spec, parseWork(s.workLines, vocabularyOf(s.spec)));
  const needsReview = s.workSource === 'photo' && !s.reviewAcknowledged && workGrade.result.verdict === 'DUNG';
  if (workGrade.questions.length || needsReview) {
    // Never expose a definitive verdict while questions or the photo review remain.
    workGrade = { ...workGrade, result: { verdict: 'CAN_XAC_NHAN', message: sessionVi.review, notes: [] } };
  }
  const { grade: _ms, ...timings } = s.timings;
  return { ...s, timings, workGrade, stage: workGrade.result.verdict === 'CAN_XAC_NHAN' ? 'work_review' : 'result' };
}

export function sessionReducer(s: Session, e: SessionEvent): Session {
  switch (e.type) {
    case 'reset': return createSession(s.id, s.createdAt);
    case 'retake': {
      if (e.target === 'problem') return createSession(s.id, s.createdAt);
      return { ...clearWork(s), stage: s.specConfirmed ? 'work_capture' : s.stage };
    }
    case 'problem_photos': {
      if (!e.photos.length) return s;
      return { ...createSession(s.id, s.createdAt), problemPhotos: structuredClone(e.photos), stage: 'problem_reading' };
    }
    case 'problem_read': {
      if (s.stage !== 'problem_reading') return s;
      const outcome = structuredClone(e.outcome);
      return { ...s, stage: 'problem_confirm', problemRead: outcome, ...(outcome.spec ? { spec: outcome.spec } : {}),
        timings: { ...s.timings, problemRead: e.ms }, readerId: outcome.usage.engine };
    }
    case 'manual_spec': case 'spec_confirmed': {
      if (e.type === 'spec_confirmed' && s.stage !== 'problem_confirm' && !s.specConfirmed) return s;
      if (!validateSpec(e.spec).ok || e.spec.uncertain?.length) return s;
      const spec = structuredClone(e.spec);
      const changed = JSON.stringify(s.spec) !== JSON.stringify(spec);
      const { workGrade: _grade, ...rest } = s;
      const { solve: _solveMs, grade: _gradeMs, ...timings } = s.timings;
      return regrade({ ...rest, spec, specConfirmed: true, specSource: e.type === 'manual_spec' ? 'manual' : s.specSource,
        solution: solve(spec), stage: s.stage === 'work_reading' || s.stage === 'work_capture' ? s.stage : 'solution',
        timings, reviewAcknowledged: changed ? false : s.reviewAcknowledged });
    }
    case 'work_photos': {
      if (!s.specConfirmed || !s.solution || !e.photos.length) return s;
      return { ...clearWork(s), workPhotos: structuredClone(e.photos), workSource: 'photo', stage: 'work_reading' };
    }
    case 'work_read': {
      if (!s.specConfirmed || !s.solution || s.workSource !== 'photo' || !['work_reading', 'work_review', 'result'].includes(s.stage)) return s;
      // Each event can checkpoint one page; globally unique line indices replace earlier readings.
      const lines = new Map(s.workLines.map((line) => [line.index, line]));
      for (const line of structuredClone(e.lines)) lines.set(line.index, line);
      const { workGrade: _grade, ...rest } = s;
      return regrade({ ...rest, stage: e.complete === false ? 'work_reading' : 'work_review',
        workLines: [...lines.values()].sort((a, b) => a.page - b.page || a.index - b.index),
        reviewAcknowledged: false, timings: { ...s.timings, workRead: (s.timings.workRead ?? 0) + e.ms } });
    }
    case 'manual_work': {
      if (!s.specConfirmed || !s.solution) return s;
      return regrade({ ...clearWork(s), stage: 'work_review', workSource: 'manual', workLines: e.lines.map((text, index) => ({
        text, index, page: 0, conf: 1, alternatives: [], region: 'solution',
      })) });
    }
    case 'work_answer': {
      if (!s.workSource || !['work_review', 'result'].includes(s.stage) || !s.workLines.some((line) => line.index === e.answer.line)) return s;
      return regrade({ ...s, workLines: applyWorkAnswers(s.workLines, [e.answer]),
        workAnswers: [...s.workAnswers, structuredClone(e.answer)], reviewAcknowledged: false });
    }
    case 'review_ack': {
      if (s.stage !== 'work_review' || s.workSource !== 'photo' || !s.workGrade || s.workGrade.questions.length) return s;
      return regrade({ ...s, reviewAcknowledged: true });
    }
  }
}
