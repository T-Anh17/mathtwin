/// <reference lib="webworker" />
import * as runtime from 'onnxruntime-web/wasm';
import wasm from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import mjs from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';
import { readOcr } from './ocr-runtime.js';
import { errorCode } from './messages.vi.js';
import type { OcrRequest, OcrResponse } from './ocr.js';

self.onmessage = async (event: MessageEvent<OcrRequest>) => {
  let response: OcrResponse;
  try {
    const output = await readOcr(event.data, runtime, { wasm: new URL(wasm, self.location.href).href, mjs: new URL(mjs, self.location.href).href }, self.crossOriginIsolated);
    response = { ok: true, output };
  } catch (error) { response = { ok: false, code: errorCode(error) }; }
  self.postMessage(response);
};
