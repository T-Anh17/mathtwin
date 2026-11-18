import { normalizeDraft } from '@mathtwin/reader';
import type { ReadDraft } from '@mathtwin/reader';
import type { Readers } from './flow/reading.js';

/** Explicitly labelled web preview only, never selected on Android. */
export function previewReaders(): Readers {
  const draft: ReadDraft = { representation: 'figure', directed: false,
    vertices: ['A', 'B', 'C'].map((label, i) => ({ label, conf: 1, box: [100 + i * 300, 300, 180 + i * 300, 380] })),
    edges: [{ u: 'A', v: 'B', w: 3, wAlternatives: [8], name: null, conf: 0.6 },
      { u: 'B', v: 'C', w: 2, wAlternatives: [], name: null, conf: 1 }],
    statedFacts: { vertexCount: 3, edgeCount: 2, weightUnit: null },
    question: { rawText: '', format: 'tu_luan', task: { type: 'shortest_path', from: 'A', to: 'C' }, options: [], conf: 1 }, unreadable: [] };
  return { text: { engine: 'preview:fake', readLines: async () => ({ lines: [], usage: { engine: 'preview:fake', passes: 1, latencyMs: 0 } }) },
    problem: async (_photos, signal) => { signal?.throwIfAborted(); return { ...normalizeDraft(draft), drafts: [structuredClone(draft)],
      usage: { engine: 'preview:fake', passes: 1, latencyMs: 0 } }; },
    figure: async (_image, signal) => { signal.throwIfAborted(); return structuredClone(draft); } };
}
