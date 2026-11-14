import type { ProblemSpec, Task } from '@mathtwin/core';
import { ReadDraftSchema } from '@mathtwin/reader';
import type { ReadDraft, VisionReader } from '@mathtwin/reader';

/** Fixture oracle for exercising the evaluation pipeline. It does not inspect pixels.
 * Confidence 1 means scripted certainty, never measured recognition confidence.
 */
export function draftFromTruth(truth: ProblemSpec): ReadDraft {
  const label = (id: string): string => truth.graph.vertices.find((v) => v.id === id)?.label ?? id;
  const map = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(map);
    if (value === null || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
      ['u', 'v', 'from', 'to', 'start', 'end', 'source', 'via'].includes(key) && typeof item === 'string' ? label(item)
        : key === 'vertices' && Array.isArray(item) ? item.map((id: string) => label(id))
          : key === 'edgeIds' && Array.isArray(item) ? item.map((id: string) => `e${truth.graph.edges.findIndex((e) => e.id === id) + 1}`) : map(item),
    ]));
  };
  const task = map(truth.task) as Task;
  return ReadDraftSchema.parse({
    representation: 'figure', directed: false,
    vertices: truth.graph.vertices.map((v) => ({ label: v.label, conf: 1 })),
    edges: truth.graph.edges.map((e) => ({ u: label(e.u), v: label(e.v), w: e.w ?? null, name: e.name ?? null, wAlternatives: [], conf: 1 })),
    statedFacts: { vertexCount: null, edgeCount: null, weightUnit: null },
    question: { rawText: '', format: truth.questionFormat, task,
      options: task.type === 'statements' ? task.items.map((item) => ({ ...item, conf: 1 })) : [], conf: 1 },
    unreadable: [],
  });
}
export function fakeReader(truth: ProblemSpec): VisionReader {
  const draft = draftFromTruth(truth);
  return { engine: 'fake', async read(_images, _pass, signal) {
    signal?.throwIfAborted();
    return { draft: structuredClone(draft), usage: { engine: 'fake', latencyMs: 0, passes: 1 } };
  } };
}
