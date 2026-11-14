import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { validateSpec } from '@mathtwin/core';
import type { ProblemSpec } from '@mathtwin/core';
import type { PreparedImage } from '@mathtwin/reader';

export interface ImageMeta {
  source: 'printed' | 'handwritten';
  capture: 'straight' | 'tilted';
  blurred: boolean;
  questionFormat: ProblemSpec['questionFormat'];
  notes: string;
  synthetic: boolean;
  variant?: string;
  coreFixture?: string;
  artifactHashes?: { svgSha256: string; pngSha256: string };
}
export interface ImageCase { id: string; directory: string; files: string[]; truth: ProblemSpec; meta: ImageMeta }
export async function readJson(path: string): Promise<unknown> { return JSON.parse(await readFile(path, 'utf8')) as unknown; }

export function checkedTruth(value: unknown, id: string): ProblemSpec {
  const spec = value as ProblemSpec;
  if (!validateSpec(spec).ok || Object.hasOwn(spec, 'uncertain')) throw new Error(`truth.json không hợp lệ hoặc có uncertain: ${id}`);
  return spec;
}
function checkedMeta(value: unknown, truth: ProblemSpec, id: string): ImageMeta {
  if (value === null || typeof value !== 'object') throw new Error(`meta.json không hợp lệ: ${id}`);
  const meta = value as ImageMeta;
  if (!['printed', 'handwritten'].includes(meta.source) || !['straight', 'tilted'].includes(meta.capture)
    || typeof meta.blurred !== 'boolean' || typeof meta.synthetic !== 'boolean' || typeof meta.notes !== 'string'
    || meta.questionFormat !== truth.questionFormat) throw new Error(`meta.json không hợp lệ: ${id}`);
  return meta;
}
export async function loadCases(directory: string, limit?: number): Promise<ImageCase[]> {
  const entries = (await readdir(directory, { withFileTypes: true })).filter((e) => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name, 'en'));
  const result: ImageCase[] = [];
  for (const entry of entries.slice(0, limit)) {
    const folder = join(directory, entry.name);
    const truth = checkedTruth(await readJson(join(folder, 'truth.json')), entry.name);
    const meta = checkedMeta(await readJson(join(folder, 'meta.json')), truth, entry.name);
    const files = (await readdir(folder)).filter((file) => /^[1-9]\d*\.(jpg|jpeg|png)$/i.test(file))
      .sort((a, b) => Number(a.split('.')[0]) - Number(b.split('.')[0]));
    if (files.length === 0 || files.some((file, i) => Number(file.split('.')[0]) !== i + 1)) throw new Error(`Thiếu ảnh hoặc thứ tự trang không hợp lệ: ${entry.name}`);
    result.push({ id: entry.name, directory: folder, files, truth, meta });
  }
  return result;
}
export async function prepareImages(sample: ImageCase): Promise<PreparedImage[]> {
  const result: PreparedImage[] = [];
  for (const file of sample.files) {
    const { data, info } = await sharp(join(sample.directory, file)).rotate().toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    result.push({ pixels: new Uint8ClampedArray(data), width: info.width, height: info.height, source: file });
  }
  return result;
}
