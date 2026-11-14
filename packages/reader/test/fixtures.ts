import type { ReadDraft, PreparedImage, ReadUsage, VisionReader } from '../src/index.js';

export function draft(): ReadDraft {
  return {
    representation: 'figure', directed: false,
    vertices: ['A', 'B', 'C', 'D'].map((label) => ({ label, conf: 0.96 })),
    edges: [
      { u: 'A', v: 'B', w: 2, wAlternatives: [], name: 'a', conf: 0.96 },
      { u: 'B', v: 'C', w: 3, wAlternatives: [], name: 'b', conf: 0.96 },
      { u: 'C', v: 'A', w: 4, wAlternatives: [], name: null, conf: 0.96 },
      { u: 'C', v: 'D', w: 7, wAlternatives: [], name: 'm', conf: 0.96 },
    ],
    statedFacts: { vertexCount: null, edgeCount: null, weightUnit: null },
    question: { rawText: 'Tìm đường đi ngắn nhất từ A đến D.', format: 'tu_luan',
      task: { type: 'shortest_path', from: 'A', to: 'D' }, options: [], conf: 0.96 },
    unreadable: [],
  };
}
export const image: PreparedImage = { pixels: new Uint8ClampedArray([0, 0, 0, 255]), width: 1, height: 1 };
export class FakeVisionReader implements VisionReader {
  readonly engine = 'fake:fixture';
  readonly calls: { images: PreparedImage[]; pass: 'edges' | 'neighbors'; signal: AbortSignal | undefined }[] = [];
  constructor(private readonly drafts: { edges: ReadDraft; neighbors: ReadDraft }, private readonly memory = [10, 20]) {}
  async read(images: PreparedImage[], pass: 'edges' | 'neighbors', signal?: AbortSignal): Promise<{ draft: ReadDraft; usage: ReadUsage }> {
    signal?.throwIfAborted();
    this.calls.push({ images, pass, signal });
    return { draft: structuredClone(this.drafts[pass]), usage: { passes: 1, latencyMs: pass === 'edges' ? 4 : 6,
      engine: this.engine, peakMemoryMb: this.memory[pass === 'edges' ? 0 : 1]! } };
  }
}
