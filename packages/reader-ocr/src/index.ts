import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VietOcrReader, missingVietnameseChars, parseVietOcrConfig } from '@mathtwin/reader-ocr-shared';
import type { LineMergeOptions, OrtLike } from '@mathtwin/reader-ocr-shared';
import type { Tensor } from 'onnxruntime-common';
export { parseVietOcrConfig, unsupportedSymbols } from '@mathtwin/reader-ocr-shared';

/** Node development adapter. No download or network fallback, including for the JSON config. */
export async function createNodeOcrReader(options: { modelRoot?: string; signal?: AbortSignal; ort?: OrtLike; lineMerge?: LineMergeOptions } = {}): Promise<VietOcrReader> {
  const root = options.modelRoot ?? fileURLToPath(new URL('../../../.models/c/', import.meta.url));
  const manifest: unknown = JSON.parse(await readFile(new URL('../../../tools/models/manifest.json', import.meta.url), 'utf8'));
  if (typeof manifest !== 'object' || manifest === null || !('files' in manifest) || !Array.isArray(manifest.files)) throw new Error('Invalid model manifest.');
  const expected = ['det.onnx', 'vietocr_encoder.onnx', 'vietocr_decoder.onnx', 'vietocr.json'];
  for (const filename of expected) {
    options.signal?.throwIfAborted();
    const entry: unknown = manifest.files.find((file: unknown) => typeof file === 'object' && file !== null && 'model' in file && file.model === 'c' && 'filename' in file && file.filename === filename);
    if (typeof entry !== 'object' || entry === null || !('bytes' in entry) || !('sha256' in entry)) throw new Error('Missing OCR manifest entry.');
    const path = join(root, filename);
    if ((await stat(path)).size !== entry.bytes) throw new Error(`OCR size mismatch: ${filename}`);
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path)) { options.signal?.throwIfAborted(); hash.update(chunk); }
    if (hash.digest('hex') !== entry.sha256) throw new Error(`OCR SHA-256 mismatch: ${filename}`);
  }
  const config = parseVietOcrConfig(JSON.parse(await readFile(join(root, 'vietocr.json'), 'utf8')) as unknown);
  if (missingVietnameseChars(config.vocab).length) throw new Error('Incomplete Vietnamese vocabulary.');
  let ort = options.ort;
  if (!ort) {
    const runtime = await import('onnxruntime-node');
    ort = {
      createSession: async (model) => {
        const session = typeof model === 'string'
          ? await runtime.InferenceSession.create(model, { executionProviders: ['cpu'] })
          : await runtime.InferenceSession.create(model, { executionProviders: ['cpu'] });
        return { inputNames: session.inputNames, outputNames: session.outputNames,
          run: async (feeds) => session.run(feeds as Record<string, Tensor>), release: () => session.release() };
      },
      tensor: (type, data, dims) => type === 'float32'
        ? new runtime.Tensor('float32', data as Float32Array, dims)
        : new runtime.Tensor('int64', data as BigInt64Array, dims),
    };
  }
  return VietOcrReader.create(ort, { detector: join(root, 'det.onnx'), encoder: join(root, 'vietocr_encoder.onnx'), decoder: join(root, 'vietocr_decoder.onnx') }, config, options.signal, options.lineMerge);
}
