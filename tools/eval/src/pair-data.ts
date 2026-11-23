import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { validateSpec } from '@mathtwin/core';
import type { GradeResult, ProblemSpec } from '@mathtwin/core';
import type { WorkBox, WorkLine, WorkTruth } from '@mathtwin/work';
import { validateWork, workLines } from './work-data.js';

export type PairSource = 'real' | 'generated';
export interface PairLine { text: string | null; region: 'question' | 'figure' | 'solution' | 'table'; struck?: boolean; page?: number; box?: [number, number, number, number] }
export interface TeacherResult { verdict: Extract<GradeResult['verdict'], 'DUNG' | 'SAI'>; dongSaiDau: number | null; lyDo: string }
export interface PairMeta { source: PairSource; capture: string; labeler: string; independentlyChecked: boolean; sha256?: Record<string, string>; [key: string]: unknown }
export interface PairCase {
  id: string; directory: string; problemFiles: string[]; workFiles: string[]; truth: ProblemSpec; lines: PairLine[];
  teacher: TeacherResult; meta: PairMeta; work?: WorkTruth;
}

const image = (name: string, stem: 'de' | 'bai'): number | null => {
  const match = new RegExp(`^${stem}-(\\d+)\\.(?:jpg|jpeg|png)$`, 'iu').exec(name);
  return match ? Number(match[1]) : null;
};
const pairId = (id: string): boolean => /^(?:pair|real|generated|gen)-\d{2,}$/u.test(id);
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const json = async (path: string): Promise<unknown> => JSON.parse(await readFile(path, 'utf8')) as unknown;

function orderedImages(files: string[], stem: 'de' | 'bai', id: string): string[] {
  const pages = files.map((name) => ({ name, page: image(name, stem) })).filter((entry): entry is { name: string; page: number } => entry.page !== null)
    .sort((a, b) => a.page - b.page);
  if (!pages.length || pages.some((entry, index) => entry.page !== index + 1)) throw new Error(`Thứ tự ảnh ${stem} không hợp lệ: ${id}`);
  return pages.map((entry) => entry.name);
}

function checkedLines(value: unknown, pages: number, id: string): PairLine[] {
  if (!Array.isArray(value)) throw new Error(`lines.json không hợp lệ: ${id}`);
  return value.map((raw, index): PairLine => {
    const line = object(raw);
    if (!line || !['question', 'figure', 'solution', 'table'].includes(String(line.region))
      || line.text !== null && (typeof line.text !== 'string' || !line.text.trim() || line.text !== line.text.normalize('NFC'))
      || line.text === null && line.struck !== true
      || line.struck !== undefined && typeof line.struck !== 'boolean'
      || line.page !== undefined && (!Number.isInteger(line.page) || Number(line.page) < 0 || Number(line.page) >= pages)) {
      throw new Error(`lines.json không hợp lệ: ${id}, dòng ${index}`);
    }
    const box = line.box;
    if (box !== undefined && (!Array.isArray(box) || box.length !== 4 || box.some((n) => typeof n !== 'number' || !Number.isFinite(n) || n < 0)
      || Number(box[2]) <= Number(box[0]) || Number(box[3]) <= Number(box[1]))) throw new Error(`box không hợp lệ: ${id}, dòng ${index}`);
    const result: PairLine = { text: line.text as string | null, region: line.region as PairLine['region'] };
    if (line.struck !== undefined) result.struck = line.struck as boolean;
    if (line.page !== undefined) result.page = line.page as number;
    if (box !== undefined) result.box = box as [number, number, number, number];
    return result;
  });
}

function checkedTeacher(value: unknown, id: string): TeacherResult {
  const result = object(value);
  if (!result || !['DUNG', 'SAI'].includes(String(result.verdict)) || result.dongSaiDau !== null && (!Number.isInteger(result.dongSaiDau) || Number(result.dongSaiDau) < 0)
    || typeof result.lyDo !== 'string' || !result.lyDo.trim()) throw new Error(`ket-qua-giao-vien.json không hợp lệ: ${id}`);
  if (result.verdict === 'DUNG' && result.dongSaiDau !== null || result.verdict === 'SAI' && result.dongSaiDau === null) throw new Error(`Kết luận và dòng sai không khớp: ${id}`);
  return result as unknown as TeacherResult;
}

function checkedMeta(value: unknown, id: string): PairMeta {
  const meta = object(value);
  if (!meta || !['real', 'generated'].includes(String(meta.source)) || typeof meta.capture !== 'string' || typeof meta.labeler !== 'string'
    || typeof meta.independentlyChecked !== 'boolean') throw new Error(`meta.json không hợp lệ: ${id}`);
  if (meta.sha256 !== undefined && (!object(meta.sha256) || Object.values(meta.sha256 as Record<string, unknown>).some((hash) => typeof hash !== 'string' || !/^[a-f0-9]{64}$/u.test(hash)))) throw new Error(`SHA-256 không hợp lệ: ${id}`);
  return meta as PairMeta;
}

export async function pairWorkLines(lines: PairLine[], files: string[]): Promise<WorkLine[]> {
  const dimensions = await Promise.all(files.map(async (file) => {
    const info = await sharp(file).rotate().metadata();
    if (!info.width || !info.height) throw new Error(`Không đọc được kích thước ảnh: ${file}`);
    return { width: info.width, height: info.height };
  }));
  return lines.map((line, index) => {
    const page = line.page ?? 0, size = dimensions[page];
    if (!size) throw new Error(`Dòng tham chiếu trỏ tới trang không có ảnh: ${page}`);
    return { text: line.text ?? '', conf: 1, alternatives: [], index, page, region: line.region,
      ...(line.struck === undefined ? {} : { struck: line.struck }),
      ...(line.box ? { box: [line.box[0] / size.width * 1000, line.box[1] / size.height * 1000, line.box[2] / size.width * 1000, line.box[3] / size.height * 1000] as WorkBox } : {}) };
  });
}

export function solutionRegion(lines: WorkLine[], page: number): WorkBox | undefined {
  const boxes = lines.filter((line) => line.page === page && (line.region === 'solution' || line.region === 'table') && line.box).map((line) => line.box!);
  if (!boxes.length) return undefined;
  return [Math.min(...boxes.map((box) => box[0])), Math.min(...boxes.map((box) => box[1])), Math.max(...boxes.map((box) => box[2])), Math.max(...boxes.map((box) => box[3]))];
}

export async function loadPairs(directory: string, source?: PairSource): Promise<PairCase[]> {
  const entries = (await readdir(directory, { withFileTypes: true })).filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name, 'en'));
  const pairs: PairCase[] = [];
  for (const entry of entries) {
    if (!pairId(entry.name)) throw new Error(`Mã cặp phải là mã vô danh dạng generated-01/real-01: ${entry.name}`);
    const folder = join(directory, entry.name), files = await readdir(folder);
    const problemFiles = orderedImages(files, 'de', entry.name), workFiles = orderedImages(files, 'bai', entry.name);
    const truth = await json(join(folder, 'truth.json')) as ProblemSpec;
    if (!validateSpec(truth).ok || Object.hasOwn(truth, 'uncertain')) throw new Error(`truth.json không hợp lệ hoặc có uncertain: ${entry.name}`);
    const lines = checkedLines(await json(join(folder, 'lines.json')), workFiles.length, entry.name);
    if (workFiles.length > 1 && lines.some((line) => line.page === undefined)) throw new Error(`Cặp nhiều trang phải ghi page cho mọi dòng: ${entry.name}`);
    const teacher = checkedTeacher(await json(join(folder, 'ket-qua-giao-vien.json')), entry.name);
    const meta = checkedMeta(await json(join(folder, 'meta.json')), entry.name);
    if (source && meta.source !== source) throw new Error(`Nguồn meta không khớp --source ${source}: ${entry.name}`);
    if (meta.sha256) for (const [file, expected] of Object.entries(meta.sha256)) {
      if (!files.includes(file) || createHash('sha256').update(await readFile(join(folder, file))).digest('hex') !== expected) throw new Error(`SHA-256 ảnh không khớp: ${entry.name}/${file}`);
    }
    let work: WorkTruth | undefined;
    if (files.includes('work.json')) {
      work = await json(join(folder, 'work.json')) as WorkTruth;
      const normalized = await pairWorkLines(lines, workFiles);
      validateWork(truth, work, normalized);
      if (work.expected.verdict !== teacher.verdict) throw new Error(`work.json và giáo viên khác kết luận: ${entry.name}`);
      if (teacher.verdict === 'SAI') {
        const step = work.expected.firstErrorStep;
        const sources = step === null || step === undefined ? [] : work.lineOf[String(step)] ?? [];
        if (!sources.includes(teacher.dongSaiDau!)) throw new Error(`work.json không trỏ tới dòng sai đầu của giáo viên: ${entry.name}`);
      }
    }
    pairs.push({ id: entry.name, directory: folder, problemFiles, workFiles, truth, lines, teacher, meta, ...(work ? { work } : {}) });
  }
  return pairs;
}

/** The minimal evaluation truth used when a teacher labels only the verdict. */
export function teacherWorkTruth(teacher: TeacherResult): WorkTruth {
  return { claims: [], lineOf: {}, expected: { verdict: teacher.verdict, firstErrorStep: null, errorCode: null } };
}
