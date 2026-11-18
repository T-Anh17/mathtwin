import { describe, expect, it } from 'vitest';
import { createProblemReaders } from '../src/problem-readers.js';
import { previewReaders } from '../src/preview-readers.js';
import type { ImageResult } from '../src/contracts.js';
import type { Benchmark } from '../src/benchmark.js';

const image = { width: 2000, height: 1000, pixels: new Uint8ClampedArray(0) };
describe('4.2 production B adapter', () => {
  it('uses B only, forwards cancellation, restores lifecycle and normalizes original-pixel boxes', async () => {
    const outcome = await previewReaders().problem([]);
    outcome.drafts[0]!.vertices[0]!.box = [200, 300, 360, 380];
    const calls: Parameters<Benchmark['run']>[] = [], lifecycle: boolean[] = [];
    const run: Benchmark['run'] = async (...args) => {
      calls.push(args);
      return { id: 'problem', engine: 'offline:qwen3-vl-2b', config: args[1], imageSource: 'gallery', outcome,
        usage: outcome.usage, totalMs: 1, modelLoadMs: 0, modelVerifyMs: 0, reusedModel: true,
        memory: { alive: true, cpuVariant: 'armv8.2' } } satisfies ImageResult;
    };
    const readers = createProblemReaders({ run }, { setBenchmarkState: async ({ running }) => { lifecycle.push(running); } },
      () => 'data:image/png;base64,AA==', previewReaders().figure!);
    const signal = new AbortController().signal;
    const result = await readers.problem([image], signal);
    expect(calls[0]?.[1]).toMatchObject({ model: 'b', mode: 'graph', passes: 1 });
    expect(calls[0]?.[2]).toBe(signal); expect(lifecycle).toEqual([true, false]);
    expect(result.drafts[0]?.vertices[0]?.box).toEqual([100, 300, 180, 380]);
    expect(result.usage.engine).toContain('armv8.2');
  });
  it('restores background idle state after server/memory failure and retains the native cause', async () => {
    const lifecycle: boolean[] = [];
    const readers = createProblemReaders({ run: async () => { throw { code: 'memory_pressure' }; } },
      { setBenchmarkState: async ({ running }) => { lifecycle.push(running); } }, () => '', previewReaders().figure!);
    await expect(readers.problem([image])).rejects.toMatchObject({ code: 'memory_pressure' });
    expect(lifecycle).toEqual([true, false]);
  });
  it('prevents starting B after cancellation', async () => {
    let calls = 0;
    const readers = createProblemReaders({ run: async () => { calls++; throw new Error(); } }, { setBenchmarkState: async () => {} }, () => '', previewReaders().figure!);
    const controller = new AbortController(); controller.abort();
    await expect(readers.problem([image], controller.signal)).rejects.toBeDefined(); expect(calls).toBe(0);
  });
  it('keeps the screen awake across B, D and checkpoints until the outer reading lease ends', async () => {
    const lifecycle: { running: boolean; backgroundIdleMinutes: number }[] = [];
    const outcome = await previewReaders().problem([]);
    const readers = createProblemReaders({ run: async (...args) => ({ id: 'problem', engine: 'fake', config: args[1],
      imageSource: 'gallery', outcome, usage: outcome.usage, totalMs: 1, modelLoadMs: 0, modelVerifyMs: 0, reusedModel: true }) },
      { setBenchmarkState: async (state) => { lifecycle.push(state); } }, () => '', previewReaders().figure!);
    await readers.activity!(true);
    await readers.problem([image]); await readers.figure!(image, new AbortController().signal);
    expect(lifecycle).toEqual([{ running: true, backgroundIdleMinutes: 5 }]);
    await readers.activity!(false);
    expect(lifecycle).toEqual([{ running: true, backgroundIdleMinutes: 5 }, { running: false, backgroundIdleMinutes: 5 }]);
  });
});
