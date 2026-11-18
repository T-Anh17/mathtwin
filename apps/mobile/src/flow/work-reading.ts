import { detectMissingLines, filterWorkRegions, readWork, validWorkBox, validWorkLineBox, suggestWorkRegion } from '@mathtwin/work';
import type { WorkBox, WorkLine, WorkVocabulary } from '@mathtwin/work';
import type { PreparedImage, TextReader } from '@mathtwin/reader';
import { cancellable } from './reading.js';

export interface WorkPageRead {
  page: number; raw: WorkLine[]; lines: WorkLine[]; ms: number;
  needsRegion: boolean; region?: WorkBox; figures?: WorkBox[];
  inspected?: boolean;
  missingLineCheckUnavailable?: boolean;
  suggestedRegion?: WorkBox;
  failed?: boolean;
}

export function processWorkPage(image: PreparedImage, reading: WorkPageRead, region?: WorkBox): WorkPageRead {
  const filtered = filterWorkRegions(reading.raw, { ...(reading.figures ? { figures: reading.figures } : {}), ...(region ? { solution: region } : {}),
    ...(region && reading.missingLineCheckUnavailable ? { cropped: true } : {}) });
  if (filtered.needsRegion) {
    const { suggestedRegion: _old, ...rest } = reading, suggestedRegion = suggestWorkRegion(reading.raw);
    return { ...rest, lines: filtered.lines, needsRegion: true, inspected: true, ...(suggestedRegion ? { suggestedRegion } : {}) };
  }
  if (reading.missingLineCheckUnavailable && region) return { ...reading, lines: filtered.lines, needsRegion: false, region, inspected: true };
  const solution = filtered.lines.filter((l) => l.region === 'solution' || l.region === 'table');
  const area: WorkBox = region ?? [0, Math.max(0, Math.min(...solution.map((l) => l.box![1])) - 12), 1000, 1000];
  const missing = detectMissingLines(image, filtered.lines, area).map((item): WorkLine => ({ text: '', conf: 0, alternatives: [],
    page: reading.page, index: 0, region: 'solution', missing: true, box: item.box }));
  const lines = [...filtered.lines, ...missing].sort((a, b) => (a.box?.[1] ?? 0) - (b.box?.[1] ?? 0) || (a.box?.[0] ?? 0) - (b.box?.[0] ?? 0))
    .map((l, index) => ({ ...l, index }));
  return { ...reading, lines, needsRegion: false, region: area, inspected: true };
}

/** When OCR supplied no boxes, reread the user's crop instead of guessing which text it contains. */
export async function readWorkRegion(image: PreparedImage, reading: WorkPageRead, region: WorkBox, reader: TextReader,
  vocab: WorkVocabulary, signal: AbortSignal): Promise<WorkPageRead> {
  signal.throwIfAborted();
  if (!validWorkBox(region)) throw new Error('Invalid solution region.');
  if (reading.raw.every((l) => l.box && validWorkLineBox(l.box))) return processWorkPage(image, reading, region);
  const left = Math.floor(region[0] * image.width / 1000), top = Math.floor(region[1] * image.height / 1000);
  const right = Math.ceil(region[2] * image.width / 1000), bottom = Math.ceil(region[3] * image.height / 1000);
  const width = right - left, height = bottom - top, pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) pixels.set(image.pixels.subarray(((top + y) * image.width + left) * 4, ((top + y) * image.width + right) * 4), y * width * 4);
  const started = performance.now();
  const read = await cancellable(() => readWork([{ pixels, width, height }], { reader, vocab, signal }), signal);
  const cropLines = read.lines.map(({ box, ...l }): WorkLine => ({ ...l, page: reading.page, ...(box && validWorkLineBox(box) ? {
    box: [(left + box[0] * width / 1000) / image.width * 1000, (top + box[1] * height / 1000) / image.height * 1000,
      (left + box[2] * width / 1000) / image.width * 1000, (top + box[3] * height / 1000) / image.height * 1000],
  } : {}) }));
  // A crop pass must not silently erase already located text. Keep original boxed
  // lines absent from the crop transcription; confirmed geometry governs both.
  const retained = reading.raw.filter((l) => l.box && validWorkLineBox(l.box)
    && !cropLines.some((c) => c.text.trim() === l.text.trim()));
  const raw = [...cropLines, ...retained].map((l, index) => ({ ...l, index }));
  signal.throwIfAborted();
  return processWorkPage(image, { ...reading, raw, missingLineCheckUnavailable: raw.some((l) => !l.box), ms: reading.ms + performance.now() - started }, region);
}

/** Normalized TextReader boundary. Every page is durable before starting the next. */
export async function readWorkPages(options: {
  count: number; reader: TextReader; vocab: WorkVocabulary; signal: AbortSignal;
  load: (page: number) => Promise<PreparedImage>; saved?: WorkPageRead[];
  figures?: (image: PreparedImage, signal: AbortSignal) => Promise<WorkBox[]>;
  progress: (page: number) => void; checkpoint: (page: WorkPageRead) => Promise<void>; now?: () => number;
}): Promise<boolean> {
  const { signal } = options, now = options.now ?? (() => performance.now());
  for (let page = 0; page < options.count; page++) {
    signal.throwIfAborted();
    const saved = options.saved?.find((p) => p.page === page);
    if (saved?.inspected) continue;
    options.progress(page);
    const image = await cancellable(() => options.load(page), signal), started = now();
    if (saved && !saved.failed) { await options.checkpoint(processWorkPage(image, saved, saved.region)); continue; }
    let result: Awaited<ReturnType<typeof readWork>>;
    try { result = await cancellable(() => readWork([image], { reader: options.reader, vocab: options.vocab, signal }), signal); }
    catch (error) {
      signal.throwIfAborted();
      await options.checkpoint({ page, raw: [], lines: [], ms: now() - started, needsRegion: true, failed: true });
      throw error;
    }
    const raw = result.lines.map((l) => ({ ...l, page }));
    // Save OCR even if optional geometry or missing-line inspection fails afterwards.
    const reading: WorkPageRead = { page, raw, lines: raw, ms: now() - started, needsRegion: true };
    await options.checkpoint(reading);
    signal.throwIfAborted();
    if (options.figures) {
      try { reading.figures = await cancellable(() => options.figures!(image, signal), signal); }
      catch { signal.throwIfAborted(); }
    }
    const completed = processWorkPage(image, reading);
    signal.throwIfAborted();
    await options.checkpoint(completed);
  }
  return true;
}

export function combinedWorkLines(pages: WorkPageRead[]): WorkLine[] {
  return [...pages].sort((a, b) => a.page - b.page).flatMap((p) => p.lines.map((l) => ({ ...l, page: p.page })))
    .map((l, index) => ({ ...l, index }));
}

/** Keep potentially misclassified content visible, including lines with no location. */
export function ignoredWorkLines(lines: WorkLine[], pages: WorkPageRead[]): WorkLine[] {
  return lines.filter((l) => {
    if (l.region !== 'question' && l.region !== 'figure') return false;
    const region = pages.find((p) => p.page === l.page)?.region;
    return !region || !l.box || l.box[0] <= region[2] + 80 && l.box[2] >= region[0] - 80
      && l.box[1] <= region[3] + 80 && l.box[3] >= region[1] - 80;
  });
}
