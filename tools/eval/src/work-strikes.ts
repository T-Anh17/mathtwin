import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import type { PreparedImage, TruthLine } from '@mathtwin/reader';
import type { ProblemSpec } from '@mathtwin/core';
import { detectStrikes, readWork, STRIKE_NO, vocabularyOf } from '@mathtwin/work';
import type { WorkLine } from '@mathtwin/work';

type Box = NonNullable<WorkLine['box']>;
interface Placement { text: string; x: number; y: number; size: number; region: TruthLine['region'] }
interface Cancellation { lineIndex: number; kind: 'single' | 'opaque'; imageBox: Box }
export interface StrikePageMeasurement {
  id: string; lines: number; positives: number; tp: number; fp: number; fn: number; uncertain: number;
  struckAsContent: number;
  detections: { line: number; truth: boolean; kind?: string; score: number; struck: boolean }[];
}
const json = async <T>(path: string): Promise<T> => JSON.parse(await readFile(path, 'utf8')) as T;

/** Source layout supplies row geometry for ALL rows (lines.json only boxes cancellations).
 * No cancellation marker, cancellation.json, text or answer affects these boxes. */
function layoutBoxes(placements: Placement[], tilted: boolean, width: number, height: number): Box[] {
  const rows: Placement[][] = [];
  for (const p of placements) {
    if (p.region === 'table' && rows.at(-1)?.[0]?.region === 'table' && rows.at(-1)![0]!.y === p.y) rows.at(-1)!.push(p);
    else rows.push([p]);
  }
  return rows.map((row) => {
    const y = row[0]!.y, size = Math.max(...row.map((p) => p.size));
    const box: Box = [Math.min(...row.map((p) => p.x)) - 5, y - 4, 950, y + size + 4];
    if (tilted) {
      const corners = [[box[0], box[1]], [box[0], box[3]], [box[2], box[1]], [box[2], box[3]]].map(([x, yy]) => {
        const sy = yy! / 1440, d = 1 + .035 * sy;
        return [25 + 950 * (x! / 1000 + .018 * sy) / d, 16 + 1408 * sy / d];
      });
      box[0] = Math.min(...corners.map((p) => p[0]!)); box[1] = Math.min(...corners.map((p) => p[1]!));
      box[2] = Math.max(...corners.map((p) => p[0]!)); box[3] = Math.max(...corners.map((p) => p[1]!));
    }
    return [box[0] / width * 1000, box[1] / height * 1000, box[2] / width * 1000, box[3] / height * 1000];
  });
}

export async function measureStrikes(root: string): Promise<StrikePageMeasurement[]> {
  const folder = join(root, 'testdata/images-synthetic-hw');
  const names = (await readdir(folder, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  const pages: StrikePageMeasurement[] = [];
  for (const id of names) {
    const dir = join(folder, id);
    const { data, info } = await sharp(join(dir, '1.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const image: PreparedImage = { pixels: new Uint8ClampedArray(data), width: info.width, height: info.height };
    const [truthLines, placements, spec] = await Promise.all([
      json<TruthLine[]>(join(dir, 'lines.json')), json<Placement[]>(join(dir, 'layout.json')), json<ProblemSpec>(join(dir, 'truth.json')),
    ]);
    const boxes = layoutBoxes(placements, id.endsWith('perspective'), info.width, info.height);
    if (boxes.length !== truthLines.length) throw new Error(`Layout/line mismatch: ${id}`);
    // Transcriptions are oracle; remove ALL struck/box annotations, including null text.
    const input: WorkLine[] = truthLines.map((line, index) => ({ text: line.text ?? '', region: line.region, index, page: 0,
      box: boxes[index]!, conf: 1, alternatives: [] }));
    const vocab = vocabularyOf(spec);
    const output = await readWork([image], { vocab, reader: { engine: 'oracle-text-layout-boxes', readLines: async () => ({
      lines: input, usage: { engine: 'oracle-text-layout-boxes', passes: 1, latencyMs: 0 },
    }) } });
    // Truth is accessed for comparison only, AFTER inference.
    const cancellations = await json<Cancellation[]>(join(dir, 'cancellation.json'));
    const positives = new Set(cancellations.map((c) => c.lineIndex));
    if (truthLines.some((line, index) => Boolean(line.struck) !== positives.has(index))) throw new Error(`Cancellation truth mismatch: ${id}`);
    const detections = output.lines.filter((l) => l.region === 'solution' || l.region === 'table').map((line) => ({
      line: line.index, truth: positives.has(line.index), score: line.strikeScore!, struck: line.struck === true,
      ...(positives.has(line.index) ? { kind: cancellations.find((c) => c.lineIndex === line.index)!.kind } : {}),
    }));
    pages.push({ id, lines: detections.length, positives: positives.size,
      tp: detections.filter((d) => d.truth && d.struck).length, fp: detections.filter((d) => !d.truth && d.struck).length,
      fn: detections.filter((d) => d.truth && !d.struck).length,
      uncertain: detections.filter((d) => !d.struck && d.score > STRIKE_NO).length,
      struckAsContent: output.parsed.steps.filter((step) => step.lines.some((line) => positives.has(line))).length, detections });
  }
  return pages;
}

/** Separately exercise exact cancellation annotation boxes (not the 40-page metric). */
export async function checkCancellationBoxes(root: string, id: string): Promise<{ struck: boolean; score: number }[]> {
  const dir = join(root, 'testdata/images-synthetic-hw', id);
  const { data, info } = await sharp(join(dir, '1.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const cancellations = await json<Cancellation[]>(join(dir, 'cancellation.json'));
  const input: WorkLine[] = cancellations.map((c) => ({ index: c.lineIndex, page: 0, text: '', conf: 1, alternatives: [],
    box: [c.imageBox[0] / info.width * 1000, c.imageBox[1] / info.height * 1000, c.imageBox[2] / info.width * 1000, c.imageBox[3] / info.height * 1000] }));
  return detectStrikes({ pixels: new Uint8ClampedArray(data), width: info.width, height: info.height }, input);
}
