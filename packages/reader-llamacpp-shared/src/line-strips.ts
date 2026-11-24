import type { PreparedImage, ReadUsage, TextLine, TextReader } from '@mathtwin/reader';

export interface LineStripConfig { bands: number; overlap: number; maxLongEdge: number }
export interface LineStripAudit extends LineStripConfig { retriedBands: number; predictedTokens: number[] }

/** Dense handwritten pages need smaller visual contexts; callers apply maxLongEdge to each crop. */
export const defaultWorkLineStripConfig: Readonly<LineStripConfig> = Object.freeze({ bands: 2, overlap: .08, maxLongEdge: 1024 });

/** Crop extent (with overlap) and the band's own, non-overlapping share of the page; all as page fractions 0–1. */
export interface StripBand { top: number; bottom: number; ownTop: number; ownBottom: number }

export function validateLineStripConfig(config: LineStripConfig): void {
  if (!Number.isSafeInteger(config.bands) || config.bands < 1 || config.bands > 8
    || !Number.isFinite(config.overlap) || config.overlap < 0 || config.overlap >= .5
    || !Number.isSafeInteger(config.maxLongEdge) || config.maxLongEdge < 1 || config.maxLongEdge > 16384) throw new Error('Invalid line-strip configuration.');
}

function bands(parent: StripBand, count: number, overlap: number): StripBand[] {
  const height = parent.bottom - parent.top;
  return Array.from({ length: count }, (_, index) => {
    const top = parent.top + height * index / count, bottom = parent.top + height * (index + 1) / count;
    return { top: Math.max(parent.top, top - height * overlap / 2), bottom: Math.min(parent.bottom, bottom + height * overlap / 2),
      ownTop: index === 0 ? parent.ownTop : Math.max(parent.ownTop, top), ownBottom: index === count - 1 ? parent.ownBottom : Math.min(parent.ownBottom, bottom) };
  });
}

function crop(image: PreparedImage, band: StripBand): PreparedImage {
  const top = Math.floor(image.height * band.top), bottom = Math.ceil(image.height * band.bottom);
  const height = bottom - top, pixels = new Uint8ClampedArray(image.width * height * 4);
  for (let row = 0; row < height; row++) pixels.set(image.pixels.subarray((top + row) * image.width * 4, (top + row + 1) * image.width * 4), row * image.width * 4);
  return { width: image.width, height, pixels };
}

function mapLine(line: TextLine, band: StripBand): TextLine {
  if (!line.box) return line;
  const height = band.bottom - band.top;
  return { ...line, box: [line.box[0], band.top * 1000 + line.box[1] * height, line.box[2], band.top * 1000 + line.box[3] * height] };
}

function owns(band: StripBand, centre: number): boolean { return centre >= band.ownTop && (centre < band.ownBottom || band.ownBottom >= 1); }
function centre(box: NonNullable<TextLine['box']>): number { return (box[1] + box[3]) / 2000; }
function sameRow(a: NonNullable<TextLine['box']>, b: NonNullable<TextLine['box']>): boolean {
  const shared = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  return shared > 0 && shared >= .5 * Math.min(a[3] - a[1], b[3] - b[1]);
}

/**
 * Join band reads (boxes already in page coordinates, bands top to bottom).
 * A line belongs to the band whose own share contains its box centre. Overlap
 * exists only so a line cut by one band edge is whole in the neighbour, so a
 * line outside its band's share is dropped when the owning band read a line
 * on the same row — even if the two passes spelled it differently. When the
 * owner read nothing there, the line is kept: a duplicate is safer than a lost
 * line. Lines without a box cannot be placed and stay in reading order.
 */
export function mergeStripLines(parts: { band: StripBand; lines: TextLine[] }[]): TextLine[] {
  return parts.flatMap(({ band, lines }) => lines.filter((line) => {
    if (!line.box || owns(band, centre(line.box))) return true;
    const box = line.box, middle = centre(box);
    return !parts.some((other) => other.band !== band && owns(other.band, middle)
      && other.lines.some((candidate) => candidate.box !== undefined && sameRow(candidate.box, box)));
  }));
}

function addUsage(total: ReadUsage, next: ReadUsage): void {
  total.passes += next.passes; total.latencyMs += next.latencyMs;
  total.lineCount = (total.lineCount ?? 0) + (next.lineCount ?? 0);
  if (next.peakMemoryMb !== undefined) total.peakMemoryMb = Math.max(total.peakMemoryMb ?? 0, next.peakMemoryMb);
  if (next.sentImages) total.sentImages = [...total.sentImages ?? [], ...next.sentImages];
  if (next.finish_reason) total.finish_reason = [...total.finish_reason ?? [], ...next.finish_reason];
  if (next.lineMs) total.lineMs = [...total.lineMs ?? [], ...next.lineMs];
  for (const key of ['detectionMs', 'recognitionMs'] as const) if (next[key] !== undefined) total[key] = (total[key] ?? 0) + next[key]!;
  if (next.serverTimings) {
    const timings = total.serverTimings ?? { promptMs: 0, predictedMs: 0, promptTokens: 0, predictedTokens: 0 };
    for (const key of ['promptMs', 'predictedMs', 'promptTokens', 'predictedTokens'] as const) timings[key] += next.serverTimings[key];
    total.serverTimings = timings;
  }
}

function shouldSplit(error: unknown): boolean {
  return error !== null && typeof error === 'object'
    && (('code' in error && error.code === 'repetition_loop') || ('reason' in error && (error.reason === 'repetition_loop' || error.reason === 'truncated')));
}

/**
 * Read a page in horizontal bands. A single looping band is split once; all
 * other failures remain failures so this wrapper never disguises a bad read.
 */
export async function readLinesInStrips(reader: TextReader, image: PreparedImage, signal: AbortSignal | undefined,
  options: { continuation?: boolean; config?: LineStripConfig } = {}): Promise<{ lines: TextLine[]; usage: ReadUsage }> {
  const config = options.config ?? defaultWorkLineStripConfig;
  validateLineStripConfig(config); signal?.throwIfAborted();
  // A thumbnail/crop already below the requested long edge has no density
  // benefit from splitting, and retaining one pass keeps manual crop review exact.
  if (Math.max(image.width, image.height) <= config.maxLongEdge) {
    const result = await reader.readLines([image], signal, options.continuation === undefined ? undefined : { continuation: options.continuation });
    return { ...result, usage: { ...result.usage, lineCount: result.lines.length,
      lineStrips: { ...config, retriedBands: 0, predictedTokens: result.usage.serverTimings ? [result.usage.serverTimings.predictedTokens] : [] } } };
  }
  const usage: ReadUsage = { engine: reader.engine, passes: 0, latencyMs: 0, lineCount: 0 };
  let retriedBands = 0;
  const predictedTokens: number[] = [];
  const parts: { band: StripBand; lines: TextLine[] }[] = [];
  const readBand = async (band: StripBand, retry: boolean): Promise<void> => {
    try {
      const result = await reader.readLines([crop(image, band)], signal, options.continuation === undefined ? undefined : { continuation: options.continuation });
      addUsage(usage, result.usage);
      if (result.usage.serverTimings) predictedTokens.push(result.usage.serverTimings.predictedTokens);
      parts.push({ band, lines: result.lines.map((line) => mapLine(line, band)) });
    } catch (error) {
      if (!retry || !shouldSplit(error)) throw error;
      retriedBands++;
      const children = bands(band, 2, config.overlap);
      for (const child of children) await readBand(child, false);
    }
  };
  // Bands are read top to bottom and each keeps the model's own reading order, so concatenation is the page order.
  for (const band of bands({ top: 0, bottom: 1, ownTop: 0, ownBottom: 1 }, config.bands, config.overlap)) await readBand(band, true);
  const lines = mergeStripLines(parts);
  usage.lineCount = lines.length;
  usage.lineStrips = { ...config, retriedBands, predictedTokens };
  return { lines, usage };
}

/** Adapter for the existing TextReader boundary used by app and Node flows. */
export function withLineStrips(reader: TextReader, config: LineStripConfig = defaultWorkLineStripConfig): TextReader {
  validateLineStripConfig(config);
  return { engine: reader.engine, readLines: (images, signal, options) => {
    if (images.length !== 1) return reader.readLines(images, signal, options);
    return readLinesInStrips(reader, images[0]!, signal, { ...(options?.continuation === undefined ? {} : { continuation: options.continuation }), config });
  } };
}
