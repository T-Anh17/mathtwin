import type { PreparedImage, ReadDraft, ReadUsage, TextReader, VisionReader } from '@mathtwin/reader';
import type { LineMergeOptions, OcrModels, OcrTextLine, OrtLike, OrtSession, OrtTensor, VietOcrConfig } from './types.js';
import { parseVietOcrConfig } from './config.js';
import { checkAbort, OcrError } from './errors.js';
import { detectBoxes } from './detection.js';
import { cropBox, detectorSize, imageTensor, lineSize, normalizedBox, validateImage } from './image.js';
import { dispose, output, recognizeLine } from './recognition.js';

export type * from './types.js';
export { parseVietOcrConfig, missingVietnameseChars, unsupportedSymbols } from './config.js';
export { OcrError } from './errors.js';
export { detectBoxes, mergeReadingLines } from './detection.js';
export { cropBox, detectorSize, imageTensor, lineSize } from './image.js';

export class VietOcrReader implements TextReader, VisionReader {
  readonly engine = 'offline:vietocr-onnx';
  private busy = false;
  private closed = false;
  private constructor(private readonly ort: OrtLike, private readonly sessions: readonly [OrtSession, OrtSession, OrtSession], private readonly config: VietOcrConfig, private readonly lineMerge: LineMergeOptions) {}
  static async create(ort: OrtLike, models: OcrModels, config: unknown, signal?: AbortSignal, lineMerge: LineMergeOptions = {}): Promise<VietOcrReader> {
    const parsed = parseVietOcrConfig(config);
    const sessions: OrtSession[] = [];
    try {
      for (const model of [models.detector, models.encoder, models.decoder]) { checkAbort(signal); sessions.push(await ort.createSession(model)); }
      checkAbort(signal);
      const [detector, encoder, decoder] = sessions;
      if (!detector || !encoder || !decoder || detector.inputNames.length !== 1 || detector.outputNames.length !== 1
        || !encoder.inputNames.includes('image') || encoder.outputNames.length !== 2 || decoder.outputNames.length !== 2
        || !['tgt', 'hidden', 'encoder_outputs'].every((name) => decoder.inputNames.includes(name))) throw new OcrError('invalid_output');
      return new VietOcrReader(ort, [detector, encoder, decoder], parsed, { ...lineMerge });
    } catch (error) { await Promise.allSettled(sessions.map((session) => session.release())); throw error; }
  }
  async read(_images: PreparedImage[], _pass: 'edges' | 'neighbors', _signal?: AbortSignal): Promise<{ draft: ReadDraft; usage: ReadUsage }> {
    throw new OcrError('unsupported_mode');
  }
  async readLines(images: PreparedImage[], signal?: AbortSignal): Promise<{ lines: OcrTextLine[]; usage: ReadUsage }> {
    checkAbort(signal);
    if (this.busy) throw new OcrError('busy');
    if (this.closed) throw new OcrError('read_failed');
    this.busy = true;
    const start = performance.now();
    let detectionMs = 0, recognitionMs = 0;
    const lines: OcrTextLine[] = [];
    const lineMs: number[] = [];
    const [detector, encoder, decoder] = this.sessions;
    try {
      for (const image of images) {
        checkAbort(signal); validateImage(image);
        const detectionStart = performance.now();
        const size = detectorSize(image);
        const input = this.ort.tensor('float32', imageTensor(image, [0, 0, image.width, image.height], size.width, size.height, true), [1, 3, size.height, size.width]);
        let outputs: Record<string, OrtTensor> = {};
        let boxes;
        try {
          outputs = await detector.run({ [detector.inputNames[0]!]: input });
          checkAbort(signal);
          boxes = detectBoxes(output(outputs, detector.outputNames[0]), image.width, image.height, this.lineMerge);
        } finally { dispose([input, ...Object.values(outputs)]); }
        detectionMs += performance.now() - detectionStart;
        for (const box of boxes) {
          checkAbort(signal);
          const recognitionStart = performance.now();
          const crop = cropBox(box, image.width, image.height), resized = lineSize(crop, this.config);
          const tensor = this.ort.tensor('float32', imageTensor(image, crop, resized.width, resized.height), [1, 3, resized.height, resized.width]);
          const line = await recognizeLine(this.ort, encoder, decoder, tensor, this.config, signal);
          checkAbort(signal);
          lines.push({ ...line, box: normalizedBox(crop, image) });
          const elapsed = performance.now() - recognitionStart;
          lineMs.push(elapsed); recognitionMs += elapsed;
        }
      }
      return { lines, usage: { engine: this.engine, passes: 1, latencyMs: performance.now() - start, lineCount: lines.length, detectionMs, recognitionMs, lineMs } };
    } catch (error) { checkAbort(signal); if (error instanceof OcrError) throw error; throw new OcrError('read_failed'); }
    finally { this.busy = false; }
  }
  /** Recognize one CV-supplied line crop without invoking the text detector. */
  async readCrop(image: PreparedImage, signal?: AbortSignal): Promise<{ text: string; probability: number }[]> {
    checkAbort(signal); validateImage(image);
    if (this.busy) throw new OcrError('busy');
    if (this.closed) throw new OcrError('read_failed');
    this.busy = true;
    try {
      const box: [number, number, number, number] = [0, 0, image.width, image.height], size = lineSize(box, this.config);
      const input = this.ort.tensor('float32', imageTensor(image, box, size.width, size.height), [1, 3, size.height, size.width]);
      let candidates: { text: string; probability: number }[] = [];
      await recognizeLine(this.ort, this.sessions[1], this.sessions[2], input, this.config, signal, values => { candidates = values; });
      return candidates;
    } finally { this.busy = false; }
  }
  async close(): Promise<void> {
    if (this.busy) throw new OcrError('busy');
    if (this.closed) return;
    this.closed = true;
    const results = await Promise.allSettled(this.sessions.map((session) => session.release()));
    if (results.some((result) => result.status === 'rejected')) throw new OcrError('read_failed');
  }
}
