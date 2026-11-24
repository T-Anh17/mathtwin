import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import type { PreparedImage, TextReader } from '@mathtwin/reader';
import type { ProblemSpec } from '@mathtwin/core';
import type { WorkLine } from '@mathtwin/work';
import { vocabularyOf } from '@mathtwin/work';
import { readWorkPages, processWorkPage, readWorkRegion, ignoredWorkLines } from '../src/flow/work-reading.js';
import type { WorkPageRead } from '../src/flow/work-reading.js';
import { createSession, sessionReducer as reduce } from '../src/flow/sessionReducer.js';
import { createMemoryData, createMemoryStorage } from '../src/storage/memory.js';
import { WorkScreen, WorkQuestionScreen } from '../src/WorkScreen.js';
import { WorkFlowScreen, RegionPicker, WorkPageFailure } from '../src/WorkFlowScreen.js';
import { workVi } from '../src/work.vi.js';

const spec: ProblemSpec = { graph: { directed: false, vertices: [{ id: 'v3', label: 'A' }, { id: 'v4', label: 'I' }], edges: [{ id: 'e1', u: 'v3', v: 'v4', name: 'a' }] }, task: { type: 'elements' }, questionFormat: 'tu_luan' };
const img: PreparedImage = { width: 100, height: 100, pixels: new Uint8ClampedArray(40000).fill(255) };
const line = (text = 'Đồ thị có 2 đỉnh.', conf = 1): WorkLine => ({ text, conf, index: 0, page: 0, alternatives: [], region: 'solution', regionConf: 1, box: [50, 500, 950, 600] });
const photo = (id: string, page = 0) => ({ id, page, width: 100, height: 100 });
const fresh = () => reduce(createSession('w', '2026-11-18T00:00:00Z'), { type: 'manual_spec', spec });
const noop = () => {};

it('offers a one-tap proposal without applying it until confirmation; no usable box requires drawing', async () => {
  const raw = [{ ...line(), regionConf: .2 }];
  const reading = processWorkPage(img, { page: 0, raw, lines: [], ms: 0, needsRegion: true });
  expect(reading.needsRegion).toBe(true); expect(reading.suggestedRegion).toEqual([26, 476, 974, 624]);
  const html = renderToStaticMarkup(createElement(RegionPicker, { photo: { image: 'blob:local', width: 100, height: 100 },
    suggestedRegion: reading.suggestedRegion!, busy: false, onDone: noop }));
  expect(html).toContain(workVi.confirmRegion); expect(html).toContain('<rect'); expect(html).not.toContain('disabled');
  const { box: _box, ...withoutBox } = raw[0]!;
  expect(processWorkPage(img, { ...reading, raw: [withoutBox] }).suggestedRegion).toBeUndefined();
  const confirmed = processWorkPage(img, reading, reading.suggestedRegion!);
  expect(confirmed.needsRegion).toBe(false); expect(confirmed.lines[0]?.regionConf).toBe(1);
});

it('restores a near-region excluded error, regrades, clears acknowledgment, and persists the correction', async () => {
  const raw: WorkLine[] = [line(), { ...line('Đồ thị có 3 đỉnh.'), index: 1, box: [50, 630, 950, 670], region: 'question' },
    { ...line('Đề'), index: 2, box: [50, 0, 950, 60], region: 'question' }];
  let s = reduce(fresh(), { type: 'work_photos', photos: [photo('a')] });
  s = reduce(s, { type: 'work_page', reading: { page: 0, raw, lines: raw, ms: 1, needsRegion: false, inspected: true, region: [0, 450, 1000, 620] } });
  s = reduce(s, { type: 'work_read', lines: [], ms: 0 });
  expect(s.workGrade?.questions[0]?.kind).toBe('region');
  s = reduce(s, { type: 'work_answer', answer: { line: 1, region: 'question' } });
  s = reduce(s, { type: 'review_ack' }); expect(s.workGrade?.result.verdict).toBe('DUNG');
  const ignored = ignoredWorkLines(s.workLines, s.workPages!); expect(ignored.map((l) => l.index)).toEqual([1]);
  const html = renderToStaticMarkup(createElement(WorkScreen, { spec, initialLines: s.workLines, pages: [], grade: s.workGrade!,
    ignoredLines: ignored, onRestore: noop, onAnswers: noop, onBack: noop }));
  expect(html).toContain(`<details class="card"><summary>${workVi.ignored}`); expect(html).toContain(workVi.restore);
  s = reduce(s, { type: 'work_restore', line: 1 });
  expect(s.reviewAcknowledged).toBe(false); expect(s.workGrade?.result.verdict).toBe('SAI');
  const storage = createMemoryStorage(); await storage.sessions.put(s); const reopened = (await storage.sessions.get(s.id))!;
  expect(reopened.workPages?.[0]?.lines[1]?.region).toBe('solution'); expect(reopened.workGrade?.result.verdict).toBe('SAI');
});

it('checkpoints a failed page and allows typing just that page without losing earlier or later pages', async () => {
  let s = reduce(fresh(), { type: 'work_photos', photos: [photo('a'), photo('b', 1), photo('c', 2)] });
  let calls = 0;
  const reader: TextReader = { engine: 'fake', readLines: async () => {
    if (++calls === 2) throw new Error('read_failed'); return { lines: [line()], usage: { engine: 'fake', passes: 1, latencyMs: 1 } };
  } };
  const checkpoint = async (reading: WorkPageRead) => { s = reduce(s, { type: 'work_page', reading }); };
  const options = { count: 3, reader, vocab: vocabularyOf(spec), signal: new AbortController().signal, load: async () => img, progress: noop, checkpoint };
  await expect(readWorkPages(options)).rejects.toThrow('read_failed');
  expect(s.workPages?.[1]?.failed).toBe(true);
  const failedSession = structuredClone(s);
  const html = renderToStaticMarkup(createElement(WorkPageFailure, { page: 1, busy: false, onRetry: noop, onManual: noop }));
  expect(html).toContain(workVi.retryPage); expect(html).toContain(workVi.manualPage); expect(html).toContain(workVi.failedPage(1));
  s = reduce(s, { type: 'work_manual_page', page: 1, lines: ['Đồ thị có 1 cạnh.'] });
  expect(s.workPages?.[0]).toEqual(failedSession.workPages?.[0]); expect(s.stage).toBe('work_reading');
  await readWorkPages({ ...options, saved: s.workPages! }); expect(calls).toBe(3);
  s = reduce(s, { type: 'work_read', lines: [], ms: 0 }); expect(s.workLines.map((l) => l.text)).toEqual(['Đồ thị có 2 đỉnh.', 'Đồ thị có 1 cạnh.', 'Đồ thị có 2 đỉnh.']);
  expect(s.workPages?.[1]?.failed).toBeUndefined(); expect(s.stage).toBe('work_review');
  // A separate retry branch skips page 0 and rereads the failed page, then page 2.
  s = failedSession; await readWorkPages({ ...options, saved: s.workPages! }); expect(calls).toBe(5);
  expect(s.workPages?.every((p) => p.inspected && !p.failed)).toBe(true);
});

it('uses complete geometry without another crop OCR', async () => {
  const reader: TextReader = { engine: 'fake', readLines: async () => { throw new Error('unexpected OCR'); } };
  const reading = await readWorkRegion(img, { page: 0, raw: [line()], lines: [], ms: 1, needsRegion: true },
    [0, 450, 1000, 1000], reader, vocabularyOf(spec), new AbortController().signal);
  expect(reading.needsRegion).toBe(false); expect(reading.missingLineCheckUnavailable).toBeFalsy();
});

it('keeps a previously located error inside the confirmed region when crop OCR omits it', async () => {
  const { box: _box, ...withoutBox } = line();
  const error = { ...line('Đồ thị có 3 đỉnh.'), region: 'figure' as const, index: 1, box: [50, 650, 950, 700] as [number, number, number, number] };
  const reader: TextReader = { engine: 'fake', readLines: async () => ({ lines: [withoutBox], usage: { engine: 'fake', passes: 1, latencyMs: 1 } }) };
  const reading = await readWorkRegion(img, { page: 0, raw: [withoutBox, error], lines: [], ms: 1, needsRegion: true },
    [0, 400, 1000, 1000], reader, vocabularyOf(spec), new AbortController().signal);
  expect(reading.lines.find((l) => l.text === error.text)?.region).toBe('solution');
  expect(new Set(reading.lines.map((l) => l.index)).size).toBe(reading.lines.length);
  expect(reading.missingLineCheckUnavailable).toBe(true);
});

it('passes continuation context for subsequent work pages and their crops', async () => {
  const contexts: (boolean | undefined)[] = [];
  const reader: TextReader = { engine: 'fake', readLines: async (_images, _signal, options) => {
    contexts.push(options?.continuation);
    return { lines: [line()], usage: { engine: 'fake', passes: 1, latencyMs: 1 } };
  } };
  const signal = new AbortController().signal, vocab = vocabularyOf(spec);
  await readWorkPages({ count: 2, reader, signal, vocab, load: async () => img, progress: () => {}, checkpoint: async () => {} });
  const { box: _box, ...withoutBox } = line();
  await readWorkRegion(img, { page: 1, raw: [withoutBox], lines: [], ms: 1, needsRegion: true },
    [0, 400, 1000, 1000], reader, vocab, signal);
  expect(contexts).toEqual([false, true, true]);
});

it.each(['partial', 'none', 'invalid'] as const)('keeps %s crop geometry usable, persists warning, and gates both verdicts', async (mode) => {
  for (const [text, verdict] of [['Đồ thị có 2 đỉnh.', 'DUNG'], ['Đồ thị có 3 đỉnh.', 'SAI']] as const) {
    const withBox = line(text), { box: _box, ...withoutBox } = line('Đồ thị có 1 cạnh.');
    const cropLines = mode === 'partial' ? [withBox, { ...withoutBox, index: 1 }] : mode === 'invalid'
      ? [{ ...withBox, box: [0, 0, 1000, 1000] as [number, number, number, number] }]
      : [{ ...withoutBox, text }];
    let calls = 0;
    const reader: TextReader = { engine: 'fake', readLines: async () => {
      calls++; return { lines: cropLines, usage: { engine: 'fake', passes: 1, latencyMs: 1 } };
    } };
    const reading = await readWorkRegion(img, { page: 0, raw: [withoutBox], lines: [], ms: 1, needsRegion: true },
      [0, 400, 1000, 1000], reader, vocabularyOf(spec), new AbortController().signal);
    expect(calls).toBe(1); expect(reading.needsRegion).toBe(false); expect(reading.missingLineCheckUnavailable).toBe(true);
    expect(reading.lines.map((l) => l.text)).toEqual(cropLines.map((l) => l.text));
    let s = reduce(fresh(), { type: 'work_photos', photos: [photo('a')] });
    s = reduce(s, { type: 'work_page', reading }); s = reduce(s, { type: 'work_read', lines: [], ms: 0 });
    // A line without geometry also needs the existing cancellation confirmation.
    if (s.workGrade?.questions.length) expect(reduce(s, { type: 'review_ack' }).reviewAcknowledged).toBe(false);
    for (let i = 0; i < 4 && s.workGrade?.questions.length; i++) {
      const q = s.workGrade.questions[0]!; expect(q.kind).toBe('struck');
      s = reduce(s, { type: 'work_answer', answer: { line: q.lines[0]!, struck: false } });
    }
    const storage = createMemoryStorage(); await storage.sessions.put(s); s = (await storage.sessions.get(s.id))!;
    expect(s.workGrade?.result.verdict).toBe('CAN_XAC_NHAN'); expect(s.stage).toBe('work_review');
    const html = renderToStaticMarkup(createElement(WorkScreen, { spec, initialLines: s.workLines, grade: s.workGrade!,
      pages: [{ image: 'data:image/png;base64,AA==', width: 100, height: 100 }], uncheckedPages: s.workPages ?? [],
      onAnswers: noop, onAcknowledge: noop, onBack: noop }));
    expect(html).toContain(workVi.missingLineCheckUnavailable); expect(html).toContain('data:image/png;base64,AA=='); expect(html).toContain(workVi.ack);
    s = reduce(s, { type: 'review_ack' }); expect(s.workGrade?.result.verdict).toBe(verdict);
    s = reduce(s, { type: 'work_answer', answer: { line: 0, text } });
    expect(s.reviewAcknowledged).toBe(false); expect(s.workGrade?.result.verdict).toBe('CAN_XAC_NHAN');
  }
});

it('rereads a user-selected crop when original OCR has no geometry, mapping boxes back to the page', async () => {
  let dimensions: number[] = [];
  const reader: TextReader = { engine: 'fake:B', readLines: async ([image]) => {
    dimensions = [image!.width, image!.height];
    return { lines: [{ ...line(), box: [100, 100, 900, 900] }], usage: { engine: 'fake:B', passes: 1, latencyMs: 1 } };
  } };
  const raw = [{ text: 'Đồ thị có 2 đỉnh.', conf: 1, alternatives: [], index: 0, page: 0 }];
  const reading = await readWorkRegion(img, { page: 0, raw, lines: raw, ms: 1, needsRegion: true }, [100, 500, 900, 900], reader, vocabularyOf(spec), new AbortController().signal);
  expect(dimensions).toEqual([80, 40]); expect(reading.raw[0]?.box).toEqual([180, 540, 820, 860]); expect(reading.needsRegion).toBe(false);
});

it('checkpoints each page, survives server failure and restart, skips saved OCR, blocks unresolved regions', async () => {
  const data = createMemoryData(), storage = createMemoryStorage(data);
  let s = reduce(fresh(), { type: 'work_photos', photos: [photo('p0'), photo('p1', 1)] });
  let calls = 0;
  const reader: TextReader = { engine: 'fake:B', readLines: async () => { calls++; if (calls === 2) throw new Error('server_exit'); return { lines: [line()], usage: { engine: 'fake:B', passes: 1, latencyMs: 2 } }; } };
  const checkpoint = async (reading: WorkPageRead) => { s = reduce(s, { type: 'work_page', reading }); await storage.sessions.put(s); };
  await expect(readWorkPages({ count: 2, reader, vocab: vocabularyOf(spec), signal: new AbortController().signal, load: async () => img, progress: noop, checkpoint })).rejects.toThrow('server_exit');
  s = (await createMemoryStorage(data).sessions.get(s.id))!;
  expect(s.stage).toBe('work_reading'); expect(s.workLines).toHaveLength(1); expect(s.workPages?.[0]?.inspected).toBe(true);
  calls = 2;
  await readWorkPages({ count: 2, reader, vocab: vocabularyOf(spec), saved: s.workPages!, signal: new AbortController().signal, load: async () => img, progress: noop, checkpoint });
  expect(calls).toBe(3); expect(s.workLines).toHaveLength(2);
  s = reduce(s, { type: 'work_read', lines: [], ms: 0 }); expect(s.stage).toBe('work_review');
  const unclear = processWorkPage(img, { page: 0, raw: [{ ...line(), regionConf: .2 }], lines: [], ms: 2, needsRegion: true });
  expect(unclear.needsRegion).toBe(true);
  let blocked = reduce(fresh(), { type: 'work_photos', photos: [photo('p0')] });
  blocked = reduce(blocked, { type: 'work_page', reading: unclear });
  expect(reduce(blocked, { type: 'work_read', lines: [], ms: 0 }).workGrade).toBeUndefined();
  const resolved = processWorkPage(img, unclear, [0, 450, 1000, 1000]); expect(resolved.needsRegion).toBe(false);
  blocked = reduce(blocked, { type: 'work_page', reading: resolved });
  expect(reduce(blocked, { type: 'work_read', lines: [], ms: 0 }).stage).toBe('work_review');
});

it('adds, removes and reorders photos while retaining checkpoints and user corrections with the photo', () => {
  let s = reduce(fresh(), { type: 'work_capture_photos', photos: [photo('a'), photo('b', 1)] });
  s = reduce(s, { type: 'work_photos', photos: s.workPhotos });
  for (let page = 0; page < 2; page++) s = reduce(s, { type: 'work_page', reading: { page, raw: [line()], lines: [line()], ms: 1, needsRegion: false, inspected: true } });
  s = reduce(s, { type: 'work_read', lines: [], ms: 0 });
  s = reduce(s, { type: 'work_answer', answer: { line: 0, text: 'Đồ thị có 1 cạnh.' } });
  s = reduce(s, { type: 'work_capture_photos', photos: [photo('b'), photo('a', 1), photo('c', 2)] });
  expect(s.workLines.map((l) => l.text)).toEqual(['Đồ thị có 2 đỉnh.', 'Đồ thị có 1 cạnh.']);
  expect(s.workPhotos.map((p) => p.page)).toEqual([0, 1, 2]); expect(s.workGrade).toBeUndefined();
  s = reduce(s, { type: 'work_capture_photos', photos: [photo('a')] });
  expect(s.workLines).toHaveLength(1); expect(s.workLines[0]?.text).toBe('Đồ thị có 1 cạnh.'); expect(s.workLines[0]?.page).toBe(0);
});

it('asks sequentially through reading, unknown, strike and missing; regrades immediately, and only photo work needs acknowledgment', () => {
  let s = reduce(fresh(), { type: 'work_photos', photos: [photo('a')] });
  const lines: WorkLine[] = [line('Đồ thị có 2 đỉnh.', .2), { ...line('x = ?'), index: 1 },
    { ...line('Đồ thị có 1 cạnh.'), index: 2, strikeScore: .5 }, { ...line(''), index: 3, missing: true, conf: 0 }];
  s = reduce(s, { type: 'work_read', lines, ms: 1 });
  const kinds: string[] = [];
  for (let i = 0; i < 6 && s.workGrade?.questions.length; i++) {
    const q = s.workGrade.questions[0]!; kinds.push(q.reason ?? q.kind);
    const answer = q.reason === 'missing' || q.kind === 'unparsed' ? { line: q.lines[0]!, skip: true as const }
      : q.kind === 'struck' ? { line: q.lines[0]!, struck: false } : { line: q.lines[0]!, text: lines[q.lines[0]!]!.text };
    s = reduce(s, { type: 'work_answer', answer });
  }
  expect(kinds).toEqual(['reading', 'unparsed', 'struck', 'missing']); expect(s.workGrade?.questions).toEqual([]);
  expect(s.workGrade?.result.verdict).toBe('CAN_XAC_NHAN');
  expect(reduce(s, { type: 'review_ack' }).workGrade?.result.verdict).toBe('DUNG');
  const manual = reduce(fresh(), { type: 'manual_work', lines: ['Đồ thị có 2 đỉnh.', 'Đồ thị có 1 cạnh.'] });
  expect(manual.workGrade?.result.verdict).toBe('DUNG'); expect(manual.workSource).toBe('manual');
  const html = renderToStaticMarkup(createElement(WorkFlowScreen, { session: manual, busy: false, onEvent: noop, onBack: noop }));
  expect(html).toContain('>ĐÚNG<'); expect(html).toContain('Xem lời giải chuẩn'); expect(html).not.toContain('dữ liệu mẫu');
});

it('cancellation refuses late results without publishing an OCR checkpoint', async () => {
  const abort = new AbortController(), saved: WorkPageRead[] = [];
  let resolve!: (value: Awaited<ReturnType<TextReader['readLines']>>) => void;
  const reader: TextReader = { engine: 'fake', readLines: () => new Promise((r) => { resolve = r; }) };
  const pending = readWorkPages({ count: 1, reader, vocab: vocabularyOf(spec), signal: abort.signal, load: async () => img, progress: noop, checkpoint: async (p) => { saved.push(p); } });
  for (let i = 0; i < 10 && !resolve; i++) await Promise.resolve();
  abort.abort(new Error('cancelled')); resolve({ lines: [line()], usage: { engine: 'fake', passes: 1, latencyMs: 1 } });
  await expect(pending).rejects.toThrow('cancelled'); expect(saved).toEqual([]);
});

it('renders uncertainty, local issues, accurate question reasons, empty missing input, region controls, and display labels', () => {
  const html = renderToStaticMarkup(createElement(WorkScreen, { spec, initialLines: [line('Đồ thị có 2 đỉnh.', .2), { ...line('x = ?'), index: 1 }], pages: [], onBack: noop }));
  expect(html).toContain(workVi.uncertain); expect(html).toContain('Máy đọc chưa chắc.');
  expect(html.indexOf('Chưa hiểu được nội dung')).toBeGreaterThan(html.indexOf('x = ?'));
  const missing = renderToStaticMarkup(createElement(WorkQuestionScreen, { question: { kind: 'reading', reason: 'missing', page: 0, lines: [0], shownText: 'Có thể sót dòng.', options: [] }, lines: [{ ...line(''), missing: true }], pages: [], onAnswer: noop, onBack: noop }));
  expect(missing).toContain(workVi.nothing); expect(missing).toContain('<textarea></textarea>');
  const labels = renderToStaticMarkup(createElement(WorkScreen, { spec, initialLines: [line()], grade: { result: { verdict: 'SAI', message: 'v3 e1', notes: [] }, questions: [] }, pages: [], onBack: noop }));
  // The current screen is the line review; result messages pass through the same label mapping.
  expect(labels).not.toMatch(/\b(?:e1|v3)\b/);
  const region = renderToStaticMarkup(createElement(RegionPicker, { photo: { image: 'blob:local', width: 100, height: 200 }, busy: false, onDone: noop }));
  expect(region).toContain(`aria-label="${workVi.regionLabel}"`); expect(region).toContain('type="number"');
});

it('Lô 5.3: a crop that excludes a working claim asks "Bài làm / Đề, hình" with the line crop, and the answer regrades', () => {
  const raw: WorkLine[] = [line(), { ...line('Đồ thị có 3 đỉnh.'), index: 1, box: [50, 630, 950, 670] }];
  let s = reduce(fresh(), { type: 'work_photos', photos: [photo('a')] });
  s = reduce(s, { type: 'work_page', reading: processWorkPage(img, { page: 0, raw, lines: raw, ms: 1, needsRegion: true }, [0, 450, 1000, 620]) });
  s = reduce(s, { type: 'work_read', lines: [], ms: 0 });
  // Before the answer the line is not silently dropped: no KHONG_DU_CAN_CU / DUNG, one region question.
  expect(s.workGrade?.result.verdict).toBe('CAN_XAC_NHAN');
  const question = s.workGrade!.questions[0]!;
  expect(question).toMatchObject({ kind: 'region', lines: [1], box: [50, 630, 950, 670], shownText: 'Đồ thị có 3 đỉnh.' });
  const pages = [{ image: 'blob:local', width: 100, height: 100 }];
  const html = renderToStaticMarkup(createElement(WorkQuestionScreen, { question, lines: s.workLines, pages, onAnswer: noop, onBack: noop }));
  expect(html).toContain('class="work-crop"'); expect(html).toContain('viewBox=');
  expect(html).toContain(`>${workVi.solution}</button>`); expect(html).toContain(`>${workVi.questionOrFigure}</button>`);
  expect(html).toContain(workVi.status(question)); expect(html).not.toContain('<textarea');
  const asWork = reduce(s, { type: 'work_answer', answer: { line: 1, region: 'solution' } });
  expect(asWork.workGrade?.result.verdict).toBe('SAI'); expect(asWork.workGrade?.questions).toEqual([]);
  expect(asWork.workPages?.[0]?.lines[1]).toMatchObject({ region: 'solution', regionConfirmed: true });
  const asProblem = reduce(s, { type: 'work_answer', answer: { line: 1, region: 'question' } });
  expect(asProblem.workGrade?.questions).toEqual([]);
  expect(reduce(asProblem, { type: 'review_ack' }).workGrade?.result.verdict).toBe('DUNG');
});
