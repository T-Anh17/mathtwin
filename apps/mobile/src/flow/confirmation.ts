import { applyConfirmation } from '@mathtwin/reader';
import type { ReadOutcome } from '@mathtwin/reader';
import type { Graph, ProblemSpec } from '@mathtwin/core';
import { validateSpec } from '@mathtwin/core';
import { problemVi as m } from '../problem.vi.js';

export interface ConfirmationQuestion { item: string; candidates: unknown[]; page: number; box?: [number, number, number, number] }
export function confirmationQuestions(outcome: ReadOutcome, page = 0): ConfirmationQuestion[] {
  const flags = outcome.spec?.uncertain ?? outcome.graphUncertain;
  return flags.map((flag) => {
    let offset = 0;
    const index = /^e(\d+)(?:\.|$)/.exec(flag.item);
    for (const [draftPage, draft] of outcome.drafts.entries()) {
      const edge = index ? draft.edges[Number(index[1]) - 1 - offset] : undefined;
      const vertex = draft.vertices.find((v) => v.label === flag.item);
      const a = edge ? draft.vertices.find((v) => v.label === edge.u)?.box : undefined;
      const b = edge ? draft.vertices.find((v) => v.label === edge.v)?.box : undefined;
      const box: ConfirmationQuestion['box'] = vertex?.box ?? (a && b
        ? [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])] : undefined);
      if (vertex || edge) return { ...structuredClone(flag), page: page + draftPage, ...(box ? { box } : {}) };
      offset += draft.edges.length;
    }
    return { ...structuredClone(flag), page };
  });
}
export function confirmationValue(text: string): unknown {
  try { return JSON.parse(text) as unknown; } catch { return text.trim(); }
}
export function confirmProblem(spec: ProblemSpec, answers: Record<string, unknown>): ProblemSpec {
  const result = applyConfirmation(spec, answers);
  if (result.uncertain?.length) throw new Error(m.unresolved);
  const checked = validateSpec(result);
  if (!checked.ok) throw new Error(checked.errors.join('\n'));
  return result;
}
export function initialProblem(outcome?: ReadOutcome): ProblemSpec {
  if (outcome?.spec) return structuredClone(outcome.spec);
  return { graph: structuredClone(outcome?.graph ?? { directed: false, vertices: [], edges: [] }),
    task: { type: 'elements' }, questionFormat: 'tu_luan', uncertain: structuredClone(outcome?.graphUncertain ?? []) };
}
export function replaceGraph(spec: ProblemSpec, graph: Graph): ProblemSpec {
  return { ...spec, graph, uncertain: (spec.uncertain ?? []).filter((u) => u.item.startsWith('task.') || u.item === 'questionFormat') };
}
