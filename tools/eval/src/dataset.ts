import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { validateSpec } from '@mathtwin/core';
import type { ProblemSpec } from '@mathtwin/core';
import type { PreparedImage, TruthLine } from '@mathtwin/reader';

export interface ImageMeta {
  source: 'printed' | 'handwritten' | 'synthetic_handwriting';
  capture: 'straight' | 'tilted';
  blurred: boolean;
  questionFormat: ProblemSpec['questionFormat'];
  notes: string;
  synthetic: boolean;
  variant?: string;
  coreFixture?: string;
  hasSolution?: boolean;
  studentErrors?: { kind: 'arithmetic' | 'vertex' | 'conclusion'; written: string; expected: string; description: string }[];
  artifactHashes?: { svgSha256: string; pngSha256: string };
}
export interface ImageCase { id: string; directory: string; files: string[]; truth: ProblemSpec; meta: ImageMeta; lines?: TruthLine[] }
export async function readJson(path: string): Promise<unknown> { return JSON.parse(await readFile(path, 'utf8')) as unknown; }

export function checkedTruth(value: unknown, id: string): ProblemSpec {
  const spec = value as ProblemSpec;
  if (!validateSpec(spec).ok || Object.hasOwn(spec, 'uncertain')) throw new Error(`truth.json không hợp lệ hoặc có uncertain: ${id}`);
  return spec;
}
function checkedMeta(value: unknown, truth: ProblemSpec, id: string): ImageMeta {
  if (value === null || typeof value !== 'object') throw new Error(`meta.json không hợp lệ: ${id}`);
  const meta = value as ImageMeta;
  if (!['printed', 'handwritten', 'synthetic_handwriting'].includes(meta.source) || !['straight', 'tilted'].includes(meta.capture)
    || typeof meta.blurred !== 'boolean' || typeof meta.synthetic !== 'boolean' || typeof meta.notes !== 'string'
    || meta.questionFormat !== truth.questionFormat || (meta.source === 'synthetic_handwriting' && !meta.synthetic)) throw new Error(`meta.json không hợp lệ: ${id}`);
  if ((meta.hasSolution !== undefined && typeof meta.hasSolution !== 'boolean') || (meta.studentErrors !== undefined
    && (!Array.isArray(meta.studentErrors) || meta.studentErrors.some((error) => error === null || typeof error !== 'object'
      || !['arithmetic', 'vertex', 'conclusion'].includes(error.kind) || typeof error.written !== 'string'
      || typeof error.expected !== 'string' || typeof error.description !== 'string')))) throw new Error(`Metadata bài làm không hợp lệ: ${id}`);
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
    const names = await readdir(folder);
    const lines = names.includes('lines.json') ? checkedLines(await readJson(join(folder, 'lines.json'))) : undefined;
    if (meta.source === 'synthetic_handwriting' && lines === undefined) throw new Error(`Thiếu lines.json: ${entry.name}`);
    result.push({ id: entry.name, directory: folder, files, truth, meta, ...(lines === undefined ? {} : { lines }) });
  }
  return result;
}
export function checkedLines(value: unknown): TruthLine[] {
  if (!Array.isArray(value) || value.some((line: unknown) => {
    if (line === null || typeof line !== 'object') return true;
    const item = line as Record<string, unknown>;
    const textInvalid = item.text === null ? item.struck !== true
      : typeof item.text !== 'string' || !item.text.trim() || item.text !== item.text.normalize('NFC');
    const box = item.box;
    return textInvalid || (item.struck !== undefined && typeof item.struck !== 'boolean')
      || !['question', 'figure', 'solution', 'table'].includes(String(item.region))
      || (box !== undefined && (!Array.isArray(box) || box.length !== 4 || box.some((n: unknown) => typeof n !== 'number' || !Number.isFinite(n) || n < 0)
        || box[2] <= box[0] || box[3] <= box[1]));
  })) throw new Error('lines.json không hợp lệ (cần text NFC và region).');
  return value as TruthLine[];
}
export const setFolders = { synthetic: 'images-synthetic', 'synthetic-hw': 'images-synthetic-hw', real: 'images' } as const;
export type DatasetSet = keyof typeof setFolders;
export async function prepareImages(sample: ImageCase): Promise<PreparedImage[]> {
  const result: PreparedImage[] = [];
  for (const file of sample.files) {
    const { data, info } = await sharp(join(sample.directory, file)).rotate().toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    result.push({ pixels: new Uint8ClampedArray(data), width: info.width, height: info.height, source: file });
  }
  return result;
}
