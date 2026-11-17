import type { ProblemSpec } from '@mathtwin/core';
import type { WorkVocabulary } from './types.js';
export function vocabularyOf(spec: ProblemSpec, questionText: string[] = []): WorkVocabulary {
  return { vertexLabels: spec.graph.vertices.map((v) => v.label),
    edgeNames: [...new Set(spec.graph.edges.flatMap((e) => e.name === undefined ? [] : [e.name]))],
    task: spec.task.type, questionFormat: spec.questionFormat,
    statementIds: spec.task.type === 'statements' ? spec.task.items.map((item) => item.id) : [],
    questionText: [...questionText] };
}
