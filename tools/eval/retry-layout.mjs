import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { LlamaCppReader } from '../../packages/reader-llamacpp/dist/index.js';

// Retry only failed pages from the saved 4.4 measurement; never overwrite that run.
const source = JSON.parse(await readFile('reports/.debug/mvp-batch-4.4-measurement.json', 'utf8'));
const reader = new LlamaCppReader({ model: 'b', serverPath: resolve('.build-cache/llama-win/bin/llama-server.exe'),
  modelsDirectory: resolve('.models'), threads: 4, maxImageSide: 768, readTimeout: 180_000, timeoutMs: 300_000 });
const pages = [];
for (const { id } of source.node.pages.filter((p) => p.error)) {
  const started = performance.now();
  try {
    const { data, info } = await sharp(`testdata/images-synthetic-hw/${id}/1.png`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const result = await reader.readLines([{ pixels: new Uint8ClampedArray(data), width: info.width, height: info.height }], AbortSignal.timeout(300_000));
    pages.push({ id, ms: performance.now() - started, usage: result.usage, lines: result.lines });
  } catch (error) {
    pages.push({ id, ms: performance.now() - started, error: String(error), reason: error?.reason, finish_reason: error?.finish_reason });
  }
  await writeFile('reports/.debug/4.4-r2-retries.json', JSON.stringify({ pages }, null, 2) + '\n');
  console.log(JSON.stringify({ ...pages.at(-1), lines: undefined }));
}
