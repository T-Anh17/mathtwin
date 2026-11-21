import type { PreparedImage, TextReadOptions, TextReader } from '@mathtwin/reader';
import type { Readers } from './flow/reading.js';
import type { FigureDraftRunner } from './flow/reading.js';
import type { MobilePlugin } from './contracts.js';
import { Benchmark, engineFor } from './benchmark.js';
import { decodeImage } from './images.js';
import { mobile, transport } from './native.js';
import { workerRunner } from './figure-suggest.js';

function encode(image: PreparedImage): string {
  const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
  const ctx = canvas.getContext('2d'); if (!ctx) throw { code: 'image_invalid' };
  ctx.putImageData(new ImageData(new Uint8ClampedArray(image.pixels), image.width, image.height), 0, 0);
  const data = canvas.toDataURL('image/png'); canvas.width = 0; canvas.height = 0; return data;
}

/** Reuses B's guarded local transport, readProblem/shared parser, cancellation and server lifecycle. */
export function nativeProblemReaders(): Readers {
  const benchmark = new Benchmark(mobile, transport, decodeImage);
  return createProblemReaders(benchmark, mobile, encode, workerRunner);
}

export function createProblemReaders(benchmark: Pick<Benchmark, 'run'>, lifecycle: Pick<MobilePlugin, 'setBenchmarkState'>,
  encodeImage: (image: PreparedImage) => string, figure: FigureDraftRunner): Readers {
  let leases = 0;
  const activity = async (running: boolean) => {
    if (running) {
      if (leases++ === 0) {
        try { await lifecycle.setBenchmarkState({ running: true, backgroundIdleMinutes: 5 }); }
        catch (error) { leases--; throw error; }
      }
    } else if (leases > 0 && --leases === 0) await lifecycle.setBenchmarkState({ running: false, backgroundIdleMinutes: 5 });
  };
  const run = async (images: PreparedImage[], mode: 'graph' | 'lines', signal = new AbortController().signal, textOptions?: TextReadOptions) => {
    if (images.length !== 1) throw { code: 'image_invalid' };
    signal.throwIfAborted();
    await activity(true);
    try {
      const result = await benchmark.run({ id: 'problem', dataUrl: encodeImage(images[0]!), imageSource: 'gallery' },
        { model: 'b', passes: 1, mode, threads: 4, minRamGb: 6, allowLowRam: false, backgroundIdleMinutes: 5 }, signal, textOptions);
      if (result.errorCode) throw { code: result.errorCode };
      return result;
    } finally { await activity(false); }
  };
  const text: TextReader = { engine: engineFor('b'), readLines: async (images, signal, options) => {
    const result = await run(images, 'lines', signal, options);
    const read = result.linePasses?.[0] ?? { lines: [], usage: result.usage };
    const image = images[0]!;
    return { ...read, lines: read.lines.map((line) => ({ ...line, ...(line.box ? {
      box: line.box.map((n, axis) => n * 1000 / (axis % 2 ? image.height : image.width)) as [number, number, number, number],
    } : {}) })) };
  } };
  return { text, problem: async (images, signal) => {
    const result = await run(images, 'graph', signal);
    if (!result.outcome) throw { code: 'read_failed' };
    // B's shared parser returns original pixels; the editor/crops use normalized 0..1000.
    const image = images[0]!;
    for (const draft of result.outcome.drafts) for (const vertex of draft.vertices) {
      if (vertex.box) vertex.box = [vertex.box[0] * 1000 / image.width, vertex.box[1] * 1000 / image.height,
        vertex.box[2] * 1000 / image.width, vertex.box[3] * 1000 / image.height];
    }
    const variant = result.memory?.cpuVariant;
    if (variant) result.outcome.usage.engine += `:${variant}`;
    return result.outcome;
  }, activity, figure: async (image, signal) => {
    signal.throwIfAborted(); await activity(true);
    try { return await figure(image, signal); } finally { await activity(false); }
  } };
}
