import { applyWorkAnswers, gradeWork, parseWork, vocabularyOf } from '@mathtwin/work';
import type { ProblemSpec } from '@mathtwin/core';
import type { WorkAnswer, WorkLine, WorkQuestion } from '@mathtwin/work';

/** Shared by the sample UI and benchmark; no reader, storage or asynchronous work. */
export function reviewWork(spec: ProblemSpec, lines: WorkLine[], answers: WorkAnswer[] = []) {
  const updated = applyWorkAnswers(lines, answers);
  const parsed = parseWork(updated, vocabularyOf(spec));
  return { lines: updated, parsed, grade: gradeWork(spec, parsed) };
}
export type WorkReview = ReturnType<typeof reviewWork>;

/** One field per source line, including questions spanning tables or pages. */
export function textAnswers(question: WorkQuestion, texts: Record<number, string>): WorkAnswer[] {
  return question.lines.map((line) => ({ line, text: texts[line] ?? '' }));
}

export interface WorkPage { image: string; width: number; height: number }
export function cropBox(box?: [number, number, number, number]): [number, number, number, number] {
  const [x, y, right, bottom] = box ?? [0, 0, 1000, 1000];
  const left = Math.max(0, x - 15), top = Math.max(0, y - 12);
  return [left, top, Math.min(1000, right + 15) - left, Math.min(1000, bottom + 12) - top];
}
