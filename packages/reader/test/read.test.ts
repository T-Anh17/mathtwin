import { describe, expect, it, vi } from 'vitest';
import { readProblem } from '../src/index.js';
import type { VisionReader } from '../src/index.js';
import { draft, FakeVisionReader, image } from './fixtures.js';

describe('readProblem', () => {
  it('runs independent passes sequentially with all images and aggregates usage', async () => {
    const reader = new FakeVisionReader({ edges: draft(), neighbors: draft() });
    const controller = new AbortController(); const images = [image, image];
    const result = await readProblem(images, { reader, signal: controller.signal });
    expect(result.spec).not.toBeNull(); expect(result.drafts).toHaveLength(2);
    expect(result.usage).toEqual({ engine: reader.engine, passes: 2, latencyMs: 10, peakMemoryMb: 20 });
    expect(reader.calls).toEqual([
      { images, pass: 'edges', signal: controller.signal }, { images, pass: 'neighbors', signal: controller.signal },
    ]);
  });
  it('supports one pass', async () => {
    const reader = new FakeVisionReader({ edges: draft(), neighbors: draft() });
    const result = await readProblem([image], { reader, passes: 1 });
    expect(reader.calls.map((c) => c.pass)).toEqual(['edges']); expect(result.usage.passes).toBe(1);
  });
  it('rejects an already cancelled request without invoking the reader', async () => {
    const reader = new FakeVisionReader({ edges: draft(), neighbors: draft() });
    const controller = new AbortController(); controller.abort();
    await expect(readProblem([image], { reader, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(reader.calls).toHaveLength(0);
  });
  it('cancels a pending adapter even if it ignores AbortSignal', async () => {
    const reader: VisionReader = { engine: 'fake:pending', read: vi.fn(() => new Promise<never>(() => {})) };
    const controller = new AbortController();
    const pending = readProblem([image], { reader, signal: controller.signal });
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await Promise.resolve(); controller.abort(); await assertion;
    expect(reader.read).toHaveBeenCalledTimes(1);
  });
  it('does not begin the second pass after cancellation', async () => {
    const controller = new AbortController(); const fake = new FakeVisionReader({ edges: draft(), neighbors: draft() });
    const read = vi.fn(async () => { controller.abort('stop'); return fake.read([image], 'edges'); });
    await expect(readProblem([image], { reader: { engine: 'fake:cancel', read }, signal: controller.signal })).rejects.toBe('stop');
    expect(read).toHaveBeenCalledTimes(1);
  });
  it('cleans up the cancellation listener after successful reads', async () => {
    const controller = new AbortController(); const spy = vi.spyOn(controller.signal, 'removeEventListener');
    const fake = new FakeVisionReader({ edges: draft(), neighbors: draft() });
    await readProblem([image], { reader: fake, signal: controller.signal });
    expect(spy).toHaveBeenCalledTimes(2);
  });
  it('returns sanitized errors and retains completed drafts and usage when the next pass fails', async () => {
    const fake = new FakeVisionReader({ edges: draft(), neighbors: draft() });
    const reader: VisionReader = { engine: fake.engine, read: async (images, pass) => {
      if (pass === 'neighbors') throw new Error('PRIVATE: ảnh và toàn bộ nội dung đề');
      return fake.read(images, pass);
    } };
    const result = await readProblem([image], { reader });
    expect(result).toMatchObject({ spec: null, drafts: [draft()], usage: { passes: 1, latencyMs: 4 }, issues: [{ code: 'read_failed', severity: 'blocking' }] });
    expect(JSON.stringify(result.issues)).not.toContain('PRIVATE');
  });
  it('validates adapter drafts and usage at runtime', async () => {
    for (const invalid of ['draft', 'usage']) {
      const reader: VisionReader = { engine: 'fake:invalid', read: async () => ({
        draft: invalid === 'draft' ? { ...draft(), answer: 42 } : draft(),
        usage: { passes: 1, latencyMs: invalid === 'usage' ? NaN : 1, engine: 'fake:invalid' },
      }) };
      const result = await readProblem([image], { reader });
      expect(result.spec).toBeNull(); expect(result.issues[0]!.code).toBe(invalid === 'draft' ? 'invalid_spec' : 'read_failed');
    }
  });
  it('rejects empty/invalid prepared images before calling the reader', async () => {
    const fake = new FakeVisionReader({ edges: draft(), neighbors: draft() });
    for (const images of [[], [{ ...image, width: 2 }], [{ ...image, height: 0 }], [{ ...image, width: 0.5 }]]) {
      expect((await readProblem(images, { reader: fake })).spec).toBeNull();
    }
    expect(fake.calls).toHaveLength(0);
  });
});
