import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import type { PreparedImage } from '@mathtwin/reader';
import type { Readers } from '../../../apps/mobile/src/flow/reading.js';
import type { Session } from '../../../apps/mobile/src/flow/types.js';
import type { FigureAnnotation } from './figure-geometry.js';
import { pairWorkLines, solutionRegion, teacherWorkTruth } from './pair-data.js';
import type { PairCase } from './pair-data.js';
import { runMvpSample } from './mvp.js';

async function prepared(path: string): Promise<PreparedImage> {
  const { data, info } = await sharp(path).rotate().toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { pixels: new Uint8ClampedArray(data), width: info.width, height: info.height, source: path };
}
function annotation(pair: PairCase, image: PreparedImage): FigureAnnotation {
  return { version: 1, width: image.width, height: image.height, box: [0, 0, image.width, image.height], crossings: [],
    vertices: pair.truth.graph.vertices.map((vertex) => ({ ...vertex, center: [0, 0] as [number, number], labelBox: [0, 0, 1, 1] as [number, number, number, number], contours: [], style: 'pair-truth', gap: 0 })),
    edges: pair.truth.graph.edges.map((edge) => ({ ...edge, w: edge.w ?? null, name: edge.name ?? null, polyline: [] })) };
}
export async function pairInputHash(pair: PairCase): Promise<string> {
  const hash = createHash('sha256');
  for (const file of [...pair.problemFiles, ...pair.workFiles]) hash.update(await readFile(join(pair.directory, file)));
  hash.update(JSON.stringify({ truth: pair.truth, lines: pair.lines, teacher: pair.teacher, work: pair.work ?? null }));
  return hash.digest('hex');
}
export async function runMvpPair(pair: PairCase, date: string, readers: Readers, signal: AbortSignal, checkpoint: (session: Awaited<ReturnType<typeof runMvpSample>>['session']) => Promise<void>, saved?: Session, prior?: Awaited<ReturnType<typeof runMvpSample>>, problemRead: 'none' | 'b' = 'none') {
  const problemImages = await Promise.all(pair.problemFiles.map((file) => prepared(join(pair.directory, file))));
  const workImages = await Promise.all(pair.workFiles.map((file) => prepared(join(pair.directory, file))));
  const reference = await pairWorkLines(pair.lines, pair.workFiles.map((file) => join(pair.directory, file)));
  const regions = new Map(workImages.map((_, page) => [page, solutionRegion(reference, page)]));
  return runMvpSample({ id: pair.id, date, image: workImages[0]!, problemImages, workImages, truth: pair.truth,
    workTruth: pair.work ?? teacherWorkTruth(pair.teacher), reference, region: regions.get(0) ?? [0, 0, 1000, 1000],
    regionByPage: (page) => regions.get(page), figure: annotation(pair, problemImages[0]!), readers, signal, checkpoint, problemRead,
    ...(saved ? { saved } : {}), ...(prior ? { prior } : {}) });
}
