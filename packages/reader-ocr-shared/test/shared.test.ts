import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { VietOcrReader, missingVietnameseChars, unsupportedSymbols, parseVietOcrConfig, mergeReadingLines, detectBoxes, cropBox, detectorSize, imageTensor, lineSize } from '../src/index.js';
import type { Box, OrtLike, OrtSession, OrtTensor, VietOcrConfig } from '../src/index.js';
import type { PreparedImage } from '@mathtwin/reader';
import { rankedLogProbs } from '../src/recognition.js';

const config: VietOcrConfig = { vocab: 'ốẹAB ', offset: 4, sos: 1, eos: 2, image_height: 32, image_min_width: 32, image_max_width: 512, max_seq_length: 8 };
const image: PreparedImage = { pixels: new Uint8ClampedArray(100 * 100 * 4).fill(255), width: 100, height: 100 };
function tensor(data: Float32Array | BigInt64Array, dims: readonly number[]): OrtTensor {
  return { type: data instanceof Float32Array ? 'float32' : 'int64', data, dims, dispose: vi.fn() };
}
function probabilities(values: Record<number, number>, c = config): OrtTensor {
  const data = new Float32Array(Array.from(c.vocab).length + c.offset).fill(-Infinity);
  for (const [id, probability] of Object.entries(values)) data[Number(id)] = Math.log(probability);
  return tensor(data, [1, data.length]);
}
function mapBoxes(boxes: Box[]): OrtTensor {
  const data = new Float32Array(100 * 100);
  for (const [left, top, right, bottom] of boxes) for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) data[y * 100 + x] = 0.9;
  return tensor(data, [1, 1, 100, 100]);
}
function fakeRuntime(options: { missing?: boolean; abort?: AbortController; failCreate?: number; limitLine?: number; invalidTokenLine?: number; failLine?: number; badShapeLine?: number; badHiddenShapeLine?: number; missingHiddenLine?: number; map?: OrtTensor } = {}) {
  const allocated: OrtTensor[] = [];
  const allocate = (value: OrtTensor): OrtTensor => { allocated.push(value); return value; };
  let line = 0, step = 0;
  const session = (inputNames: string[], outputNames: string[], run: OrtSession['run']): OrtSession => ({ inputNames, outputNames, run: vi.fn(run), release: vi.fn(async () => {}) });
  const sessions = [
    session(['x'], ['sigmoid_0.tmp_0'], async () => ({ 'sigmoid_0.tmp_0': allocate(options.map ?? mapBoxes([[10, 10, 70, 18], [10, 60, 70, 68]])) })),
    session(['image'], ['hidden', 'encoder_outputs'], async (feeds) => {
      expect(feeds.image?.dims[2]).toBe(32); expect(feeds.image?.dims[3]).toBeGreaterThanOrEqual(32);
      step = 0; line++;
      return { hidden: allocate(tensor(Float32Array.of(0), [1, 1, 1])), encoder_outputs: allocate(tensor(Float32Array.of(0), [1, 1, 1])) };
    }),
    session(['tgt', 'hidden', 'encoder_outputs'], ['log_probs', 'hidden_out'], async (feeds) => {
      expect(feeds.tgt?.type).toBe('int64');
      if (line === options.failLine) throw new Error('ORT session failed.');
      const logp = options.invalidTokenLine === line && step === 1 ? probabilities({ 0: 0.9, 4: 0.1 })
        : options.limitLine === line ? probabilities({ 4: 0.9, 5: 0.1 }) : step === 0 ? probabilities({ 4: 0.9, 6: 0.07, 7: 0.03 })
        : step === 1 ? probabilities({ 5: 0.6, 6: 0.25, 7: 0.15 }) : probabilities({ 2: 0.95, 8: 0.05 });
      if (step++ === 2 && line === 1) options.abort?.abort();
      return { ...(options.missing ? {} : { log_probs: allocate(options.badShapeLine === line ? tensor(logp.data as Float32Array, [Array.from(config.vocab).length + config.offset, 1]) : logp) }),
        ...(options.missingHiddenLine === line ? {} : { hidden_out: allocate(options.badHiddenShapeLine === line ? tensor(Float32Array.of(step, step), [1, 2, 1]) : tensor(Float32Array.of(step), [1, 1, 1])) }) };
    }),
  ];
  let createIndex = 0;
  const ort: OrtLike = {
    createSession: vi.fn(async () => { if (createIndex === options.failCreate) throw new Error('session failed'); return sessions[createIndex++]!; }),
    tensor: (_type, data, dims) => allocate(tensor(data, dims)),
  };
  return { ort, sessions, allocated };
}
const models = { detector: 'det.onnx', encoder: 'vietocr_encoder.onnx', decoder: 'vietocr_decoder.onnx' };

it('greedy uses true log-probs: NFC text, minimum char confidence and two alternatives at weakest step', async () => {
  const { ort, allocated, sessions } = fakeRuntime();
  const reader = await VietOcrReader.create(ort, models, config);
  const result = await reader.readLines([image]);
  expect(result.lines).toHaveLength(2);
  for (const line of result.lines) {
    expect(line.text).toBe('ốẹ'); expect(line.conf).toBeCloseTo(0.6); expect(line.charConf[0]).toBeCloseTo(0.9);
    expect(line.charConf[1]).toBeCloseTo(0.6); expect(line.logProbs[1]).toBeCloseTo(Math.log(0.6));
    expect(line.alternatives).toEqual(['ốA', 'ốB']);
    expect(line.box?.every((n) => n >= 0 && n <= 1000)).toBe(true);
  }
  expect(result.lines[0]!.box![1]).toBeLessThan(result.lines[1]!.box![1]);
  expect(result.usage).toMatchObject({ engine: 'offline:vietocr-onnx', passes: 1, lineCount: 2 });
  expect(result.usage.detectionMs).toBeGreaterThanOrEqual(0); expect(result.usage.recognitionMs).toBeGreaterThanOrEqual(0);
  for (const value of allocated) expect(value.dispose).toHaveBeenCalledTimes(1);
  await reader.close(); await reader.close();
  for (const s of sessions) expect(s.release).toHaveBeenCalledTimes(1);
});
it('composes decoder characters to NFC and keeps one confidence per output code point', async () => {
  const fake = fakeRuntime();
  const reader = await VietOcrReader.create(fake.ort, models, { ...config, vocab: 'o\u0302AB ' });
  const result = await reader.readLines([image]);
  expect(result.lines[0]!.text).toBe('ô');
  expect(result.lines[0]!.charConf).toHaveLength(1);
  expect(result.lines[0]!.charConf[0]).toBeCloseTo(0.6);
  await reader.close();
});
it('missing log-prob output is an error, never a confident line', async () => {
  const fake = fakeRuntime({ missing: true }); const reader = await VietOcrReader.create(fake.ort, models, config);
  await expect(reader.readLines([image])).rejects.toMatchObject({ code: 'missing_log_probs' });
  for (const value of fake.allocated) expect(value.dispose).toHaveBeenCalledTimes(1);
  await reader.close();
});
it('rejects raw logits, non-normalized values, NaN and wrong vocabulary shape', () => {
  const count = Array.from(config.vocab).length + config.offset;
  for (const data of [new Float32Array(count).fill(1), new Float32Array(count).fill(-1), new Float32Array(count).fill(NaN), Float32Array.of(0)]) {
    expect(() => rankedLogProbs(tensor(data, [1, data.length]), config)).toThrow();
  }
  expect(rankedLogProbs(probabilities({ 4: 0.5, 5: 0.5 }), config).slice(0, 2).map((entry) => entry.id)).toEqual([4, 5]);
});
it('a blank page returns no invented text and no recognition run', async () => {
  const fake = fakeRuntime({ map: mapBoxes([]) }), reader = await VietOcrReader.create(fake.ort, models, config);
  const result = await reader.readLines([image]);
  expect(result.lines).toEqual([]); expect(result.usage.lineCount).toBe(0);
  expect(fake.sessions[1]!.run).not.toHaveBeenCalled(); await reader.close();
});
it('honors cancellation between lines, discards partial text and releases tensors', async () => {
  const controller = new AbortController(), fake = fakeRuntime({ abort: controller });
  const reader = await VietOcrReader.create(fake.ort, models, config);
  await expect(reader.readLines([image], controller.signal)).rejects.toMatchObject({ code: 'aborted' });
  expect(fake.sessions[1]!.run).toHaveBeenCalledTimes(1);
  for (const value of fake.allocated) expect(value.dispose).toHaveBeenCalledTimes(1);
  await reader.close();
});
it('already aborted initialization creates no sessions; partial initialization failure releases sessions', async () => {
  const controller = new AbortController(); controller.abort(); const fake = fakeRuntime();
  await expect(VietOcrReader.create(fake.ort, models, config, controller.signal)).rejects.toMatchObject({ code: 'aborted' });
  expect(fake.ort.createSession).not.toHaveBeenCalled();
  const failed = fakeRuntime({ failCreate: 2 });
  await expect(VietOcrReader.create(failed.ort, models, config)).rejects.toThrow('session failed');
  expect(failed.sessions[0]!.release).toHaveBeenCalledOnce(); expect(failed.sessions[1]!.release).toHaveBeenCalledOnce();
});
it('rejects graph mode explicitly before running inference', async () => {
  const fake = fakeRuntime(), reader = await VietOcrReader.create(fake.ort, models, config);
  await expect(reader.read([image], 'edges')).rejects.toMatchObject({ code: 'unsupported_mode' });
  expect(fake.sessions[0]!.run).not.toHaveBeenCalled(); await reader.close();
});
it('a decoder without EOS on line 2/3 preserves all three lines and flags only the truncated prefix', async () => {
  const fake = fakeRuntime({ limitLine: 2, map: mapBoxes([[10, 10, 70, 16], [10, 45, 70, 51], [10, 80, 70, 86]]) });
  const reader = await VietOcrReader.create(fake.ort, models, config);
  const result = await reader.readLines([image]);
  expect(result.lines).toHaveLength(3);
  expect(result.lines[0]).toMatchObject({ text: 'ốẹ' }); expect(result.lines[0]!.truncated).toBeUndefined();
  expect(result.lines[1]).toMatchObject({ text: 'ố'.repeat(config.max_seq_length), conf: 0, truncated: true, truncationReason: 'decode_limit' });
  expect(result.lines[2]).toMatchObject({ text: 'ốẹ' }); expect(result.lines[2]!.truncated).toBeUndefined();
  expect(result.usage.lineCount).toBe(3);
  for (const value of fake.allocated) expect(value.dispose).toHaveBeenCalledTimes(1);
  await reader.close();
});
it('an invalid decoded special token keeps the prefix at conf 0 and continues with the next line', async () => {
  const fake = fakeRuntime({ invalidTokenLine: 1 }), reader = await VietOcrReader.create(fake.ort, models, config);
  const result = await reader.readLines([image]);
  expect(result.lines).toHaveLength(2);
  expect(result.lines[0]).toMatchObject({ text: 'ố', conf: 0, truncated: true, truncationReason: 'invalid_output' });
  expect(result.lines[1]).toMatchObject({ text: 'ốẹ' });
  for (const value of fake.allocated) expect(value.dispose).toHaveBeenCalledTimes(1);
  await reader.close();
});
it.each([{ failLine: 1, code: 'read_failed' }, { badShapeLine: 1, code: 'missing_log_probs' }, { badHiddenShapeLine: 1, code: 'invalid_output' }, { missingHiddenLine: 1, code: 'invalid_output' }])('real session/tensor errors remain fatal: $code', async ({ code, ...options }) => {
  const fake = fakeRuntime(options), reader = await VietOcrReader.create(fake.ort, models, config);
  await expect(reader.readLines([image])).rejects.toMatchObject({ code });
  for (const value of fake.allocated) expect(value.dispose).toHaveBeenCalledTimes(1);
  await reader.close();
});
it('rejects concurrent reads/close while active and reads after close', async () => {
  const fake = fakeRuntime(), reader = await VietOcrReader.create(fake.ort, models, config);
  const running = reader.readLines([image]);
  await expect(reader.readLines([image])).rejects.toMatchObject({ code: 'busy' });
  await expect(reader.close()).rejects.toMatchObject({ code: 'busy' });
  await running; await reader.close(); await expect(reader.readLines([image])).rejects.toMatchObject({ code: 'read_failed' });
});
it('groups rows before ordering their fragments left to right', () => {
  expect(mergeReadingLines([[60, 40, 90, 50], [50, 10, 80, 22], [5, 16, 30, 26], [10, 40, 50, 49]]))
    .toEqual([[5, 10, 80, 26], [10, 40, 90, 50]]);
  expect(mergeReadingLines([[80, 9, 100, 19], [0, 10, 20, 20]])).toEqual([[0, 10, 20, 20], [80, 9, 100, 19]]);
});
it('three lines with 10px gaps remain separate despite overlapping after unclip', () => {
  expect(detectBoxes(mapBoxes([[10, 10, 70, 20], [10, 30, 70, 40], [10, 50, 70, 60]]), 100, 100)).toHaveLength(3);
  const expanded: Box[] = [[0, 0, 100, 30], [0, 21, 100, 51], [0, 42, 100, 72]];
  expect(mergeReadingLines(expanded)).toEqual(expanded); // 30% overlap is below 50%.
  expect(mergeReadingLines(expanded, { referenceBoxes: [[10, 10, 90, 20], [10, 30, 90, 40], [10, 50, 90, 60]] })).toEqual(expanded);
});
it('same-row fragments merge at 1x height, remain separate at 6x, and allow a configured gap', () => {
  expect(mergeReadingLines([[0, 10, 20, 20], [30, 10, 50, 20]])).toEqual([[0, 10, 50, 20]]);
  const far: Box[] = [[0, 10, 20, 20], [80, 10, 100, 20]];
  expect(mergeReadingLines(far)).toEqual(far);
  expect(mergeReadingLines(far, { maxHorizontalGapRatio: 6 })).toEqual([[0, 10, 100, 20]]);
  expect(() => mergeReadingLines(far, { maxHorizontalGapRatio: NaN })).toThrow();
});
it('row membership never bridges through an expanded or accumulated union', () => {
  expect(mergeReadingLines([[0, 0, 10, 10], [11, 5, 21, 15], [22, 10, 32, 20]])).toEqual([[0, 0, 21, 15], [22, 10, 32, 20]]);
});
it('crop keeps upper marks of ố and lower dot of ẹ including when close to page boundary', () => {
  const crop = cropBox([10, 20, 80, 40], 100, 100);
  // Body at y=20..40; explicit accent pixels outside the detector body.
  const accentPixels = [{ char: 'ố', y: 18 }, { char: 'ẹ', y: 42 }];
  for (const pixel of accentPixels) expect(crop[1] <= pixel.y && pixel.y < crop[3], pixel.char).toBe(true);
  expect(cropBox([0, 0, 100, 100], 100, 100)).toEqual([0, 0, 100, 100]);
  const marked = { ...image, pixels: image.pixels.slice() };
  for (const { y } of accentPixels) for (let c = 0; c < 3; c++) marked.pixels[(y * 100 + 25) * 4 + c] = 0;
  const pixels = imageTensor(marked, crop, crop[2] - crop[0], crop[3] - crop[1]);
  for (const { y } of accentPixels) expect(pixels[(y - crop[1]) * (crop[2] - crop[0]) + 25 - crop[0]]).toBe(0);
});
it('DB thresholds, unclip and minimum size reject noise and map coordinates back to image pixels', () => {
  const map = mapBoxes([[10, 10, 70, 18], [5, 60, 6, 61]]);
  const boxes = detectBoxes(map, 200, 300); expect(boxes).toHaveLength(1);
  expect(boxes[0]![0]).toBeLessThan(20); expect(boxes[0]![2]).toBeGreaterThan(140);
  const low = tensor(new Float32Array(10000).fill(0.4), [1, 1, 100, 100]);
  expect(detectBoxes(low, 100, 100)).toEqual([]);
  expect(() => detectBoxes(tensor(Float32Array.of(NaN), [1, 1, 1, 1]), 100, 100)).toThrow();
});
it('scores a thin 45-degree component on its foreground instead of its background rectangle', () => {
  const data = new Float32Array(100 * 100);
  for (let i = 10; i < 40; i++) data[i * 100 + i] = 0.9;
  expect(detectBoxes(tensor(data, [1, 1, 100, 100]), 100, 100)).toHaveLength(1);
});
it('RapidOCR preprocessing is BGR [-1,1], recognition is RGB [0,1], and transparency composites white', () => {
  const red = { width: 1, height: 1, pixels: Uint8ClampedArray.of(255, 0, 0, 255) };
  expect([...imageTensor(red, [0, 0, 1, 1], 1, 1, true)]).toEqual([-1, -1, 1]);
  expect([...imageTensor(red, [0, 0, 1, 1], 1, 1)]).toEqual([1, 0, 0]);
  expect([...imageTensor({ ...red, pixels: Uint8ClampedArray.of(0, 0, 0, 0) }, [0, 0, 1, 1], 1, 1)]).toEqual([1, 1, 1]);
  expect(detectorSize(image)).toEqual({ width: 736, height: 736 });
  expect(lineSize([0, 0, 100, 32], config)).toEqual({ width: 100, height: 32 });
  expect(lineSize([0, 0, 10000, 10], config).width).toBe(512);
});
it('actual 712-byte vocab is pinned by hash and contains every Vietnamese letter; missing ự is reported', async () => {
  const bytes = await readFile(new URL('../../../tools/models/config/vietocr.json', import.meta.url));
  expect(bytes.length).toBe(712); expect(createHash('sha256').update(bytes).digest('hex')).toBe('518345b7672fd36e534fb8ffcf6f6599c687793541259170834789fe2f7dd6e6');
  const actual = parseVietOcrConfig(JSON.parse(bytes.toString('utf8')) as unknown);
  expect(missingVietnameseChars(actual.vocab)).toEqual([]);
  expect(missingVietnameseChars(actual.vocab.replace('ự', ''))).toEqual(['ự']);
  expect(missingVietnameseChars(actual.vocab.normalize('NFD'))).toEqual([]);
  expect(unsupportedSymbols(actual.vocab)).toEqual(['→', '×', '∞', '≥', '≤', '≠']);
  expect(unsupportedSymbols([...actual.vocab, '→', '∞'])).toEqual(['×', '≥', '≤', '≠']);
});
it('direct C glyph crops bypass detection and retain actual alternate probabilities', async () => {
  const fake=fakeRuntime(), reader=await VietOcrReader.create(fake.ort,models,config);
  const candidates=await reader.readCrop(image);
  expect(fake.sessions[0]!.run).not.toHaveBeenCalled();expect(candidates).toHaveLength(3);
  expect(candidates[0]!.probability).toBeCloseTo(.6);expect(candidates[1]!.probability).toBeCloseTo(.25);expect(candidates[2]!.probability).toBeCloseTo(.15);
  for(const value of fake.allocated)expect(value.dispose).toHaveBeenCalledTimes(1);
  await reader.close();await expect(reader.readCrop(image)).rejects.toMatchObject({code:'read_failed'});
});
it('direct C glyph crops fail closed without log probabilities', async () => {
  const fake=fakeRuntime({missing:true}),reader=await VietOcrReader.create(fake.ort,models,config);
  await expect(reader.readCrop(image)).rejects.toMatchObject({code:'missing_log_probs'});await reader.close();
});
