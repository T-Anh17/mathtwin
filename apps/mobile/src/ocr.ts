import type { PreparedImage, ReadUsage, TextLine } from '@mathtwin/reader';
import type { ImageResult, MobilePlugin } from './contracts.js';

export interface OcrRequest {
  image: PreparedImage; models: Awaited<ReturnType<MobilePlugin['ocrModels']>>;
  passes: 1 | 2; threads: number;
}
export interface OcrOutput {
  linePasses: { lines: TextLine[]; usage: ReadUsage }[];
  loadMs: number; wasm: NonNullable<ImageResult['wasm']>;
}
export type OcrResponse = { ok: true; output: OcrOutput } | { ok: false; code: string };
export type OcrRunner = (request: OcrRequest, signal: AbortSignal) => Promise<OcrOutput>;

/** One worker/page: cancellation frees all ORT sessions and WASM memory immediately. */
export function runOcrWorker(request: OcrRequest, signal: AbortSignal,
  createWorker = () => new Worker(new URL('./ocr.worker.ts', import.meta.url), { type: 'module' })): Promise<OcrOutput> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject({ code: 'aborted' }); return; }
    const worker = createWorker();
    const finish = (): void => { signal.removeEventListener('abort', cancel); worker.terminate(); };
    const cancel = (): void => { finish(); reject({ code: 'aborted' }); };
    signal.addEventListener('abort', cancel, { once: true });
    worker.onmessage = (event: MessageEvent<OcrResponse>) => {
      finish(); event.data.ok ? resolve(event.data.output) : reject({ code: event.data.code });
    };
    worker.onerror = () => { finish(); reject({ code: 'read_failed' }); };
    const pixels = new Uint8ClampedArray(request.image.pixels);
    try { worker.postMessage({ ...request, image: { width: request.image.width, height: request.image.height, pixels } }, [pixels.buffer]); }
    catch { finish(); reject({ code: 'read_failed' }); }
  });
}
