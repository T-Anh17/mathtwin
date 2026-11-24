/** One-page llama.cpp diagnosis; writes only operational metadata under reports/.debug. */
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { LlamaCppReader } from '@mathtwin/reader-llamacpp';
import { defaultWorkLineStripConfig, readLinesInStrips } from '@mathtwin/reader-llamacpp-shared';
import type { PreparedImage } from '@mathtwin/reader';

const root = resolve(process.cwd()), args = process.argv.slice(2);
let directory: string | undefined, ids: string[] | undefined;
for (let index = 0; index < args.length; index++) {
  const flag = args[index], value = args[++index];
  if (flag === '--dir' && value) directory = resolve(value);
  else if (flag === '--ids' && value && /^[a-z0-9,-]+$/u.test(value)) ids = [...new Set(value.split(','))];
  else throw new Error('Dùng mvp-diagnostic-cli --dir <cặp ảnh thật> --ids real-01,real-02.');
}
if (!directory || !ids?.length) throw new Error('Cần --dir và 1–2 mã cặp qua --ids.');
if (ids.length > 2) throw new Error('Chỉ chẩn đoán tối đa 2 trang, không thay cho lượt đo đầy đủ.');

async function image(path: string): Promise<PreparedImage> {
  const { data, info } = await sharp(path).rotate().toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { pixels: new Uint8ClampedArray(data), width: info.width, height: info.height };
}
const output = join(root, 'reports/.debug', `llama-diagnostic-${new Date().toISOString().slice(0, 10)}.json`);
await mkdir(join(root, 'reports/.debug'), { recursive: true });
const results: unknown[] = [];
for (const id of ids) {
  const folder = join(directory, id);
  const file = (await readdir(folder)).find((name) => /^bai-1\.(?:jpg|jpeg|png)$/iu.test(name));
  if (!file) throw new Error(`${id} không có bai-1.jpg/png.`);
  const events: unknown[] = [], began = performance.now();
  const reader = new LlamaCppReader({ model: 'b', serverPath: join(root, '.build-cache/llama-win/bin/llama-server.exe'), modelsDirectory: join(root, '.models'),
    threads: 4, gpuLayers: 0, maxImageSide: defaultWorkLineStripConfig.maxLongEdge,
    contextSize: 8192, maxTokens: 3072, readTimeout: 600_000, timeoutMs: 780_000, diagnostics: (event) => events.push(event) });
  try {
    const result = await readLinesInStrips(reader, await image(join(folder, file)), undefined, { config: defaultWorkLineStripConfig });
    results.push({ id, ok: true, elapsedMs: performance.now() - began, lines: result.lines.length, usage: result.usage, events });
  } catch (error) {
    const record = error !== null && typeof error === 'object' ? error as Record<string, unknown> : {};
    results.push({ id, ok: false, elapsedMs: performance.now() - began, error: { name: error instanceof Error ? error.name : 'Error', message: error instanceof Error ? error.message : String(error),
      code: record.code, reason: record.reason, finish_reason: record.finish_reason }, events });
  }
}
await writeFile(output, JSON.stringify({ config: { contextSize: 8192, maxTokens: 3072, readTimeout: 600_000, strips: defaultWorkLineStripConfig }, results }, null, 2) + '\n');
console.log(output);
if (results.some((result) => result !== null && typeof result === 'object' && 'ok' in result && result.ok === false)) process.exitCode = 1;
