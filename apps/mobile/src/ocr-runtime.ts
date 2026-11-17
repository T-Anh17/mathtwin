import { VietOcrReader, missingVietnameseChars, parseVietOcrConfig } from '@mathtwin/reader-ocr-shared';
import type { OrtLike } from '@mathtwin/reader-ocr-shared';
import type { Tensor } from 'onnxruntime-web/wasm';
import type { OcrOutput, OcrRequest } from './ocr.js';

type WebOrt = Pick<typeof import('onnxruntime-web/wasm'), 'env' | 'Tensor' | 'InferenceSession'>;
/** Called inside the dedicated worker. Only WASM EP is allowed; all assets are bundled locally. */
export async function readOcr(request: OcrRequest, runtime: WebOrt, assets: { wasm: string; mjs: string },
  isolated: boolean, signal?: AbortSignal): Promise<OcrOutput> {
  runtime.env.wasm.numThreads = isolated ? request.threads : 1;
  runtime.env.wasm.simd = true;
  runtime.env.wasm.proxy = false;
  runtime.env.wasm.wasmPaths = assets;
  const ort: OrtLike = {
    createSession: async (model) => {
      const session = typeof model === 'string'
        ? await runtime.InferenceSession.create(model, { executionProviders: ['wasm'] })
        : await runtime.InferenceSession.create(model, { executionProviders: ['wasm'] });
      return { inputNames: session.inputNames, outputNames: session.outputNames,
        run: (feeds) => session.run(feeds as Record<string, Tensor>), release: () => session.release() };
    },
    tensor: (type, data, dims) => type === 'float32'
      ? new runtime.Tensor('float32', data as Float32Array, dims)
      : new runtime.Tensor('int64', data as BigInt64Array, dims),
  };
  const config = parseVietOcrConfig(request.models.config);
  if (missingVietnameseChars(config.vocab).length) throw { code: 'invalid_config' };
  const began = performance.now();
  const reader = await VietOcrReader.create(ort, request.models, config, signal);
  const loadMs = performance.now() - began;
  try {
    const linePasses: OcrOutput['linePasses'] = [];
    for (let i = 0; i < request.passes; i++) linePasses.push(await reader.readLines([request.image], signal));
    // ORT mutates numThreads to 1 when its WASM threads feature check fails.
    return { linePasses, loadMs, wasm: { numThreads: runtime.env.wasm.numThreads ?? 1, crossOriginIsolated: isolated, simd: true } };
  } finally { await reader.close(); }
}
