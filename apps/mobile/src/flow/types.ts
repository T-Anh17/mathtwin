import type { ProblemSpec, Solution } from '@mathtwin/core';
import type { ReadOutcome } from '@mathtwin/reader';
import type { WorkAnswer, WorkGrade, WorkLine } from '@mathtwin/work';
import type { ProblemPageRead } from './reading.js';

export type Stage = 'problem_capture' | 'problem_reading' | 'problem_confirm' | 'solution'
  | 'work_capture' | 'work_reading' | 'work_review' | 'result';
export interface PhotoRef { id: string; width: number; height: number; page: number }
export interface Session {
  id: string; createdAt: string; stage: Stage;
  problemPhotos: PhotoRef[]; problemRead?: ReadOutcome;
  spec?: ProblemSpec; specConfirmed: boolean; specSource: 'photo' | 'manual';
  solution?: Solution;
  workPhotos: PhotoRef[]; workLines: WorkLine[]; workAnswers: WorkAnswer[]; workSource?: 'photo' | 'manual';
  workGrade?: WorkGrade; reviewAcknowledged: boolean;
  timings: Partial<Record<'problemRead' | 'figureDraft' | 'solve' | 'workRead' | 'grade', number>>;
  readerId?: string;
  problemPages?: ProblemPageRead[];
}
export type SessionEvent =
  | { type: 'problem_page'; reading: ProblemPageRead }
  | { type: 'problem_capture'; photos: PhotoRef[] }
  | { type: 'problem_photos'; photos: PhotoRef[] } | { type: 'problem_read'; outcome: ReadOutcome; ms: number }
  | { type: 'spec_confirmed'; spec: ProblemSpec } | { type: 'manual_spec'; spec: ProblemSpec }
  | { type: 'work_photos'; photos: PhotoRef[] }
  /** complete=false checkpoints a page while more pages are being read; omitted means final reading. */
  | { type: 'work_read'; lines: WorkLine[]; ms: number; complete?: boolean }
  | { type: 'work_answer'; answer: WorkAnswer } | { type: 'manual_work'; lines: string[] }
  | { type: 'review_ack' } | { type: 'retake'; target: 'problem' | 'work' } | { type: 'reset' };
