import { finalizeGraphRead } from './normalize.js';
import type { QuestionDraft } from './schema.js';
import type { ReadOutcome } from './types.js';

/** Complete a partial read using the retained graph, without another image read or losing graph flags. */
export function completeWithQuestion(outcome: ReadOutcome, question: QuestionDraft): ReadOutcome {
  const result = structuredClone(outcome);
  if (result.graph === null) return result;
  const completed = finalizeGraphRead(result.graph, result.graphUncertain, result.drafts, question);
  const failures = result.issues.filter((issue) => issue.code === 'read_failed');
  if (failures.length > 0) {
    completed.spec = null;
    completed.issues.push(...failures);
  }
  return { ...result, ...completed };
}
