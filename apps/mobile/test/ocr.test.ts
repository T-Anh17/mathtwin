import { afterEach, expect, it, vi } from 'vitest';
import { missingVietnameseChars } from '@mathtwin/reader-ocr-shared';
import type { OrtSession, OrtTensor } from '@mathtwin/reader-ocr-shared';
import { readOcr } from '../src/ocr-runtime.js';
import { runOcrWorker } from '../src/ocr.js';
import type { OcrRequest, OcrResponse } from '../src/ocr.js';

afterEach(() => vi.useRealTimers());
const vocab = missingVietnameseChars('').join('') + ' ';
const config = { vocab, image_height: 32, image_min_width: 32, image_max_width: 512, max_seq_length: 8, sos: 1, eos: 2, offset: 4 };
const request: OcrRequest = { image: { width: 100, height: 100, pixels: new Uint8ClampedArray(40_000).fill(255) },
  models: { detector: '/local/det', encoder: '/local/enc', decoder: '/local/dec', config, verifyMs: 10 }, passes: 2, threads: 4 };
function fakeOrt(options: { missing?: boolean; failCreate?: number; fallback?: boolean } = {}) {
  const tensors: OrtTensor[] = [];
  const tensor = (type: string, data: Float32Array | BigInt64Array, dims: readonly number[]): OrtTensor => {
    const value = { type, data, dims, dispose: vi.fn() }; tensors.push(value); return value;
  };
  let step = 0, created = 0;
  const state = () => tensor('float32', Float32Array.of(0), [1, 1, 1]);
  const session = (inputNames: string[], outputNames: string[], run: OrtSession['run']): OrtSession => ({ inputNames, outputNames, run: vi.fn(run), release: vi.fn(async () => {}) });
  const sessions = [
    session(['x'], ['map'], async () => {
      const map = new Float32Array(10_000);
      for (let y = 20; y < 28; y++) for (let x = 10; x < 70; x++) map[y * 100 + x] = 0.9;
      return { map: tensor('float32', map, [1, 1, 100, 100]) };
    }),
    session(['image'], ['hidden', 'encoder_outputs'], async () => { step = 0; return { hidden: state(), encoder_outputs: state() }; }),
    session(['tgt', 'hidden', 'encoder_outputs'], ['log_probs', 'hidden_out'], async () => {
      const logp = new Float32Array(Array.from(vocab).length + 4).fill(-Infinity);
      if (step === 0) {
        logp[Array.from(vocab).indexOf('ố') + 4] = Math.log(0.6);
        logp[Array.from(vocab).indexOf('ẹ') + 4] = Math.log(0.4);
      } else logp[2] = 0;
      step++;
      return { ...(options.missing ? {} : { log_probs: tensor('float32', logp, [1, logp.length]) }), hidden_out: state() };
    }),
  ];
  const env = { wasm: { numThreads: 0, simd: false, proxy: true, wasmPaths: {} } };
  const create = vi.fn(async () => {
    if (created === options.failCreate) throw new Error('create failed');
    if (options.fallback) env.wasm.numThreads = 1;
    return sessions[created++]!;
  });
  class Tensor { constructor(type: string, data: Float32Array | BigInt64Array, dims: readonly number[]) { return tensor(type, data, dims); } }
  // Structural fake at the runtime boundary; no ORT binary, models, files or network.
  const runtime = { env, Tensor, InferenceSession: { create } } as unknown as Parameters<typeof readOcr>[1];
  return { runtime, env, create, tensors, sessions };
}
const assets = { wasm: 'https://localhost/assets/ort.wasm', mjs: 'https://localhost/assets/ort.mjs' };
it.each([false, true])('uses shared inference with WASM/SIMD and records actual threads (isolated=%s)', async (isolated) => {
  const fake = fakeOrt();
  const output = await readOcr(request, fake.runtime, assets, isolated);
  expect(fake.env.wasm).toMatchObject({ simd: true, proxy: false, wasmPaths: assets });
  expect(output.wasm).toEqual({ numThreads: isolated ? 4 : 1, crossOriginIsolated: isolated, simd: true });
  expect(fake.create.mock.calls).toHaveLength(3);
  expect(fake.create).toHaveBeenCalledWith('/local/det', { executionProviders: ['wasm'] });
  for (const pass of output.linePasses) {
    expect(pass.lines[0]).toMatchObject({ text: 'ố', conf: expect.closeTo(0.6), alternatives: ['ẹ'] });
    expect(pass.usage).toMatchObject({ lineCount: 1, lineMs: [expect.any(Number)], detectionMs: expect.any(Number), recognitionMs: expect.any(Number) });
    expect(pass.usage.lineMs![0]).toBeGreaterThanOrEqual(0);
  }
  expect(output.linePasses).toHaveLength(2);
  for (const s of fake.sessions) expect(s.release).toHaveBeenCalledOnce();
  for (const t of fake.tensors) expect(t.dispose).toHaveBeenCalledOnce();
});
it('records ORT thread fallback rather than requested threads', async () => {
  const fake = fakeOrt({ fallback: true });
  expect((await readOcr(request, fake.runtime, assets, true)).wasm.numThreads).toBe(1);
});
it('missing log probabilities fails and releases sessions/tensors', async () => {
  const fake = fakeOrt({ missing: true });
  await expect(readOcr(request, fake.runtime, assets, false)).rejects.toMatchObject({ code: 'missing_log_probs' });
  for (const s of fake.sessions) expect(s.release).toHaveBeenCalledOnce();
  for (const t of fake.tensors) expect(t.dispose).toHaveBeenCalledOnce();
});
it('partial model initialization releases earlier sessions', async () => {
  const fake = fakeOrt({ failCreate: 1 });
  await expect(readOcr(request, fake.runtime, assets, false)).rejects.toThrow('create failed');
  expect(fake.sessions[0]!.release).toHaveBeenCalledOnce();
});
it('already aborted inference opens no sessions', async () => {
  const fake = fakeOrt(), abort = new AbortController(); abort.abort();
  await expect(readOcr(request, fake.runtime, assets, false, abort.signal)).rejects.toMatchObject({ code: 'aborted' });
  expect(fake.create).not.toHaveBeenCalled();
});
it('worker cancellation terminates ongoing inference and preserves caller pixels', async () => {
  const worker = { postMessage: vi.fn(), terminate: vi.fn(), onmessage: null, onerror: null };
  const abort = new AbortController();
  const pending = runOcrWorker(request, abort.signal, () => worker as unknown as Worker);
  const sent = worker.postMessage.mock.calls[0]![0] as OcrRequest;
  expect(sent.image.pixels).not.toBe(request.image.pixels);
  abort.abort();
  await expect(pending).rejects.toMatchObject({ code: 'aborted' });
  expect(worker.terminate).toHaveBeenCalledOnce();
});
it.each(['success', 'failure', 'crash'] as const)('worker %s terminates and settles the caller', async (kind) => {
  const worker = { postMessage: vi.fn(), terminate: vi.fn(), onmessage: null as null | ((event: MessageEvent<OcrResponse>) => void), onerror: null as null | (() => void) };
  const pending = runOcrWorker(request, new AbortController().signal, () => worker as unknown as Worker);
  if (kind === 'crash') worker.onerror!();
  else worker.onmessage!({ data: kind === 'failure' ? { ok: false, code: 'missing_log_probs' } : { ok: true, output: { linePasses: [], loadMs: 0, wasm: { numThreads: 1, crossOriginIsolated: false, simd: true } } } } as MessageEvent<OcrResponse>);
  if (kind === 'success') expect(await pending).toMatchObject({ linePasses: [] });
  else await expect(pending).rejects.toMatchObject({ code: kind === 'crash' ? 'read_failed' : 'missing_log_probs' });
  expect(worker.terminate).toHaveBeenCalledOnce();
});
